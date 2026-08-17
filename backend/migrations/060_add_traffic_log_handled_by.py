"""
Migration 060: Add handled_by to traffic_log_entries.

Adds a free-text column recording who actually performed a chain-of-custody
hop (took the message), distinct from reported_by_user_id (who is logged
into ECTLogger entering the record). The common case is the entering
operator logging their own action -- but an NCS or logger often logs a hop
a relay station reported verbally over the net, and until now there was no
field to record that station; only who typed it in.
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
        cursor.execute("PRAGMA table_info(traffic_log_entries)")
        existing = {row[1] for row in cursor.fetchall()}
        if "handled_by" in existing:
            print("Column handled_by already exists in traffic_log_entries — skipping.")
        else:
            cursor.execute("ALTER TABLE traffic_log_entries ADD COLUMN handled_by VARCHAR(200)")
            print("Added handled_by to traffic_log_entries.")

        conn.commit()
        print("Migration 060 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 060 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
