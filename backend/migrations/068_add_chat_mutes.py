"""
Migration 068: Add chat_mutes table
Date: 2026-09-08
Description: Personal, per-net chat mutes -- a viewer hiding one station's
messages from their own view only. See ROADMAP.md "Chat Moderation" for the
deferred net-wide/staff-set half of this feature.
"""
import os
import sqlite3
import sys


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_mutes'")
        if cursor.fetchone():
            print("Table chat_mutes already exists. Skipping.")
            return

        print("Creating chat_mutes table...")
        cursor.execute("""
            CREATE TABLE chat_mutes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
                muter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                muted_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (net_id, muter_user_id, muted_user_id)
            )
        """)
        cursor.execute("CREATE INDEX ix_chat_mutes_net_id ON chat_mutes(net_id)")
        cursor.execute("CREATE INDEX ix_chat_mutes_muter_user_id ON chat_mutes(muter_user_id)")
        conn.commit()
        print("Migration 068 completed successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
