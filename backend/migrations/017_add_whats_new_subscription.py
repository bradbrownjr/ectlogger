"""Migration 017: Add notify_whats_new and timezone columns to users.

`notify_whats_new` is an opt-in (default False) for the daily 8 AM
"What's New in ECTLogger" digest email summarising changelog entries
from the previous calendar day.

`timezone` is an optional IANA timezone string (e.g. "America/New_York")
used to schedule per-user emails at the user's local 8 AM. When unset
the digest service falls back to America/Los_Angeles (PST/PDT) so we
don't wake users up before their typical workday.
"""

import sqlite3
import os


def migrate():
    db_path = os.environ.get(
        'DATABASE_PATH',
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db'),
    )

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(users)")
    existing_cols = {row[1] for row in cursor.fetchall()}

    if 'notify_whats_new' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN notify_whats_new BOOLEAN DEFAULT 0")
        print("Added users.notify_whats_new")
    else:
        print("users.notify_whats_new already exists, skipping")

    if 'timezone' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN timezone VARCHAR(64)")
        print("Added users.timezone")
    else:
        print("users.timezone already exists, skipping")

    conn.commit()
    conn.close()
    print("Migration 017 complete.")


if __name__ == '__main__':
    migrate()
