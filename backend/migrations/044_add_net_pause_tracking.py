"""
Migration 044: Add paused_at and total_paused_seconds to nets.

Tracks periods where a net has an assigned NCS but none of them are
actively present (checked in and not away). paused_at is set the moment
that becomes true and cleared (folded into total_paused_seconds) the
moment an NCS is present again, or when the net is closed while still
paused. Used to exclude "no NCS present" time from the net's recorded
duration.
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
        cursor.execute("PRAGMA table_info(nets)")
        existing = {row[1] for row in cursor.fetchall()}

        if "paused_at" in existing:
            print("Column paused_at already exists in nets — skipping.")
        else:
            cursor.execute("ALTER TABLE nets ADD COLUMN paused_at TIMESTAMP")
            print("Added paused_at to nets.")

        if "total_paused_seconds" in existing:
            print("Column total_paused_seconds already exists in nets — skipping.")
        else:
            cursor.execute("ALTER TABLE nets ADD COLUMN total_paused_seconds INTEGER NOT NULL DEFAULT 0")
            print("Added total_paused_seconds to nets.")

        conn.commit()
        print("Migration 044 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 044 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
