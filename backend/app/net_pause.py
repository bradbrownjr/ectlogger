"""
Net pause tracking.

A net with an assigned NCS is considered "paused" whenever none of its
assigned-active NCS operators are currently present (checked in and not
away/checked out) — i.e. the NCS had to step away with no co-NCS covering.
A net with no NCS assigned at all is not "paused" — that's a different,
by-design scenario (an open net running without a claimed NCS).

Transitions are detected and persisted here, server-side, rather than
derived independently by each connected client, so total_paused_seconds is
written exactly once per transition regardless of which mutation
(check-in status change, role change, check-in delete) triggered it.
Call sync_net_pause_state() after any mutation that could change NCS
presence: check-in status update/delete, NCS role toggle/assign/remove.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Net, NetRole, CheckIn, NetStatus, StationStatus

PRESENT_STATUSES = {
    StationStatus.CHECKED_IN, StationStatus.HAS_TRAFFIC, StationStatus.LISTENING,
    StationStatus.RELAY, StationStatus.ANNOUNCEMENTS, StationStatus.MOBILE,
}


async def sync_net_pause_state(db: AsyncSession, net_id: int) -> None:
    """Recompute whether `net_id` should be paused and persist/broadcast any transition."""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net or net.status not in (NetStatus.ACTIVE, NetStatus.LOBBY):
        return

    ncs_result = await db.execute(
        select(NetRole).where(
            NetRole.net_id == net_id,
            NetRole.role == "NCS",
            NetRole.is_active != False,  # noqa: E712
        )
    )
    ncs_roles = ncs_result.scalars().all()

    if not ncs_roles:
        should_be_paused = False
    else:
        ncs_user_ids = {r.user_id for r in ncs_roles}
        checkins_result = await db.execute(
            select(CheckIn).where(CheckIn.net_id == net_id, CheckIn.user_id.in_(ncs_user_ids))
        )
        ncs_present = any(ci.status in PRESENT_STATUSES for ci in checkins_result.scalars().all())
        should_be_paused = not ncs_present

    now = datetime.now(timezone.utc)
    changed = False

    if should_be_paused and net.paused_at is None:
        net.paused_at = now
        changed = True
    elif not should_be_paused and net.paused_at is not None:
        elapsed = (now - net.paused_at).total_seconds()
        net.total_paused_seconds = (net.total_paused_seconds or 0) + int(elapsed)
        net.paused_at = None
        changed = True

    if not changed:
        return

    await db.commit()
    await db.refresh(net)

    from app.main import manager
    await manager.broadcast({
        "type": "net_pause_change",
        "data": {
            "net_id": net.id,
            "paused": net.paused_at is not None,
            "paused_at": net.paused_at.isoformat() if net.paused_at else None,
            "total_paused_seconds": net.total_paused_seconds,
        },
        "timestamp": now.isoformat(),
    }, net.id)
