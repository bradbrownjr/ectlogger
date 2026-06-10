"""
Migration 033: Add is_active column to net_roles table.

Allows NCS-role operators to temporarily step down to participant status
(and back up) without losing their permanent role assignment. The column
defaults to 1 (active) so all existing role records remain unaffected.

SQLite does not support IF NOT EXISTS on ALTER TABLE, so we check the
current column list before attempting the addition.
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
        cursor.execute("PRAGMA table_info(net_roles)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'is_active' in columns:
            print("Column is_active already exists on net_roles — skipping.")
        else:
            cursor.execute(
                "ALTER TABLE net_roles ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"
            )
            print("Added is_active column to net_roles.")

        conn.commit()
        print("Migration 033 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 033 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
