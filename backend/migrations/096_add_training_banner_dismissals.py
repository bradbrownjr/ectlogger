"""
Migration 096: Training banner dismissals

Changes:
  training_banner_dismissals - one row per signed-in user per training session
                               whose banner they closed, so it stays closed on
                               every device. Deleted once the session is over.

Additive. Safe to re-run. Run after migration 095 and a database backup.
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='training_banner_dismissals'")
        if cursor.fetchone():
            print("Table training_banner_dismissals already exists. Skipping.")
            return
        cursor.execute("""
            CREATE TABLE training_banner_dismissals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
                dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_training_banner_dismissal UNIQUE (user_id, session_id)
            )
        """)
        cursor.execute("CREATE INDEX ix_training_banner_dismissals_id ON training_banner_dismissals(id)")
        cursor.execute("CREATE INDEX ix_training_banner_dismissals_user_id ON training_banner_dismissals(user_id)")
        conn.commit()
        print("Migration 096 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 096 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
