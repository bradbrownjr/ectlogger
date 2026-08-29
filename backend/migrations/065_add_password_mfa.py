"""
Migration 065: Add password + MFA columns to users.

Adds an optional password fallback (bcrypt hash) alongside magic-link
sign-in, for when outbound email is down and users can't retrieve a magic
link at all. TOTP-based MFA is optional for regular users and required for
admins (enforced in app.dependencies.get_admin_user, not in the schema).

password_hash / failed_password_attempts / password_locked_until: password
auth and its brute-force lockout.
mfa_enabled / mfa_secret_encrypted / mfa_backup_codes: TOTP enrollment state.
mfa_pending_secret_encrypted: staging slot so a user can replace a lost
authenticator (proven by password, not a TOTP code) without ever leaving
mfa_secret_encrypted in a half-migrated state if they abandon the flow.
"""

import sqlite3
import os


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(users)")
        existing = {row[1] for row in cursor.fetchall()}

        columns = [
            ("password_hash", "VARCHAR(255)"),
            ("failed_password_attempts", "INTEGER NOT NULL DEFAULT 0"),
            ("password_locked_until", "DATETIME"),
            ("mfa_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
            ("mfa_secret_encrypted", "TEXT"),
            ("mfa_backup_codes", "TEXT"),
            ("mfa_pending_secret_encrypted", "TEXT"),
        ]

        for name, ddl_type in columns:
            if name in existing:
                print(f"Column {name} already exists in users — skipping.")
            else:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl_type}")
                print(f"Added {name} to users.")

        conn.commit()
        print("Migration 065 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 065 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
