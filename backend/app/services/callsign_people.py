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
- When an account gains a callsign, it takes over that callsign's entries
  (claim_callsign_placeholders), and the managers of every affected schedule
  are told. Each claim is recorded with every row it changed, so an admin can
  undo it exactly (revert_callsign_claim); banning an account undoes all of
  its claims. Nothing proves a callsign belongs to whoever typed it, so the
  claim is the moment to watch.
- If a manager invited the callsign at an email address, only an account
  signed in with that address takes over automatically. Anyone else holding
  the callsign is held for the manager, who can link it by hand.
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
    Contact,
    Net,
    NetCallsignRole,
    NetRole,
    NetTemplate,
    NCSRotationMember,
    NCSScheduleOverride,
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
    user = await find_user_by_callsign(db, normalized)
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
        if await find_user_by_callsign(db, callsign) is not None:
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
    db: AsyncSession, net_id: int, old: str, new: str, new_user: Optional[User]
) -> bool:
    """A check-in's callsign was corrected: its credit-only role follows it.

    Only when no other check-in on the net still uses the old callsign (a
    recheck row keeps the station's role where it is). The corrected
    callsign's account, if any, gets a real NetRole instead: the Logger
    could give it that role from the row directly. Returns whether anything
    moved. Does not commit."""
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
    db: AsyncSession, callsign: str, email: str, invited_by: User
) -> Contact:
    """Remember the address a manager invited a callsign at, on the shared
    Contact row for that callsign. That address is what lets the invitee's
    account take over their entries automatically, and what prefills their
    callsign when they first sign in (routers/auth.py::get_or_create_user)."""
    from app.utils import normalize_email

    result = await db.execute(select(Contact).where(Contact.callsign == callsign))
    contact = result.scalar_one_or_none()
    if contact is None:
        contact = Contact(callsign=callsign)
        db.add(contact)
    elif contact.user_id is not None:
        raise HTTPException(status_code=400, detail=f"{callsign} already has an account")
    contact.email = normalize_email(email)
    contact.invited_at = datetime.now(timezone.utc)
    contact.invited_by_id = invited_by.id
    return contact


INVITES_PER_DAY = 25


async def check_invite_budget(db: AsyncSession, inviter: User) -> None:
    """Refuse a manager's invite past INVITES_PER_DAY in 24 hours, so the
    invite form can't be used to send mail to arbitrary addresses at volume.
    Counted from Contact.invited_at, so no separate counter is kept; a
    re-invite of the same callsign overwrites its row and doesn't add up."""
    from datetime import timedelta
    from sqlalchemy import func

    since = datetime.now(timezone.utc) - timedelta(days=1)
    sent = (await db.execute(
        select(func.count(Contact.id)).where(Contact.invited_by_id == inviter.id, Contact.invited_at >= since)
    )).scalar_one()
    if sent >= INVITES_PER_DAY:
        raise HTTPException(status_code=429, detail="You've sent a lot of invites today. Try again tomorrow.")


# ========== CLAIMING ==========

@dataclass
class ClaimOutcome:
    """What claim_callsign_placeholders did, for the caller to report."""
    claims: List[CallsignClaim]
    # (callsign, template_ids) whose entries were left for the manager
    # because the callsign was invited at a different address.
    held: List[tuple]


async def _placeholder_template_ids(db: AsyncSession, callsign: str) -> set:
    """Schedules that name this callsign without an account anywhere."""
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
    return ids


async def _claim_one_callsign(
    db: AsyncSession, user: User, callsign: str, template_id: Optional[int]
) -> list:
    """Convert this callsign's entries to the account. Returns the row log
    revert_callsign_claim replays backwards. With template_id, only that
    schedule's entries (a manager linking by hand)."""
    rows: list = []

    def scoped(query, model):
        return query.where(model.template_id == template_id) if template_id else query

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
                         "data": {"is_active": row.is_active, "is_co_manager": row.is_co_manager}})
            await db.delete(row)
        else:
            row.user_id = user.id
            row.callsign = None
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
    callsigns: Optional[Iterable[str]] = None,
    linked_by: Optional[User] = None,
) -> ClaimOutcome:
    """Give an account the entries that name its callsigns. Commits.

    Called whenever an account gains a callsign (sign-up, a profile or admin
    edit, an admin invite) and when a manager links an entry by hand
    (template_id + linked_by set). Idempotent: entries already linked are not
    matched again. Skips an inactive (banned) account, and a callsign whose
    earlier claim by this same account an admin reverted, so editing the
    profile again cannot re-take what was taken back.
    """
    from app.utils import normalize_email

    outcome = ClaimOutcome(claims=[], held=[])
    if not user.is_active:
        return outcome

    for callsign in (list(callsigns) if callsigns is not None else account_callsigns(user)):
        callsign = callsign.strip().upper()
        if not callsign:
            continue
        reverted = (await db.execute(
            select(CallsignClaim.id).where(
                CallsignClaim.user_id == user.id,
                CallsignClaim.callsign == callsign,
                CallsignClaim.reverted_at.isnot(None),
            ).limit(1)
        )).scalar_one_or_none()
        if reverted is not None and linked_by is None:
            continue

        contact = (await db.execute(select(Contact).where(Contact.callsign == callsign))).scalar_one_or_none()
        invited_email = normalize_email(contact.email) if contact and contact.email else None
        via_invite = bool(invited_email) and invited_email == normalize_email(user.email or "")
        if invited_email and not via_invite and linked_by is None:
            template_ids = await _placeholder_template_ids(db, callsign)
            if template_ids:
                outcome.held.append((callsign, template_ids))
                logger.warning(
                    "CALLSIGN_CLAIM",
                    f"Held: account {user.id} has callsign {callsign}, which was invited at a different address",
                )
            continue

        rows = await _claim_one_callsign(db, user, callsign, template_id)
        if not rows:
            continue
        claim = CallsignClaim(user_id=user.id, callsign=callsign, rows=json.dumps(rows), via_invite=via_invite)
        db.add(claim)
        if contact is not None and contact.user_id is None:
            contact.user_id = user.id
        outcome.claims.append(claim)
        logger.info(
            "CALLSIGN_CLAIM",
            f"Account {user.id} took over {len(rows)} entr{'y' if len(rows) == 1 else 'ies'} for {callsign}"
            + (f" (linked by {linked_by.id})" if linked_by else "")
            + (" via invite" if via_invite else ""),
        )

    if outcome.claims or outcome.held:
        await db.commit()
    return outcome


async def revert_callsign_claim(db: AsyncSession, claim: CallsignClaim, by_user: User) -> int:
    """Undo a claim: every entry it converted goes back to being callsign-only.

    Defensive per row: an entry the account no longer holds (removed by a
    manager since, say) is left alone. Returns how many entries were restored.
    Does not commit; the caller does, so a ban and its reverts land together.
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
                entry.user_id, entry.callsign = None, callsign
                restored += 1
        elif table == "template_staff" and action == "merged":
            exists = (await db.execute(select(TemplateStaff.id).where(
                TemplateStaff.template_id == row["template_id"], TemplateStaff.callsign == callsign,
                TemplateStaff.user_id.is_(None)).limit(1))).scalar_one_or_none()
            if exists is None:
                db.add(TemplateStaff(template_id=row["template_id"], callsign=callsign,
                                     is_active=row["data"].get("is_active", True),
                                     is_co_manager=row["data"].get("is_co_manager", False)))
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


async def revert_all_claims(db: AsyncSession, user: User, by_user: User) -> int:
    """Revert every claim this account still holds (used when it is banned).
    Does not commit."""
    claims = (await db.execute(
        select(CallsignClaim).where(CallsignClaim.user_id == user.id, CallsignClaim.reverted_at.is_(None))
    )).scalars().all()
    total = 0
    for claim in claims:
        total += await revert_callsign_claim(db, claim, by_user)
    return total


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
    for claim in outcome.claims:
        for row in json.loads(claim.rows or "[]"):
            if row.get("template_id"):
                by_template.setdefault(row["template_id"], {"callsign": claim.callsign, "via_invite": claim.via_invite,
                                                            "what": set()})["what"].add(_TABLE_LABELS.get(row["table"], row["table"]))
    for template_id, info in by_template.items():
        tpl = await db.get(NetTemplate, template_id)
        if tpl is None or tpl.owner_id is None or tpl.owner_id == user.id:
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
    for callsign, template_ids in outcome.held:
        for template_id in template_ids:
            tpl = await db.get(NetTemplate, template_id)
            if tpl is None or tpl.owner_id is None:
                continue
            owner = await db.get(User, tpl.owner_id)
            if owner is None or not owner.email or not owner.is_active:
                continue
            messages.append(("held", owner.email, {
                "callsign": callsign,
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
