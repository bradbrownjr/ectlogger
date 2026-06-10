"""
Migration 031: Add session_lifetime_days and session_rolling_renewal to app_settings.

Allows admins to configure how long login sessions last and whether sessions
automatically renew when nearing expiry, without requiring a .env file edit.
"""

import sqlite3
import os


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(app_settings)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'session_lifetime_days' not in columns:
            print("Adding session_lifetime_days column to app_settings...")
            cursor.execute("ALTER TABLE app_settings ADD COLUMN session_lifetime_days INTEGER DEFAULT 30")
            print("session_lifetime_days column added.")
        else:
            print("session_lifetime_days already exists, skipping.")

        if 'session_rolling_renewal' not in columns:
            print("Adding session_rolling_renewal column to app_settings...")
            cursor.execute("ALTER TABLE app_settings ADD COLUMN session_rolling_renewal BOOLEAN DEFAULT 1")
            print("session_rolling_renewal column added.")
        else:
            print("session_rolling_renewal already exists, skipping.")

        conn.commit()
        print("Migration 031 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 031 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
