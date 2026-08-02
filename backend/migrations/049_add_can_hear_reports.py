"""
Migration 049: Add can_hear_reports table
Date: 2026-08-01
Description: Stores directional "can hear" propagation edges reported during a
             net (Phase 1 of the "Can hear" inter-station propagation logging
             feature). Each checked box in the "Who can this station hear?"
             dialog is its own row: reporter_check_in can hear heard_check_in,
             optionally scoped to a frequency. See docs/ROADMAP.md
             "Relaying & Propagation Mapping" for the full data model rationale.
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='can_hear_reports'")
        if cursor.fetchone():
            print("Table can_hear_reports already exists. Skipping.")
            return

        print("Creating can_hear_reports table...")
        cursor.execute("""
            CREATE TABLE can_hear_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
                reporter_check_in_id INTEGER NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
                heard_check_in_id INTEGER NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
                frequency_id INTEGER REFERENCES frequencies(id),
                reported_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_can_hear_report UNIQUE (reporter_check_in_id, heard_check_in_id, frequency_id)
            )
        """)
        cursor.execute("CREATE INDEX ix_can_hear_reports_net_id ON can_hear_reports(net_id)")
        cursor.execute("CREATE INDEX ix_can_hear_reports_heard_check_in_id ON can_hear_reports(heard_check_in_id)")
        # The UNIQUE constraint above does not catch duplicate NULL-frequency
        # reports (NULL never equals NULL in a unique constraint on SQLite or
        # PostgreSQL), so a partial unique index closes that gap explicitly.
        cursor.execute("""
            CREATE UNIQUE INDEX uq_can_hear_report_null_freq
            ON can_hear_reports(reporter_check_in_id, heard_check_in_id)
            WHERE frequency_id IS NULL
        """)
        conn.commit()
        print("Migration 049 completed successfully.")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
