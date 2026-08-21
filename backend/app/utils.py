"""Shared utility helpers used across the backend."""

import hashlib
import re
from datetime import datetime, timezone as dt_timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Single source of truth for where uploaded avatar files live on disk.
# routers/users.py imports this rather than redefining it.
AVATAR_DIR = Path(__file__).resolve().parents[1] / "data" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

# Single source of truth for the uploaded instance logo (Admin -> Branding).
# One file for the whole instance, not per-user, unlike AVATAR_DIR.
LOGO_DIR = Path(__file__).resolve().parents[1] / "data" / "logo"
LOGO_DIR.mkdir(parents=True, exist_ok=True)


def _custom_avatar_file_ok(custom_url: str) -> bool:
    """Check that an uploaded avatar's file still exists on disk and isn't empty.

    Uploads are validated and re-encoded via Pillow at write time (see
    routers/users.py), so a missing or zero-byte file at read time means the
    file was deleted, never copied (e.g. a database restored without its
    matching upload directory), or otherwise corrupted.
    """
    filename = custom_url.rsplit('/', 1)[-1]
    path = AVATAR_DIR / filename
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


# Master switch mirroring app_settings.gravatar_enabled. Cached in-process
# because get_avatar_url is called from UserResponse.from_orm, which is
# synchronous and has no database session to consult. Loaded at startup and
# refreshed whenever settings are saved -- see set_gravatar_enabled.
_gravatar_enabled = True


def set_gravatar_enabled(enabled: bool) -> None:
    """Update the cached Gravatar master switch (startup + on settings save)."""
    global _gravatar_enabled
    _gravatar_enabled = bool(enabled)


def gravatar_is_enabled() -> bool:
    return _gravatar_enabled


def get_avatar_url(email: Optional[str], custom_url: Optional[str] = None) -> Optional[str]:
    """Return a profile avatar URL for a user.

    If the user has uploaded a custom profile image (custom_url set) and the file
    still exists on disk and is non-empty, return that. Otherwise return a
    Gravatar URL computed from the email hash. The email is never sent to the
    frontend — only the resolved URL is exposed.

    Deliberately does NOT check whether the Gravatar actually exists. That check
    used to issue a blocking HTTP HEAD to gravatar.com per user: ~150-200 ms
    each, on all twelve endpoints returning UserResponse — including /users/me,
    which every authenticated page load hits. Worse, it used synchronous urllib
    inside async request handlers, so it stalled the event loop for every other
    request while it waited (66 users measured at 6.3 s of blocked loop).

    It was also unnecessary. Gravatar is built for direct client-side embedding,
    with the `d=` parameter deciding the fallback; `d=404` makes Gravatar answer
    404 when a user has no image, and MUI's <Avatar> renders its children (the
    user's initial) on any load failure — 404, blocked by an extension, offline,
    or DNS failure alike. The browser already does this job, in parallel, cached,
    and always current, with no server-side TTL to go stale.

    Returns None when Gravatar is disabled instance-wide, so no browser is ever
    asked to contact gravatar.com. Uploaded photos are served locally and remain
    available either way.
    """
    if custom_url and _custom_avatar_file_ok(custom_url):
        return custom_url
    if not email or not _gravatar_enabled:
        return None
    h = hashlib.md5(email.strip().lower().encode()).hexdigest()
    return f"https://www.gravatar.com/avatar/{h}?s=128&d=404&r=g"


def resolve_display_tz(user) -> Optional[ZoneInfo]:
    """Return the IANA zone a user's times should be displayed in for server-generated
    output (net log emails, CSV/ICS-309 exports), or None to mean "leave as UTC".

    None covers both real cases: the user has ``prefer_utc`` set, or they haven't
    got a ``timezone`` on file yet (the common case today, since nothing populates
    it automatically). Falling back to UTC rather than guessing a region keeps
    output correct for everyone until the frontend starts reporting a real zone.
    """
    if user is None or getattr(user, 'prefer_utc', False):
        return None
    tz_name = getattr(user, 'timezone', None)
    if not tz_name:
        return None
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return None


def to_display_tz(dt: Optional[datetime], tz: Optional[ZoneInfo]) -> Optional[datetime]:
    """Convert a UTC datetime for display in ``tz``. No-op when ``dt`` or ``tz`` is None."""
    if dt is None or tz is None:
        return dt
    aware = dt if dt.tzinfo else dt.replace(tzinfo=dt_timezone.utc)
    return aware.astimezone(tz).replace(tzinfo=None)


def format_time_for_net(
    timestamp: datetime,
    net_started_at: datetime,
    net_closed_at: datetime = None,
) -> str:
    """Format a timestamp; include the date only when the net spans multiple days."""
    if not timestamp:
        return ""
    is_multi_day = False
    if net_started_at:
        end_date = net_closed_at or datetime.utcnow()
        if net_started_at.date() != end_date.date():
            is_multi_day = True
    return timestamp.strftime("%m/%d %H:%M:%S") if is_multi_day else timestamp.strftime("%H:%M:%S")


def display_callsign(user) -> str:
    """Return the best available display callsign for a user.

    Falls back through: amateur callsign → GMRS callsign → display name → email.
    Supports GMRS-only users who have no amateur radio license.
    """
    if user is None:
        return ''
    return (
        getattr(user, 'callsign', None)
        or getattr(user, 'gmrs_callsign', None)
        or getattr(user, 'name', None)
        or getattr(user, 'email', '')
        or ''
    )


_EMAIL_RE = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
# Matches common US phone formats -- (555) 123-4567, 555-123-4567,
# 555.123.4567, +1 555 123 4567, or a bare 5551234567 -- while the
# (?<!\d)/(?!\d) boundaries keep it from grabbing a piece of a longer digit
# run (a talkgroup ID, a ZIP+4, etc).
_PHONE_RE = re.compile(r'(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)')


def redact_contact_info(text: Optional[str]) -> Optional[str]:
    """Best-effort redaction of email addresses and phone numbers from free
    text shown to unauthenticated (guest) viewers of a net's history.

    Regex-based PII detection is inherently imperfect -- this reduces casual
    exposure of a callback number or email address typed into a check-in
    note or chat message, it does not guarantee none is present. Callers
    apply this only when the requester is not logged in; a callsign and
    licensee name are already public via the FCC ULS, so those are left
    alone, and authenticated net participants always see the original
    text -- sharing a callback number during a net is normal coordination,
    not a leak.
    """
    if not text:
        return text
    text = _EMAIL_RE.sub('[redacted]', text)
    text = _PHONE_RE.sub('[redacted]', text)
    return text
