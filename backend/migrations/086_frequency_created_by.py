"""
Migration 086: Who added each shared frequency

Lets the person who added a frequency fix or remove it while no other net
uses it (routers/frequencies.py::change_refusal). Until now only an admin
could, so a wrong mode picked in the Create Net form could not be undone by
the person who picked it.

Changes:
  frequencies.created_by_id - users.id of whoever added it. Existing rows
                              stay NULL: who added them was never recorded,
                              so they remain admin-only.

Additive. Safe to re-run. Run after a database backup.
"""
import os
import sqlite3


def _columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        if "created_by_id" in _columns(cursor, "frequencies"):
            print("  frequencies.created_by_id: already exists")
        else:
            cursor.execute(
                "ALTER TABLE frequencies ADD COLUMN created_by_id INTEGER "
                "REFERENCES users(id) ON DELETE SET NULL"
            )
            print("  frequencies.created_by_id: added")
        conn.commit()
        print("Migration 086 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 086 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
