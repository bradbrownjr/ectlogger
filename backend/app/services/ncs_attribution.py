"""
Who is credited as NCS for a set of nets.

The one place that answers it, for every caller: the net list and a net's
own page (nets_core), the schedule calendar, the schedule statistics history,
the ICS-309 export, the closing log email and the 1h staff reminder. It
applies the single attribution rule in ``app.utils.format_ncs_attribution``:
every *active* NCS, oldest assignment first.

Two sources, merged by assigned_at: NetRole (an account) and NetCallsignRole
(a station with no account, credited by callsign; see
services/callsign_people.py). Until 2026-10-19 six callers each ran their own
copy of the NetRole query, so a station with no account could not have been
credited without changing all six.
"""
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NetCallsignRole, NetRole, User
from app.utils import format_ncs_attribution


async def load_ncs_rows(
    db: AsyncSession, net_ids: Iterable[int]
) -> Dict[int, List[Tuple[Optional[str], Optional[str]]]]:
    """Map net id -> [(callsign, name), ...] for its active NCS, oldest first.

    A callsign-only NCS has no name. Nets with no NCS are absent."""
    net_ids = list(net_ids)
    if not net_ids:
        return {}
    account_rows = await db.execute(
        select(NetRole.net_id, NetRole.assigned_at, User.callsign, User.name)
        .join(User, User.id == NetRole.user_id)
        .where(NetRole.net_id.in_(net_ids))
        .where(NetRole.role == "NCS")
        .where(NetRole.is_active == True)  # noqa: E712
    )
    callsign_rows = await db.execute(
        select(NetCallsignRole.net_id, NetCallsignRole.assigned_at, NetCallsignRole.callsign)
        .where(NetCallsignRole.net_id.in_(net_ids))
        .where(NetCallsignRole.role == "NCS")
    )
    merged: list = [(net_id, assigned_at, callsign, name) for net_id, assigned_at, callsign, name in account_rows.all()]
    merged += [(net_id, assigned_at, callsign, None) for net_id, assigned_at, callsign in callsign_rows.all()]

    def sort_key(row):
        # assigned_at is a server default and can be None on a row built in
        # a test without a flush; those sort last rather than raising.
        assigned_at = row[1]
        return (assigned_at is None, assigned_at.replace(tzinfo=None) if assigned_at else None)

    merged.sort(key=sort_key)
    by_net: dict = {}
    for net_id, _assigned_at, callsign, name in merged:
        by_net.setdefault(net_id, []).append((callsign, name))
    return by_net


async def load_ncs_attribution(
    db: AsyncSession, net_ids: Iterable[int]
) -> Dict[int, Tuple[Optional[str], Optional[str]]]:
    """Map net id -> (ncs_callsign, ncs_name) for every net that has an active NCS."""
    rows = await load_ncs_rows(db, net_ids)
    return {nid: format_ncs_attribution(net_rows) for nid, net_rows in rows.items()}


async def net_ncs_attribution(db: AsyncSession, net_id: int) -> Tuple[Optional[str], Optional[str]]:
    """(ncs_callsign, ncs_name) for one net; (None, None) when it has no NCS."""
    return (await load_ncs_attribution(db, [net_id])).get(net_id, (None, None))
