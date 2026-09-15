"""
Migration 073: Auto-close net on inactivity.

Adds:
  nets.auto_close_after_minutes - minutes since the last check-in/recheck/chat
                                   message (or started_at, if neither exists
                                   yet) after which an ACTIVE net closes
                                   itself. Nullable, no default -- NULL means
                                   disabled, which is what every existing net
                                   keeps.
  net_templates.auto_close_after_minutes - same, seeds new nets created from
                                   this schedule. Nullable, no default.
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
        if "auto_close_after_minutes" in existing:
            print("Column auto_close_after_minutes already exists in nets, skipping.")
        else:
            cursor.execute("ALTER TABLE nets ADD COLUMN auto_close_after_minutes INTEGER")
            print("Added auto_close_after_minutes to nets.")

        cursor.execute("PRAGMA table_info(net_templates)")
        existing = {row[1] for row in cursor.fetchall()}
        if "auto_close_after_minutes" in existing:
            print("Column auto_close_after_minutes already exists in net_templates, skipping.")
        else:
            cursor.execute("ALTER TABLE net_templates ADD COLUMN auto_close_after_minutes INTEGER")
            print("Added auto_close_after_minutes to net_templates.")

        conn.commit()
        print("Migration 073 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 073 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
