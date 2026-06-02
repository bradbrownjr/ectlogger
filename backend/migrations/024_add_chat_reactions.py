"""
Migration 024: Add chat_reactions table
Date: 2026-06-02
Description: Stores per-user emoji reactions on chat messages.
             Emojis are toggled; each (message, user, emoji) is unique.
"""
import sqlite3
import os


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_reactions'")
        if cursor.fetchone():
            print("Table chat_reactions already exists. Skipping.")
            return

        print("Creating chat_reactions table...")
        cursor.execute("""
            CREATE TABLE chat_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                emoji VARCHAR(10) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_chat_reaction UNIQUE (message_id, user_id, emoji)
            )
        """)
        cursor.execute("CREATE INDEX ix_chat_reactions_message_id ON chat_reactions(message_id)")
        conn.commit()
        print("Migration 024 completed successfully.")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
