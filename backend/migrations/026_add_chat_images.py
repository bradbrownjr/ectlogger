"""
Migration 026: Add chat_images table
Date: 2026-06-02
Description: Stores uploaded chat images and thumbnail metadata.
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_images'")
        if cursor.fetchone():
            print("Table chat_images already exists. Skipping.")
            return

        print("Creating chat_images table...")
        cursor.execute("""
            CREATE TABLE chat_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
                image_path VARCHAR(500) NOT NULL,
                thumb_path VARCHAR(500) NOT NULL,
                mime_type VARCHAR(50) NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX ix_chat_images_net_id ON chat_images(net_id)")
        cursor.execute("CREATE INDEX ix_chat_images_user_id ON chat_images(user_id)")
        cursor.execute("CREATE INDEX ix_chat_images_message_id ON chat_images(message_id)")
        conn.commit()
        print("Migration 026 completed successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
