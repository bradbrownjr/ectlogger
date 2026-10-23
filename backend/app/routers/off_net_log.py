"""
Off-net log: a station's activity away from this net, for its ICS-309.

A check-in to the Maine ARES Net on HF, a call on DMR talkgroup 3123, or a
Winlink message sent to another county is logged here as the fact that it
happened, never its content (models.OffNetLogEntry). Accepted entries become
ICS-309 rows (services/ics309_log.py).

Who may do what:
  - A signed-in station checked into the net logs its own activity. The
    entry is pending, and its from_station is that station's callsign.
  - Net control staff (permissions.may_log_off_net) log for any station,
    including activity called in over the air; their entries count at once.
  - Reviewers (permissions.may_review_off_net_log) accept, reject, edit and
    delete any entry. The station that wrote a pending entry may still edit
    or delete it, and net control staff may edit or delete their own.

Nobody signed out sees these entries. A station that isn't staff sees the
accepted ones and its own.

Endpoints (all under /nets/{net_id}/off-net-log):
  GET    ""                    -> OffNetLogListResponse
  POST   ""                    OffNetLogEntryCreate -> OffNetLogEntryResponse
  PUT    "/{entry_id}"         OffNetLogEntryCreate -> OffNetLogEntryResponse
  POST   "/{entry_id}/review"  OffNetLogReview -> OffNetLogEntryResponse
  POST   "/accept-pending"     -> {"accepted": n}
  DELETE "/{entry_id}"         -> 204
"""
import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.audit import record_net_event
from app.models import CheckIn, Net, NetStatus, OffNetLogEntry, User
from app.permissions import NetAccess, may_log_off_net, may_review_off_net_log, net_access
from app.schemas import (
    OffNetLogEntryCreate,
    OffNetLogEntryResponse,
    OffNetLogListResponse,
    OffNetLogReview,
)
from app.utils import display_callsign

router = APIRouter(prefix="/nets", tags=["off-net-log"])

# The net is open, or closed and its log still being finished.
WRITABLE_STATUSES = {NetStatus.LOBBY, NetStatus.ACTIVE, NetStatus.CLOSED}


class _Viewer:
    """One user's standing on one net's off-net log."""

    def __init__(self, user: User, access: NetAccess, own_callsign: Optional[str]):
        self.user = user
        self.staff = may_log_off_net(access)
        self.reviewer = may_review_off_net_log(access)
        # Callsign of the user's own check-in on this net, if they have one.
        self.own_callsign = own_callsign

    @property
    def can_add(self) -> bool:
        return self.staff or self.own_callsign is not None

    def may_see(self, entry: OffNetLogEntry) -> bool:
        return self.staff or entry.status == "accepted" or entry.entered_by_user_id == self.user.id

    def may_edit(self, entry: OffNetLogEntry) -> bool:
        """Edit or delete."""
        if self.reviewer:
            return True
        if entry.entered_by_user_id != self.user.id:
            return False
        return self.staff or entry.status != "accepted"


async def _load(db: AsyncSession, net_id: int, user: User):
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    own_callsign = (await db.execute(
        select(CheckIn.callsign)
        .where(CheckIn.net_id == net_id, CheckIn.user_id == user.id)
        .order_by(CheckIn.checked_in_at)
        .limit(1)
    )).scalar_one_or_none()
    return net, _Viewer(user, await net_access(db, net, user), own_callsign)


async def _entry(db: AsyncSession, net_id: int, entry_id: int) -> OffNetLogEntry:
    entry = (await db.execute(
        select(OffNetLogEntry)
        .options(selectinload(OffNetLogEntry.entered_by), selectinload(OffNetLogEntry.reviewed_by))
        .where(OffNetLogEntry.id == entry_id, OffNetLogEntry.net_id == net_id)
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


def _require_writable(net: Net) -> None:
    if net.status not in WRITABLE_STATUSES:
        raise HTTPException(status_code=400, detail="The off-net log opens with the net's lobby")


def _response(entry: OffNetLogEntry, viewer: _Viewer) -> OffNetLogEntryResponse:
    return OffNetLogEntryResponse(
        id=entry.id,
        net_id=entry.net_id,
        occurred_at=entry.occurred_at,
        from_station=entry.from_station,
        to_station=entry.to_station,
        channel=entry.channel,
        message=entry.message,
        message_id=entry.message_id,
        status=entry.status,
        entered_by_user_id=entry.entered_by_user_id,
        entered_by_callsign=display_callsign(entry.entered_by) if entry.entered_by else None,
        reviewed_by_callsign=display_callsign(entry.reviewed_by) if entry.reviewed_by else None,
        reviewed_at=entry.reviewed_at,
        created_at=entry.created_at,
        can_edit=viewer.may_edit(entry),
        can_review=viewer.reviewer,
    )


async def _broadcast_changed(net_id: int) -> None:
    """Tell open views to refetch. Carries no entry content, so it is safe
    for every connection, guests included."""
    from app.main import manager
    await manager.broadcast({
        "type": "off_net_log_changed",
        "data": {"net_id": net_id},
        "timestamp": dt.datetime.utcnow().isoformat(),
    }, net_id)


def _apply(entry: OffNetLogEntry, data: OffNetLogEntryCreate, viewer: _Viewer) -> None:
    entry.occurred_at = data.occurred_at
    # Only net control staff log for another station.
    if viewer.staff:
        if not data.from_station:
            raise HTTPException(status_code=422, detail="Say which station it was")
        entry.from_station = data.from_station.upper()
    elif entry.from_station is None:
        entry.from_station = viewer.own_callsign
    entry.to_station = data.to_station
    entry.channel = data.channel
    entry.message = data.message
    entry.message_id = data.message_id


@router.get("/{net_id}/off-net-log", response_model=OffNetLogListResponse)
async def list_off_net_log(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    net, viewer = await _load(db, net_id, current_user)
    entries = (await db.execute(
        select(OffNetLogEntry)
        .options(selectinload(OffNetLogEntry.entered_by), selectinload(OffNetLogEntry.reviewed_by))
        .where(OffNetLogEntry.net_id == net.id)
        .order_by(OffNetLogEntry.occurred_at, OffNetLogEntry.id)
    )).scalars().all()
    visible = [e for e in entries if viewer.may_see(e)]
    return OffNetLogListResponse(
        entries=[_response(e, viewer) for e in visible],
        can_add=viewer.can_add and net.status in WRITABLE_STATUSES,
        adds_accepted=viewer.staff,
        can_review=viewer.reviewer,
        own_callsign=viewer.own_callsign,
        pending_count=sum(1 for e in visible if e.status == "pending"),
    )


@router.post("/{net_id}/off-net-log", response_model=OffNetLogEntryResponse, status_code=201)
async def add_off_net_entry(
    net_id: int,
    data: OffNetLogEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    net, viewer = await _load(db, net_id, current_user)
    _require_writable(net)
    if not viewer.can_add:
        raise HTTPException(status_code=403, detail="Check in to this net first")
    entry = OffNetLogEntry(
        net_id=net.id,
        entered_by_user_id=current_user.id,
        status="accepted" if viewer.staff else "pending",
    )
    _apply(entry, data, viewer)
    db.add(entry)
    await db.commit()
    entry = await _entry(db, net.id, entry.id)
    await _broadcast_changed(net.id)
    return _response(entry, viewer)


@router.put("/{net_id}/off-net-log/{entry_id}", response_model=OffNetLogEntryResponse)
async def update_off_net_entry(
    net_id: int,
    entry_id: int,
    data: OffNetLogEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    net, viewer = await _load(db, net_id, current_user)
    _require_writable(net)
    entry = await _entry(db, net.id, entry_id)
    if not viewer.may_edit(entry):
        raise HTTPException(status_code=403, detail="Only net control can change this entry")
    _apply(entry, data, viewer)
    await db.commit()
    entry = await _entry(db, net.id, entry_id)
    await _broadcast_changed(net.id)
    return _response(entry, viewer)


@router.post("/{net_id}/off-net-log/accept-pending")
async def accept_pending_off_net_entries(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept every pending entry at once (the close dialog's "Accept all")."""
    net, viewer = await _load(db, net_id, current_user)
    if not viewer.reviewer:
        raise HTTPException(status_code=403, detail="Only net control can review entries")
    result = await db.execute(
        update(OffNetLogEntry)
        .where(OffNetLogEntry.net_id == net.id, OffNetLogEntry.status == "pending")
        .values(status="accepted", reviewed_by_user_id=current_user.id,
                reviewed_at=dt.datetime.now(dt.timezone.utc))
    )
    await db.commit()
    if result.rowcount:
        await _broadcast_changed(net.id)
    return {"accepted": result.rowcount}


@router.post("/{net_id}/off-net-log/{entry_id}/review", response_model=OffNetLogEntryResponse)
async def review_off_net_entry(
    net_id: int,
    entry_id: int,
    data: OffNetLogReview,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    net, viewer = await _load(db, net_id, current_user)
    if not viewer.reviewer:
        raise HTTPException(status_code=403, detail="Only net control can review entries")
    entry = await _entry(db, net.id, entry_id)
    entry.status = data.status
    entry.reviewed_by_user_id = current_user.id
    entry.reviewed_at = dt.datetime.now(dt.timezone.utc)
    await db.commit()
    entry = await _entry(db, net.id, entry_id)
    await _broadcast_changed(net.id)
    return _response(entry, viewer)


@router.delete("/{net_id}/off-net-log/{entry_id}", status_code=204)
async def delete_off_net_entry(
    net_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    net, viewer = await _load(db, net_id, current_user)
    entry = await _entry(db, net.id, entry_id)
    if not viewer.may_edit(entry):
        raise HTTPException(status_code=403, detail="Only net control can delete this entry")
    await db.delete(entry)
    record_net_event(db, "off_net_log.deleted", current_user, net, subject_user_id=entry.entered_by_user_id,
                     details={"from": entry.from_station, "to": entry.to_station, "message": entry.message})
    await db.commit()
    await _broadcast_changed(net.id)
    return Response(status_code=204)
