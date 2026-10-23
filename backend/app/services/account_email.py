"""Changing the address an account signs in with.

Two ways in, one rule for what a change does (apply_email_change):
- an admin edits it (routers/users.py::admin_update_user), and
- the user changes it themselves (routers/auth.py /auth/email-change/*):
  the link goes to the NEW address, so the change only happens once someone
  proves they can read it, and the old address is told afterwards.

The old address can't block a self-service change, deliberately: losing
access to that mailbox is one of the reasons to change it.
"""
from typing import Optional

from itsdangerous import BadSignature, SignatureExpired
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import serializer
from app.models import User

EMAIL_CHANGE_SALT = "email-change"
EMAIL_CHANGE_MAX_AGE_SECONDS = 24 * 3600


def create_email_change_token(user: User, new_email: str) -> str:
    """Signed, 24 h. Carries the address being replaced, so the link dies
    the moment the account's email changes by any route: a link can be used
    once, and an older one can't undo a newer change."""
    return serializer.dumps({"uid": user.id, "old": user.email, "new": new_email}, salt=EMAIL_CHANGE_SALT)


def read_email_change_token(token: str) -> Optional[dict]:
    """The token's payload, or None if it is forged, mangled or expired."""
    try:
        return serializer.loads(token, salt=EMAIL_CHANGE_SALT, max_age=EMAIL_CHANGE_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None


async def email_in_use(db: AsyncSession, email: str, except_user_id: int) -> bool:
    return (await db.execute(
        select(User.id).where(func.lower(User.email) == email.lower(), User.id != except_user_id).limit(1)
    )).scalar_one_or_none() is not None


def apply_email_change(user: User, new_email: str) -> None:
    """Point the account, and its sign-in link lookup, at new_email.

    Magic-link accounts are found by (oauth_provider, oauth_id) before email
    (routers/auth.py::get_or_create_user), with oauth_id holding the address
    they signed up with. Changing only User.email therefore left a link sent
    to the OLD address still signing in to the account, which is exactly
    what someone replacing a compromised mailbox needs to stop.
    """
    user.email = new_email
    if user.oauth_provider in ("email", "magic_link"):
        user.oauth_provider = "email"
        user.oauth_id = new_email
