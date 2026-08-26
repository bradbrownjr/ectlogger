"""
Migration 063: Add auto_assigned to net_roles.

Marks a NetRole as having been stamped by the rotation logic itself
(_assign_duty_ncs, at auto-create time) rather than by a human action
(starting the net, self-check-in auto-grant, or an owner/admin manually
assigning a role). Defaults to False so every pre-existing NetRole is
treated as human-authored.

This is what lets a later roster edit find and safely replace *only* the
rotation's own pick for a not-yet-started net, without ever touching a
role a person deliberately set.
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
        cursor.execute("PRAGMA table_info(net_roles)")
        existing = {row[1] for row in cursor.fetchall()}
        if "auto_assigned" in existing:
            print("Column auto_assigned already exists in net_roles — skipping.")
        else:
            cursor.execute(
                "ALTER TABLE net_roles ADD COLUMN auto_assigned BOOLEAN NOT NULL DEFAULT 0"
            )
            print("Added auto_assigned to net_roles.")

        conn.commit()
        print("Migration 063 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 063 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
