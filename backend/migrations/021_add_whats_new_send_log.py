"""
Migration 021: Add whats_new_send_log table.

Provides cross-process deduplication for the What's New email digest.
The app runs two uvicorn processes (ports 8001 and 9999); the port guard
in startup_event() prevents the secondary process from starting background
services at all, but this table acts as a defense-in-depth safety net.

When the digest service wants to send an email it first inserts a row with
(user_id, sent_date).  The UNIQUE constraint means only one INSERT can
succeed; the losing process catches the IntegrityError and skips the send.
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
        # Check if the table already exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='whats_new_send_log'"
        )
        if cursor.fetchone():
            print("whats_new_send_log table already exists. Skipping.")
        else:
            print("Creating whats_new_send_log table...")
            cursor.execute("""
                CREATE TABLE whats_new_send_log (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    sent_date TEXT    NOT NULL,
                    sent_at   DATETIME DEFAULT (datetime('now')),
                    UNIQUE (user_id, sent_date)
                )
            """)
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS ix_whats_new_send_log_user_id "
                "ON whats_new_send_log (user_id)"
            )
            print("whats_new_send_log table created.")

        conn.commit()
        print("Migration 021 completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration 021 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
