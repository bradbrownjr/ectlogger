"""
Net closure service.

Owns everything that happens when a net becomes CLOSED: the state mutation,
the topic-history record, the status broadcast, the system chat message, and
the net-log email to the owner and subscribers.

Extracted from routers/nets_core.py::close_net so that the CSV backfill path
(routers/nets_export.py::import_net_csv) can close a net that ran off-app with
exactly the same behavior a live close produces, rather than growing a second,
drifting copy of the email builder. The only behavioral knobs are the two
timestamp overrides and post_chat_message; with all three left at their
defaults this is byte-for-byte the original close.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.email_service import EmailService
from app.models import Net, NetRole, NetStatus, User
from app.traffic.ics309 import (
    format_traffic_ics309_message,
    get_net_traffic_log_entries,
    traffic_from_station,
    traffic_to_station,
)
from app.traffic.log import compute_net_traffic_counts
from app.utils import display_callsign, format_time_for_net, resolve_display_tz, to_display_tz


async def close_net_and_notify(
    db: AsyncSession,
    net: Net,
    actor: User,
    *,
    closed_at: Optional[datetime] = None,
    started_at: Optional[datetime] = None,
    post_chat_message: bool = True,
) -> None:
    """Close *net*, commit, then broadcast and mail the log.

    Callers must have already checked permission and confirmed the net is not
    already closed. Anything else pending on the session (for example freshly
    imported check-ins) is committed together with the closure, so a backfill
    that fails to close does not leave half its rows behind.

    closed_at
        Overrides the close timestamp. Defaults to now. A backfill passes the
        time the net actually ended.
    started_at
        Overrides the start timestamp, taking precedence over the
        scheduled-time and earliest-check-in fallbacks below. Only a caller who
        knows the true start (a backfill, where the operator states it) should
        pass this; a live close leaves it None and lets the fallbacks run.
    post_chat_message
        Whether to append the "Net has been closed by X" system message. A
        backfill suppresses it: the message would be stamped after closed_at
        and so render as an out-of-order trailing row in the CSV, ICS-309 and
        emailed log, and its wording is false for a net nobody closed live.
    """
    net_id = net.id

    net.status = NetStatus.CLOSED
    net.closed_at = closed_at if closed_at is not None else datetime.utcnow()

    # Finalize an in-progress pause (net closed while NCS was away) so
    # total_paused_seconds reflects the full paused window.
    if net.paused_at:
        closed_at_aware = net.closed_at.replace(tzinfo=timezone.utc) if net.closed_at.tzinfo is None else net.closed_at
        paused_at_aware = net.paused_at.replace(tzinfo=timezone.utc) if net.paused_at.tzinfo is None else net.paused_at
        net.total_paused_seconds = (net.total_paused_seconds or 0) + int((closed_at_aware - paused_at_aware).total_seconds())
        net.paused_at = None

    if started_at is not None:
        # The caller is asserting the true start, so this overwrites rather
        # than filling a blank -- a backfill exists precisely to correct it.
        net.started_at = started_at
    elif not net.started_at:
        # If started_at was never set (net closed from LOBBY without going ACTIVE),
        # backfill it from scheduled_start_time so duration stats are accurate.
        if net.scheduled_start_time:
            net.started_at = net.scheduled_start_time
        elif net.check_ins:
            times = [c.checked_in_at for c in net.check_ins if c.checked_in_at]
            if times:
                net.started_at = min(times)

    # Log topic to history if topic was used and template is set. Usually a
    # no-op by this point -- update_net already upserts this the moment the
    # topic is set live -- but this is the only history write a CSV-backfilled
    # net (imported and closed without ever going through update_net) gets.
    from app.services.topic_history import upsert_topic_history_from_net
    await upsert_topic_history_from_net(db, net)

    await db.commit()

    # Broadcast net status change so all clients update immediately
    from app.main import post_system_message, manager
    await manager.broadcast({
        "type": "net_status_change",
        "data": {
            "net_id": net_id,
            "status": "closed",
            "closed_at": net.closed_at.isoformat() if net.closed_at else None
        }
    }, net_id)

    # Post system message for net close
    if post_chat_message:
        await post_system_message(net_id, f"Net has been closed by {display_callsign(actor)}", db)

    # Get owner/NCS information
    result = await db.execute(
        select(User).where(User.id == net.owner_id)
    )
    owner = result.scalar_one_or_none()

    # Build frequency lookup map
    freq_map = {f.id: f for f in net.frequencies}

    # Helper to format frequency
    def format_freq(freq):
        if freq.frequency:
            return f"{freq.frequency} {freq.mode or ''}".strip()
        elif freq.network:
            return f"{freq.network} TG{freq.talkgroup or ''}"
        return ""

    # Get chat messages
    from app.models import ChatMessage
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.net_id == net_id)
        .order_by(ChatMessage.created_at.asc())
    )
    chat_messages = result.scalars().all()

    # Check-ins/chat/timestamps are formatted per-recipient timezone (see
    # resolve_display_tz), so build them lazily per unique tz below rather than
    # once here — two recipients can have different display preferences.
    sorted_check_ins = sorted(net.check_ins, key=lambda x: x.checked_in_at)

    # Coverage ("can hear") reports for this net, if the feature is enabled.
    # Queried once (the edge list itself doesn't depend on recipient
    # timezone) rather than per-tz like build_log_payload below - only each
    # edge's reported_at formatting varies per recipient. Reuses the same
    # net_id-scoped query shape as list_can_hear_reports in
    # routers/can_hear.py; callsigns and frequency labels come from the
    # check-in/frequency data already loaded for this net rather than a
    # second round trip.
    checkin_callsigns = {c.id: c.callsign for c in sorted_check_ins}
    can_hear_reports = []
    if net.propagation_logging_enabled:
        from app.models import CanHearReport
        can_hear_result = await db.execute(
            select(CanHearReport).where(CanHearReport.net_id == net_id)
        )
        can_hear_reports = can_hear_result.scalars().all()

    # Assisted Traffic Handling: log entries and summary counts for this net.
    # Entries are only needed for the ICS-309 attachment (metadata rows,
    # gated on net.ics309_enabled -- see TRAFFIC-HANDLING-DESIGN.md D3's
    # "ICS-309 consequence"); the summary counts are shown in the plain
    # net-log email whenever the net has the traffic panel enabled at all.
    # Queried once, like can_hear_reports above, since neither depends on
    # recipient timezone.
    traffic_log_entries_for_ics309 = []
    if net.ics309_enabled:
        traffic_log_entries_for_ics309 = await get_net_traffic_log_entries(db, net_id)

    traffic_summary = await compute_net_traffic_counts(db, net_id) if net.traffic_enabled else None

    def build_log_payload(tz):
        started_at_local = to_display_tz(net.started_at, tz)
        closed_at_local = to_display_tz(net.closed_at, tz)

        check_ins_data = []
        for check_in in sorted_check_ins:
            # Get available frequencies list
            available_freqs = []
            if check_in.available_frequencies:
                try:
                    freq_ids = json.loads(check_in.available_frequencies)
                    for fid in freq_ids:
                        if fid in freq_map:
                            available_freqs.append(format_freq(freq_map[fid]))
                except (json.JSONDecodeError, TypeError):
                    pass

            check_ins_data.append({
                'time': format_time_for_net(to_display_tz(check_in.checked_in_at, tz), started_at_local, closed_at_local),
                'callsign': check_in.callsign,
                'name': check_in.name,
                'location': check_in.location,
                'frequencies': ', '.join(available_freqs) if available_freqs else '',
                'skywarn_number': check_in.skywarn_number or '',
                'weather_observation': check_in.weather_observation or '',
                'power_source': check_in.power_source or '',
                'power': check_in.power or '',
                'feedback': check_in.feedback or '',
                'notes': check_in.notes or '',
                'topic_response': check_in.topic_response or '',
                'poll_response': check_in.poll_response or '',
                'status': check_in.status.value if check_in.status else ''
            })

        chat_messages_data = []
        for msg in chat_messages:
            chat_messages_data.append({
                'timestamp': format_time_for_net(to_display_tz(msg.created_at, tz), started_at_local, closed_at_local),
                'callsign': msg.user.callsign if msg.user and msg.user.callsign else ('System' if msg.is_system else 'Unknown'),
                'message': msg.message
            })

        coverage_edges_data = []
        for report in can_hear_reports:
            coverage_edges_data.append({
                'reporter_callsign': checkin_callsigns.get(report.reporter_check_in_id, ''),
                'heard_callsign': checkin_callsigns.get(report.heard_check_in_id, ''),
                'frequency_label': format_freq(freq_map[report.frequency_id]) if report.frequency_id in freq_map else '',
                'reported_at': format_time_for_net(to_display_tz(report.reported_at, tz), started_at_local, closed_at_local),
            })

        traffic_rows_data = [
            {
                'time': format_time_for_net(to_display_tz(entry.occurred_at, tz), started_at_local, closed_at_local),
                'from_station': traffic_from_station(entry.form, entry),
                'to_station': traffic_to_station(entry),
                'message': format_traffic_ics309_message(entry.form, entry),
            }
            for entry in traffic_log_entries_for_ics309
        ]

        started_at_str = started_at_local.strftime("%Y-%m-%d %H:%M:%S") if started_at_local else "N/A"
        closed_at_str = closed_at_local.strftime("%Y-%m-%d %H:%M:%S") if closed_at_local else "N/A"
        return check_ins_data, chat_messages_data, started_at_str, closed_at_str, coverage_edges_data, traffic_rows_data

    # Cache built payloads by tz key so recipients sharing a display preference
    # (the common case: everyone on UTC/no-timezone-set) don't redo the work.
    log_payload_cache = {}

    def log_payload_for(tz):
        cache_key = tz.key if tz else None
        if cache_key not in log_payload_cache:
            log_payload_cache[cache_key] = build_log_payload(tz)
        return log_payload_cache[cache_key]

    # Build list of email recipients (owner + subscribers who want close notifications)
    # Store as list of (email, user) tuples to check preferences
    recipients_to_notify = []

    # Add owner if they have notifications enabled
    if owner and owner.email and owner.email_notifications and owner.notify_net_close:
        recipients_to_notify.append((owner.email, owner))

    # Add subscribers who want close notifications
    if net.template_id:
        from app.models import NetTemplateSubscription
        result = await db.execute(
            select(User)
            .join(NetTemplateSubscription, NetTemplateSubscription.user_id == User.id)
            .where(NetTemplateSubscription.template_id == net.template_id)
            .where(User.email_notifications == True)  # noqa: E712
            .where(User.notify_net_close == True)  # noqa: E712
        )
        subscribers = result.scalars().all()
        existing_emails = {r[0] for r in recipients_to_notify}
        for subscriber in subscribers:
            if subscriber.email and subscriber.email not in existing_emails:
                recipients_to_notify.append((subscriber.email, subscriber))

    # Format frequencies for ICS-309
    freq_strings = []
    for freq in net.frequencies:
        if freq.frequency:
            freq_strings.append(f"{freq.frequency} {freq.mode or ''}".strip())
        elif freq.network:
            freq_strings.append(f"{freq.network} TG{freq.talkgroup or ''}")

    # Send log email to all recipients based on their preference
    # Use the most recently assigned NCS role; fall back to owner if none is recorded.
    ncs_role_result = await db.execute(
        select(User.callsign, User.name)
        .join(NetRole, NetRole.user_id == User.id)
        .where(NetRole.net_id == net_id, NetRole.role == "NCS")
        .order_by(NetRole.assigned_at.desc())
        .limit(1)
    )
    ncs_role_row = ncs_role_result.first()
    ncs_callsign = ncs_role_row[0] if ncs_role_row else (display_callsign(owner) if owner else "Unknown")
    ncs_name = ncs_role_row[1] if ncs_role_row else (owner.name or display_callsign(owner) if owner else "Unknown")

    for email, recipient in recipients_to_notify:
        try:
            email_service = EmailService()

            # Use ICS-309 if net has it enabled OR user prefers it
            use_ics309 = net.ics309_enabled or getattr(recipient, 'notify_ics309', False)

            # Get unsubscribe token for compliance
            unsub_token = getattr(recipient, 'unsubscribe_token', None)

            check_ins_data, chat_messages_data, started_at_str, closed_at_str, coverage_edges_data, traffic_rows_data = log_payload_for(
                resolve_display_tz(recipient)
            )

            if use_ics309:
                await email_service.send_ics309_log(
                    email=email,
                    net_name=net.name,
                    net_description=net.description or "",
                    ncs_name=ncs_name,
                    ncs_callsign=ncs_callsign,
                    check_ins=check_ins_data,
                    started_at=started_at_str,
                    closed_at=closed_at_str,
                    chat_messages=chat_messages_data if chat_messages_data else None,
                    frequencies=freq_strings,
                    traffic_log_rows=traffic_rows_data if traffic_rows_data else None,
                    unsubscribe_token=unsub_token
                )
            else:
                await email_service.send_net_log(
                    email=email,
                    net_name=net.name,
                    net_description=net.description or "",
                    ncs_name=ncs_name,
                    check_ins=check_ins_data,
                    started_at=started_at_str,
                    closed_at=closed_at_str,
                    chat_messages=chat_messages_data if chat_messages_data else None,
                    field_config=json.loads(net.field_config) if isinstance(net.field_config, str) else net.field_config,
                    topic_of_week_enabled=net.topic_of_week_enabled,
                    topic_of_week_prompt=net.topic_of_week_prompt,
                    poll_enabled=net.poll_enabled,
                    poll_question=net.poll_question,
                    propagation_logging_enabled=net.propagation_logging_enabled,
                    coverage_edges=coverage_edges_data,
                    traffic_enabled=net.traffic_enabled,
                    traffic_summary=traffic_summary,
                    unsubscribe_token=unsub_token
                )
        except Exception as e:
            # Log error with traceback but don't fail the close operation
            import traceback
            print(f"Failed to send net log email to {email}: {e}\n{traceback.format_exc()}")
