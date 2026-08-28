"""
Migration 064: Add cancelled_at and cancel_reason to nets.

Supports NetStatus.CANCELLED: cancelling a net now sets this status instead
of deleting the row, so the occurrence stays visible (in the Archived Nets
list) instead of silently vanishing - and so the reminder scheduler can see
it was intentionally skipped instead of recreating it. cancel_reason is an
optional operator-entered note (e.g. "in-person meeting instead").
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
        cursor.execute("PRAGMA table_info(nets)")
        existing = {row[1] for row in cursor.fetchall()}

        if "cancelled_at" in existing:
            print("Column cancelled_at already exists in nets — skipping.")
        else:
            cursor.execute("ALTER TABLE nets ADD COLUMN cancelled_at DATETIME")
            print("Added cancelled_at to nets.")

        if "cancel_reason" in existing:
            print("Column cancel_reason already exists in nets — skipping.")
        else:
            cursor.execute("ALTER TABLE nets ADD COLUMN cancel_reason VARCHAR(500)")
            print("Added cancel_reason to nets.")

        conn.commit()
        print("Migration 064 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 064 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
