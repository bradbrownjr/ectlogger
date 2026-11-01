"""
Migration 098: Station channels marked offline

Changes:
  station_channel_marks - a channel a station had at one place, marked
                          offline by net control (its radio failed, the
                          repeater went down). Never removes the channel;
                          restored_at brings it back. One row per outage.

Additive. Safe to re-run. Run after migration 097 and a database backup.
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='station_channel_marks'")
        if cursor.fetchone():
            print("Table station_channel_marks already exists. Skipping.")
            return
        cursor.execute("""
            CREATE TABLE station_channel_marks (
                id INTEGER PRIMARY KEY,
                net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
                station_key VARCHAR(200) NOT NULL,
                frequency_id INTEGER NOT NULL REFERENCES frequencies(id) ON DELETE CASCADE,
                offline_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                offline_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                restored_at DATETIME,
                restored_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
            )
        """)
        cursor.execute("CREATE INDEX ix_station_channel_marks_id ON station_channel_marks(id)")
        cursor.execute("CREATE INDEX ix_station_channel_marks_net_id ON station_channel_marks(net_id)")
        conn.commit()
        print("Migration 098 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 098 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
