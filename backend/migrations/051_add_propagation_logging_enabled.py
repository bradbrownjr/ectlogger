"""
Migration 051: Add propagation_logging_enabled to nets and net_templates.

Adds a boolean column (default 0 = disabled) that controls whether the
"can hear" station-to-station coverage logging feature is available on a
net. Off by default - it's a specialized ARES/EmComm capability, not a
general check-in feature, so it must not appear unless a manager turns it
on. Mirrors the self_checkin_enabled inheritance pattern: the template
value seeds nets created from it, and the per-net value is authoritative.
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
        for table in ("nets", "net_templates"):
            cursor.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cursor.fetchall()}
            if "propagation_logging_enabled" in existing:
                print(f"Column propagation_logging_enabled already exists in {table} — skipping.")
            else:
                cursor.execute(
                    f"ALTER TABLE {table} ADD COLUMN propagation_logging_enabled INTEGER NOT NULL DEFAULT 0"
                )
                print(f"Added propagation_logging_enabled to {table}.")

        conn.commit()
        print("Migration 051 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 051 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
