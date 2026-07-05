"""Shared utility helpers used across the backend."""

import hashlib
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Optional

# Single source of truth for where uploaded avatar files live on disk.
# routers/users.py imports this rather than redefining it.
AVATAR_DIR = Path(__file__).resolve().parents[1] / "data" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)


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


def get_avatar_url(email: Optional[str], custom_url: Optional[str] = None) -> Optional[str]:
    """Return a profile avatar URL for a user.

    If the user has uploaded a custom profile image (custom_url set) and the file
    still exists on disk and is non-empty, return that. Otherwise compute a
    Gravatar URL from the email hash. The email is never sent to the frontend —
    only the resolved URL is exposed.

    Validates that the Gravatar exists (200) before returning it. If neither the
    custom upload nor the Gravatar is available, returns None so the frontend
    falls back to the name initial.
    """
    if custom_url and _custom_avatar_file_ok(custom_url):
        return custom_url
    if not email:
        return None
    h = hashlib.md5(email.strip().lower().encode()).hexdigest()
    gravatar_url = f"https://www.gravatar.com/avatar/{h}?s=128&d=404&r=g"

    # Validate that the Gravatar exists before returning it
    try:
        req = urllib.request.Request(gravatar_url, method="HEAD")
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                return gravatar_url
    except Exception:
        pass

    return None


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
