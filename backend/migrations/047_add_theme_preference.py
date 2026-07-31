"""
Migration 047: User-selectable color themes.

Adds:
  users.theme               - nullable theme key (e.g. 'ocean'); NULL means
                               "follow the system default"
  app_settings.default_theme - system-wide default theme key, admin-editable

Ships defaulted to 'ectlogger-blue', the app's existing blue/pink palette, so
no visible change for existing deployments until a user or admin picks a
different named theme.
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
        ("users", "theme", "TEXT"),
        ("app_settings", "default_theme", "TEXT NOT NULL DEFAULT 'ectlogger-blue'"),
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
        print("Migration 047 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 047 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
