"""
Migration 059: Add self_can_hear_enabled to nets and net_templates.

Adds a boolean column (default 1 = enabled) that controls whether a regular
participant may record their own "can hear" propagation report, in addition
to NCS/Logger/Relay recording on behalf of any station. When disabled for a
schedule/net, only NCS/Logger/Relay may save "can hear" reports.
On by default -- existing nets and schedules retain today's staff-only
save behavior only if propagation_logging_enabled was never turned on;
once "can hear" logging is enabled, self-reporting is now on too, matching
the "Allow self check-in" default.
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
        for table in ("nets", "net_templates"):
            cursor.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cursor.fetchall()}
            if "self_can_hear_enabled" in existing:
                print(f"Column self_can_hear_enabled already exists in {table} — skipping.")
            else:
                cursor.execute(
                    f"ALTER TABLE {table} ADD COLUMN self_can_hear_enabled INTEGER NOT NULL DEFAULT 1"
                )
                print(f"Added self_can_hear_enabled to {table}.")

        conn.commit()
        print("Migration 059 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 059 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
