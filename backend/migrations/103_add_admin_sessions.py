"""
Migration 103: admin mode

Changes:
  admin_sessions
      - one row each time an admin opens admin mode in a browser session
        (the token's `sid` claim). Open while closed_at is null and
        last_used_at is within 15 minutes; see app/admin_mode.py.

Additive. Safe to re-run. Run after migration 102 and a database backup.
"""
import os
import sqlite3
import sys


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        tables = {row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'admin_sessions' not in tables:
            cursor.execute("""
                CREATE TABLE admin_sessions (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    sid VARCHAR(64) NOT NULL,
                    opened_at DATETIME NOT NULL,
                    last_used_at DATETIME NOT NULL,
                    closed_at DATETIME,
                    ip VARCHAR(64),
                    user_agent VARCHAR(255)
                )
            """)
            print("Created table admin_sessions.")
        else:
            print("Table admin_sessions already exists. Skipping.")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_admin_sessions_id ON admin_sessions (id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_admin_sessions_user_id ON admin_sessions (user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_admin_sessions_sid ON admin_sessions (sid)")
        conn.commit()
        print("Migration 103 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 103 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
