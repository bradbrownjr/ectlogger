"""
Migration 099: Remember an In person check-in after it checks out

Changes:
  check_ins.in_person - true for a station checked in In person (no radio).
                        Checking out overwrites status, so without this a
                        checked-out in-person row looks like any other, and
                        the ICS-309 (a log of radio traffic) can't leave it
                        out. Backfilled from rows whose status is still
                        IN_PERSON; a row already checked out can't be told
                        apart and stays false.

Additive. Safe to re-run. Run after migration 098 and a database backup.
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
        if 'in_person' in columns:
            print("Column check_ins.in_person already exists. Skipping.")
            return
        cursor.execute("ALTER TABLE check_ins ADD COLUMN in_person BOOLEAN NOT NULL DEFAULT 0")
        cursor.execute("UPDATE check_ins SET in_person = 1 WHERE status = 'IN_PERSON'")
        conn.commit()
        print(f"Migration 099 complete ({cursor.rowcount} in-person check-ins).")
    except Exception as e:
        conn.rollback()
        print(f"Migration 099 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
