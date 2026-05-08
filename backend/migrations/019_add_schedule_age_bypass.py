"""
Migration 019: Add schedule_age_bypass column to users table.

Allows admins to grant a specific user early access to schedule creation,
bypassing the minimum account age requirement.
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
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'schedule_age_bypass' not in columns:
            print("Adding schedule_age_bypass column to users table...")
            cursor.execute(
                "ALTER TABLE users ADD COLUMN schedule_age_bypass BOOLEAN DEFAULT 0"
            )
        else:
            print("schedule_age_bypass column already exists on users. Skipping.")

        conn.commit()
        print("Migration 019 completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
