"""
Migration 050: Add operating_position to check_ins
Date: 2026-08-01
Description: Nullable classifier for the reporting station's operating
             position (e.g. "Home", "Field Deployed") used by the "Can hear"
             propagation logging feature. Plain string, not an enum - see
             docs/ROADMAP.md "Relaying & Propagation Mapping" for why (it is
             expected to grow a third value, and enum columns are a known
             PostgreSQL porting landmine).
"""
import sqlite3
import os


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(check_ins)")
        existing = {row[1] for row in cursor.fetchall()}
        if "operating_position" in existing:
            print("Column operating_position already exists in check_ins — skipping.")
        else:
            cursor.execute("ALTER TABLE check_ins ADD COLUMN operating_position VARCHAR(50)")
            print("Added operating_position to check_ins.")

        conn.commit()
        print("Migration 050 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 050 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
