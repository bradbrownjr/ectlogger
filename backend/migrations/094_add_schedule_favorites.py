"""
Migration 094: Starred schedules saved to the account

Changes:
  schedule_favorites - one row per account and starred schedule. Until
                       2026-10-30 stars lived only in each browser; the app
                       copies a browser's stars up the first time the person
                       signs in there.

Additive. Safe to re-run. Run after a database backup.
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='schedule_favorites'")
        if cursor.fetchone():
            print("Table schedule_favorites already exists. Skipping.")
            return
        cursor.execute("""
            CREATE TABLE schedule_favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                template_id INTEGER NOT NULL REFERENCES net_templates(id) ON DELETE CASCADE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_schedule_favorite UNIQUE (user_id, template_id)
            )
        """)
        cursor.execute("CREATE INDEX ix_schedule_favorites_id ON schedule_favorites(id)")
        cursor.execute("CREATE INDEX ix_schedule_favorites_user_id ON schedule_favorites(user_id)")
        conn.commit()
        print("Migration 094 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 094 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
