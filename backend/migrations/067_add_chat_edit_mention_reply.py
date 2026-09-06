"""
Migration 067: Add edit, @mention, and reply columns to chat_messages.

- edited_at: overwrite-only edit stamp (no history table by design).
- mentioned_user_ids: JSON list of user ids the message @mentions, resolved
  against the net's checked-in roster at send/edit time.
- reply_to_message_id: self-referential pointer to the quoted message
  (Signal-style single-level quote, not a Slack thread). SQLite cannot add a
  real FK constraint via ALTER TABLE, so this is a plain INTEGER here; the
  constraint exists in models.py for fresh installs, and the serializers
  already treat a missing parent row as "no quote block" either way.
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

    new_columns = [
        ("edited_at", "TIMESTAMP"),
        ("mentioned_user_ids", "TEXT"),
        ("reply_to_message_id", "INTEGER"),
    ]

    try:
        cursor.execute("PRAGMA table_info(chat_messages)")
        existing = {row[1] for row in cursor.fetchall()}

        for column_name, column_type in new_columns:
            if column_name in existing:
                print(f"Column {column_name} already exists in chat_messages - skipping.")
            else:
                cursor.execute(f"ALTER TABLE chat_messages ADD COLUMN {column_name} {column_type}")
                print(f"Added {column_name} to chat_messages.")

        conn.commit()
        print("Migration 067 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 067 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
