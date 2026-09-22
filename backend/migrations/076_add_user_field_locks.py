"""
Migration 076: Admin-settable field locks on User

Adds:
  users.name_locked     - blocks the user's own PUT /users/me from changing name
  users.callsign_locked - blocks the user's own PUT /users/me from changing callsign
  users.email_locked    - stored for consistency with the other two, but currently
                           inert: UserUpdate has no email field, so self-service
                           email editing doesn't exist yet to block.

All default 0/False -- no existing account is locked by this migration.
Part of the same change as migration 075 (admin_audit_log): an admin fixing a
spammy/inappropriate name or callsign via the Edit User dialog can now also
padlock that field so the user can't just type it back in from their own
Profile page.
"""
import os
import sqlite3


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(users)")
        existing = {row[1] for row in cursor.fetchall()}

        for column in ("name_locked", "callsign_locked", "email_locked"):
            if column in existing:
                print(f"Column {column} already exists in users, skipping.")
            else:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {column} BOOLEAN NOT NULL DEFAULT 0")
                print(f"Added {column} to users.")

        conn.commit()
        print("Migration 076 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 076 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
