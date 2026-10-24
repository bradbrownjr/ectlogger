"""Removing a station from a net and keeping it from checking itself back in.

For a participants-only net (a drill's deployed teams) that leaves self
check-in open, since nobody knows ahead of time who will volunteer: when
someone who isn't taking part checks in anyway, net control removes and
blocks them instead of turning self check-in off for everyone. Works on any
net. See models.NetBlock and permissions.may_block_station.
"""
from datetime import datetime, UTC
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import record_net_event
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ChatNetMute, CheckIn, Net, NetBlock, User
from app.permissions import may_block_station, net_access
from app.routers.chat import _broadcast_net_mute_changed, announce_net_mute, apply_net_mute
from app.schemas import NetBlockCreate, NetBlockResponse

router = APIRouter(prefix="/nets", tags=["net-blocks"])


async def _net_for_blocking(db: AsyncSession, net_id: int, user: User) -> Net:
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    if not may_block_station(await net_access(db, net, user)):
        raise HTTPException(status_code=403, detail="Not authorized")
    return net


def _response(block: NetBlock) -> NetBlockResponse:
    return NetBlockResponse(
        id=block.id,
        net_id=block.net_id,
        callsign=block.callsign,
        user_id=block.user_id,
        blocked_by_callsign=block.blocked_by.callsign if block.blocked_by else None,
        created_at=block.created_at,
    )


@router.get("/{net_id}/blocks", response_model=List[NetBlockResponse])
async def list_blocks(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The stations blocked on this net. Net control only."""
    await _net_for_blocking(db, net_id, current_user)
    result = await db.execute(
        select(NetBlock).options(selectinload(NetBlock.blocked_by))
        .where(NetBlock.net_id == net_id).order_by(NetBlock.created_at)
    )
    return [_response(b) for b in result.scalars().all()]


@router.post("/{net_id}/blocks", response_model=NetBlockResponse, status_code=status.HTTP_201_CREATED)
async def block_station(
    net_id: int,
    body: NetBlockCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the station on a check-in from this net and block it.

    Deletes every check-in under that callsign on the net (it was never
    meant to be on it), records the block so the station can't check itself
    back in, and net-wide mutes its chat when it has an account. Returns the
    block; every viewer gets a check_in_deleted per removed row.
    """
    net = await _net_for_blocking(db, net_id, current_user)
    check_in = (await db.execute(
        select(CheckIn).where(CheckIn.id == body.check_in_id, CheckIn.net_id == net_id)
    )).scalar_one_or_none()
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    if check_in.user_id is not None and check_in.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't block yourself")

    callsign = check_in.callsign.strip().upper()
    target_user: Optional[User] = None
    if check_in.user_id is not None:
        target_user = (await db.execute(select(User).where(User.id == check_in.user_id))).scalar_one_or_none()

    block = (await db.execute(
        select(NetBlock).where(NetBlock.net_id == net_id, NetBlock.callsign == callsign)
    )).scalar_one_or_none()
    if block is None:
        block = NetBlock(net_id=net_id, callsign=callsign)
        db.add(block)
    block.user_id = target_user.id if target_user else block.user_id
    block.blocked_by_user_id = current_user.id

    removed = (await db.execute(
        select(CheckIn).where(CheckIn.net_id == net_id, func.upper(CheckIn.callsign) == callsign)
    )).scalars().all()
    removed_ids = [row.id for row in removed]
    for row in removed:
        await db.delete(row)

    mute = await apply_net_mute(db, net, target_user, current_user) if target_user else None
    record_net_event(db, "net.station_blocked", current_user, net,
                     subject_user_id=target_user.id if target_user else None,
                     details={"station": callsign, "check_ins_removed": len(removed_ids)})
    await db.commit()

    from app.main import manager
    for removed_id in removed_ids:
        await manager.broadcast({
            "type": "check_in_deleted",
            "data": {"id": removed_id, "net_id": net_id},
            "timestamp": datetime.now(UTC).isoformat(),
        }, net_id)
    if mute is not None:
        await announce_net_mute(db, mute, target_user, current_user)
    from app.net_pause import sync_net_pause_state
    await sync_net_pause_state(db, net_id)

    block = (await db.execute(
        select(NetBlock).options(selectinload(NetBlock.blocked_by)).where(NetBlock.id == block.id)
    )).scalar_one()
    return _response(block)


@router.delete("/{net_id}/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_station(
    net_id: int,
    block_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lift a block, and the chat mute blocking applied. The station can
    check itself in again; its removed check-ins don't come back."""
    net = await _net_for_blocking(db, net_id, current_user)
    block = (await db.execute(
        select(NetBlock).where(NetBlock.id == block_id, NetBlock.net_id == net_id)
    )).scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    unmuted = None
    if block.user_id is not None:
        result = await db.execute(
            delete(ChatNetMute).where(ChatNetMute.net_id == net_id, ChatNetMute.muted_user_id == block.user_id)
        )
        if result.rowcount:
            unmuted = block.user_id
            record_net_event(db, "chat.station_unmuted", current_user, net, subject_user_id=block.user_id)
    record_net_event(db, "net.station_unblocked", current_user, net,
                     subject_user_id=block.user_id, details={"station": block.callsign})
    await db.delete(block)
    await db.commit()
    if unmuted is not None:
        await _broadcast_net_mute_changed(net_id, {"muted_user_id": unmuted, "active": False})
    return None
