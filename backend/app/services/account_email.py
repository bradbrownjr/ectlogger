"""The addresses an account signs in with: its primary (User.email) and up
to MAX_BACKUP_EMAILS confirmed backups (models.UserEmail).

Finding an account by address always goes through find_user_by_email, and
"is this address free" through email_in_use, because one address belongs to
one account across both columns and no database constraint spans them.

Changing the primary address:

Two ways in, one rule for what a change does (apply_email_change):
- an admin edits it (routers/users.py::admin_update_user), and
- the user changes it themselves (routers/auth.py /auth/email-change/*):
  the link goes to the NEW address, so the change only happens once someone
  proves they can read it, and the old address is told afterwards.

The old address can't block a self-service change, deliberately: losing
access to that mailbox is one of the reasons to change it.
"""
from typing import List, Optional

from itsdangerous import BadSignature, SignatureExpired
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import serializer
from app.models import User, UserEmail
from app.utils import normalize_email

EMAIL_CHANGE_SALT = "email-change"
EMAIL_CHANGE_MAX_AGE_SECONDS = 24 * 3600
BACKUP_EMAIL_SALT = "backup-email"
MAX_BACKUP_EMAILS = 3


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


async def find_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """The account an address signs in to: its primary address, else one of
    its backups. Case-insensitive on the primary for any row still holding
    a mixed-case address from before normalization (migration 072)."""
    email = normalize_email(email)
    user = (await db.execute(
        select(User).where(func.lower(User.email) == email).order_by(User.id).limit(1)
    )).scalar_one_or_none()
    if user is not None:
        return user
    return (await db.execute(
        select(User).join(UserEmail, UserEmail.user_id == User.id).where(UserEmail.email == email)
    )).scalar_one_or_none()


async def email_in_use(db: AsyncSession, email: str, except_user_id: Optional[int] = None) -> bool:
    """Whether another account (not except_user_id) has this address, as its
    primary or as a backup."""
    owner = await find_user_by_email(db, email)
    return owner is not None and owner.id != except_user_id


async def backup_emails(db: AsyncSession, user_id: int) -> List[UserEmail]:
    return list((await db.execute(
        select(UserEmail).where(UserEmail.user_id == user_id).order_by(UserEmail.created_at, UserEmail.id)
    )).scalars().all())


async def account_addresses(db: AsyncSession, user: User) -> List[str]:
    """Every address the account signs in with, primary first: where its
    security notices go."""
    return [a for a in [user.email] + [row.email for row in await backup_emails(db, user.id)] if a]


def create_backup_email_token(user: User, email: str) -> str:
    """Signed, 24 h, for confirming a backup address from that mailbox. Used
    up by adding the address (confirming it again finds it already there)."""
    return serializer.dumps({"uid": user.id, "add": email}, salt=BACKUP_EMAIL_SALT)


def read_backup_email_token(token: str) -> Optional[dict]:
    try:
        return serializer.loads(token, salt=BACKUP_EMAIL_SALT, max_age=EMAIL_CHANGE_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None


def make_backup_primary(user: User, backup: UserEmail) -> str:
    """Swap a backup with the primary, so the old primary becomes a backup
    and the account keeps every address it had. Returns the old primary."""
    old_primary = user.email
    apply_email_change(user, backup.email)
    backup.email = normalize_email(old_primary)
    return old_primary


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


async def notify_sign_in_address_change(db: AsyncSession, user: User, change: str, address: str,
                                        by_admin: bool, other: str = "", also: tuple = ()) -> None:
    """Email every address on the account, plus `also` (a removed address),
    about a change to its sign-in addresses. Best effort: the change has
    already happened."""
    from app.email_service import EmailService
    from app.logger import logger

    recipients = list(dict.fromkeys(await account_addresses(db, user) + [a for a in also if a]))
    for to_email in recipients:
        try:
            await EmailService.send_sign_in_address_notice(to_email, change, address, by_admin, other)
        except Exception as exc:
            logger.error("EMAIL CHANGE", f"Sign-in address notice to {to_email} not sent: {exc}")


async def notify_backups_of_primary_change(db: AsyncSession, user: User, old_email: str, by_admin: bool) -> None:
    """After the primary address is replaced (the old and new addresses get
    their own notice, email/auth.py::send_email_change_notice), tell the
    backups too."""
    from app.email_service import EmailService
    from app.logger import logger

    for row in await backup_emails(db, user.id):
        try:
            await EmailService.send_sign_in_address_notice(row.email, "primary_changed", user.email, by_admin, old_email)
        except Exception as exc:
            logger.error("EMAIL CHANGE", f"Sign-in address notice to {row.email} not sent: {exc}")
