"""
Migration 085: Coverage site details, imported site lists

For importing an EMA's shelter and point-of-distribution lists, which are
not public: only the sites a net supports are shown to anyone but net staff.

Changes:
  coverage_sites.address       - street address
  coverage_sites.latitude      - exact position, used by the map when set
  coverage_sites.longitude
  coverage_sites.notes         - net staff only: contacts and notes
  coverage_sites.details       - net staff only: JSON of the source
                                 spreadsheet's other columns
  coverage_sites.is_supported  - a site the net is staffing. Every existing
                                 site is set supported, since all of them
                                 were shown publicly before this migration.

New site types (pod, staging, hospital, other) need no schema change.

Additive; existing rows only gain is_supported = 1. Safe to re-run. Run
after a database backup.
"""
import os
import sqlite3

ADDED_COLUMNS = [
    ("coverage_sites", "address", "VARCHAR(255)"),
    ("coverage_sites", "latitude", "FLOAT"),
    ("coverage_sites", "longitude", "FLOAT"),
    ("coverage_sites", "notes", "TEXT"),
    ("coverage_sites", "details", "TEXT"),
    ("coverage_sites", "is_supported", "BOOLEAN NOT NULL DEFAULT 1"),
]


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
        for table, column, ddl in ADDED_COLUMNS:
            if column in _columns(cursor, table):
                print(f"  {table}.{column}: already exists")
            else:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                print(f"  {table}.{column}: added")
        conn.commit()
        print("Migration 085 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 085 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
