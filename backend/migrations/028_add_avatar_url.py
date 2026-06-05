"""
Migration 028: Add avatar_url column to users table.

Stores a custom profile image URL for users who upload a profile photo.
When NULL, the application derives a Gravatar URL from the user's email
(computed server-side; email hash never exposed to the browser).
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

        if 'avatar_url' not in columns:
            print("Adding avatar_url column to users table...")
            cursor.execute(
                "ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) NULL"
            )
            print("avatar_url column added.")
        else:
            print("avatar_url column already exists on users. Skipping.")

        conn.commit()
        print("Migration 028 completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration 028 failed: {e}")
        raise

    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
