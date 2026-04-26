"""
Migration 018: Add stream_url and announcements to net_templates table.

These fields already existed on the nets table. Adding them at the template
(schedule) level lets users push those values back to a schedule via the new
"Save to Schedule" action so future nets opened from the schedule inherit them.
"""

import sqlite3
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


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

        if 'stream_url' not in columns:
            print("Adding stream_url column to net_templates table...")
            cursor.execute("ALTER TABLE net_templates ADD COLUMN stream_url VARCHAR(500)")
        else:
            print("stream_url column already exists on net_templates. Skipping.")

        if 'announcements' not in columns:
            print("Adding announcements column to net_templates table...")
            cursor.execute("ALTER TABLE net_templates ADD COLUMN announcements TEXT")
        else:
            print("announcements column already exists on net_templates. Skipping.")

        conn.commit()
        print("Migration 018 completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
