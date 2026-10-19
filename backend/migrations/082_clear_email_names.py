"""
Migration 082: Clear account names that are just the account's email address

Magic-link sign-up stored the email address as a new account's name until
2026-10-19 (routers/auth.py::verify_magic_link), and public lists show a
signed-out visitor the first word of a name, so those addresses were shown
as the operator's "first name". Sign-up now leaves the name empty; this
clears the ones already stored, so profile setup asks those operators for
their name. Only names that equal the address exactly are touched.

Safe to re-run. Run after a database backup.
"""
import os
import sqlite3


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET name = NULL "
            "WHERE name IS NOT NULL AND LOWER(TRIM(name)) = LOWER(TRIM(email))"
        )
        conn.commit()
        print(f"Cleared {cursor.rowcount} name(s) that were the account's email address.")
        print("Migration 082 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 082 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
