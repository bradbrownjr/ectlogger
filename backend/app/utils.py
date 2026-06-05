"""Shared utility helpers used across the backend."""

import hashlib
import requests
from typing import Optional


def get_avatar_url(email: Optional[str], custom_url: Optional[str] = None) -> Optional[str]:
    """Return a profile avatar URL for a user.

    If the user has uploaded a custom profile image (custom_url set), return that.
    Otherwise compute a Gravatar URL from the email hash. The email is never sent
    to the frontend — only the resolved URL is exposed.
    
    Validates that the Gravatar exists (200) before returning it. If the Gravatar
    doesn't exist (404), returns None so the frontend falls back to name initial.
    """
    if custom_url:
        return custom_url
    if not email:
        return None
    h = hashlib.md5(email.strip().lower().encode()).hexdigest()
    gravatar_url = f"https://www.gravatar.com/avatar/{h}?s=128&d=404&r=g"
    
    # Validate that the Gravatar exists before returning it
    try:
        response = requests.head(gravatar_url, timeout=2)
        if response.status_code == 200:
            return gravatar_url
    except Exception:
        pass
    
    # Gravatar doesn't exist or couldn't be reached; return None for frontend fallback
    return None


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
