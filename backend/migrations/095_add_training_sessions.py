"""
Migration 095: Training sessions for Help > Training

Changes:
  training_sessions - scheduled training sessions an admin posts. The Training
                      dialog lists the ones that are not over yet. Times are
                      stored as naive UTC.

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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='training_sessions'")
        if cursor.fetchone():
            print("Table training_sessions already exists. Skipping.")
            return
        cursor.execute("""
            CREATE TABLE training_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title VARCHAR(200) NOT NULL,
                starts_at DATETIME NOT NULL,
                ends_at DATETIME,
                location VARCHAR(300),
                online_url VARCHAR(500),
                details TEXT,
                created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX ix_training_sessions_id ON training_sessions(id)")
        conn.commit()
        print("Migration 095 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 095 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
