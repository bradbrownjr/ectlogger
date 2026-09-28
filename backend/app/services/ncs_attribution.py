"""
Batch lookup of who is credited as NCS for a set of nets.

One query for any number of nets, applying the single attribution rule in
``app.utils.format_ncs_attribution``: every *active* NCS, oldest assignment
first. Shared by the net list and the schedule calendar so the two never
credit different people for the same net.
"""
from typing import Dict, Iterable, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NetRole, User
from app.utils import format_ncs_attribution


async def load_ncs_attribution(
    db: AsyncSession, net_ids: Iterable[int]
) -> Dict[int, Tuple[Optional[str], Optional[str]]]:
    """Map net id -> (ncs_callsign, ncs_name) for every net that has an active NCS."""
    net_ids = list(net_ids)
    if not net_ids:
        return {}
    result = await db.execute(
        select(NetRole.net_id, User.callsign, User.name)
        .join(User, User.id == NetRole.user_id)
        .where(NetRole.net_id.in_(net_ids))
        .where(NetRole.role == "NCS")
        .where(NetRole.is_active == True)  # noqa: E712
        .order_by(NetRole.assigned_at.asc())
    )
    accumulated: dict = {}
    for net_id, callsign, name in result.all():
        accumulated.setdefault(net_id, []).append((callsign, name))
    return {nid: format_ncs_attribution(rows) for nid, rows in accumulated.items()}
