"""Admin mode: an admin acts as a regular user until they enter a code.

An admin's account keeps its ADMIN role, but the server only treats them as an
admin while admin mode is open for the browser session they are using (the
token's `sid` claim). They open it with a two-factor code
(POST /auth/admin-mode), and it closes after ADMIN_MODE_IDLE_MINUTES with no
request they made themselves, or when they lock it (DELETE /auth/admin-mode).

`get_current_user` calls `load_admin_mode` once per request and records the
answer on the user object; `permissions.is_admin` reads it. That is the only
admin check: never compare `user.role` to `UserRole.ADMIN` to decide what
someone may do (tests/test_admin_mode.py fails on one). A query for who holds
the role, such as the admins to email about a security alert, still filters
on `User.role`, since those emails go out whether or not anyone is in admin
mode.

Brad, 2026-11-15: he works in public places and rarely needs admin powers,
and wanted to see the app as users see it by default. See
docs/concepts/SIGN-IN-PROVIDERS-AND-ADMIN-MODE.md.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminSession, User, UserRole

ADMIN_MODE_IDLE_MINUTES = 15

# Matched verbatim by frontend/src/services/api.ts, which opens the code
# dialog and retries the request. Keep the two in sync.
ADMIN_MODE_REQUIRED_DETAIL = "Switch to admin to do this."

# Response header carrying when admin mode closes (ISO 8601) or "closed",
# sent to admins on every authenticated request. Exposed through CORS in
# main.py and read by frontend/src/services/api.ts.
ADMIN_MODE_HEADER = "X-Admin-Mode-Closes-At"

# The attribute get_current_user sets. Not a mapped column, so it is never
# saved; a User loaded any other way reads as not in admin mode.
_FLAG = "_admin_mode_open"
_ROW = "_admin_session"


def _utc(value: datetime) -> datetime:
    """SQLite hands back naive datetimes; they were written in UTC."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def closes_at(row: AdminSession) -> datetime:
    return _utc(row.last_used_at) + timedelta(minutes=ADMIN_MODE_IDLE_MINUTES)


def is_open(row: Optional[AdminSession], now: Optional[datetime] = None) -> bool:
    if row is None or row.closed_at is not None:
        return False
    return (now or datetime.now(timezone.utc)) < closes_at(row)


async def _latest_row(db: AsyncSession, user_id: int, sid: str) -> Optional[AdminSession]:
    result = await db.execute(
        select(AdminSession)
        .where(AdminSession.user_id == user_id, AdminSession.sid == sid)
        .order_by(AdminSession.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def load_admin_mode(db: AsyncSession, user: User, sid: Optional[str], *, keep_open: bool) -> None:
    """Record on `user` whether admin mode is open for this session.

    `keep_open` moves the idle clock on; pass False for a background poll, so
    an open tab does not keep admin mode open for someone who walked away.
    The caller commits (get_current_user already commits `last_active`).
    """
    setattr(user, _FLAG, False)
    setattr(user, _ROW, None)
    if user.role != UserRole.ADMIN or not sid:
        return
    row = await _latest_row(db, user.id, sid)
    if not is_open(row):
        return
    if keep_open:
        row.last_used_at = datetime.now(timezone.utc)
    setattr(user, _FLAG, True)
    setattr(user, _ROW, row)


def admin_mode_open(user: User) -> bool:
    return bool(getattr(user, _FLAG, False))


def admin_mode_closes_at(user: User) -> Optional[datetime]:
    row = getattr(user, _ROW, None)
    return closes_at(row) if row is not None and admin_mode_open(user) else None


async def open_admin_mode(db: AsyncSession, user: User, sid: str,
                          ip: Optional[str], user_agent: Optional[str]) -> AdminSession:
    """Open (or keep open) admin mode for this session. The caller has
    already checked the code, and commits."""
    now = datetime.now(timezone.utc)
    row = await _latest_row(db, user.id, sid)
    if is_open(row, now):
        row.last_used_at = now
    else:
        row = AdminSession(user_id=user.id, sid=sid, opened_at=now, last_used_at=now,
                           ip=ip, user_agent=(user_agent or "")[:255] or None)
        db.add(row)
    setattr(user, _FLAG, True)
    setattr(user, _ROW, row)
    return row


async def close_admin_mode(db: AsyncSession, user: User, sid: Optional[str]) -> bool:
    """Lock admin. True when there was an open session to close. The caller
    commits."""
    setattr(user, _FLAG, False)
    setattr(user, _ROW, None)
    if not sid:
        return False
    row = await _latest_row(db, user.id, sid)
    if not is_open(row):
        return False
    row.closed_at = datetime.now(timezone.utc)
    return True
