"""
Migration 089: Security alerts and GeoIP location

Changes:
  audit_events.location  - approximate location of the address (app/geoip.py)
  app_settings           - signin_alert_* and mute_alert_* (app/security_alerts.py)

Additive. Safe to re-run. Run after migration 088 and a database backup.
"""
import os
import sqlite3

COLUMNS = [
    ("audit_events", "location", "VARCHAR(120)"),
    ("app_settings", "signin_alert_enabled", "BOOLEAN DEFAULT 1"),
    ("app_settings", "signin_alert_threshold", "INTEGER DEFAULT 5"),
    ("app_settings", "signin_alert_window_minutes", "INTEGER DEFAULT 15"),
    ("app_settings", "mute_alert_enabled", "BOOLEAN DEFAULT 1"),
    ("app_settings", "mute_alert_threshold", "INTEGER DEFAULT 3"),
    ("app_settings", "mute_alert_window_days", "INTEGER DEFAULT 30"),
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
        for table, column, ddl in COLUMNS:
            existing = {row[1] for row in cursor.execute(f"PRAGMA table_info({table})")}
            if not existing:
                raise RuntimeError(f"Table {table} is missing; run migration 088 first.")
            if column not in existing:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                print(f"Added {table}.{column}")
        conn.commit()
        print("Migration 089 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 089 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
