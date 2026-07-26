"""
Migration 043: Add self_checkin_enabled to nets and net_templates.

Adds a boolean column (default 1 = enabled) that controls whether regular
users may check themselves into a net. When disabled for a schedule/net,
only NCS/logger-entered check-ins are accepted.
On by default — existing nets and schedules retain current behavior.
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
        for table in ("nets", "net_templates"):
            cursor.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cursor.fetchall()}
            if "self_checkin_enabled" in existing:
                print(f"Column self_checkin_enabled already exists in {table} — skipping.")
            else:
                cursor.execute(
                    f"ALTER TABLE {table} ADD COLUMN self_checkin_enabled INTEGER NOT NULL DEFAULT 1"
                )
                print(f"Added self_checkin_enabled to {table}.")

        conn.commit()
        print("Migration 043 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 043 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
