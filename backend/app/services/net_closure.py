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
import logging
from dataclasses import dataclass, field as dataclass_field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import BackgroundTasks
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings as app_settings
from app.email_service import EmailService
from app.models import ChatMessage, CheckIn, Net, NetRole, NetStatus, User
from app.services.check_in_columns import (
    available_frequencies,
    checked_in_frequency,
    field_value,
    format_frequency,
    load_field_definitions,
    net_log_fields,
)
from app.services.ics309_log import build_ics309_rows, get_accepted_off_net_entries
from app.services.net_figures import net_figures
from app.services.report_sections import is_legacy, sections_for_recipient
from app.traffic.ics309 import get_ics309_muted_user_ids, get_net_traffic_log_entries
from app.traffic.log import compute_net_traffic_counts
from app.utils import check_in_time_for_net, display_callsign, format_time_for_net, resolve_display_tz, to_display_tz

logger = logging.getLogger(__name__)


async def get_last_activity_at(db: AsyncSession, net_id: int, started_at: Optional[datetime]) -> Optional[datetime]:
    """Most recent of: a check-in/recheck, a chat message, or the net's own start.

    Shared by the auto-close scheduler (ncs_reminder_service.py) and
    compute_auto_close_at below, so the "will close at" time a viewer sees on
    the net page always matches what the scheduler itself will act on.
    """
    check_in_result = await db.execute(
        select(func.max(func.coalesce(CheckIn.updated_at, CheckIn.checked_in_at)))
        .where(CheckIn.net_id == net_id)
    )
    chat_result = await db.execute(
        select(func.max(ChatMessage.created_at)).where(ChatMessage.net_id == net_id)
    )
    candidates = [started_at, check_in_result.scalar(), chat_result.scalar()]
    candidates = [c for c in candidates if c is not None]
    return max(candidates) if candidates else None


async def compute_auto_close_at(db: AsyncSession, net: Net) -> Optional[datetime]:
    """When this net will close itself if nothing resets the clock first.

    None when the feature is off, the net isn't ACTIVE, or (shouldn't happen,
    since started_at is always a fallback) there's truly no activity to
    measure from yet -- None just means "don't show a countdown".
    """
    if net.auto_close_after_minutes is None or net.status != NetStatus.ACTIVE:
        return None
    last_activity = await get_last_activity_at(db, net.id, net.started_at)
    if last_activity is None:
        return None
    if last_activity.tzinfo is None:
        last_activity = last_activity.replace(tzinfo=timezone.utc)
    return last_activity + timedelta(minutes=net.auto_close_after_minutes)


async def close_net_and_notify(
    db: AsyncSession,
    net: Net,
    actor: User,
    *,
    closed_at: Optional[datetime] = None,
    started_at: Optional[datetime] = None,
    post_chat_message: bool = True,
    hold_log: bool = False,
    background_tasks: Optional[BackgroundTasks] = None,
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
    hold_log
        Close without emailing the log. Net control finishes it (offline
        logs, off-net entries, corrections) and sends it later with
        send_net_log, through POST /nets/{id}/send-log.
    background_tasks
        A request's background tasks. When given, the log is emailed after
        the response goes out (schedule_net_log), so the person closing the
        net isn't left waiting while every copy is sent.
    """
    net_id = net.id

    net.status = NetStatus.CLOSED
    net.closed_at = closed_at if closed_at is not None else datetime.utcnow()
    if hold_log:
        net.log_held_since = net.closed_at
        net.log_held_by_user_id = actor.id if actor else None
        net.log_hold_reminded_at = None

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
            times = [c.checked_in_at for c in net.check_ins if c.checked_in_at and not c.time_not_recorded]
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
            "closed_at": net.closed_at.isoformat() if net.closed_at else None,
            "log_held": hold_log,
        }
    }, net_id)

    # Post system message for net close
    if post_chat_message:
        await post_system_message(net_id, f"Net has been closed by {display_callsign(actor)}", db)

    if hold_log:
        return
    if background_tasks is not None:
        schedule_net_log(background_tasks, db, net_id)
    else:
        await send_net_log(db, net)


def schedule_net_log(background_tasks: BackgroundTasks, db: AsyncSession, net_id: int) -> None:
    """Email the net's log once the response has gone out.

    Sending is one SMTP conversation per recipient, so a net with many
    subscribers kept Close and send the log waiting for tens of seconds with
    the dialog still open (UFB New England, net 139, 2026-10-25): the closer
    clicked again, got "already closed", and a stray click landed on Archive
    Now. The request's own session is closed by the time background tasks
    run, so this opens a new one on the same engine.
    """
    background_tasks.add_task(_send_net_log_by_id, db.bind, net_id)


async def _send_net_log_by_id(bind, net_id: int) -> None:
    try:
        async with AsyncSession(bind, expire_on_commit=False) as db:
            net = (await db.execute(
                select(Net).options(
                    selectinload(Net.frequencies),
                    selectinload(Net.check_ins).selectinload(CheckIn.frequency),
                ).where(Net.id == net_id)
            )).scalar_one_or_none()
            if net is not None:
                await send_net_log(db, net)
    except Exception:
        logger.exception("Failed to send the log for net %s", net_id)


async def send_net_log(db: AsyncSession, net: Net) -> None:
    """Email *net*'s log (plain or ICS-309) to its owner, its schedule's
    subscribers and its active NCS/Logger/Relay. Sent at close, or later from
    POST /nets/{id}/send-log for a net closed with hold_log.

    The caller loads net.frequencies and net.check_ins with CheckIn.frequency.
    A failed send to one address is logged and skipped, never raised.

    Which sections each copy carries, and whether it is the ICS-309, comes
    from services/report_sections.py::sections_for_recipient. The email
    itself is built by email/net_logs.py from NetLog.email_kwargs, the same
    path as the Reports tab's preview (routers/closing_email_preview.py).
    """
    log = await load_net_log(db, net)
    recipients_to_notify = await closing_log_recipients(db, net)

    for email, recipient in recipients_to_notify:
        try:
            email_service = EmailService()

            # ICS-309 if the net's sections include it OR the user prefers it
            fmt, sections = sections_for_recipient(
                net, log.has_sites, getattr(recipient, 'notify_ics309', False)
            )

            # Get unsubscribe token for compliance
            unsub_token = getattr(recipient, 'unsubscribe_token', None)

            kwargs = log.email_kwargs(resolve_display_tz(recipient), fmt, sections)
            if fmt == "ics309":
                await email_service.send_ics309_log(email=email, unsubscribe_token=unsub_token, **kwargs)
            else:
                await email_service.send_net_log(email=email, unsubscribe_token=unsub_token, **kwargs)
        except Exception as e:
            # Log error with traceback but don't fail the close operation
            import traceback
            print(f"Failed to send net log email to {email}: {e}\n{traceback.format_exc()}")


async def closing_log_recipients(db: AsyncSession, net: Net) -> list:
    """(email, user) pairs that get *net*'s closing log: the owner and the
    schedule's subscribers who want close notifications, then the net's own
    active NCS/Logger/Relay. One copy per address."""
    net_id = net.id
    owner = (await db.execute(select(User).where(User.id == net.owner_id))).scalar_one_or_none()

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

    # Add this net's own active NCS/Logger/Relay -- previously only the owner
    # and explicit schedule subscribers got the closure email, so a rotation
    # member who ran the net as NCS but never separately subscribed to the
    # schedule got no copy of the log they just produced (reported 2026-09-04,
    # net 84: Josh/N1VKQ ran as NCS and is active staff, but has no
    # NetTemplateSubscription row, so he was silently excluded). Still respects
    # each user's own notify_net_close opt-out -- running the net doesn't
    # override an explicit "don't email me net closures" preference.
    role_result = await db.execute(
        select(User)
        .join(NetRole, NetRole.user_id == User.id)
        # "RELAY", not "Relay": NetRole.role is stored upper-case on every
        # write path, so the title-cased value here never matched a row and
        # relay operators have never received the closing log (found
        # 2026-09-19).
        .where(NetRole.net_id == net_id, NetRole.role.in_(["NCS", "LOGGER", "RELAY"]))
        .where(NetRole.is_active == True)  # noqa: E712
        .where(User.email_notifications == True)  # noqa: E712
        .where(User.notify_net_close == True)  # noqa: E712
    )
    existing_emails = {r[0] for r in recipients_to_notify}
    for role_holder in role_result.scalars().unique():
        if role_holder.email and role_holder.email not in existing_emails:
            recipients_to_notify.append((role_holder.email, role_holder))
            existing_emails.add(role_holder.email)
    return recipients_to_notify


@dataclass
class NetLog:
    """Everything a net's closing email is built from, loaded once by
    load_net_log. email_kwargs turns it into the arguments of
    email/net_logs.py's builders for one recipient's timezone and format.

    `source` holds the feature settings the email follows (the net itself,
    or for a schedule's preview the schedule); the data is the net's.
    """
    net: Any
    source: Any
    chat_messages: list
    muted_user_ids: set
    sorted_check_ins: list
    can_hear_reports: list
    site_roster: list
    log_fields: list
    site_coverage: Optional[dict]
    traffic_log_entries_for_ics309: list
    off_net_entries: list
    traffic_summary: Optional[dict]
    station_groups: list
    freq_strings: list
    ncs_callsign: str
    ncs_name: str
    has_sites: bool
    schedule_announcements: Optional[str] = None
    # Where the report link points; the net's report page unless set (the
    # preview's made-up net has no report).
    report_url: Optional[str] = None
    _payload_cache: dict = dataclass_field(default_factory=dict)

    @property
    def freq_map(self) -> dict:
        return {f.id: f for f in self.net.frequencies}

    def payload(self, tz):
        """The recipient-timezone-dependent rows, cached per timezone so
        recipients sharing a display preference (the common case: everyone
        on UTC/no-timezone-set) don't redo the work."""
        cache_key = tz.key if tz else None
        if cache_key not in self._payload_cache:
            self._payload_cache[cache_key] = self._build_payload(tz)
        return self._payload_cache[cache_key]

    def _build_payload(self, tz):
        net = self.net
        freq_map = self.freq_map
        format_freq = format_frequency
        log_fields = self.log_fields
        checkin_callsigns = {c.id: c.callsign for c in self.sorted_check_ins}
        started_at_local = to_display_tz(net.started_at, tz)
        closed_at_local = to_display_tz(net.closed_at, tz)

        check_ins_data = []
        for check_in in self.sorted_check_ins:
            check_ins_data.append({
                'time': check_in_time_for_net(check_in, tz, started_at_local, closed_at_local),
                'callsign': check_in.callsign,
                'name': check_in.name,
                'location': check_in.location,
                'frequency': checked_in_frequency(check_in, freq_map),
                'frequencies': available_frequencies(check_in, freq_map),
                'skywarn_number': check_in.skywarn_number or '',
                'weather_observation': check_in.weather_observation or '',
                'power_source': check_in.power_source or '',
                'power': check_in.power or '',
                'feedback': check_in.feedback or '',
                'notes': check_in.notes or '',
                'topic_response': check_in.topic_response or '',
                'poll_response': check_in.poll_response or '',
                'fields': {field.name: field_value(check_in, field) for field in log_fields},
                'status': check_in.status.value if check_in.status else ''
            })

        chat_messages_data = []
        for msg in self.chat_messages:
            chat_messages_data.append({
                'timestamp': format_time_for_net(to_display_tz(msg.created_at, tz), started_at_local, closed_at_local),
                'callsign': msg.user.callsign if msg.user and msg.user.callsign else ('System' if msg.is_system else 'Unknown'),
                'message': msg.message,
                # Used to leave net-muted stations out of the ICS-309
                # email's chat attachment (email_kwargs).
                'user_id': msg.user_id,
            })

        coverage_edges_data = []
        for report in self.can_hear_reports:
            coverage_edges_data.append({
                'reporter_callsign': checkin_callsigns.get(report.reporter_check_in_id, ''),
                'heard_callsign': checkin_callsigns.get(report.heard_check_in_id, ''),
                'frequency_label': format_freq(freq_map[report.frequency_id]) if report.frequency_id in freq_map else '',
                'reported_at': format_time_for_net(to_display_tz(report.reported_at, tz), started_at_local, closed_at_local),
            })

        # The ICS-309 email's log rows, from the same builder as the export.
        ics309_rows = build_ics309_rows(
            check_ins=self.sorted_check_ins,
            chat_messages=self.chat_messages,
            traffic_entries=self.traffic_log_entries_for_ics309,
            off_net_entries=self.off_net_entries,
            muted_user_ids=self.muted_user_ids,
            tz=tz,
            started_at=started_at_local,
            closed_at=closed_at_local,
        )

        stations_data = []
        for group in self.station_groups:
            rows = group["rows"]
            newest = group["row"]

            def latest(read):
                return next((v for v in (read(r) for r in reversed(rows)) if v), "")

            channels = [
                format_freq(freq_map[fid]) + (" (offline)" if fid in group["offline"] else "")
                for fid in group["worked"] if fid in freq_map
            ]
            listed = [format_freq(freq_map[fid]) for fid in group["listed"] if fid in freq_map]
            stations_data.append({
                'time': check_in_time_for_net(rows[0], tz, started_at_local, closed_at_local),
                'callsign': newest.callsign,
                'check_in_count': len(rows),
                'frequency': ", ".join(channels),
                'frequencies': ", ".join(listed),
                'topic_response': latest(lambda r: r.topic_response),
                'poll_response': latest(lambda r: r.poll_response),
                'fields': {field.name: latest(lambda r, f=field: field_value(r, f)) for field in log_fields},
                'status': newest.status.value if newest.status else '',
            })

        started_at_str = started_at_local.strftime("%Y-%m-%d %H:%M:%S") if started_at_local else "N/A"
        closed_at_str = closed_at_local.strftime("%Y-%m-%d %H:%M:%S") if closed_at_local else "N/A"
        return {
            'check_ins': check_ins_data,
            'chat_messages': chat_messages_data,
            'started_at': started_at_str,
            'closed_at': closed_at_str,
            'coverage_edges': coverage_edges_data,
            'ics309_rows': ics309_rows,
            'stations': stations_data,
        }

    def email_kwargs(self, tz, fmt: str, sections: set) -> dict:
        """Arguments for email/net_logs.py's build_/send_ net log (fmt
        "plain") or ICS-309 log (fmt "ics309"), minus the address and the
        unsubscribe token."""
        net, source = self.net, self.source
        payload = self.payload(tz)
        chat_messages_data = payload['chat_messages']
        configured = not is_legacy(source)

        # The sections only a set-up net can have. A never-set-up net's
        # email (report_sections null) is the long-standing one.
        if configured:
            optional = {
                'sections': sections,
                'figures': net_figures(net, self.sorted_check_ins) if 'figures' in sections else None,
                'report_url': (self.report_url or f"{app_settings.frontend_url}/nets/{net.id}/report")
                if 'report_link' in sections else None,
                'announcements': [
                    ("Announcements", self.schedule_announcements),
                    ("Net notes", net.announcements),
                ] if 'announcements' in sections else None,
                # Each station's latest answer, as its row in the table shows it
                'topic_answers': _topic_answers(payload['stations']) if 'topic' in sections else None,
            }
        else:
            optional = {'sections': sections}

        if fmt == "ics309":
            kwargs = dict(
                net_name=net.name,
                net_description=net.description or "",
                ncs_name=self.ncs_name,
                ncs_callsign=self.ncs_callsign,
                check_ins=payload['check_ins'],
                started_at=payload['started_at'],
                closed_at=payload['closed_at'],
                log_entries=payload['ics309_rows'],
                message_count=len([m for m in chat_messages_data if m.get('callsign') != 'System']),
                frequencies=self.freq_strings,
                log_fields=self.log_fields,
            )
            if configured:
                # The optional sections, as the plain email gets them. The
                # chat attachment leaves out net-muted stations, as the
                # ICS-309 log's own chat rows do.
                kwargs.update(
                    chat_messages=[m for m in chat_messages_data
                                   if m.get('user_id') is None or m['user_id'] not in self.muted_user_ids] or None,
                    topic_of_week_enabled=source.topic_of_week_enabled,
                    topic_of_week_prompt=net.topic_of_week_prompt,
                    poll_enabled=source.poll_enabled,
                    poll_question=net.poll_question,
                    propagation_logging_enabled=source.propagation_logging_enabled,
                    coverage_edges=payload['coverage_edges'],
                    site_coverage=self.site_coverage,
                    site_roster=self.site_roster,
                    traffic_enabled=source.traffic_enabled,
                    traffic_summary=self.traffic_summary,
                )
            kwargs.update(optional)
            return kwargs

        kwargs = dict(
            net_name=net.name,
            net_description=net.description or "",
            ncs_name=self.ncs_name,
            check_ins=payload['check_ins'],
            stations=payload['stations'],
            started_at=payload['started_at'],
            closed_at=payload['closed_at'],
            chat_messages=chat_messages_data if chat_messages_data else None,
            log_fields=self.log_fields,
            frequencies=self.freq_strings,
            topic_of_week_enabled=source.topic_of_week_enabled,
            topic_of_week_prompt=net.topic_of_week_prompt,
            poll_enabled=source.poll_enabled,
            poll_question=net.poll_question,
            propagation_logging_enabled=source.propagation_logging_enabled,
            coverage_edges=payload['coverage_edges'],
            site_coverage=self.site_coverage,
            site_roster=self.site_roster,
            traffic_enabled=source.traffic_enabled,
            traffic_summary=self.traffic_summary,
        )
        kwargs.update(optional)
        return kwargs


def _topic_answers(stations: list) -> list:
    """[{callsign, answer}]: each station's latest non-empty answer, from
    the table's station rows (one per station per place), one per callsign."""
    answers = {}
    for station in stations:
        if station.get('topic_response'):
            answers[station['callsign']] = station['topic_response']
    return [{'callsign': callsign, 'answer': answer} for callsign, answer in answers.items()]


async def load_net_log(db: AsyncSession, net: Net, source=None) -> NetLog:
    """Read everything *net*'s closing email shows. Reads only.

    source: what to take the feature settings from (ICS-309, coverage,
    traffic, topic, poll, report_sections). Defaults to the net; the
    Reports tab's preview passes the schedule, or the net with the
    sections being previewed.
    """
    source = net if source is None else source
    net_id = net.id

    # Get chat messages
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.net_id == net_id)
        .order_by(ChatMessage.created_at.asc())
    )
    chat_messages = result.scalars().all()

    # Stations net-muted for spam/disruption -- excluded from the ICS-309
    # email's chat rows only (never the plain net-log email or the stored
    # chat log) when the net opts in, on by default. See
    # get_ics309_muted_user_ids's docstring.
    muted_user_ids = (
        await get_ics309_muted_user_ids(db, net_id)
        if source.ics309_hide_muted_stations
        else set()
    )

    # Check-ins/chat/timestamps are formatted per-recipient timezone (see
    # resolve_display_tz), so NetLog.payload builds them lazily per unique tz
    # rather than once here — two recipients can have different display
    # preferences.
    sorted_check_ins = sorted(net.check_ins, key=lambda x: x.checked_in_at)

    # Coverage ("can hear") reports for this net, if the feature is enabled.
    # Queried once (the edge list itself doesn't depend on recipient
    # timezone) - only each edge's reported_at formatting varies per
    # recipient. Reuses the same net_id-scoped query shape as
    # list_can_hear_reports in routers/can_hear.py; callsigns and frequency
    # labels come from the check-in/frequency data already loaded for this
    # net rather than a second round trip.
    can_hear_reports = []
    if source.propagation_logging_enabled:
        from app.models import CanHearReport
        can_hear_result = await db.execute(
            select(CanHearReport).where(CanHearReport.net_id == net_id)
        )
        can_hear_reports = can_hear_result.scalars().all()

    # Who was at each site, home or deployed: any net with sites, coverage
    # logging or not. Empty when nobody was placed anywhere.
    from app.models import CoverageSite
    from app.services.station_place import build_site_roster
    reporting_sites = (await db.execute(
        select(CoverageSite.id, CoverageSite.name, CoverageSite.location)
        .where(CoverageSite.net_id == net_id, CoverageSite.site_type != "infrastructure")
        .order_by(CoverageSite.sort_order, CoverageSite.id)
    )).all()
    site_roster = build_site_roster([tuple(r) for r in reporting_sites], sorted_check_ins) if reporting_sites else []
    # Any site at all, infrastructure included, makes the coverage section
    # available (services/report_sections.py).
    has_sites = (await db.execute(
        select(CoverageSite.id).where(CoverageSite.net_id == net_id).limit(1)
    )).first() is not None
    # The check-in fields the log shows: turned on and filled in, as the
    # admin named them (services/check_in_columns.py).
    log_fields = net_log_fields(net.field_config, await load_field_definitions(db), sorted_check_ins)

    # Coverage by site and contacts outside the net: tz-independent, so built
    # once. None on an ordinary coverage net with neither.
    site_coverage = None
    if source.propagation_logging_enabled:
        from app.services.site_coverage import describe_site_coverage, load_site_coverage
        site_coverage = describe_site_coverage(
            await load_site_coverage(db, net), {f.id: format_frequency(f) for f in net.frequencies},
        )

    # Assisted Traffic Handling: log entries and summary counts for this net.
    # Entries are only needed for the ICS-309 attachment (metadata rows,
    # gated on net.ics309_enabled -- see TRAFFIC-HANDLING-DESIGN.md D3's
    # "ICS-309 consequence"); the summary counts are shown in the plain
    # net-log email whenever the net has the traffic panel enabled at all.
    # Queried once, like can_hear_reports above, since neither depends on
    # recipient timezone.
    traffic_log_entries_for_ics309 = []
    if source.ics309_enabled:
        traffic_log_entries_for_ics309 = await get_net_traffic_log_entries(db, net_id)
    # Every recipient is signed in, so the ICS-309 copy carries the accepted
    # off-net entries (a guest's export does not, see nets_export.py).
    off_net_entries = await get_accepted_off_net_entries(db, net_id)

    traffic_summary = await compute_net_traffic_counts(db, net_id) if source.traffic_enabled else None

    # The email's check-in table: one row per station per place, with every
    # channel it had there (services/station_rows.py). The CSV attachment and
    # the ICS-309 keep every check-in.
    from app.models import StationChannelMark
    from app.services.station_rows import group_station_rows
    channel_marks = (await db.execute(
        select(StationChannelMark).where(StationChannelMark.net_id == net_id)
    )).scalars().all()
    station_groups = group_station_rows(sorted_check_ins, channel_marks)

    # The net's frequencies, for the ICS-309 and the closing email's summary
    freq_strings = [label for label in (format_frequency(f) for f in net.frequencies) if label]

    # Every credited NCS, oldest assignment first (services/ncs_attribution.py
    # and the NCS attribution row in the Feature Registry), or "Not recorded".
    # This email and its ICS-309 attachment go to every participant, so
    # crediting the wrong operator here is the most visible form of the
    # 2026-08-30 net 79 misattribution. It fell back to the net manager until
    # 2026-10-28, which credited someone who may not have run the net.
    from app.services.ncs_attribution import NCS_NOT_RECORDED, net_ncs_attribution
    ncs_callsign, ncs_name = await net_ncs_attribution(db, net_id)
    if not ncs_callsign:
        ncs_callsign = NCS_NOT_RECORDED
    # Several NCS (or no name on file): the callsign list is the operator
    # identity. Keeps the templates from rendering "NCS: None".
    ncs_name = ncs_name or ncs_callsign

    # The schedule's announcements, for the Announcements section. Read live
    # from the schedule, as the net view does (a net holds no copy).
    schedule_announcements = None
    if net.template_id:
        from app.models import NetTemplate
        schedule_announcements = (await db.execute(
            select(NetTemplate.announcements).where(NetTemplate.id == net.template_id)
        )).scalar_one_or_none()

    return NetLog(
        net=net,
        source=source,
        chat_messages=chat_messages,
        muted_user_ids=muted_user_ids,
        sorted_check_ins=sorted_check_ins,
        can_hear_reports=can_hear_reports,
        site_roster=site_roster,
        log_fields=log_fields,
        site_coverage=site_coverage,
        traffic_log_entries_for_ics309=traffic_log_entries_for_ics309,
        off_net_entries=off_net_entries,
        traffic_summary=traffic_summary,
        station_groups=station_groups,
        freq_strings=freq_strings,
        ncs_callsign=ncs_callsign,
        ncs_name=ncs_name,
        has_sites=has_sites,
        schedule_announcements=schedule_announcements,
    )
