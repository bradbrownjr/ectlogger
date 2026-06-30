"""Migration 038: Add walkthrough_seen to users table."""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')


def run():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(users)")
    existing = {row[1] for row in cursor.fetchall()}
    if 'walkthrough_seen' in existing:
        print("Column walkthrough_seen already exists in users — skipping.")
    else:
        cursor.execute(
            "ALTER TABLE users ADD COLUMN walkthrough_seen BOOLEAN DEFAULT 0 NOT NULL"
        )
        print("Added walkthrough_seen to users.")

    conn.commit()
    conn.close()
    print("Migration 038 complete.")


if __name__ == '__main__':
    run()
