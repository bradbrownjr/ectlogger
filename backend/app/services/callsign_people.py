"""
Operators named by callsign before they have an account.

A net manager can put an operator on a schedule's staff list, its NCS rotation,
a swap, or the 5th-week slot by callsign alone, and a Logger can credit a
station with no account as NCS, Logger or Relay on a net (NetCallsignRole).
Clubs adopting ECTLogger rarely have every net control operator signed up on
day one (N1KWG, Greater Manchester NH ARES, 2026-10-05), and some nets are run
by a Logger who checks the NCS in each week.

The rules, all enforced here:

- A callsign-only entry grants nothing. Every permission check compares a
  row's user_id to the signed-in account, and a callsign-only row's user_id
  is NULL. Net credit for a station with no account lives in its own table,
  net_callsign_roles, which no permission check reads at all.
- A callsign that already belongs to an account always resolves to that
  account (resolve_person), so the same operator is never listed twice.
- Nothing proves a callsign belongs to whoever typed it into a profile, and
  taking over a staff entry is taking over the power to run (and, as staff,
  edit) a schedule. So an account takes over a schedule's entries by itself
  only when it signed in with the address *that schedule's* manager invited
  the callsign at (TeamInvite). Every other match is held: the schedule's
  manager is told once and links it by hand (claim_callsign_placeholders).
  Only the account's primary callsign (the unique column) is ever matched
  automatically; an extra or GMRS callsign is anybody's to type.
- Every take-over is recorded per schedule with every row it changed, so an
  admin can undo it exactly (revert_callsign_claim), and banning or deleting
  an account undoes all of its claims. A claim an admin reverted is never
  re-taken automatically by that account.
"""
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.logger import logger
from app.models import (
    CallsignClaim,
    Net,
    NetCallsignRole,
    NetRole,
    NetTemplate,
    NCSRotationMember,
    NCSScheduleOverride,
    TeamInvite,
    TemplateStaff,
    User,
)

# Letters, digits and portable/prefix slashes, with at least one letter and one
# digit (every amateur and GMRS callsign has both), 3-20 characters. Matches
# what the rest of the app stores (schemas.py's callsign validators), plus the
# letter/digit rule, which keeps a name or a typo like "KENG" out.
_CALLSIGN_RE = re.compile(r'^[A-Z0-9/]{3,20}$')


def normalize_callsign(raw: Optional[str]) -> str:
    """Upper-case and validate a callsign typed by a person. Raises HTTP 400."""
    callsign = (raw or "").strip().upper()
    if (
        not _CALLSIGN_RE.match(callsign)
        or not re.search(r'[A-Z]', callsign)
        or not re.search(r'\d', callsign)
        or callsign.startswith('/')
        or callsign.endswith('/')
    ):
        raise HTTPException(status_code=400, detail=f"'{(raw or '').strip()}' doesn't look like a callsign")
    return callsign


def account_callsigns(user: User) -> List[str]:
    """Every callsign an account answers to: its primary, its GMRS callsign and
    its extra callsigns. Matches find_user_by_callsign, which is what links a
    check-in to an account."""
    found = []
    for value in (user.callsign, user.gmrs_callsign):
        if value:
            found.append(value.strip().upper())
    try:
        extras = json.loads(user.callsigns) if user.callsigns else []
    except (TypeError, ValueError):
        extras = []
    for value in extras:
        if isinstance(value, str) and value.strip():
            found.append(value.strip().upper())
    return list(dict.fromkeys(found))


async def find_user_by_callsign(db: AsyncSession, callsign: str) -> Optional[User]:
    """The account that owns a callsign (amateur, GMRS, or one of its extra
    callsigns). A primary callsign wins over an extra one, and two accounts
    listing the same extra callsign is tolerated rather than raising (only
    the primary and GMRS columns are unique)."""
    if not callsign:
        return None
    callsign = callsign.strip().upper()
    result = await db.execute(
        select(User).where(
            (User.callsign == callsign) |
            (User.gmrs_callsign == callsign) |
            (User.callsigns.like(f'%"{callsign}"%'))
        ).order_by(User.id)
    )
    users = result.scalars().all()
    for user in users:
        if callsign in account_callsigns(user) and (user.callsign or '').upper() == callsign:
            return user
    for user in users:
        if callsign in account_callsigns(user):
            return user
    return None


async def find_active_user_by_callsign(db: AsyncSession, callsign: str) -> Optional[User]:
    """find_user_by_callsign, but never a banned or deactivated account: a
    schedule entry is never resolved to, linked to, or flagged as available
    for an account that can't sign in."""
    user = await find_user_by_callsign(db, callsign)
    return user if user is not None and user.is_active else None


@dataclass(frozen=True)
class Person:
    """Who a staff, rotation, swap or role entry names: an account or a callsign."""
    user_id: Optional[int]
    callsign: Optional[str]


async def resolve_person(
    db: AsyncSession, user_id: Optional[int], callsign: Optional[str]
) -> Person:
    """Turn a request's user_id-or-callsign into the Person to store.

    Exactly one must be given. A callsign that belongs to an account becomes
    that account, so typing a registered operator's callsign is the same as
    picking them from the list.
    """
    has_callsign = bool(callsign and callsign.strip())
    if user_id is not None and has_callsign:
        raise HTTPException(status_code=400, detail="Give either an account or a callsign, not both")
    if user_id is not None:
        result = await db.execute(select(User).where(User.id == user_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="User not found")
        return Person(user_id=user_id, callsign=None)
    if not has_callsign:
        raise HTTPException(status_code=400, detail="An account or a callsign is required")
    normalized = normalize_callsign(callsign)
    user = await find_active_user_by_callsign(db, normalized)
    if user is not None:
        return Person(user_id=user.id, callsign=None)
    return Person(user_id=None, callsign=normalized)


def row_callsign(user: Optional[User], callsign: Optional[str]) -> Optional[str]:
    """The callsign to show for an entry: its account's, else its own."""
    if user is not None:
        return user.callsign
    return callsign


async def callsigns_with_accounts(db: AsyncSession, callsigns: Iterable[str]) -> set:
    """Which of these callsign-only entries' callsigns now belong to an account
    (a claim that was held back for the manager). One lookup per distinct
    callsign; these lists are a handful of rows."""
    found = set()
    for callsign in {c for c in callsigns if c}:
        if await find_active_user_by_callsign(db, callsign) is not None:
            found.add(callsign)
    return found


def duty_ncs_role(net_id: int, entry):
    """The auto-assigned NCS role for a computed schedule entry (an
    NCSScheduleEntry): a NetRole for an account, a credit-only
    NetCallsignRole for a callsign with no account, None for an empty or
    cancelled slot. Shared by the auto-create job and the roster resync so
    the two can never assign differently."""
    if entry is None or not entry.is_staffed:
        return None
    if entry.user_id:
        return NetRole(net_id=net_id, user_id=entry.user_id, role="NCS", auto_assigned=True)
    return NetCallsignRole(net_id=net_id, callsign=entry.user_callsign, role="NCS", auto_assigned=True)


async def rename_placeholder(db: AsyncSession, template_id: int, old: str, new: str) -> None:
    """Correct a mistyped callsign on a schedule: every callsign-only entry
    for `old` on it (staff, rotation, swaps, 5th week, and the credit on its
    nets) becomes `new`. Callers resolve `new` first; if it belongs to an
    account they link with claim_callsign_placeholders afterward. Does not
    commit."""
    if old == new:
        return
    for row in (await db.execute(select(TemplateStaff).where(
            TemplateStaff.template_id == template_id, TemplateStaff.callsign == old,
            TemplateStaff.user_id.is_(None)))).scalars().all():
        duplicate = (await db.execute(select(TemplateStaff.id).where(
            TemplateStaff.template_id == template_id, TemplateStaff.callsign == new,
            TemplateStaff.user_id.is_(None)).limit(1))).scalar_one_or_none()
        if duplicate is not None:
            await db.delete(row)
        else:
            row.callsign = new
    for row in (await db.execute(select(NCSRotationMember).where(
            NCSRotationMember.template_id == template_id, NCSRotationMember.callsign == old,
            NCSRotationMember.user_id.is_(None)))).scalars().all():
        row.callsign = new
    for field in ("replacement_callsign", "original_callsign"):
        column = getattr(NCSScheduleOverride, field)
        for row in (await db.execute(select(NCSScheduleOverride).where(
                NCSScheduleOverride.template_id == template_id, column == old))).scalars().all():
            setattr(row, field, new)
    tpl = await db.get(NetTemplate, template_id)
    if tpl is not None and tpl.fifth_week_callsign == old:
        tpl.fifth_week_callsign = new
    roles = (await db.execute(
        select(NetCallsignRole).join(Net, Net.id == NetCallsignRole.net_id).where(
            Net.template_id == template_id, NetCallsignRole.callsign == old)
    )).scalars().all()
    for role in roles:
        duplicate = (await db.execute(select(NetCallsignRole.id).where(
            NetCallsignRole.net_id == role.net_id, NetCallsignRole.callsign == new,
            NetCallsignRole.role == role.role).limit(1))).scalar_one_or_none()
        if duplicate is not None:
            await db.delete(role)
        else:
            role.callsign = new


async def follow_callsign_correction(
    db: AsyncSession, net_id: int, old: str, new: str, new_user: Optional[User],
    may_assign_roles: bool = False,
) -> bool:
    """A check-in's callsign was corrected: its credit-only role follows it.

    Only when no other check-in on the net still uses the old callsign (a
    recheck row keeps the station's role where it is). When the corrected
    callsign belongs to an account, the credit becomes a real NetRole only if
    the editor may assign roles on this net (may_assign_roles, i.e.
    can_manage_net_roles); otherwise the credit is dropped, so editing a row's
    callsign can never hand an account a role its editor couldn't give
    directly. Returns whether anything moved. Does not commit."""
    if not old or old == new:
        return False
    from app.models import CheckIn
    still_used = (await db.execute(select(CheckIn.id).where(
        CheckIn.net_id == net_id, CheckIn.callsign == old).limit(1))).scalar_one_or_none()
    if still_used is not None:
        return False
    roles = (await db.execute(select(NetCallsignRole).where(
        NetCallsignRole.net_id == net_id, NetCallsignRole.callsign == old))).scalars().all()
    for role in roles:
        if new_user is not None and not may_assign_roles:
            await db.delete(role)
            continue
        if new_user is not None:
            has_role = (await db.execute(select(NetRole.id).where(
                NetRole.net_id == net_id, NetRole.user_id == new_user.id, NetRole.role == role.role
            ).limit(1))).scalar_one_or_none()
            if has_role is None:
                db.add(NetRole(net_id=net_id, user_id=new_user.id, role=role.role, auto_assigned=bool(role.auto_assigned)))
            await db.delete(role)
            continue
        duplicate = (await db.execute(select(NetCallsignRole.id).where(
            NetCallsignRole.net_id == net_id, NetCallsignRole.callsign == new,
            NetCallsignRole.role == role.role).limit(1))).scalar_one_or_none()
        if duplicate is not None:
            await db.delete(role)
        else:
            role.callsign = new
    return bool(roles)


# ========== INVITES ==========

async def record_invite(
    db: AsyncSession, template_id: int, callsign: str, email: str, invited_by: User
) -> TeamInvite:
    """Log a sign-up invite a schedule manager sent for a callsign-only entry.

    The address is what lets the invitee's account take over that callsign's
    entries on *this* schedule by itself, and what prefills their callsign on
    first sign-in (routers/auth.py::get_or_create_user). Kept per schedule so
    one schedule's invite can never vouch for an account on another. Does
    not commit."""
    from app.utils import normalize_email

    if await find_active_user_by_callsign(db, callsign) is not None:
        raise HTTPException(status_code=400, detail=f"{callsign} already has an account")
    invite = TeamInvite(template_id=template_id, callsign=callsign, email=normalize_email(email),
                        invited_by_id=invited_by.id)
    db.add(invite)
    return invite


INVITES_PER_DAY = 25
INVITES_PER_ADDRESS_PER_DAY = 3


async def check_invite_budget(db: AsyncSession, inviter: User, email: str) -> None:
    """Refuse an invite past INVITES_PER_DAY for this inviter, or past
    INVITES_PER_ADDRESS_PER_DAY to this address from anyone, in 24 hours, so
    the invite form can't be used to send mail at volume or to keep mailing
    one person. Every send is a TeamInvite row, so a re-send counts too."""
    from datetime import timedelta
    from sqlalchemy import func
    from app.utils import normalize_email

    since = datetime.now(timezone.utc) - timedelta(days=1)
    sent = (await db.execute(
        select(func.count(TeamInvite.id)).where(TeamInvite.invited_by_id == inviter.id, TeamInvite.sent_at >= since)
    )).scalar_one()
    if sent >= INVITES_PER_DAY:
        raise HTTPException(status_code=429, detail="You've sent a lot of invites today. Try again tomorrow.")
    to_address = (await db.execute(
        select(func.count(TeamInvite.id)).where(TeamInvite.email == normalize_email(email), TeamInvite.sent_at >= since)
    )).scalar_one()
    if to_address >= INVITES_PER_ADDRESS_PER_DAY:
        raise HTTPException(status_code=429, detail="That address has had several invites today. Try again tomorrow.")


async def invited_email(db: AsyncSession, template_id: int, callsign: str) -> Optional[str]:
    """The address this schedule most recently invited this callsign at."""
    return (await db.execute(
        select(TeamInvite.email)
        .where(TeamInvite.template_id == template_id, TeamInvite.callsign == callsign)
        .order_by(TeamInvite.sent_at.desc(), TeamInvite.id.desc())
        .limit(1)
    )).scalar_one_or_none()


async def invited_callsign_for(db: AsyncSession, email: str) -> Optional[str]:
    """The callsign to prefill for someone signing in for the first time:
    the one callsign they were invited under, if exactly one and no active
    account already holds it."""
    from app.utils import normalize_email

    callsigns = set((await db.execute(
        select(TeamInvite.callsign).where(TeamInvite.email == normalize_email(email))
    )).scalars().all())
    if len(callsigns) != 1:
        return None
    callsign = callsigns.pop()
    if await find_user_by_callsign(db, callsign) is not None:
        return None
    return callsign


# ========== CLAIMING ==========

@dataclass
class ClaimOutcome:
    """What claim_callsign_placeholders did, for the caller to report."""
    claims: List[CallsignClaim]
    # Newly held claims: entries waiting for a manager to confirm.
    held: List[CallsignClaim]


async def _placeholder_template_ids(db: AsyncSession, callsign: str) -> set:
    """Schedules that name this callsign without an account anywhere: an
    entry on the schedule, or NCS/Logger/Relay credit on one of its nets."""
    ids = set()
    for model, column in (
        (TemplateStaff, TemplateStaff.callsign),
        (NCSRotationMember, NCSRotationMember.callsign),
    ):
        result = await db.execute(
            select(model.template_id).where(column == callsign, model.user_id.is_(None))
        )
        ids.update(result.scalars().all())
    result = await db.execute(
        select(NCSScheduleOverride.template_id).where(
            or_(
                NCSScheduleOverride.replacement_callsign == callsign,
                NCSScheduleOverride.original_callsign == callsign,
            )
        )
    )
    ids.update(result.scalars().all())
    result = await db.execute(select(NetTemplate.id).where(NetTemplate.fifth_week_callsign == callsign))
    ids.update(result.scalars().all())
    result = await db.execute(
        select(Net.template_id).join(NetCallsignRole, NetCallsignRole.net_id == Net.id).where(
            NetCallsignRole.callsign == callsign, Net.template_id.isnot(None))
    )
    ids.update(result.scalars().all())
    return ids


async def _claim_one_callsign(db: AsyncSession, user: User, callsign: str, template_id: int) -> list:
    """Convert this callsign's entries on one schedule to the account.
    Returns the row log revert_callsign_claim replays backwards."""
    rows: list = []

    def scoped(query, model):
        return query.where(model.template_id == template_id)

    # Staff: a schedule lists an account once (uq_template_staff_template_user).
    staff_rows = (await db.execute(scoped(
        select(TemplateStaff).where(TemplateStaff.callsign == callsign, TemplateStaff.user_id.is_(None)),
        TemplateStaff,
    ))).scalars().all()
    for row in staff_rows:
        existing = (await db.execute(
            select(TemplateStaff.id).where(
                TemplateStaff.template_id == row.template_id, TemplateStaff.user_id == user.id
            ).limit(1)
        )).scalar_one_or_none()
        if existing is not None:
            rows.append({"table": "template_staff", "action": "merged", "template_id": row.template_id,
                         "data": {"is_active": row.is_active}})
            await db.delete(row)
        else:
            row.user_id = user.id
            row.callsign = None
            # A callsign-only row can't be co-manager; never let one carry
            # the flag over to whoever takes it.
            row.is_co_manager = False
            rows.append({"table": "template_staff", "action": "linked", "id": row.id, "template_id": row.template_id})
    rotation_rows = (await db.execute(scoped(
        select(NCSRotationMember).where(NCSRotationMember.callsign == callsign, NCSRotationMember.user_id.is_(None)),
        NCSRotationMember,
    ))).scalars().all()
    for row in rotation_rows:
        # A rotation may list the same operator twice on purpose (every
        # other week, say), so a rotation entry is always linked, never merged.
        row.user_id = user.id
        row.callsign = None
        rows.append({"table": "ncs_rotation_members", "action": "linked", "id": row.id, "template_id": row.template_id})

    for field in ("replacement", "original"):
        callsign_col = getattr(NCSScheduleOverride, f"{field}_callsign")
        override_rows = (await db.execute(scoped(
            select(NCSScheduleOverride).where(callsign_col == callsign), NCSScheduleOverride,
        ))).scalars().all()
        for row in override_rows:
            setattr(row, f"{field}_user_id", user.id)
            setattr(row, f"{field}_callsign", None)
            rows.append({"table": "ncs_schedule_overrides", "action": f"linked_{field}", "id": row.id,
                         "template_id": row.template_id})

    template_query = select(NetTemplate).where(NetTemplate.fifth_week_callsign == callsign)
    if template_id:
        template_query = template_query.where(NetTemplate.id == template_id)
    for tpl in (await db.execute(template_query)).scalars().all():
        tpl.fifth_week_user_id = user.id
        tpl.fifth_week_callsign = None
        rows.append({"table": "net_templates", "action": "linked_fifth_week", "id": tpl.id, "template_id": tpl.id})

    role_query = select(NetCallsignRole, Net.template_id).join(Net, Net.id == NetCallsignRole.net_id).where(
        NetCallsignRole.callsign == callsign
    )
    if template_id:
        role_query = role_query.where(Net.template_id == template_id)
    for role, net_template_id in (await db.execute(role_query)).all():
        data = {"net_id": role.net_id, "role": role.role,
                "assigned_at": role.assigned_at.isoformat() if role.assigned_at else None,
                "auto_assigned": bool(role.auto_assigned), "assigned_by_id": role.assigned_by_id}
        existing = (await db.execute(
            select(NetRole.id).where(
                NetRole.net_id == role.net_id, NetRole.user_id == user.id, NetRole.role == role.role
            ).limit(1)
        )).scalar_one_or_none()
        if existing is not None:
            rows.append({"table": "net_callsign_roles", "action": "merged", "template_id": net_template_id, "data": data})
        else:
            promoted = NetRole(net_id=role.net_id, user_id=user.id, role=role.role,
                               auto_assigned=bool(role.auto_assigned))
            if role.assigned_at:
                promoted.assigned_at = role.assigned_at
            db.add(promoted)
            await db.flush()
            rows.append({"table": "net_callsign_roles", "action": "promoted", "net_role_id": promoted.id,
                         "template_id": net_template_id, "data": data})
        await db.delete(role)

    return rows


async def claim_callsign_placeholders(
    db: AsyncSession,
    user: User,
    template_id: Optional[int] = None,
    callsign: Optional[str] = None,
    linked_by: Optional[User] = None,
) -> ClaimOutcome:
    """Match an account against the callsign-only entries for its callsign,
    one schedule at a time. Commits.

    Called when an account is created or its primary callsign changes, and
    when a schedule manager links an entry by hand (template_id, callsign and
    linked_by set; the caller checks the manager's permission). Per schedule:

    - linked by a manager, or the account signed in with the address that
      schedule invited this callsign at: the entries are taken over and a
      "linked" CallsignClaim records every row changed;
    - otherwise a "held" CallsignClaim is recorded once and the schedule's
      manager is told; nothing changes until they link it.

    Only the account's primary callsign is matched unless a manager names
    another of its callsigns. Skips an inactive (banned) account, and a
    schedule where an admin reverted this account's claim to this callsign
    (unless a manager links it again by hand). Idempotent.
    """
    from app.utils import normalize_email

    outcome = ClaimOutcome(claims=[], held=[])
    if not user.is_active:
        return outcome
    if linked_by is not None:
        if not callsign or callsign.strip().upper() not in account_callsigns(user):
            return outcome
        callsign = callsign.strip().upper()
    else:
        callsign = (user.callsign or "").strip().upper()
    if not callsign:
        return outcome

    template_ids = [template_id] if template_id else sorted(await _placeholder_template_ids(db, callsign))
    account_email = normalize_email(user.email or "")
    for tid in template_ids:
        earlier = (await db.execute(
            select(CallsignClaim).where(
                CallsignClaim.user_id == user.id, CallsignClaim.callsign == callsign,
                CallsignClaim.template_id == tid,
            )
        )).scalars().all()
        if linked_by is None and any(c.reverted_at is not None and c.status == "linked" for c in earlier):
            continue
        held = next((c for c in earlier if c.status == "held" and c.reverted_at is None), None)

        invite_email = await invited_email(db, tid, callsign)
        via_invite = bool(invite_email) and invite_email == account_email
        if linked_by is None and not via_invite:
            if held is None and await _has_entries(db, tid, callsign):
                held = CallsignClaim(user_id=user.id, callsign=callsign, template_id=tid, status="held")
                db.add(held)
                outcome.held.append(held)
                logger.warning(
                    "CALLSIGN_CLAIM",
                    f"Held: account {user.id} has callsign {callsign}, on schedule {tid} without an invite to its address",
                )
            continue

        rows = await _claim_one_callsign(db, user, callsign, tid)
        if not rows:
            continue
        claim = held or CallsignClaim(user_id=user.id, callsign=callsign, template_id=tid)
        claim.status = "linked"
        claim.rows = json.dumps(rows)
        claim.via_invite = via_invite
        claim.linked_by_id = linked_by.id if linked_by else None
        if held is None:
            db.add(claim)
        outcome.claims.append(claim)
        logger.info(
            "CALLSIGN_CLAIM",
            f"Account {user.id} took over {len(rows)} entr{'y' if len(rows) == 1 else 'ies'} for {callsign} on schedule {tid}"
            + (f" (linked by {linked_by.id})" if linked_by else "")
            + (" via invite" if via_invite else ""),
        )

    if outcome.claims or outcome.held:
        await db.commit()
    return outcome


async def _has_entries(db: AsyncSession, template_id: int, callsign: str) -> bool:
    return template_id in await _placeholder_template_ids(db, callsign)


async def revert_callsign_claim(db: AsyncSession, claim: CallsignClaim, by_user: User) -> int:
    """Undo a claim: every entry it converted goes back to being callsign-only
    (a held claim is simply dismissed). Callers resync the schedule's pending
    duty NCS afterward (routers/ncs_rotation.py::resync_pending_duty_ncs), so
    an NCS role the account was auto-assigned while it held the slot goes too.

    Defensive per row: an entry the account no longer holds (removed by a
    manager since, say) is left alone. Restored staff rows are never
    co-manager. Returns how many entries were restored. Does not commit; the
    caller does, so a ban and its reverts land together.
    """
    if claim.reverted_at is not None:
        return 0
    callsign = claim.callsign
    restored = 0
    for row in reversed(json.loads(claim.rows or "[]")):
        table, action = row.get("table"), row.get("action")
        if table == "template_staff" and action == "linked":
            entry = await db.get(TemplateStaff, row["id"])
            if entry and entry.user_id == claim.user_id:
                entry.user_id, entry.callsign, entry.is_co_manager = None, callsign, False
                restored += 1
        elif table == "template_staff" and action == "merged":
            exists = (await db.execute(select(TemplateStaff.id).where(
                TemplateStaff.template_id == row["template_id"], TemplateStaff.callsign == callsign,
                TemplateStaff.user_id.is_(None)).limit(1))).scalar_one_or_none()
            if exists is None and await db.get(NetTemplate, row["template_id"]) is not None:
                db.add(TemplateStaff(template_id=row["template_id"], callsign=callsign,
                                     is_active=row["data"].get("is_active", True), is_co_manager=False))
                restored += 1
        elif table == "ncs_rotation_members" and action == "linked":
            entry = await db.get(NCSRotationMember, row["id"])
            if entry and entry.user_id == claim.user_id:
                entry.user_id, entry.callsign = None, callsign
                restored += 1
        elif table == "ncs_schedule_overrides" and action in ("linked_replacement", "linked_original"):
            field = action.split("_", 1)[1]
            entry = await db.get(NCSScheduleOverride, row["id"])
            if entry and getattr(entry, f"{field}_user_id") == claim.user_id:
                setattr(entry, f"{field}_user_id", None)
                setattr(entry, f"{field}_callsign", callsign)
                restored += 1
        elif table == "net_templates" and action == "linked_fifth_week":
            tpl = await db.get(NetTemplate, row["id"])
            if tpl and tpl.fifth_week_user_id == claim.user_id:
                tpl.fifth_week_user_id, tpl.fifth_week_callsign = None, callsign
                restored += 1
        elif table == "net_callsign_roles" and action in ("promoted", "merged"):
            data = row["data"]
            if action == "promoted":
                net_role = await db.get(NetRole, row["net_role_id"])
                if net_role and net_role.user_id == claim.user_id and net_role.role == data["role"]:
                    await db.delete(net_role)
                else:
                    continue
            exists = (await db.execute(select(NetCallsignRole.id).where(
                NetCallsignRole.net_id == data["net_id"], NetCallsignRole.callsign == callsign,
                NetCallsignRole.role == data["role"]).limit(1))).scalar_one_or_none()
            if exists is None:
                restored_role = NetCallsignRole(
                    net_id=data["net_id"], callsign=callsign, role=data["role"],
                    auto_assigned=data.get("auto_assigned", False), assigned_by_id=data.get("assigned_by_id"),
                )
                if data.get("assigned_at"):
                    restored_role.assigned_at = datetime.fromisoformat(data["assigned_at"])
                db.add(restored_role)
            restored += 1
    claim.reverted_at = datetime.now(timezone.utc)
    claim.reverted_by_id = by_user.id
    logger.warning(
        "CALLSIGN_CLAIM",
        f"Claim {claim.id} ({callsign} by account {claim.user_id}) reverted by {by_user.id}: {restored} entries restored",
    )
    return restored


async def revert_all_claims(db: AsyncSession, user: User, by_user: User) -> set:
    """Revert every claim this account still holds (used when it is banned or
    deleted). Returns the affected schedule ids, for the caller to resync.
    Does not commit."""
    claims = (await db.execute(
        select(CallsignClaim).where(CallsignClaim.user_id == user.id, CallsignClaim.reverted_at.is_(None))
    )).scalars().all()
    template_ids = set()
    for claim in claims:
        await revert_callsign_claim(db, claim, by_user)
        if claim.template_id:
            template_ids.add(claim.template_id)
    return template_ids


# ========== NOTIFYING MANAGERS ==========

_TABLE_LABELS = {
    "template_staff": "net staff",
    "ncs_rotation_members": "NCS rotation",
    "ncs_schedule_overrides": "a swap",
    "net_templates": "5th-week NCS",
    "net_callsign_roles": "net roles",
}


async def claim_notifications(db: AsyncSession, user: User, outcome: ClaimOutcome) -> list:
    """The emails to send each affected schedule's manager about a claim, as
    (to_email, kwargs) for EmailService.send_callsign_claimed /
    send_callsign_claim_held. Built here, sent by the caller (usually as a
    background task) so a slow mail server never holds up a sign-in."""
    from app.config import settings
    from app.utils import display_callsign

    messages = []
    account_display = display_callsign(user) or f"account {user.id}"
    by_template: dict = {}
    linked_by_ids = {}
    for claim in outcome.claims:
        linked_by_ids[claim.template_id] = claim.linked_by_id
        for row in json.loads(claim.rows or "[]"):
            if row.get("template_id"):
                by_template.setdefault(row["template_id"], {"callsign": claim.callsign, "via_invite": claim.via_invite,
                                                            "what": set()})["what"].add(_TABLE_LABELS.get(row["table"], row["table"]))
    for template_id, info in by_template.items():
        tpl = await db.get(NetTemplate, template_id)
        # Nobody needs telling about a link they made themselves.
        if tpl is None or tpl.owner_id is None or tpl.owner_id in (user.id, linked_by_ids.get(template_id)):
            continue
        owner = await db.get(User, tpl.owner_id)
        if owner is None or not owner.email or not owner.is_active:
            continue
        messages.append(("claimed", owner.email, {
            "callsign": info["callsign"],
            "account_display": account_display,
            "account_email": user.email,
            "schedule_name": tpl.name,
            "entries": sorted(info["what"]),
            "via_invite": info["via_invite"],
            "scheduler_url": f"{settings.frontend_url}/scheduler",
        }))
    for claim in outcome.held:
        tpl = await db.get(NetTemplate, claim.template_id)
        if tpl is None or tpl.owner_id is None:
            continue
        owner = await db.get(User, tpl.owner_id)
        if owner is None or not owner.email or not owner.is_active:
            continue
        messages.append(("held", owner.email, {
            "callsign": claim.callsign,
            "account_display": account_display,
            "account_email": user.email,
            "schedule_name": tpl.name,
            "scheduler_url": f"{settings.frontend_url}/scheduler",
        }))
    return messages


async def send_claim_notifications(messages: list) -> None:
    """Send what claim_notifications built. Best-effort: a failed email is
    logged, never raised into a sign-in."""
    from app.email_service import EmailService

    for kind, to_email, kwargs in messages:
        try:
            if kind == "claimed":
                await EmailService.send_callsign_claimed(to_email=to_email, **kwargs)
            else:
                await EmailService.send_callsign_claim_held(to_email=to_email, **kwargs)
        except Exception as e:  # noqa: BLE001 - notification only
            logger.error("CALLSIGN_CLAIM", f"Failed to send {kind} notice to {to_email}: {e}")


async def claim_and_queue_notices(db: AsyncSession, user: User, background_tasks=None, **kwargs) -> ClaimOutcome:
    """claim_callsign_placeholders, then queue the managers' notices.

    Never lets a failure here break the caller's own operation (a sign-in or
    a profile save): the claim is logged and skipped instead.
    """
    try:
        outcome = await claim_callsign_placeholders(db, user, **kwargs)
        messages = await claim_notifications(db, user, outcome)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        await db.rollback()
        logger.error("CALLSIGN_CLAIM", f"Claim for account {user.id} failed: {e}")
        return ClaimOutcome(claims=[], held=[])
    if messages:
        if background_tasks is not None:
            background_tasks.add_task(send_claim_notifications, messages)
        else:
            import asyncio
            asyncio.create_task(send_claim_notifications(messages))
    return outcome
