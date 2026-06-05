"""Shared utility helpers used across the backend."""

import hashlib
from typing import Optional


def get_avatar_url(email: Optional[str], custom_url: Optional[str] = None) -> str:
    """Return a profile avatar URL for a user.

    If the user has uploaded a custom profile image (custom_url set), return that.
    Otherwise compute a Gravatar URL from the email hash. The email is never sent
    to the frontend — only the resolved URL is exposed.
    Falls back to mystery-person silhouette (d=mp) when no Gravatar exists.
    """
    if custom_url:
        return custom_url
    if not email:
        return "https://www.gravatar.com/avatar/00000000000000000000000000000000?s=128&d=mp&r=g"
    h = hashlib.md5(email.strip().lower().encode()).hexdigest()
    return f"https://www.gravatar.com/avatar/{h}?s=128&d=mp&r=g"


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
