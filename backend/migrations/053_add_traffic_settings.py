"""
Migration 053: Add traffic_enabled to nets and net_templates.

Adds a boolean column (default 1 = enabled) that controls whether the
per-net Traffic side panel (Assisted Traffic Handling & Forms) is shown.
On by default, unlike propagation_logging_enabled -- traffic handling is a
general-purpose net feature, not a specialized opt-in one, so a chatty
SKYWARN net turns it *off* rather than an ARES net turning it on. Mirrors
the self_checkin_enabled / ics309_enabled inheritance pattern: the template
value seeds nets created from it, and the per-net value is authoritative.
See docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 2.7.
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
            if "traffic_enabled" in existing:
                print(f"Column traffic_enabled already exists in {table} — skipping.")
            else:
                cursor.execute(
                    f"ALTER TABLE {table} ADD COLUMN traffic_enabled INTEGER NOT NULL DEFAULT 1"
                )
                print(f"Added traffic_enabled to {table}.")

        conn.commit()
        print("Migration 053 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 053 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
