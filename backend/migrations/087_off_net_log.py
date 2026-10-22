"""
Migration 087: Off-net log entries

A station's off-net activity during a net (a check-in to another net, a call
on a statewide talkgroup, a Winlink message sent to another county), logged
so it appears on the net's ICS-309. See models.OffNetLogEntry.

Changes:
  off_net_log_entries - new table

Additive. Safe to re-run. Run after a database backup.
"""
import os
import sqlite3


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS off_net_log_entries (
                id INTEGER PRIMARY KEY,
                net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
                occurred_at DATETIME NOT NULL,
                from_station VARCHAR(100) NOT NULL,
                to_station VARCHAR(200) NOT NULL,
                channel VARCHAR(200),
                message VARCHAR(1000) NOT NULL,
                message_id VARCHAR(100),
                status VARCHAR(20) NOT NULL DEFAULT 'accepted',
                entered_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                reviewed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_off_net_log_entries_net_id ON off_net_log_entries (net_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_off_net_log_entries_entered_by_user_id ON off_net_log_entries (entered_by_user_id)")
        conn.commit()
        print("Migration 087 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 087 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
