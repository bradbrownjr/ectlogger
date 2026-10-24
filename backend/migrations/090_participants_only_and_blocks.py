"""
Migration 090: Participants-only nets and per-net station blocks

Changes:
  net_templates.participants_only  - schedule default, off
  nets.participants_only           - per-net copy, off
  net_blocks                       - stations net control removed from a net
                                     and barred from checking back in

Additive. Safe to re-run. Run after a database backup.
"""
import os
import sqlite3

COLUMNS = [
    ("net_templates", "participants_only", "BOOLEAN NOT NULL DEFAULT 0"),
    ("nets", "participants_only", "BOOLEAN NOT NULL DEFAULT 0"),
]

CREATE_BLOCKS = """
CREATE TABLE IF NOT EXISTS net_blocks (
    id INTEGER PRIMARY KEY,
    net_id INTEGER NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
    callsign VARCHAR(20) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    blocked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_net_block UNIQUE (net_id, callsign)
)
"""


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
            if column not in existing:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                print(f"Added {table}.{column}")
        cursor.execute(CREATE_BLOCKS)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_net_blocks_net_id ON net_blocks (net_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_net_blocks_id ON net_blocks (id)")
        conn.commit()
        print("Migration 090 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 090 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
