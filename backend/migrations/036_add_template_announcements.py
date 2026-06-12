"""
Migration 036: Add template_announcements table.

Stores the recurring announcement items NCS maintains on a schedule so they
carry forward to every net opened from that schedule.
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='template_announcements'")
        if cursor.fetchone():
            print("Table template_announcements already exists — skipping.")
            conn.close()
            return

        cursor.execute("""
            CREATE TABLE template_announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL REFERENCES net_templates(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX ix_template_announcements_template_id ON template_announcements(template_id)")
        conn.commit()
        print("Migration 036 complete — template_announcements table created.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 036 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
