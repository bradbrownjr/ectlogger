"""
Migration 071: User website/YouTube channel link.

Adds:
  users.website_url - optional outbound link (personal site, YouTube channel,
                       etc.), shown on the profile popup. Nullable, no default
                       -- existing users keep NULL and show no link.

Part of the same change that adds a hard-block dialog for a Name field that
looks like an email or URL (frontend-only, ProfileSetupDialog.tsx) -- this
column is where that content is supposed to move to instead.
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
        cursor.execute("PRAGMA table_info(users)")
        existing = {row[1] for row in cursor.fetchall()}
        if "website_url" in existing:
            print("Column website_url already exists in users, skipping.")
        else:
            cursor.execute("ALTER TABLE users ADD COLUMN website_url VARCHAR(500)")
            print("Added website_url to users.")

        conn.commit()
        print("Migration 071 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 071 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
