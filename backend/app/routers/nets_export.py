import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import CheckIn, Net, NetRole, NetStatus, User, net_frequencies
from app.permissions import check_net_lifecycle_permission, check_net_permission
from app.schemas import NetResponse
from app.services.csv_import import (
    CsvImportConfig,
    ZoneInfo,
    ZoneInfoNotFoundError,
    build_frequency_token_map,
    decode_csv_bytes,
    process_csv_rows,
)
from app.utils import display_callsign, format_time_for_net

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
            format_time_for_net(check_in.checked_in_at, net.started_at, net.closed_at),
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
    filename = f"{net.name.replace(' ', '_')}_{net.started_at.strftime('%Y%m%d') if net.started_at else 'draft'}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/{net_id}/import/csv")
async def import_net_csv(
    net_id: int,
    file: UploadFile = File(...),
    timezone_name: str = Form("UTC"),
    assume_utc: bool = Form(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Import net check-ins from CSV (supports closed/archived nets)."""
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()

    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    if not await check_net_permission(db, net, current_user, required_roles=["NCS", "LOGGER", "RELAY"]):
        raise HTTPException(status_code=403, detail="Not authorized to import into this net")

    if net.status in (NetStatus.DRAFT, NetStatus.SCHEDULED):
        raise HTTPException(
            status_code=400,
            detail="CSV import is only available for lobby, active, closed, or archived nets"
        )

    if not file.filename:
        raise HTTPException(status_code=400, detail="No CSV file uploaded")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    csv_text = decode_csv_bytes(raw_bytes)
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV header row is missing")

    def to_utc_naive(value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    net_window_start = to_utc_naive(net.started_at or net.created_at)
    close_base = to_utc_naive(net.closed_at)
    net_window_end = (
        (close_base + timedelta(minutes=10)) if close_base
        else (datetime.utcnow() + timedelta(minutes=10))
    )

    try:
        import_zone = ZoneInfo("UTC") if assume_utc else ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        raise HTTPException(status_code=400, detail=f"Invalid import timezone '{timezone_name}'")

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

    if imported_rows:
        db.add_all(imported_rows)
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
    }


@router.get("/{net_id}/export/ics309")
async def export_net_ics309(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Export net as ICS-309 Communications Log CSV"""
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
    
    # Check permissions - anyone can export a net they have access to
    if not await check_net_permission(db, net, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to export this net")
    
    # Helper to format frequency
    def format_freq(freq):
        if freq.frequency:
            return f"{freq.frequency} {freq.mode or ''}".strip()
        elif freq.network:
            return f"{freq.network} TG{freq.talkgroup or ''}"
        return ""
    
    # Format frequencies list
    freq_strings = [format_freq(f) for f in net.frequencies]
    freq_list = ", ".join(freq_strings) if freq_strings else "Multiple"
    
    # Get NCS info — prefer the most recently assigned NCS role; fall back to owner.
    ncs_role_result = await db.execute(
        select(User.callsign, User.name)
        .join(NetRole, NetRole.user_id == User.id)
        .where(NetRole.net_id == net_id, NetRole.role == "NCS")
        .order_by(NetRole.assigned_at.desc())
        .limit(1)
    )
    ncs_role_row = ncs_role_result.first()
    ncs_callsign = ncs_role_row[0] if ncs_role_row else (display_callsign(net.owner) if net.owner else "Unknown")
    ncs_name = ncs_role_row[1] if ncs_role_row else (net.owner.name or display_callsign(net.owner) if net.owner else "Unknown")
    
    # Format times
    started_at = net.started_at.strftime("%Y-%m-%d %H:%M:%S") if net.started_at else "N/A"
    closed_at = net.closed_at.strftime("%Y-%m-%d %H:%M:%S") if net.closed_at else "N/A"
    
    # Get chat messages
    from app.models import ChatMessage
    chat_result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.net_id == net_id)
        .order_by(ChatMessage.created_at.asc())
    )
    chat_messages = chat_result.scalars().all()
    
    # Build log entries combining check-ins and chat
    log_entries = []
    
    # Add check-ins
    for check_in in sorted(net.check_ins, key=lambda x: x.checked_in_at):
        location_info = f" from {check_in.location}" if check_in.location else ""
        weather_info = f" | WX: {check_in.weather_observation}" if check_in.weather_observation else ""
        
        log_entries.append({
            'time': format_time_for_net(check_in.checked_in_at, net.started_at, net.closed_at),
            'from_station': check_in.callsign,
            'to_station': 'NET',
            'message': f"Check-in{location_info}{weather_info}"
        })
    
    # Add chat messages (non-system)
    for msg in chat_messages:
        callsign = msg.user.callsign if msg.user and msg.user.callsign else ('System' if msg.is_system else 'Unknown')
        if callsign != 'System':
            log_entries.append({
                'time': format_time_for_net(msg.created_at, net.started_at, net.closed_at),
                'from_station': callsign,
                'to_station': 'NET',
                'message': msg.message
            })
    
    # Sort by time
    log_entries.sort(key=lambda x: x.get('time', ''))
    
    # Create ICS-309 CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # ICS-309 header info
    writer.writerow(["ICS-309 COMMUNICATIONS LOG"])
    writer.writerow([""])
    writer.writerow(["1. Incident Name:", net.name])
    writer.writerow(["2. Operational Period:", f"{started_at} to {closed_at}"])
    writer.writerow(["3. Radio Operator:", f"{ncs_name} / {ncs_callsign}"])
    writer.writerow(["4. Channel/Frequency:", freq_list])
    writer.writerow([""])
    writer.writerow(["TIME", "FROM", "TO", "SUBJECT/MESSAGE"])
    
    for entry in log_entries:
        writer.writerow([
            entry.get('time', ''),
            entry.get('from_station', ''),
            entry.get('to_station', ''),
            entry.get('message', '')
        ])
    
    writer.writerow([""])
    writer.writerow(["9. Prepared By:", "ECTLogger - Automated Log"])
    writer.writerow(["10. Date/Time:", closed_at])
    
    # Prepare response
    output.seek(0)
    date_str = net.started_at.strftime('%Y%m%d') if net.started_at else 'draft'
    filename = f"ICS309_{net.name.replace(' ', '_')}_{date_str}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
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


