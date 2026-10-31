"""Channels marked offline at a station's place (models.StationChannelMark).

Net control marks a channel offline when a station loses it (a radio fails,
a repeater drops, the HF operator leaves the desk) and brings it back when
it returns. The channel is never taken off the station's row: it shows
greyed with the time, so the record of what the place could reach stays
whole (Brad, 2026-10-30). Each change posts a line to the net's chat, which
is the net's log, and refreshes everyone's check-in list.
"""
from datetime import datetime, UTC
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import CheckIn, CoverageSite, Frequency, Net, NetStatus, StationChannelMark, User
from app.permissions import check_net_permission
from app.schemas import StationChannelMarkResponse
from app.services.station_place import place_label
from app.services.station_rows import row_station_key
from app.utils import display_callsign

router = APIRouter(prefix="/check-ins", tags=["check-ins"])


@router.get("/nets/{net_id}/channel-marks", response_model=List[StationChannelMarkResponse])
async def list_channel_marks(net_id: int, db: AsyncSession = Depends(get_db)):
    """Every offline mark on the net, open and restored, oldest first. Open
    to anyone who can read the check-in list, like the list itself."""
    marks = (await db.execute(
        select(StationChannelMark).where(StationChannelMark.net_id == net_id).order_by(StationChannelMark.offline_at)
    )).scalars().all()
    return [StationChannelMarkResponse.model_validate(m) for m in marks]


async def _load(db: AsyncSession, check_in_id: int, frequency_id: int, user: User):
    check_in = await db.get(CheckIn, check_in_id)
    if check_in is None:
        raise HTTPException(status_code=404, detail="Check-in not found")
    net = (await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == check_in.net_id)
    )).scalar_one()
    log_open = net.status in (NetStatus.ACTIVE, NetStatus.LOBBY) or (
        net.status == NetStatus.CLOSED and net.log_held_since is not None
    )
    if not log_open:
        raise HTTPException(status_code=400, detail="This net's log has been sent")
    if not await check_net_permission(db, net, user, ["NCS", "LOGGER"]):
        raise HTTPException(status_code=403, detail="Only net control can mark a channel offline")
    frequency = next((f for f in net.frequencies if f.id == frequency_id), None)
    if frequency is None:
        raise HTTPException(status_code=400, detail="That isn't one of this net's frequencies")
    return check_in, net, frequency


async def _announce(db: AsyncSession, net: Net, check_in: CheckIn, frequency: Frequency, user: User, offline: bool):
    from app.main import manager, post_system_message
    site_names = dict((await db.execute(
        select(CoverageSite.id, CoverageSite.name).where(CoverageSite.net_id == net.id)
    )).all())
    place = place_label(check_in.coverage_site_id, check_in.operating_position, check_in.status, site_names)
    where = f" at {place}" if place else ""
    channel = f"{frequency.frequency} {frequency.mode}".strip() if frequency.frequency else frequency.mode
    state = "is offline on" if offline else "is back on"
    await post_system_message(net.id, f"{check_in.callsign}{where} {state} {channel} (marked by {display_callsign(user)})", db)
    await manager.broadcast({
        "type": "status_change",
        "data": {"id": check_in.id, "net_id": net.id, "user_id": check_in.user_id,
                 "status": check_in.status, "callsign": check_in.callsign},
        "timestamp": datetime.now(UTC).isoformat(),
    }, net.id)


async def _open_mark(db: AsyncSession, net_id: int, station_key: str, frequency_id: int):
    return (await db.execute(
        select(StationChannelMark).where(
            StationChannelMark.net_id == net_id,
            StationChannelMark.station_key == station_key,
            StationChannelMark.frequency_id == frequency_id,
            StationChannelMark.restored_at.is_(None),
        )
    )).scalars().first()


@router.post("/check-ins/{check_in_id}/channels/{frequency_id}/offline", response_model=StationChannelMarkResponse)
async def mark_channel_offline(
    check_in_id: int, frequency_id: int,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Mark a channel offline for the station at this check-in's place."""
    check_in, net, frequency = await _load(db, check_in_id, frequency_id, current_user)
    key = row_station_key(check_in)
    if await _open_mark(db, net.id, key, frequency_id) is not None:
        raise HTTPException(status_code=400, detail="That channel is already marked offline")
    mark = StationChannelMark(net_id=net.id, station_key=key, frequency_id=frequency_id,
                              offline_at=datetime.now(UTC), offline_by_id=current_user.id)
    db.add(mark)
    await db.commit()
    await db.refresh(mark)
    await _announce(db, net, check_in, frequency, current_user, offline=True)
    return StationChannelMarkResponse.model_validate(mark)


@router.post("/check-ins/{check_in_id}/channels/{frequency_id}/online", response_model=StationChannelMarkResponse)
async def mark_channel_online(
    check_in_id: int, frequency_id: int,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Bring a channel marked offline back for the station at this place."""
    check_in, net, frequency = await _load(db, check_in_id, frequency_id, current_user)
    mark = await _open_mark(db, net.id, row_station_key(check_in), frequency_id)
    if mark is None:
        raise HTTPException(status_code=400, detail="That channel isn't marked offline")
    mark.restored_at = datetime.now(UTC)
    mark.restored_by_id = current_user.id
    await db.commit()
    await db.refresh(mark)
    await _announce(db, net, check_in, frequency, current_user, offline=False)
    return StationChannelMarkResponse.model_validate(mark)
