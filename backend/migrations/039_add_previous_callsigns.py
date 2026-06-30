"""
Migration 039: Add previous_callsigns column to users table.

Automatically populated when a user changes their primary callsign so that
their check-in history and statistics follow them across callsign changes.
"""

import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db'))

def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cur.fetchall()}

    if 'previous_callsigns' not in columns:
        cur.execute("ALTER TABLE users ADD COLUMN previous_callsigns TEXT DEFAULT '[]' NOT NULL")
        print("Added column: users.previous_callsigns")
    else:
        print("Column already exists: users.previous_callsigns (skipped)")

    conn.commit()
    conn.close()
    print("Migration 039 complete.")

if __name__ == '__main__':
    run()
