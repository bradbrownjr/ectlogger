"""
Migration 030: Add fifth_week_user_id to net_templates.

Adds an optional operator override used for weekly schedules when a month
contains a fifth occurrence of the scheduled weekday. This operator is
assigned on those dates while the primary rotation pauses and resumes after.
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
        cursor.execute("PRAGMA table_info(net_templates)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'fifth_week_user_id' not in columns:
            print("Adding fifth_week_user_id column to net_templates table...")
            cursor.execute("ALTER TABLE net_templates ADD COLUMN fifth_week_user_id INTEGER NULL")
            print("fifth_week_user_id column added.")
        else:
            print("fifth_week_user_id column already exists on net_templates. Skipping.")

        conn.commit()
        print("Migration 030 completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration 030 failed: {e}")
        raise

    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
