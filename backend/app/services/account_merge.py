"""Merging a second account into an operator's original one (admin only,
routers/users.py MERGE ACCOUNTS).

The usual case: someone forgets which address they signed up with, signs in
with another, and gets a fresh, empty account (K9NPD, 2026-10-27). Merging
moves everything that account has onto the original, makes its addresses
backup sign-in addresses there (models.UserEmail), and deletes it.

What moves is found from the models, not listed by hand: every column with a
foreign key to users.id (user_columns()). A table added later is merged with
no change here. Where moving a row would give the original account a second
copy of something it may hold once, the original's copy stays and the
second account's is deleted. "Once" means a unique constraint on the table
(also found from the models) or, for the few tables without one that are
still meant to hold one row per account, SOFT_UNIQUE below.
tests/test_account_merge.py holds this to every table in the models.

Two kinds of reference have no foreign key and are handled by name: the
activity log's actor/subject/target ids (audit.py), and the mention list
stored as JSON on chat messages.
"""
import json
from dataclasses import dataclass
from typing import Dict, List, Tuple

from sqlalchemy import and_, delete, exists, select, update
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base
from app.models import AuditEvent, ChatMessage, ChatMute, User, UserEmail
from app.utils import normalize_email

# Tables with no unique constraint that still hold one row per account per
# key: a second copy would list the person twice (a rotation slot, a
# subscription that emails twice, a role row). Key columns besides the
# account column.
SOFT_UNIQUE: Dict[Tuple[str, str], Tuple[str, ...]] = {
    ("ncs_rotation_members", "user_id"): ("template_id",),
    ("net_template_subscriptions", "user_id"): ("template_id",),
    ("net_roles", "user_id"): ("net_id", "role"),
    ("net_invitations", "user_id"): ("net_id",),
}

# Profile fields the original keeps, filled from the second account only
# where the original's is blank. Never sign-in secrets (password, two-factor):
# the second account's addresses already sign in, and nothing else of its
# should be able to.
FILLED_FIELDS = ("name", "callsign", "gmrs_callsign", "location", "skywarn_number", "website_url", "timezone")

# What the preview calls each column; anything else is named from its table.
LABELS = {
    ("check_ins", "user_id"): "Check-ins",
    ("check_ins", "checked_in_by_id"): "Check-ins they logged",
    ("check_ins", "identity_verified_by_id"): "Identities they verified",
    ("net_roles", "user_id"): "Net roles",
    ("nets", "owner_id"): "Nets managed",
    ("net_templates", "owner_id"): "Schedules managed",
    ("template_staff", "user_id"): "Schedule staff spots",
    ("ncs_rotation_members", "user_id"): "NCS rotation spots",
    ("ncs_schedule_overrides", "original_user_id"): "NCS swaps (gave a turn)",
    ("ncs_schedule_overrides", "replacement_user_id"): "NCS swaps (took a turn)",
    ("ncs_schedule_overrides", "created_by_id"): "NCS swaps arranged",
    ("ncs_reminder_logs", "user_id"): "NCS reminders sent",
    ("net_template_subscriptions", "user_id"): "Schedule subscriptions",
    ("chat_messages", "user_id"): "Chat messages",
    ("chat_reactions", "user_id"): "Chat reactions",
    ("chat_images", "user_id"): "Chat images",
    ("can_hear_reports", "reported_by_user_id"): "Can-hear reports",
    ("coverage_contacts", "reported_by_user_id"): "Coverage reports",
    ("coverage_access", "reported_by_user_id"): "Site access reports",
    ("contacts", "user_id"): "Contact records",
    ("forms", "created_by_id"): "Traffic messages written",
    ("forms", "held_by_user_id"): "Traffic messages held",
    ("off_net_log_entries", "entered_by_user_id"): "Off-net log entries",
    ("callsign_claims", "user_id"): "Team spots taken by callsign",
}


@dataclass
class UserColumn:
    table: str
    column: str
    unique_keys: List[Tuple[str, ...]]  # other columns of each one-per-account rule


def user_columns() -> List[UserColumn]:
    """Every column holding a users.id, with the rules that make a moved row
    a duplicate."""
    found = []
    for table in Base.metadata.sorted_tables:
        if table.name in ("users", "user_emails"):
            continue
        uniques = [tuple(c.name for c in con.columns) for con in table.constraints
                   if con.__class__.__name__ == "UniqueConstraint"]
        uniques += [tuple(c.name for c in ix.columns) for ix in table.indexes if ix.unique]
        for column in table.columns:
            if not any(fk.column.table.name == "users" for fk in column.foreign_keys):
                continue
            keys = {tuple(c for c in u if c != column.name) for u in uniques if column.name in u}
            if (table.name, column.name) in SOFT_UNIQUE:
                keys.add(SOFT_UNIQUE[(table.name, column.name)])
            found.append(UserColumn(table.name, column.name, sorted(keys)))
    return found


def _label(table: str, column: str) -> str:
    """LABELS, else "Traffic log entries (handed to user)"."""
    if (table, column) in LABELS:
        return LABELS[(table, column)]
    label = table.replace("_", " ").capitalize()
    if column == "user_id":
        return label
    return f"{label} ({column.removesuffix('_id').replace('_', ' ')})"


async def preview(db: AsyncSession, source: User) -> List[dict]:
    """What would move from source: [{label, count}], biggest first."""
    rows = []
    for uc in user_columns():
        table = Base.metadata.tables[uc.table]
        count = (await db.execute(
            select(func.count()).select_from(table).where(table.c[uc.column] == source.id)
        )).scalar_one()
        if count:
            rows.append({"label": _label(uc.table, uc.column), "count": count})
    rows.append({"label": "Sign-in addresses", "count": 1 + len((await db.execute(
        select(UserEmail.id).where(UserEmail.user_id == source.id))).all())})
    return sorted(rows, key=lambda r: (-r["count"], r["label"]))


async def merge_accounts(db: AsyncSession, source: User, target: User) -> List[str]:
    """Move everything of source's onto target and delete source. Does not
    commit, so the caller's activity-log entry lands in the same
    transaction. Returns the addresses added to target as backups."""
    src, tgt = source.id, target.id

    # A personal mute of each other would become a mute of oneself.
    await db.execute(delete(ChatMute).where(
        ((ChatMute.muter_user_id == src) & (ChatMute.muted_user_id == tgt))
        | ((ChatMute.muter_user_id == tgt) & (ChatMute.muted_user_id == src))
    ))

    for uc in user_columns():
        table = Base.metadata.tables[uc.table]
        col = table.c[uc.column]
        # The original's copy stays: drop each row of source's that target
        # already has an equivalent of.
        for key in uc.unique_keys:
            other = table.alias("other")
            await db.execute(delete(table).where(
                col == src,
                exists().where(and_(other.c[uc.column] == tgt, *[other.c[k] == table.c[k] for k in key])),
            ))
        await db.execute(update(table).where(col == src).values({uc.column: tgt}))

    # The activity log follows the person (audit.py; no foreign key).
    await db.execute(update(AuditEvent).where(AuditEvent.actor_user_id == src).values(actor_user_id=tgt))
    await db.execute(update(AuditEvent).where(AuditEvent.subject_user_id == src).values(subject_user_id=tgt))
    await db.execute(update(AuditEvent).where(AuditEvent.target_type == "user", AuditEvent.target_id == src)
                     .values(target_id=tgt))

    # @mentions are a JSON list of ids on each message.
    for message in (await db.execute(
        select(ChatMessage).where(ChatMessage.mentioned_user_ids.like(f"%{src}%"))
    )).scalars().all():
        try:
            ids = json.loads(message.mentioned_user_ids or "[]")
        except (json.JSONDecodeError, TypeError):
            continue
        if src in ids:
            message.mentioned_user_ids = json.dumps(list(dict.fromkeys(tgt if i == src else i for i in ids)))

    # Profile: the original's values, its blanks filled from source. The
    # callsign columns are unique, so source lets go of them first.
    filled = {f: getattr(source, f) for f in FILLED_FIELDS if not getattr(target, f) and getattr(source, f)}
    source_callsign = source.callsign
    source.callsign = None
    source.gmrs_callsign = None
    callsigns = _json_list(target.callsigns) + _json_list(source.callsigns)
    previous = _json_list(target.previous_callsigns) + _json_list(source.previous_callsigns)
    # A different primary callsign on source keeps its check-ins attached,
    # the same way a callsign change does (routers/users.py).
    if source_callsign and "callsign" not in filled:
        previous.append(source_callsign.upper())
    await db.flush()
    for field, value in filled.items():
        setattr(target, field, value)
    primary = (target.callsign or "").upper()
    target.callsigns = json.dumps(_dedupe([cs for cs in callsigns if cs.upper() != primary]))
    target.previous_callsigns = json.dumps(_dedupe([cs for cs in previous if cs.upper() != primary]))
    if source.last_active and (not target.last_active or _naive(source.last_active) > _naive(target.last_active)):
        target.last_active = source.last_active

    # Source's addresses sign in to target from now on.
    added = []
    source_rows = (await db.execute(select(UserEmail).where(UserEmail.user_id == src))).scalars().all()
    addresses = [normalize_email(source.email)] + [row.email for row in source_rows]
    for row in source_rows:
        await db.delete(row)
    await db.flush()
    for address in dict.fromkeys(addresses):
        if address and address != normalize_email(target.email or ""):
            db.add(UserEmail(user_id=tgt, email=address))
            added.append(address)

    await db.delete(source)
    await db.flush()
    return added


def _json_list(value) -> List[str]:
    if isinstance(value, list):
        return list(value)
    try:
        parsed = json.loads(value) if value else []
    except (json.JSONDecodeError, TypeError):
        return []
    return [v for v in parsed if v] if isinstance(parsed, list) else []


def _dedupe(values: List[str]) -> List[str]:
    seen, out = set(), []
    for v in values:
        if v.upper() not in seen:
            seen.add(v.upper())
            out.append(v)
    return out


def _naive(value):
    return value.replace(tzinfo=None) if value is not None else None
