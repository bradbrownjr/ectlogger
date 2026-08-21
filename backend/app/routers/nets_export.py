import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.models import CheckIn, Net, NetRole, NetStatus, TemplateStaff, User, net_frequencies
from app.models import Form as TrafficFormModel
from app.permissions import check_net_lifecycle_permission, check_net_permission
from app.schemas import Ics309LogResponse, NetResponse
from app.services.csv_import import (
    MAX_IMPORT_WINDOW_DAYS,
    WIDE_IMPORT_WINDOW_HOURS,
    CsvImportConfig,
    ZoneInfo,
    ZoneInfoNotFoundError,
    build_frequency_token_map,
    decode_csv_bytes,
    local_naive_to_utc,
    process_csv_rows,
)
from app.services.net_closure import close_net_and_notify
from app.traffic.formatters import format_form
from app.traffic.ics309 import (
    format_traffic_ics309_message,
    get_net_traffic_log_entries,
    traffic_from_station,
    traffic_to_station,
)
from app.traffic.rri_strip import make_nts_safe
from app.utils import display_callsign, format_time_for_net, redact_contact_info, resolve_display_tz, to_display_tz

router = APIRouter()

@router.get("/{net_id}/export/csv")
async def export_net_csv(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Export net check-ins as CSV"""
    # Get net with check-ins and frequencies
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies),
            selectinload(Net.check_ins).selectinload(CheckIn.frequency)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - anyone can export a net they have access to
    if not await check_net_permission(db, net, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to export this net")
    
    # Build frequency lookup map
    freq_map = {f.id: f for f in net.frequencies}

    # Helper to format frequency
    def format_freq(freq):
        if freq.frequency:
            return f"{freq.frequency} {freq.mode or ''}".strip()
        elif freq.network:
            return f"{freq.network} TG{freq.talkgroup or ''}"
        return ""

    # Display times in the requesting user's timezone preference (falls back to
    # UTC if they prefer UTC or haven't got a timezone on file yet)
    tz = resolve_display_tz(current_user)
    display_started_at = to_display_tz(net.started_at, tz)
    display_closed_at = to_display_tz(net.closed_at, tz)

    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Build headers - add topic/poll columns if enabled
    headers = [
        "Check-in Time", "Callsign", "Name", "Location",
        "Available Frequencies", "Spotter #", "Weather Observation",
        "Power Src", "Power", "Feedback", "Notes", "Relayed By", "Status"
    ]
    if net.topic_of_week_enabled:
        headers.append("Topic Response")
    if net.poll_enabled:
        headers.append("Poll Response")
    writer.writerow(headers)

    # Write check-ins
    for check_in in sorted(net.check_ins, key=lambda x: x.checked_in_at):
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

        row = [
            format_time_for_net(to_display_tz(check_in.checked_in_at, tz), display_started_at, display_closed_at),
            check_in.callsign,
            check_in.name,
            check_in.location,
            ', '.join(available_freqs) if available_freqs else "",
            check_in.skywarn_number or "",
            check_in.weather_observation or "",
            check_in.power_source or "",
            check_in.power or "",
            check_in.feedback or "",
            check_in.notes or "",
            check_in.relayed_by or "",
            check_in.status.value if check_in.status else ""
        ]
        if net.topic_of_week_enabled:
            row.append(check_in.topic_response or "")
        if net.poll_enabled:
            row.append(check_in.poll_response or "")
        writer.writerow(row)
    
    # Prepare response
    output.seek(0)
    filename = f"{net.name.replace(' ', '_')}_{display_started_at.strftime('%Y%m%d') if display_started_at else 'draft'}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def _parse_import_datetime(
    raw: Optional[str],
    import_zone: ZoneInfo,
    assume_utc: bool,
    field_label: str,
) -> Optional[datetime]:
    """Parse an operator-supplied net start/end time into naive UTC.

    Deliberately takes a string rather than letting FastAPI coerce a datetime:
    a naive ISO value would be read as UTC, but these times must follow the same
    assume_utc / timezone_name contract as the CSV rows themselves. Otherwise an
    operator who unchecks UTC and types 19:00 gets a window in UTC and rows in
    their local zone, and every row silently lands hours away from the window.
    An explicit offset in the string always wins, matching parse_checkin_timestamp.
    """
    if raw is None or not raw.strip():
        return None
    value = raw.strip()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_label}: '{raw}'. Use the format YYYY-MM-DDTHH:MM.",
        )
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return local_naive_to_utc(parsed, import_zone, assume_utc)


@router.post("/{net_id}/import/csv")
async def import_net_csv(
    net_id: int,
    file: UploadFile = File(...),
    timezone_name: str = Form("UTC"),
    assume_utc: bool = Form(False),
    net_started_at: Optional[str] = Form(None),
    net_closed_at: Optional[str] = Form(None),
    close_net_on_import: bool = Form(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Import net check-ins from CSV.

    Works on any net status. A draft or scheduled net is a *backfill*: the net
    ran off-app, so the operator must supply the real start and end times, which
    both scope the import and become the net's recorded times. Lobby, active,
    closed and archived nets keep their previous behavior when the new
    parameters are omitted.
    """
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()

    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    if not await check_net_permission(db, net, current_user, required_roles=["NCS", "LOGGER", "RELAY"]):
        # Active template staff can start a net (see nets_core.start_net), so they
        # can also fix or backfill its log. Without this, a scheduled net that has
        # no NetRole rows yet is importable only by the owner or an admin -- which
        # is exactly the net a backfill is for.
        staff_row = None
        if net.template_id:
            staff_result = await db.execute(
                select(TemplateStaff).where(
                    TemplateStaff.template_id == net.template_id,
                    TemplateStaff.user_id == current_user.id,
                    TemplateStaff.is_active == True,  # noqa: E712
                )
            )
            staff_row = staff_result.scalar_one_or_none()
        if staff_row is None:
            raise HTTPException(status_code=403, detail="Not authorized to import into this net")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No CSV file uploaded")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    csv_text = decode_csv_bytes(raw_bytes)
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV header row is missing")

    # Built before the window is derived: parsing the prompted times needs the zone.
    try:
        import_zone = ZoneInfo("UTC") if assume_utc else ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        raise HTTPException(status_code=400, detail=f"Invalid import timezone '{timezone_name}'")

    prompted_start = _parse_import_datetime(net_started_at, import_zone, bool(assume_utc), "net start time")
    prompted_end = _parse_import_datetime(net_closed_at, import_zone, bool(assume_utc), "net end time")

    # ========== VALIDATION ==========
    is_backfill = net.status in (NetStatus.DRAFT, NetStatus.SCHEDULED)

    if is_backfill and (prompted_start is None or prompted_end is None):
        raise HTTPException(
            status_code=400,
            detail=(
                "Importing into a draft or scheduled net needs the net's actual start "
                "and end times, since the net has none recorded."
            ),
        )

    if prompted_start is not None and prompted_end is not None:
        if prompted_end <= prompted_start:
            raise HTTPException(status_code=400, detail="Net end time must be after the net start time.")
        window_span = prompted_end - prompted_start
        if window_span > timedelta(days=MAX_IMPORT_WINDOW_DAYS):
            # Also a guard, not just a sanity check: time-only rows generate one
            # candidate per day in the window, so an unbounded window is cheap
            # CPU amplification on an authenticated upload endpoint.
            raise HTTPException(
                status_code=400,
                detail=(
                    f"The net start and end times are more than {MAX_IMPORT_WINDOW_DAYS} days "
                    "apart. Check the dates you entered."
                ),
            )

    if close_net_on_import and (prompted_start is None or prompted_end is None):
        raise HTTPException(
            status_code=400,
            detail="Provide the net start and end times to close the net on import.",
        )

    if close_net_on_import and prompted_end > datetime.utcnow() + timedelta(minutes=5):
        raise HTTPException(
            status_code=400,
            detail="A net cannot be closed with an end time in the future.",
        )

    warnings: list[str] = []
    if prompted_start is not None and prompted_end is not None:
        if prompted_end - prompted_start > timedelta(hours=WIDE_IMPORT_WINDOW_HOURS):
            warnings.append(
                f"The net start and end times span more than {WIDE_IMPORT_WINDOW_HOURS} hours. "
                "Rows that give only a time of day (like 7:05 PM) may be rejected as ambiguous; "
                "give those rows a full date."
            )

    # ========== TIME WINDOW ==========
    def to_utc_naive(value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    if prompted_start is not None:
        net_window_start = prompted_start
    else:
        net_window_start = to_utc_naive(net.started_at or net.created_at)

    if prompted_end is not None:
        # The 10-minute grace exists because a paper log's last entry is often
        # written at or just past the closing minute. It widens the *parse
        # window* only -- net.closed_at below is stamped with the raw prompted
        # end, never this padded value.
        net_window_end = prompted_end + timedelta(minutes=10)
    else:
        close_base = to_utc_naive(net.closed_at)
        net_window_end = (
            (close_base + timedelta(minutes=10)) if close_base
            else (datetime.utcnow() + timedelta(minutes=10))
        )

    config = CsvImportConfig(
        net_id=net.id,
        net_window_start=net_window_start,
        net_window_end=net_window_end,
        import_zone=import_zone,
        assume_utc=bool(assume_utc),
        frequency_token_map=build_frequency_token_map(net.frequencies),
        checked_in_by_id=current_user.id,
    )

    svc_result = process_csv_rows(reader, config)

    # Resolve user IDs for callsigns that match registered accounts
    imported_rows: list[CheckIn] = []
    for payload in svc_result.row_payloads:
        callsign = payload["callsign"]
        user_result = await db.execute(
            select(User).where(
                (User.callsign == callsign)
                | (User.gmrs_callsign == callsign)
                | (User.callsigns.like(f'%"{callsign}"%'))
            )
        )
        matched_user = user_result.scalar_one_or_none()
        payload["user_id"] = matched_user.id if matched_user else None
        imported_rows.append(CheckIn(**payload))

    # ========== PERSIST, AND CLOSE IF THIS WAS A BACKFILL ==========
    # Closing is gated on imported_rows: if every row was rejected, recording the
    # net as closed with nobody in it is the worst outcome available -- it makes
    # the log permanently wrong and moves the retry onto a different code path.
    # Leave it scheduled, report the errors, let the operator fix the file.
    should_close = bool(close_net_on_import and is_backfill and imported_rows)

    if imported_rows:
        db.add_all(imported_rows)

    if should_close:
        # Flush so the new rows exist in the transaction, then reload the
        # relationship: close_net_and_notify builds the emailed log from
        # net.check_ins, which would otherwise be the stale pre-import list.
        await db.flush()
        await db.refresh(net, attribute_names=["check_ins"])
        # Commits the check-ins and the closure together, then broadcasts and
        # mails the log. The system chat message is suppressed: it would be
        # stamped after closed_at and render out of order in the official log.
        await close_net_and_notify(
            db,
            net,
            current_user,
            closed_at=prompted_end,
            started_at=prompted_start,
            post_chat_message=False,
        )
    else:
        if close_net_on_import and is_backfill and not imported_rows:
            warnings.append(
                "The net was left scheduled because no rows could be imported. "
                "Fix the errors below and import again to close it."
            )
        if not is_backfill and (prompted_start is not None or prompted_end is not None):
            # Correcting the recorded times on a net that already ran. No
            # re-close: the net's lifecycle is unchanged, only its timestamps.
            if prompted_start is not None:
                net.started_at = prompted_start
            if prompted_end is not None and net.closed_at is not None:
                net.closed_at = prompted_end
        if imported_rows or db.dirty:
            await db.commit()

    max_errors = 50
    errors = svc_result.errors
    return {
        "imported": len(imported_rows),
        "skipped": svc_result.skipped,
        "errors": errors[:max_errors],
        "error_count": len(errors),
        "errors_truncated": len(errors) > max_errors,
        "net_window_start": net_window_start.isoformat() if net_window_start else None,
        "net_window_end": net_window_end.isoformat() if net_window_end else None,
        "timezone_used": "UTC" if assume_utc else timezone_name,
        "assume_utc": bool(assume_utc),
        "warnings": warnings,
        "closed": should_close,
        "net_status": net.status.value if net.status else None,
    }


async def _build_ics309_data(db: AsyncSession, net: Net, current_user: Optional[User]) -> dict:
    """Single source of truth for the ICS-309 Communications Log content --
    header fields plus the merged/sorted check-in + chat + traffic log rows.
    Shared by export_net_ics309's csv and json formats (and, via the json
    format, by the frontend's ICS309PrintView PDF) so there is exactly one
    place that assembles this log, not one per output format.

    current_user may be None (a guest viewing a public net's report) -- in
    that case check-in/chat free text is scrubbed of anything that looks
    like an email or phone number, same as the REST list endpoints."""
    redact = current_user is None
    # Helper to format frequency
    def format_freq(freq):
        if freq.frequency:
            return f"{freq.frequency} {freq.mode or ''}".strip()
        elif freq.network:
            return f"{freq.network} TG{freq.talkgroup or ''}"
        return ""

    freq_strings = [format_freq(f) for f in net.frequencies]
    freq_list = ", ".join(freq_strings) if freq_strings else "Multiple"

    # Get NCS info — prefer the most recently assigned NCS role; fall back to owner.
    ncs_role_result = await db.execute(
        select(User.callsign, User.name)
        .join(NetRole, NetRole.user_id == User.id)
        .where(NetRole.net_id == net.id, NetRole.role == "NCS")
        .order_by(NetRole.assigned_at.desc())
        .limit(1)
    )
    ncs_role_row = ncs_role_result.first()
    ncs_callsign = ncs_role_row[0] if ncs_role_row else (display_callsign(net.owner) if net.owner else "Unknown")
    ncs_name = ncs_role_row[1] if ncs_role_row else (net.owner.name or display_callsign(net.owner) if net.owner else "Unknown")

    # Display times in the requesting user's timezone preference (falls back to
    # UTC if they prefer UTC or haven't got a timezone on file yet)
    tz = resolve_display_tz(current_user)
    display_started_at = to_display_tz(net.started_at, tz)
    display_closed_at = to_display_tz(net.closed_at, tz)

    started_at = display_started_at.strftime("%Y-%m-%d %H:%M:%S") if display_started_at else "N/A"
    closed_at = display_closed_at.strftime("%Y-%m-%d %H:%M:%S") if display_closed_at else "N/A"

    # Get chat messages
    from app.models import ChatMessage
    chat_result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.net_id == net.id)
        .order_by(ChatMessage.created_at.asc())
    )
    chat_messages = chat_result.scalars().all()

    # Build log entries combining check-ins and chat
    log_entries = []

    # Add check-ins
    for check_in in sorted(net.check_ins, key=lambda x: x.checked_in_at):
        location_text = redact_contact_info(check_in.location) if redact else check_in.location
        weather_text = redact_contact_info(check_in.weather_observation) if redact else check_in.weather_observation
        location_info = f" from {location_text}" if location_text else ""
        weather_info = f" | WX: {weather_text}" if weather_text else ""

        log_entries.append({
            'time': format_time_for_net(to_display_tz(check_in.checked_in_at, tz), display_started_at, display_closed_at),
            'from_station': check_in.callsign,
            'to_station': 'NET',
            'message': f"Check-in{location_info}{weather_info}"
        })

    # Add chat messages (non-system)
    for msg in chat_messages:
        callsign = msg.user.callsign if msg.user and msg.user.callsign else ('System' if msg.is_system else 'Unknown')
        if callsign != 'System':
            log_entries.append({
                'time': format_time_for_net(to_display_tz(msg.created_at, tz), display_started_at, display_closed_at),
                'from_station': callsign,
                'to_station': 'NET',
                'message': redact_contact_info(msg.message) if redact else msg.message
            })

    # Add Assisted Traffic Handling rows -- metadata only, never the message
    # body (Form.field_values / normalized_text). Only surfaced on the
    # ICS-309 format itself, gated on the net's ics309_enabled toggle so a
    # net that never opted into ICS-309 doesn't leak traffic metadata into
    # this export either. See TRAFFIC-HANDLING-DESIGN.md D3's "ICS-309
    # consequence" and app/traffic/ics309.py.
    if net.ics309_enabled:
        traffic_entries = await get_net_traffic_log_entries(db, net.id)
        for entry in traffic_entries:
            log_entries.append({
                'time': format_time_for_net(to_display_tz(entry.occurred_at, tz), display_started_at, display_closed_at),
                'from_station': traffic_from_station(entry.form, entry),
                'to_station': traffic_to_station(entry),
                'message': format_traffic_ics309_message(entry.form, entry),
            })

    log_entries.sort(key=lambda x: x.get('time', ''))

    return {
        'incident_name': net.name,
        'operational_period_from': started_at,
        'operational_period_to': closed_at,
        'radio_operator': f"{ncs_name} / {ncs_callsign}",
        'channel': freq_list,
        'entries': log_entries,
        'prepared_by': "ECTLogger - Automated Log",
        'prepared_at': closed_at,
        'display_started_at': display_started_at,
    }


@router.get("/{net_id}/export/ics309")
async def export_net_ics309(
    net_id: int,
    format: str = Query("csv"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Export net as an ICS-309 Communications Log: CSV (?format=csv, the
    default, for spreadsheet/filing use) or structured JSON (?format=json,
    consumed by the frontend's ICS309PrintView for a form-accurate PDF, and
    by NetReport.tsx -- a page intentionally open to guests). Reading this
    is no more sensitive than the check-in list and chat, both already open
    to guests: callsign and licensee name are public via the FCC ULS, and
    free text is redacted for guests the same way as those endpoints."""
    if format not in ("csv", "json"):
        raise HTTPException(status_code=400, detail="format must be 'csv' or 'json'")

    # Get net with check-ins, frequencies, and owner
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies),
            selectinload(Net.check_ins).selectinload(CheckIn.frequency),
            selectinload(Net.owner)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()

    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    data = await _build_ics309_data(db, net, current_user)

    if format == "json":
        return Ics309LogResponse(**{k: v for k, v in data.items() if k != 'display_started_at'})

    # Create ICS-309 CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # ICS-309 header info
    writer.writerow(["ICS-309 COMMUNICATIONS LOG"])
    writer.writerow([""])
    writer.writerow(["1. Incident Name:", data['incident_name']])
    writer.writerow(["2. Operational Period:", f"{data['operational_period_from']} to {data['operational_period_to']}"])
    writer.writerow(["3. Radio Operator:", data['radio_operator']])
    writer.writerow(["4. Channel/Frequency:", data['channel']])
    writer.writerow([""])
    writer.writerow(["TIME", "FROM", "TO", "SUBJECT/MESSAGE"])

    for entry in data['entries']:
        writer.writerow([
            entry.get('time', ''),
            entry.get('from_station', ''),
            entry.get('to_station', ''),
            entry.get('message', '')
        ])

    writer.writerow([""])
    writer.writerow(["9. Prepared By:", data['prepared_by']])
    writer.writerow(["10. Date/Time:", data['prepared_at']])

    # Prepare response
    output.seek(0)
    display_started_at = data['display_started_at']
    date_str = display_started_at.strftime('%Y%m%d') if display_started_at else 'draft'
    filename = f"ICS309_{net.name.replace(' ', '_')}_{date_str}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{net_id}/export/rri-strips")
async def export_net_rri_strips(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Export this net's traffic as one line per report, oldest first --
    built for pasting straight into a spreadsheet or Winlink template,
    matching how receiving stations actually use RRI/WX strip data (see
    TRAFFIC-HANDLING-DESIGN.md's RRI strip section). Every form type is
    included via format_form()'s own per-type dispatch (Radiogram/ICS-213
    canonical text alongside RRI/WX strip lines), not just strip types.

    RRI's minus->M substitution is applied to strip lines unconditionally
    and is NOT offered as a choice, because "M" is simply how a negative
    number is written in an RRI strip -- the strip specs say so in the field
    definition itself ("TEMP DEG F (### M=MINUS)"), so an operator following
    the form would never enter a literal "-5" in the first place. This just
    normalizes the case where they did. It is deliberately NOT applied to
    Radiogram/ICS-213 lines: "M" is not a general NTS proword for a minus
    sign (ordinary radiogram text spells a hyphen out as "DASH" -- see
    app/traffic/nts_text.py), and blanket-substituting would corrupt
    legitimate hyphenated free text like a route number.
    """
    net_result = await db.execute(select(Net).where(Net.id == net_id))
    net = net_result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    if not await check_net_permission(db, net, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to export this net")

    forms_result = await db.execute(
        select(TrafficFormModel)
        .options(selectinload(TrafficFormModel.definition))
        .where(TrafficFormModel.net_id == net_id)
        .order_by(TrafficFormModel.filed_at)
    )
    forms = forms_result.scalars().all()

    lines = []
    for form in forms:
        line = format_form(form)
        if form.definition.output_format in ("rri_strip", "rri_strip_raw"):
            line = make_nts_safe(line)
        lines.append(line)

    filename = f"Traffic_{net.name.replace(' ', '_')}.txt"

    return StreamingResponse(
        iter(['\n'.join(lines)]),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.delete("/{net_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a net"""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    if not await check_net_lifecycle_permission(db, net, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to delete this net")
    
    await db.delete(net)
    await db.commit()
    
    return None


@router.post("/{net_id}/archive", response_model=NetResponse)
async def archive_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive a closed net"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    if not await check_net_lifecycle_permission(db, net, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to archive this net")
    
    if net.status != NetStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Only closed nets can be archived")
    
    net.status = NetStatus.ARCHIVED
    await db.commit()
    await db.refresh(net, ['frequencies'])

    # Broadcast net status change so other clients viewing this net (e.g. a second
    # manager with the archive/delete prompt open) update immediately instead of
    # keeping a stale prompt for an action that already happened.
    from app.main import manager
    await manager.broadcast({
        "type": "net_status_change",
        "data": {
            "net_id": net_id,
            "status": "archived",
        }
    }, net_id)

    return NetResponse.from_orm(net)


@router.post("/{net_id}/unarchive", response_model=NetResponse)
async def unarchive_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unarchive an archived net back to closed status"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    if not await check_net_lifecycle_permission(db, net, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to unarchive this net")
    
    if net.status != NetStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Only archived nets can be unarchived")
    
    net.status = NetStatus.CLOSED
    await db.commit()
    await db.refresh(net, ['frequencies'])

    # Broadcast symmetrically with archive_net so other clients see the net
    # revert to closed instead of continuing to treat it as archived.
    from app.main import manager
    await manager.broadcast({
        "type": "net_status_change",
        "data": {
            "net_id": net_id,
            "status": "closed",
        }
    }, net_id)

    return NetResponse.from_orm(net)


@router.post("/{net_id}/clone", response_model=NetResponse)
async def clone_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clone a net with its settings, frequencies, and field configuration"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    original_net = result.scalar_one_or_none()
    
    if not original_net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Create new net with copied settings
    new_net = Net(
        name=f"{original_net.name} (Copy)",
        description=original_net.description,
        owner_id=current_user.id,
        field_config=original_net.field_config,
        status=NetStatus.DRAFT
    )
    db.add(new_net)
    await db.flush()
    
    # Copy frequencies
    for freq in original_net.frequencies:
        await db.execute(
            net_frequencies.insert().values(net_id=new_net.id, frequency_id=freq.id)
        )
    
    await db.commit()
    await db.refresh(new_net, ['frequencies'])
    
    return NetResponse.from_orm(new_net)


