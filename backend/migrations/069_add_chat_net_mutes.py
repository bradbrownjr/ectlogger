"""
Migration 069: Add chat_net_mutes table
Date: 2026-09-08
Description: Net-wide, staff-applied chat mutes -- NCS/Logger hiding a
station's messages live for every viewer on this net. One row per (net,
muted user), not per-viewer, since it's a moderation action any active
NCS/Logger can see and lift, not a personal preference. Never touches
chat_messages, so the net's log/export is unaffected. See ROADMAP.md
"Chat Moderation".
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_net_mutes'")
        if cursor.fetchone():
            print("Table chat_net_mutes already exists. Skipping.")
            return

        print("Creating chat_net_mutes table...")
        cursor.execute("""
            CREATE TABLE chat_net_mutes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
                muted_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                applied_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (net_id, muted_user_id)
            )
        """)
        cursor.execute("CREATE INDEX ix_chat_net_mutes_net_id ON chat_net_mutes(net_id)")
        conn.commit()
        print("Migration 069 completed successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
