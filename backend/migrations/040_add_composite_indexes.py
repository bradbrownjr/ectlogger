"""
Migration 040: Add composite indexes on the two hottest read paths.

  CheckIn(net_id, checked_in_at) — time-series statistics queries filter by
    net_id and order by checked_in_at; without a composite index SQLite scans
    the entire check_ins table and re-sorts on the fly.

  NetRole(net_id, role) — permission checks on almost every authenticated
    request do WHERE net_id = ? AND role = ?; without this, each check walks
    all roles for the net.

Verify with EXPLAIN QUERY PLAN on a production-sized database before running:

  sqlite3 ectlogger.db
  EXPLAIN QUERY PLAN
    SELECT * FROM check_ins WHERE net_id=1 ORDER BY checked_in_at;
  EXPLAIN QUERY PLAN
    SELECT * FROM net_roles WHERE net_id=1 AND role='ncs';

A result containing "SCAN" instead of "SEARCH USING INDEX" confirms the
index is needed. CREATE INDEX IF NOT EXISTS is idempotent and safe to re-run.
"""

import sqlite3
import os


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        indexes = [
            (
                "ix_check_ins_net_id_checked_in_at",
                "check_ins",
                "net_id, checked_in_at",
            ),
            (
                "ix_net_roles_net_id_role",
                "net_roles",
                "net_id, role",
            ),
        ]

        for index_name, table, columns in indexes:
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {index_name} ON {table}({columns})"
            )
            print(f"Index {index_name} on {table}({columns}) ensured.")

        conn.commit()
        print("Migration 040 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 040 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
