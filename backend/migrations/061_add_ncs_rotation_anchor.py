"""
Migration 061: Add rotation_anchor_date to net_templates.

The NCS rotation has no stored pointer for "whose turn is next" -- the
assignment for any date is recomputed by counting how many occurrences have
elapsed since a fixed anchor point, which until now was always the template's
creation date. That works while the roster is stable, but the moment someone
reorders or edits the roster the count-since-creation no longer lines up with
the order they just arranged, leaving a permanent silent offset that has to be
corrected with a per-occurrence swap every single time.

This column stores a movable anchor that is stamped whenever the roster's
membership or order changes, so the next occurrence after the edit is the
operator now sitting at the top of the list and the cycle continues correctly
from there.

Null means "never edited since this shipped" -- the calculation falls back to
the created_at-derived anchor, so existing schedules are unchanged.
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
        cursor.execute("PRAGMA table_info(net_templates)")
        existing = {row[1] for row in cursor.fetchall()}
        if "rotation_anchor_date" in existing:
            print("Column rotation_anchor_date already exists in net_templates — skipping.")
        else:
            cursor.execute("ALTER TABLE net_templates ADD COLUMN rotation_anchor_date DATETIME")
            print("Added rotation_anchor_date to net_templates.")

        conn.commit()
        print("Migration 061 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 061 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
