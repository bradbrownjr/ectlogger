"""
Migration 100: ICS-214 Activity Log

Changes:
  ics214_forms      - per net: what net control changed on the net's
                      ICS-214 (header blocks, hidden or reworded lines and
                      resources). Null header columns mean "the default".
  activity_entries  - lines written by hand for what happened off the air.
                      net_id is optional so the Incident Log can use them
                      for an incident with no net.

Additive. Safe to re-run. Run after migration 099 and a database backup.
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
        tables = {row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'ics214_forms' not in tables:
            cursor.execute("""
                CREATE TABLE ics214_forms (
                    id INTEGER PRIMARY KEY,
                    net_id INTEGER NOT NULL UNIQUE REFERENCES nets(id) ON DELETE CASCADE,
                    incident_name VARCHAR(200),
                    period_from DATETIME,
                    period_to DATETIME,
                    unit_name VARCHAR(200),
                    leader VARCHAR(200),
                    home_agency VARCHAR(200),
                    prepared_name VARCHAR(200),
                    prepared_position VARCHAR(200),
                    line_edits TEXT NOT NULL DEFAULT '{}',
                    resource_edits TEXT NOT NULL DEFAULT '{}',
                    updated_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_ics214_forms_id ON ics214_forms (id)")
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_ics214_forms_net_id ON ics214_forms (net_id)")
        else:
            print("Table ics214_forms already exists. Skipping.")
        if 'activity_entries' not in tables:
            cursor.execute("""
                CREATE TABLE activity_entries (
                    id INTEGER PRIMARY KEY,
                    net_id INTEGER REFERENCES nets(id) ON DELETE CASCADE,
                    occurred_at DATETIME NOT NULL,
                    text TEXT NOT NULL,
                    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_activity_entries_id ON activity_entries (id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_activity_entries_net_id ON activity_entries (net_id)")
        else:
            print("Table activity_entries already exists. Skipping.")
        conn.commit()
        print("Migration 100 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 100 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
