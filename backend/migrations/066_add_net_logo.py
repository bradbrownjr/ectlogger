"""
Migration 066: Add logo_url to nets and net_templates.

Lets a net (or the schedule/template it's created from) carry an uploaded
club/net logo, shown on net and schedule cards and to the left of the net
name on the check-in page. Mirrors User.avatar_url: a URL to an uploaded,
server-resized file, not the image itself.
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
        cursor.execute("PRAGMA table_info(nets)")
        existing = {row[1] for row in cursor.fetchall()}
        if "logo_url" in existing:
            print("Column logo_url already exists in nets — skipping.")
        else:
            cursor.execute("ALTER TABLE nets ADD COLUMN logo_url VARCHAR(500)")
            print("Added logo_url to nets.")

        cursor.execute("PRAGMA table_info(net_templates)")
        existing = {row[1] for row in cursor.fetchall()}
        if "logo_url" in existing:
            print("Column logo_url already exists in net_templates — skipping.")
        else:
            cursor.execute("ALTER TABLE net_templates ADD COLUMN logo_url VARCHAR(500)")
            print("Added logo_url to net_templates.")

        conn.commit()
        print("Migration 066 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 066 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
