"""
Migration 105: distribution list

Changes:
  nets
      - distribution_list: one group address (a groups.io list, for example)
        that gets the reminder the day before and the closing log.
      - list_reminder_sent_at: set when that reminder goes out, so it is sent
        once per net.
  net_templates
      - distribution_list: seeds each net created from the schedule.

Additive. Safe to re-run. Run after migration 104 and a database backup.
"""
import os
import sqlite3
import sys

COLUMNS = [
    ("nets", "distribution_list", "VARCHAR(254)"),
    ("nets", "list_reminder_sent_at", "DATETIME"),
    ("net_templates", "distribution_list", "VARCHAR(254)"),
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
        for table, column, sql_type in COLUMNS:
            existing = {row[1] for row in cursor.execute(f"PRAGMA table_info({table})")}
            if column in existing:
                print(f"{table}.{column} already exists. Skipping.")
                continue
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
            print(f"Added {table}.{column}.")
        conn.commit()
        print("Migration 105 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 105 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
