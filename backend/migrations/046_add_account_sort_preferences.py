"""
Migration 046: Account-level sort order preferences.

Adds:
  users.dashboard_sort_order  - 'status' (active first, then next up) or 'alpha'
  users.schedule_sort_order   - 'date' (next occurrence first) or 'alpha'

These were previously per-browser localStorage only (dashboard-sort-order /
scheduler-sort-order keys), which meant the choice didn't follow a user across
devices and looked like it kept "getting forgotten". Moving them onto the
account fixes that. Existing rows get the new time-based defaults; the
frontend seeds a one-time PUT from any existing localStorage value on first
load after this ships, so a user who had already picked "alpha" keeps it.
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

    columns = [
        ("users", "dashboard_sort_order", "TEXT NOT NULL DEFAULT 'status'"),
        ("users", "schedule_sort_order", "TEXT NOT NULL DEFAULT 'date'"),
    ]

    try:
        for table, column, ddl in columns:
            cursor.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cursor.fetchall()}
            if column in existing:
                print(f"Column {column} already exists in {table}, skipping.")
                continue
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            print(f"Added {column} to {table}.")

        conn.commit()
        print("Migration 046 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 046 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
