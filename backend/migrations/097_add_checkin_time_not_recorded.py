"""
Migration 097: Check-ins with no recorded time

Changes:
  check_ins.time_not_recorded - true for a station added to a held log
                                (finishing the log after the net closed)
                                whose time nobody wrote down. Its
                                checked_in_at is the net's close, so it sorts
                                last; reports print no time for it and
                                time-based statistics leave it out.

Additive. Safe to re-run. Run after migration 096 and a database backup.
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
        columns = [row[1] for row in cursor.execute("PRAGMA table_info(check_ins)")]
        if 'time_not_recorded' in columns:
            print("Column check_ins.time_not_recorded already exists. Skipping.")
            return
        cursor.execute("ALTER TABLE check_ins ADD COLUMN time_not_recorded BOOLEAN NOT NULL DEFAULT 0")
        conn.commit()
        print("Migration 097 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 097 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
