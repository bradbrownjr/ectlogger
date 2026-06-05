"""
Migration 027: Add hand_raised column to check_ins table.

Supports the hand raise feature: participants can raise a hand to indicate
they have comments or questions. NCS/Admin can toggle hands for any participant.
Default is False (hand lowered).
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

        if 'hand_raised' not in columns:
            print("Adding hand_raised column to check_ins table...")
            cursor.execute(
                "ALTER TABLE check_ins ADD COLUMN hand_raised BOOLEAN DEFAULT 0"
            )
            print("hand_raised column added.")
        else:
            print("hand_raised column already exists on check_ins. Skipping.")

        conn.commit()
        print("Migration 027 completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
