"""
Migration 020: Add parent_check_in_id column to check_ins table.

Supports the row-per-event re-check model: when a station re-checks in,
a new row is inserted with is_recheck=True and parent_check_in_id pointing
to the original (first) check-in row for that callsign in this net.
"""

import sqlite3
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(check_ins)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'parent_check_in_id' not in columns:
            print("Adding parent_check_in_id column to check_ins table...")
            cursor.execute(
                "ALTER TABLE check_ins ADD COLUMN parent_check_in_id INTEGER REFERENCES check_ins(id) ON DELETE SET NULL"
            )
            print("parent_check_in_id column added.")
        else:
            print("parent_check_in_id column already exists on check_ins. Skipping.")

        conn.commit()
        print("Migration 020 completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
