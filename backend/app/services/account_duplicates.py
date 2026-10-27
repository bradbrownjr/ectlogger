"""Accounts that are probably one operator signed up twice (Admin > Users >
Possible duplicates), the accounts an admin then merges
(services/account_merge.py).

A pair is flagged when either:
- the email addresses match, ignoring capitals;
- they share a callsign exactly (primary, additional, or previous);
- one account's callsign is in the other's email address (k9npdnh@... next
  to K9NPD);
- they have the same full name. Only a name of two words or more: most
  accounts carry a first name only, and on production's accounts a
  first-name match flagged 16 pairs, nearly all different people.

Two kinds of match are added as reasons to a pair already flagged, never
flag one on their own:
- a shared sign-in address (activity log): households and clubs share one;
- callsigns that differ only by a /suffix or prefix: a club can run one
  account per station on purpose (WS1EC, WS1EC/HF, WS1EC/NP on production).

Banned accounts are left out (a merge refuses them anyway). Checked against
production's accounts on 2026-10-27: 5 pairs, every one a real duplicate
(the WS1EC station accounts are what the /suffix rule above keeps out).
"""
import json
from collections import defaultdict
from itertools import combinations
from typing import Dict, List, Set, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, CheckIn, User

# Shortest callsign looked for inside an email address, so a two-letter
# fragment never matches.
MIN_CALLSIGN_IN_EMAIL = 4


def base_callsign(callsign: str) -> str:
    """KD1OM/1, VE/KD1OM and KD1OM/P are all KD1OM: the longest part."""
    parts = [p for p in callsign.upper().strip().split("/") if p]
    return max(parts, key=len) if parts else ""


def _callsigns(user: User) -> Set[str]:
    """Every callsign on the account, upper case, as written."""
    found = {user.callsign} if user.callsign else set()
    for column in (user.callsigns, user.previous_callsigns):
        try:
            found |= {cs for cs in json.loads(column or "[]") if cs}
        except (json.JSONDecodeError, TypeError):
            pass
    return {cs.strip().upper() for cs in found if cs.strip()}


def _bases(user: User) -> Set[str]:
    return {b for b in (base_callsign(cs) for cs in _callsigns(user)) if b}


def _full_name(user: User) -> str:
    words = (user.name or "").lower().split()
    return " ".join(words) if len(words) >= 2 else ""


async def find_possible_duplicates(db: AsyncSession) -> List[dict]:
    """[{user_ids: [a, b], reasons: [...], keep_id}], keep_id being the
    account to merge into: the one with a callsign, then more check-ins,
    then the older."""
    users = (await db.execute(select(User).where(User.is_active == True))).scalars().all()  # noqa: E712
    by_id = {u.id: u for u in users}
    reasons: Dict[Tuple[int, int], List[str]] = defaultdict(list)

    def flag(ids, reason):
        for a, b in combinations(sorted(set(ids)), 2):
            if reason not in reasons[(a, b)]:
                reasons[(a, b)].append(reason)

    buckets: Dict[Tuple[str, str], List[int]] = defaultdict(list)
    for u in users:
        buckets[("Same email", (u.email or "").strip().lower())].append(u.id)
        for cs in _callsigns(u):
            buckets[("Same callsign", cs)].append(u.id)
        if _full_name(u):
            buckets[("Same full name", _full_name(u))].append(u.id)
    for (reason, key), ids in buckets.items():
        if key and len(ids) > 1:
            flag(ids, reason)

    local_parts = {u.id: (u.email or "").split("@")[0].upper() for u in users}
    for u in users:
        for cs in _bases(u):
            if len(cs) < MIN_CALLSIGN_IN_EMAIL:
                continue
            for other_id, local in local_parts.items():
                if other_id != u.id and cs in local:
                    flag([u.id, other_id], "Callsign in the other's email")

    if not reasons:
        return []

    # Supporting evidence only.
    flagged = {i for pair in reasons for i in pair}
    addresses: Dict[int, Set[str]] = defaultdict(set)
    for user_id, ip in (await db.execute(
        select(AuditEvent.actor_user_id, AuditEvent.ip).where(
            AuditEvent.action == "auth.signed_in", AuditEvent.ip.isnot(None),
            AuditEvent.actor_user_id.in_(flagged),
        )
    )).all():
        addresses[user_id].add(ip)
    check_ins = dict((await db.execute(
        select(CheckIn.user_id, func.count()).where(CheckIn.user_id.in_(flagged)).group_by(CheckIn.user_id)
    )).all())

    bases = {i: _bases(by_id[i]) for i in flagged}

    def keep_rank(u: User):
        return (bool(u.callsign), check_ins.get(u.id, 0), -u.id)

    pairs = []
    for (a, b), why in sorted(reasons.items()):
        if "Same callsign" not in why and bases[a] & bases[b]:
            why.append("Same callsign apart from /suffix")
        if addresses[a] & addresses[b]:
            why.append("Same sign-in address")
        keep = max(by_id[a], by_id[b], key=keep_rank)
        pairs.append({"user_ids": [a, b], "reasons": why, "keep_id": keep.id})
    return pairs
