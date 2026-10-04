"""
Migration 080: Town names for GPS-derived locations

Adds:
  users.live_location_town - "Town, ST" reverse-geocoded from the browser's
                             GPS position, stored beside the live grid square
                             (users.live_location) so callsign lookup and the
                             check-in form can offer a town net control can
                             read on the air
  check_ins.grid_square    - the station's live grid square, recorded when the
                             check-in's location is the town that grid resolved
                             to; shown when hovering the location

Safe to re-run: skips any column that already exists.
"""
import os
import sqlite3

COLUMNS = {
    "users": ("live_location_town", "VARCHAR(100)"),
    "check_ins": ("grid_square", "VARCHAR(10)"),
}


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        for table, (column, column_type) in COLUMNS.items():
            cursor.execute(f"PRAGMA table_info({table})")
            if column in {row[1] for row in cursor.fetchall()}:
                print(f"Column {column} already exists in {table}, skipping.")
                continue
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
            print(f"Added {column} to {table}.")

        conn.commit()
        print("Migration 080 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 080 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
