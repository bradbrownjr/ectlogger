"""
Migration 035: Add mobile_priority_sort to nets and net_templates.

Adds a boolean column (default 1 = enabled) that controls whether mobile
stations are promoted above chronological check-in order in the check-in list.
On by default — existing nets retain current behavior.
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
            if "mobile_priority_sort" in existing:
                print(f"Column mobile_priority_sort already exists in {table} — skipping.")
            else:
                cursor.execute(
                    f"ALTER TABLE {table} ADD COLUMN mobile_priority_sort INTEGER NOT NULL DEFAULT 1"
                )
                print(f"Added mobile_priority_sort to {table}.")

        conn.commit()
        print("Migration 035 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 035 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
