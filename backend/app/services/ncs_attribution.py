"""
Who is credited as NCS for a set of nets.

The one place that answers it, for every caller: the net list and a net's
own page (nets_core), the schedule calendar, the schedule statistics history
and NCS leaderboard, the ICS-309 export, the closing log email and the 1h
staff reminder. It applies the single attribution rule in
``app.utils.format_ncs_attribution``: every *active* NCS, oldest assignment
first.

Two sources, merged by assigned_at: NetRole (an account) and NetCallsignRole
(a station with no account, credited by callsign; see
services/callsign_people.py). Until 2026-10-19 six callers each ran their own
copy of the NetRole query, so a station with no account could not have been
credited without changing all six.

Once a net has ended, an NCS is credited only if they took part
(took_part_in): they're in its check-in list, logged one of its check-ins,
or posted in its chat. The rotation's pick is assigned a day ahead, so
before 2026-10-28 an NCS who never turned up was credited on the report,
ICS-309 and closing email alongside whoever ran the net, and the net manager
had to remove them by hand (production: 12 such credits on 10 nets, two of
which never ran). Before and during a net nothing is filtered, so the card
still shows who is on duty. A net left with no credited NCS asks who ran it
when it closes (ncs_needed); see routers/nets_core.py::close_net.
"""
from typing import Dict, Iterable, List, NamedTuple, Optional, Set, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, CheckIn, Net, NetCallsignRole, NetRole, NetStatus, User
from app.utils import format_ncs_attribution

# Shown wherever an ended net has no credited NCS (closing email, ICS-309,
# report). Never the net manager's callsign: that credited someone who may
# not have run the net, the same mistake this module exists to prevent.
NCS_NOT_RECORDED = "Not recorded"

ENDED_STATUSES = (NetStatus.CLOSED, NetStatus.ARCHIVED)


class NcsCredit(NamedTuple):
    callsign: Optional[str]
    name: Optional[str]
    user_id: Optional[int]  # None for a station with no account


class _Participation(NamedTuple):
    user_ids: Set[int]
    callsigns: Set[str]


async def _participation(db: AsyncSession, net_ids: List[int]) -> Dict[int, _Participation]:
    """Per net: every account and callsign that took part."""
    found: Dict[int, _Participation] = {nid: _Participation(set(), set()) for nid in net_ids}
    for net_id, user_id, logged_by, callsign in (await db.execute(
        select(CheckIn.net_id, CheckIn.user_id, CheckIn.checked_in_by_id, func.upper(CheckIn.callsign))
        .where(CheckIn.net_id.in_(net_ids))
    )).all():
        found[net_id].user_ids.update(i for i in (user_id, logged_by) if i)
        if callsign:
            found[net_id].callsigns.add(callsign)
    for net_id, user_id in (await db.execute(
        select(ChatMessage.net_id, ChatMessage.user_id).distinct()
        .where(ChatMessage.net_id.in_(net_ids), ChatMessage.user_id.isnot(None))
        .where(ChatMessage.is_system != True)  # noqa: E712
    )).all():
        found[net_id].user_ids.add(user_id)
    return found


def took_part_in(credit: NcsCredit, participation: _Participation) -> bool:
    if credit.user_id is not None and credit.user_id in participation.user_ids:
        return True
    return bool(credit.callsign) and credit.callsign.upper() in participation.callsigns


async def load_ncs_rows(
    db: AsyncSession, net_ids: Iterable[int], *, as_if_ended: bool = False
) -> Dict[int, List[NcsCredit]]:
    """Map net id -> its credited NCS, oldest first. Nets with none are absent.

    as_if_ended applies the ended-net rule to a net still running: "who would
    be credited if it closed now", for the close prompt."""
    net_ids = list(net_ids)
    if not net_ids:
        return {}
    account_rows = await db.execute(
        select(NetRole.net_id, NetRole.assigned_at, User.callsign, User.name, User.id)
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
    merged: list = [(net_id, assigned_at, NcsCredit(callsign, name, user_id))
                    for net_id, assigned_at, callsign, name, user_id in account_rows.all()]
    merged += [(net_id, assigned_at, NcsCredit(callsign, None, None))
               for net_id, assigned_at, callsign in callsign_rows.all()]
    if not merged:
        return {}

    # Only ended nets that hold an NCS role need the participation lookup.
    filtered = {nid for nid, _a, _c in merged}
    if not as_if_ended:
        filtered = set((await db.execute(
            select(Net.id).where(Net.id.in_(filtered), Net.status.in_(ENDED_STATUSES))
        )).scalars().all())
    participation = await _participation(db, sorted(filtered)) if filtered else {}

    def sort_key(row):
        # assigned_at is a server default and can be None on a row built in
        # a test without a flush; those sort last rather than raising.
        assigned_at = row[1]
        return (assigned_at is None, assigned_at.replace(tzinfo=None) if assigned_at else None)

    merged.sort(key=sort_key)
    by_net: Dict[int, List[NcsCredit]] = {}
    for net_id, _assigned_at, credit in merged:
        if net_id in participation and not took_part_in(credit, participation[net_id]):
            continue
        by_net.setdefault(net_id, []).append(credit)
    return by_net


async def load_ncs_attribution(
    db: AsyncSession, net_ids: Iterable[int]
) -> Dict[int, Tuple[Optional[str], Optional[str]]]:
    """Map net id -> (ncs_callsign, ncs_name) for every net that has a credited NCS."""
    rows = await load_ncs_rows(db, net_ids)
    return {nid: format_ncs_attribution(net_rows) for nid, net_rows in rows.items()}


async def net_ncs_attribution(db: AsyncSession, net_id: int) -> Tuple[Optional[str], Optional[str]]:
    """(ncs_callsign, ncs_name) for one net; (None, None) when it has no NCS."""
    return (await load_ncs_attribution(db, [net_id])).get(net_id, (None, None))


async def ncs_needed(db: AsyncSession, net: Net) -> bool:
    """True when closing *net* (or sending its held log) must first record
    who ran it: someone checked in, and no NCS would be credited. A net
    nobody checked into has nothing to credit."""
    has_check_ins = (await db.execute(
        select(CheckIn.id).where(CheckIn.net_id == net.id).limit(1)
    )).scalar_one_or_none() is not None
    if not has_check_ins:
        return False
    return not (await load_ncs_rows(db, [net.id], as_if_ended=True)).get(net.id)


NCS_NEEDED_DETAIL = "Choose who ran this net before closing it or sending its log."


async def record_ncs_from_check_in(db: AsyncSession, net: Net, check_in_id: int, actor: User) -> str:
    """Record the station on one of *net*'s check-ins as its NCS, the answer
    to "Who ran this net?" (POST /nets/{id}/close and /send-log). Returns
    the callsign. Does not commit.

    A check-in with an account (its own, or one whose primary callsign this
    is) gets a NetRole, reactivated if they had stepped down; a station with
    no account gets a credit-only NetCallsignRole, as POST
    /nets/{id}/callsign-roles would give it. Either way they are in the
    check-in list, so took_part_in credits them."""
    from fastapi import HTTPException

    from app.audit import record_net_event
    from app.services.callsign_people import find_account_by_primary_callsign

    check_in = (await db.execute(
        select(CheckIn).where(CheckIn.id == check_in_id, CheckIn.net_id == net.id)
    )).scalar_one_or_none()
    if check_in is None:
        raise HTTPException(status_code=400, detail="That station isn't checked in to this net")
    callsign = (check_in.callsign or "").strip().upper()
    user = None
    if check_in.user_id:
        user = (await db.execute(select(User).where(User.id == check_in.user_id))).scalar_one_or_none()
    if user is None and callsign:
        user = await find_account_by_primary_callsign(db, callsign)

    if user is not None:
        role = (await db.execute(
            select(NetRole).where(NetRole.net_id == net.id, NetRole.user_id == user.id, NetRole.role == "NCS")
            .limit(1)
        )).scalar_one_or_none()
        if role is None:
            db.add(NetRole(net_id=net.id, user_id=user.id, role="NCS"))
        else:
            role.is_active = True
        label = user.callsign or callsign
    else:
        existing = (await db.execute(
            select(NetCallsignRole).where(NetCallsignRole.net_id == net.id, NetCallsignRole.callsign == callsign)
        )).scalars().all()
        for row in existing:
            await db.delete(row)
        db.add(NetCallsignRole(net_id=net.id, callsign=callsign, role="NCS", assigned_by_id=actor.id))
        label = callsign
    record_net_event(db, "net.role_assigned", actor, net, subject=user,
                     details={"role": "NCS", "station": label, "who_ran_it": True})
    await db.flush()
    return label
