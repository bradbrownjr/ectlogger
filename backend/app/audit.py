"""The activity log (models.AuditEvent): who did what, from where, and when.

Admins read it in Admin > Activity (routers/audit.py). Everything that
writes to it goes through record_event, which adds the row to the caller's
session without committing, so the event lands in the same transaction as
the change it describes.

What gets an event: anything that destroys a record, changes who may do
what, or touches an account's sign-in (sign-ins, failed attempts, password,
two-factor, profile and email changes). Routine net activity does not;
check-ins and chat already record themselves.

Retention: rows are kept AUDIT_RETENTION_DAYS, and their IP address and
browser are blanked after AUDIT_IP_RETENTION_DAYS. GDPR sets no fixed period
for security logs; CNIL's 2021 logging recommendation (deliberation
2021-122) suggests 6-12 months for ordinary logs and up to 3 years where
misuse has to be traced, which is the case here (repeat bad actors).
Decided with Brad 2026-10-23.
"""
import asyncio
import json
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional, Tuple

from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, User

AUDIT_RETENTION_DAYS = 3 * 365
AUDIT_IP_RETENTION_DAYS = 365

# (ip, user agent) of the request being served, set by main.py's middleware
# so record_event needs no Request threaded through every route.
_request_origin: ContextVar[Tuple[Optional[str], Optional[str]]] = ContextVar(
    "audit_request_origin", default=(None, None)
)


def set_request_origin(ip: Optional[str], user_agent: Optional[str]) -> None:
    _request_origin.set((ip, (user_agent or None) and user_agent[:255]))


def user_label(user: Optional[User]) -> Optional[str]:
    """How a person is named in the log: callsign, else email."""
    if user is None:
        return None
    return user.callsign or user.email


def record_event(
    db: AsyncSession,
    action: str,
    actor: Optional[User] = None,
    *,
    actor_label: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    target_label: Optional[str] = None,
    subject: Optional[User] = None,
    subject_user_id: Optional[int] = None,
    net_id: Optional[int] = None,
    template_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
) -> AuditEvent:
    """Add one event to the session. The caller commits.

    subject is the person the action was about when that isn't the actor;
    pass the User, or subject_user_id when only the id is at hand. A user
    target is its own subject.
    """
    ip, user_agent = _request_origin.get()
    if subject is not None:
        subject_user_id = subject.id
    if target_type == "user" and subject_user_id is None:
        subject_user_id = target_id
    event = AuditEvent(
        action=action,
        actor_user_id=actor.id if actor is not None else None,
        actor_label=actor_label or user_label(actor),
        ip=ip,
        user_agent=user_agent,
        target_type=target_type,
        target_id=target_id,
        target_label=target_label,
        subject_user_id=subject_user_id,
        net_id=net_id,
        template_id=template_id,
        details=json.dumps(details, default=str) if details else None,
    )
    db.add(event)
    return event


def _plain(value: Any) -> Any:
    """A column value as it should read in the log: enums by value, and the
    JSON lists stored as text (User.callsigns, locked_fields) as lists."""
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, str) and value.startswith("["):
        try:
            return json.loads(value)
        except ValueError:
            pass
    return value


def field_changes(obj: Any, new_values: Dict[str, Any], fields: Iterable[str]) -> Dict[str, list]:
    """{field: [old, new]} for each of fields whose value in new_values
    differs from obj's current one. Read before applying the update."""
    changes: Dict[str, list] = {}
    for field in fields:
        if field not in new_values:
            continue
        old, new = _plain(getattr(obj, field, None)), _plain(new_values[field])
        # The form sends "" or [] for a field never filled in, stored as None.
        if old in (None, "", []) and new in (None, "", []):
            continue
        if old != new:
            changes[field] = [old, new]
    return changes


async def forget_user(db: AsyncSession, user_id: int) -> None:
    """Detach a deleted account's id from its events, keeping the labels.
    SQLite hands the highest id to the next account after a delete, which
    would otherwise inherit this history in "Show activity"."""
    await db.execute(update(AuditEvent).where(AuditEvent.actor_user_id == user_id).values(actor_user_id=None))
    await db.execute(update(AuditEvent).where(AuditEvent.subject_user_id == user_id).values(subject_user_id=None))
    await db.execute(
        update(AuditEvent)
        .where(AuditEvent.target_type == "user", AuditEvent.target_id == user_id)
        .values(target_id=None)
    )


async def prune_audit_events(db: AsyncSession, now: Optional[datetime] = None) -> Tuple[int, int]:
    """Apply the retention rules. Returns (rows deleted, rows whose IP and
    browser were blanked)."""
    now = now or datetime.now(timezone.utc)
    deleted = await db.execute(
        delete(AuditEvent).where(AuditEvent.created_at < now - timedelta(days=AUDIT_RETENTION_DAYS))
    )
    blanked = await db.execute(
        update(AuditEvent)
        .where(
            AuditEvent.created_at < now - timedelta(days=AUDIT_IP_RETENTION_DAYS),
            (AuditEvent.ip.isnot(None)) | (AuditEvent.user_agent.isnot(None)),
        )
        .values(ip=None, user_agent=None)
    )
    await db.commit()
    return deleted.rowcount or 0, blanked.rowcount or 0


class AuditPruneService:
    """Runs prune_audit_events once a day in the web service."""

    INTERVAL_SECONDS = 24 * 3600

    def __init__(self):
        self._task = None

    async def start(self):
        if self._task is None:
            self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run_loop(self):
        from app.database import AsyncSessionLocal
        from app.logger import logger

        await asyncio.sleep(120)
        while True:
            try:
                async with AsyncSessionLocal() as db:
                    deleted, blanked = await prune_audit_events(db)
                if deleted or blanked:
                    logger.info("AUDIT", f"Pruned {deleted} activity log rows, blanked addresses on {blanked}")
            except Exception as exc:
                logger.error("AUDIT", f"Activity log pruning failed: {exc}")
            await asyncio.sleep(self.INTERVAL_SECONDS)


audit_prune_service = AuditPruneService()


def record_net_event(db: AsyncSession, action: str, actor: Optional[User], net: Any, **kwargs) -> AuditEvent:
    """record_event for something done to a net, tagged with its schedule so
    filtering by either finds it."""
    return record_event(
        db, action, actor, target_type="net", target_id=net.id, target_label=net.name,
        net_id=net.id, template_id=getattr(net, "template_id", None), **kwargs,
    )


def record_schedule_event(db: AsyncSession, action: str, actor: Optional[User], template: Any, **kwargs) -> AuditEvent:
    """record_event for something done to a schedule (NetTemplate)."""
    return record_event(
        db, action, actor, target_type="schedule", target_id=template.id, target_label=template.name,
        template_id=template.id, **kwargs,
    )
