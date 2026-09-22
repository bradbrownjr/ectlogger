"""
Migration 074: Spam guard for check-in fields + ICS-309 muted-station hiding.

Adds:
  field_definitions.spam_guard_enabled  - rejects URL/email-looking values
                                           for this field, on by default
  net_templates.ics309_hide_muted_stations - schedule default, on by default
  nets.ics309_hide_muted_stations          - per-occurrence copy, on by default

On by default everywhere: existing fields/templates/nets get the protection
without an admin having to opt in first. An admin can turn either off per
field (a field deliberately meant to hold a link) or per net/schedule.
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

    columns = [
        ("field_definitions", "spam_guard_enabled", "BOOLEAN NOT NULL DEFAULT 1"),
        ("net_templates", "ics309_hide_muted_stations", "BOOLEAN NOT NULL DEFAULT 1"),
        ("nets", "ics309_hide_muted_stations", "BOOLEAN NOT NULL DEFAULT 1"),
    ]

    try:
        for table, column, ddl in columns:
            cursor.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cursor.fetchall()}
            if column in existing:
                print(f"Column {column} already exists in {table}, skipping.")
                continue
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            print(f"Added {column} to {table}.")

        conn.commit()
        print("Migration 074 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 074 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
