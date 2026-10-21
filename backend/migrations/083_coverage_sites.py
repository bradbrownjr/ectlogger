"""
Migration 083: Coverage sites, contacts outside the net, coverage frequencies

For coverage drills such as an ARES Simulated Emergency Test, where the
question is which places can reach each other rather than which operators.

Changes:
  coverage_sites                            - new: the sites a net's drill is
                                              testing (shelters, EMA offices)
  coverage_contacts                         - new: stations reached that never
                                              checked into the net
  coverage_access                           - new: whether a station got into
                                              one of the net's repeaters or
                                              nodes, with an optional note
  check_ins.coverage_site_id                - the site a check-in row is at
  nets.coverage_excluded_frequency_ids      - JSON list of the net's
                                              frequencies that don't collect
                                              coverage reports (repeaters, DMR)
  net_templates.coverage_excluded_frequency_ids - seeds the net's copy

All additive; no existing row is changed. Safe to re-run. Run after a
database backup.
"""
import os
import sqlite3

ADDED_COLUMNS = [
    ("check_ins", "coverage_site_id", "INTEGER REFERENCES coverage_sites (id) ON DELETE SET NULL"),
    ("nets", "coverage_excluded_frequency_ids", "TEXT"),
    ("net_templates", "coverage_excluded_frequency_ids", "TEXT"),
]

NEW_TABLES = {
    "coverage_sites": """
CREATE TABLE coverage_sites (
    id INTEGER NOT NULL,
    net_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    site_type VARCHAR(20) NOT NULL DEFAULT 'shelter',
    frequency_id INTEGER,
    is_primary BOOLEAN NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY(net_id) REFERENCES nets (id) ON DELETE CASCADE,
    FOREIGN KEY(frequency_id) REFERENCES frequencies (id)
)""",
    "coverage_access": """
CREATE TABLE coverage_access (
    id INTEGER NOT NULL,
    net_id INTEGER NOT NULL,
    reporter_check_in_id INTEGER NOT NULL,
    target_site_id INTEGER NOT NULL,
    reached BOOLEAN NOT NULL,
    note VARCHAR(500),
    reported_by_user_id INTEGER,
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_coverage_access UNIQUE (reporter_check_in_id, target_site_id),
    FOREIGN KEY(net_id) REFERENCES nets (id) ON DELETE CASCADE,
    FOREIGN KEY(reporter_check_in_id) REFERENCES check_ins (id) ON DELETE CASCADE,
    FOREIGN KEY(target_site_id) REFERENCES coverage_sites (id) ON DELETE CASCADE,
    FOREIGN KEY(reported_by_user_id) REFERENCES users (id) ON DELETE SET NULL
)""",
    "coverage_contacts": """
CREATE TABLE coverage_contacts (
    id INTEGER NOT NULL,
    net_id INTEGER NOT NULL,
    reporter_check_in_id INTEGER NOT NULL,
    frequency_id INTEGER,
    callsign VARCHAR(20),
    station VARCHAR(100),
    county VARCHAR(100),
    state VARCHAR(50),
    two_way BOOLEAN NOT NULL DEFAULT 1,
    reported_by_user_id INTEGER,
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY(net_id) REFERENCES nets (id) ON DELETE CASCADE,
    FOREIGN KEY(reporter_check_in_id) REFERENCES check_ins (id) ON DELETE CASCADE,
    FOREIGN KEY(frequency_id) REFERENCES frequencies (id),
    FOREIGN KEY(reported_by_user_id) REFERENCES users (id) ON DELETE SET NULL
)""",
}

NEW_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_coverage_sites_id ON coverage_sites (id)",
    "CREATE INDEX IF NOT EXISTS ix_coverage_sites_net_id ON coverage_sites (net_id)",
    "CREATE INDEX IF NOT EXISTS ix_coverage_contacts_id ON coverage_contacts (id)",
    "CREATE INDEX IF NOT EXISTS ix_coverage_contacts_net_id ON coverage_contacts (net_id)",
    "CREATE INDEX IF NOT EXISTS ix_coverage_contacts_reporter_check_in_id ON coverage_contacts (reporter_check_in_id)",
    "CREATE INDEX IF NOT EXISTS ix_check_ins_coverage_site_id ON check_ins (coverage_site_id)",
    "CREATE INDEX IF NOT EXISTS ix_coverage_access_id ON coverage_access (id)",
    "CREATE INDEX IF NOT EXISTS ix_coverage_access_net_id ON coverage_access (net_id)",
    "CREATE INDEX IF NOT EXISTS ix_coverage_access_reporter_check_in_id ON coverage_access (reporter_check_in_id)",
    "CREATE INDEX IF NOT EXISTS ix_coverage_access_target_site_id ON coverage_access (target_site_id)",
]


def _tables(cursor):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {row[0] for row in cursor.fetchall()}


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
        existing = _tables(cursor)
        for table, ddl in NEW_TABLES.items():
            if table in existing:
                print(f"  {table}: already exists")
            else:
                cursor.execute(ddl)
                print(f"  {table}: created")
        for table, column, ddl in ADDED_COLUMNS:
            if column in _columns(cursor, table):
                print(f"  {table}.{column}: already exists")
            else:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                print(f"  {table}.{column}: added")
        for statement in NEW_INDEXES:
            cursor.execute(statement)
        conn.commit()
        print("Migration 083 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 083 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
