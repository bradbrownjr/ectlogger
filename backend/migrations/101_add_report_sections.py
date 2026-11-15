"""
Migration 101: Choose what the closing email and report carry

Changes:
  nets.report_sections          - JSON list of section keys (services/report_sections.py)
  net_templates.report_sections - the schedule's list, copied to each new net

Null means the net or schedule was never set up on the Reports tab, and the
closing email stays exactly as it was before this column existed. Nothing is
backfilled.

Additive. Safe to re-run. Run after migration 100 and a database backup.
"""
import os
import sqlite3
import sys

TABLES = ("nets", "net_templates")


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        added = []
        for table in TABLES:
            columns = [row[1] for row in cursor.execute(f"PRAGMA table_info({table})")]
            if 'report_sections' in columns:
                print(f"Column {table}.report_sections already exists. Skipping.")
                continue
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN report_sections TEXT")
            added.append(table)
        conn.commit()
        print(f"Migration 101 complete (added to: {', '.join(added) or 'nothing'}).")
    except Exception as e:
        conn.rollback()
        print(f"Migration 101 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
