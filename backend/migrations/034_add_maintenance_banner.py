"""
Migration 034: Add maintenance banner columns to app_settings table.

Adds five columns that power the in-app maintenance banner feature:
  - maintenance_banner_enabled   (INTEGER, default 0)
  - maintenance_banner_message   (TEXT, nullable)
  - maintenance_banner_dismissible (INTEGER, default 1)
  - maintenance_banner_scheduled_start (TEXT, nullable — ISO-8601 UTC)
  - maintenance_banner_scheduled_end   (TEXT, nullable — ISO-8601 UTC)

All columns are optional/nullable so existing rows are unaffected.
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
        cursor.execute("PRAGMA table_info(app_settings)")
        existing = {row[1] for row in cursor.fetchall()}

        columns = [
            ("maintenance_banner_enabled", "INTEGER NOT NULL DEFAULT 0"),
            ("maintenance_banner_message", "TEXT"),
            ("maintenance_banner_dismissible", "INTEGER NOT NULL DEFAULT 1"),
            ("maintenance_banner_scheduled_start", "TEXT"),
            ("maintenance_banner_scheduled_end", "TEXT"),
        ]

        for col_name, col_def in columns:
            if col_name in existing:
                print(f"Column {col_name} already exists — skipping.")
            else:
                cursor.execute(f"ALTER TABLE app_settings ADD COLUMN {col_name} {col_def}")
                print(f"Added {col_name} to app_settings.")

        conn.commit()
        print("Migration 034 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 034 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
