"""Last-resort MFA reset for an admin who lost their authenticator device.

The admin UI can't do this: an admin can't self-service disable/replace their
own MFA (that would trivially defeat "MFA mandatory for admins"), and only
another admin can reset it for them via POST /users/{id}/mfa/reset. This
script is the escape hatch for when there IS no other admin -- it requires
host/SSH access to the server, not just an app account, which is the point:
recovering from "the only admin lost their phone" should need more than a
web session.

Usage (from the backend directory):
    python scripts/reset_admin_mfa.py <CALLSIGN-or-email>

Clears mfa_enabled/mfa_secret_encrypted/mfa_backup_codes/mfa_pending_secret_encrypted
for the named admin. They'll be prompted to re-enroll next time they hit an
admin-only route (see app.dependencies.get_admin_user).
"""
import asyncio
import logging
import sys

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

sys.path.insert(0, ".")

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User, UserRole


async def main(identifier: str):
    async with AsyncSessionLocal() as db:
        if "@" in identifier:
            result = await db.execute(select(User).where(User.email == identifier.lower()))
        else:
            result = await db.execute(select(User).where(User.callsign == identifier.upper()))
        user = result.scalar_one_or_none()

        if not user:
            print(f"No user found for '{identifier}'.")
            return
        if user.role != UserRole.ADMIN:
            print(f"{user.callsign or user.email} is not an admin -- use the admin UI's "
                  f"'Reset MFA' action for a non-admin user instead.")
            return

        user.mfa_enabled = False
        user.mfa_secret_encrypted = None
        user.mfa_backup_codes = None
        user.mfa_pending_secret_encrypted = None
        await db.commit()

        print(f"MFA reset for {user.callsign or user.email}. They'll be asked to "
              f"re-enroll the next time they use an admin-only feature.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
