"""
Migration 048: Site branding (default appearance, custom theme, custom logo).

Adds:
  app_settings.default_color_mode - 'light' or 'dark'. Only affects a
                                     browser's very first visit (no
                                     'themeMode' key in localStorage yet);
                                     once a visitor toggles, their browser
                                     remembers it forever, same as before.
  app_settings.custom_theme_json  - nullable JSON blob: {name, light:
                                     {primary,secondary,background,paper},
                                     dark: {...}}. A single admin-defined
                                     theme, hidden from pickers until set.
  app_settings.custom_logo_url    - nullable path to an uploaded logo file,
                                     replacing the built-in SVG mark when set.

Ships defaulted to 'light' / null / null, so no visible change for existing
deployments until an admin configures something under Admin -> Branding.
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
        ("app_settings", "default_color_mode", "TEXT NOT NULL DEFAULT 'light'"),
        ("app_settings", "custom_theme_json", "TEXT"),
        ("app_settings", "custom_logo_url", "TEXT"),
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
        print("Migration 048 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 048 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
