"""
Migration 092: Backup sign-in addresses

Changes:
  user_emails  - new table: an account's confirmed backup sign-in addresses
                 (models.UserEmail). The primary address stays on users.email.

Additive. Safe to re-run. Run after a database backup.
"""
import os
import sqlite3


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_emails (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT (CURRENT_TIMESTAMP)
            )
        """)
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_emails_email ON user_emails (email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_user_emails_user_id ON user_emails (user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_user_emails_id ON user_emails (id)")
        conn.commit()
        print("Migration 092 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 092 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
