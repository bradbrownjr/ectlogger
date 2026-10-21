"""
Migration 084: Drill plans

An exercise plan on a net: scenario, objectives with their after-action
ratings, and a schedule of events whose message rows carry a prepared
ICS-213 that is filed as drill traffic when it is sent.

Changes:
  drill_plans       - new: one plan per net
  drill_objectives  - new: numbered objectives, grouped by heading, rated
  drill_events      - new: the schedule of events, with prepared messages

All additive; no existing row is changed. Safe to re-run. Run after a
database backup.
"""
import os
import sqlite3

NEW_TABLES = {
    "drill_plans": """
CREATE TABLE drill_plans (
    id INTEGER NOT NULL,
    net_id INTEGER NOT NULL,
    exercise_name VARCHAR(200),
    exercise_when VARCHAR(200),
    location VARCHAR(200),
    purpose TEXT,
    scenario TEXT,
    announcement TEXT,
    updated_by_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (net_id),
    FOREIGN KEY(net_id) REFERENCES nets (id) ON DELETE CASCADE,
    FOREIGN KEY(updated_by_id) REFERENCES users (id) ON DELETE SET NULL
)""",
    "drill_objectives": """
CREATE TABLE drill_objectives (
    id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    heading VARCHAR(200),
    text TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    rating VARCHAR(1),
    result_note TEXT,
    PRIMARY KEY (id),
    FOREIGN KEY(plan_id) REFERENCES drill_plans (id) ON DELETE CASCADE
)""",
    "drill_events": """
CREATE TABLE drill_events (
    id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    time_label VARCHAR(40),
    initiator VARCHAR(120),
    receiver VARCHAR(120),
    event_type VARCHAR(40),
    method VARCHAR(80),
    description TEXT,
    expected_actions TEXT,
    site_id INTEGER,
    message TEXT,
    form_id INTEGER,
    PRIMARY KEY (id),
    FOREIGN KEY(plan_id) REFERENCES drill_plans (id) ON DELETE CASCADE,
    FOREIGN KEY(site_id) REFERENCES coverage_sites (id) ON DELETE SET NULL,
    FOREIGN KEY(form_id) REFERENCES forms (id) ON DELETE SET NULL
)""",
}

NEW_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_drill_plans_id ON drill_plans (id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_drill_plans_net_id ON drill_plans (net_id)",
    "CREATE INDEX IF NOT EXISTS ix_drill_objectives_id ON drill_objectives (id)",
    "CREATE INDEX IF NOT EXISTS ix_drill_objectives_plan_id ON drill_objectives (plan_id)",
    "CREATE INDEX IF NOT EXISTS ix_drill_events_id ON drill_events (id)",
    "CREATE INDEX IF NOT EXISTS ix_drill_events_plan_id ON drill_events (plan_id)",
    "CREATE INDEX IF NOT EXISTS ix_drill_events_site_id ON drill_events (site_id)",
    "CREATE INDEX IF NOT EXISTS ix_drill_events_form_id ON drill_events (form_id)",
]


def _tables(cursor):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {row[0] for row in cursor.fetchall()}


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
        for statement in NEW_INDEXES:
            cursor.execute(statement)
        conn.commit()
        print("Migration 084 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 084 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
