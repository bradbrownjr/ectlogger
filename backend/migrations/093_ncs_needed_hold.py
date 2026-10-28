"""
Migration 093: Auto-close asks who ran the net

Changes:
  nets.log_hold_send_at - when auto-close held a log because no NCS would be
                          credited, the time it is sent anyway

Additive. Safe to re-run. Run after a database backup.
"""
import os
import sqlite3

COLUMNS = [
    ("nets", "log_hold_send_at", "DATETIME"),
]


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        for table, column, ddl in COLUMNS:
            existing = {row[1] for row in cursor.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                print(f"Added {table}.{column}")
        conn.commit()
        print("Migration 093 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 093 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
