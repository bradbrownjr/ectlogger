"""Who net control has blocked from a net (models.NetBlock). Read by the
check-in gate (routers/check_ins.py) and the block endpoints
(routers/net_blocks.py)."""
from typing import Set, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NetBlock


async def blocked_on_net(db: AsyncSession, net_id: int) -> Tuple[Set[str], Set[int]]:
    """The callsigns (upper case) and accounts blocked on a net."""
    rows = (await db.execute(
        select(NetBlock.callsign, NetBlock.user_id).where(NetBlock.net_id == net_id)
    )).all()
    return {c.upper() for c, _ in rows}, {u for _, u in rows if u is not None}
