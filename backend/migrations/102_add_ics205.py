"""
Migration 102: ICS-205 radio communications plan

Changes:
  frequencies.offset / tx_tone / rx_tone / bandwidth
      - repeater details on the shared frequency list, stored normalized by
        services/channel_plan.py. Null = simplex / no tone / not given.
  nets.ics205_enabled, net_templates.ics205_enabled
      - the "Build an ICS-205" switch (NOT NULL, default 0: off for every
        existing net and schedule)
  nets.ics205_special_instructions, net_templates.ics205_special_instructions
      - ICS 205 block 5
  channel_plan_entries
      - one row per channel on a net's or schedule's plan: PACE role, ICS
        function, assignment, remarks, in form order. A separate table because
        saving a frequency list replaces the net_frequencies /
        net_template_frequencies rows.

Additive. Safe to re-run. Run after migration 101 and a database backup.
"""
import os
import sqlite3
import sys

FREQUENCY_COLUMNS = (
    ("offset", "VARCHAR(16)"),
    ("tx_tone", "VARCHAR(16)"),
    ("rx_tone", "VARCHAR(16)"),
    ("bandwidth", "VARCHAR(1)"),
)
SETTING_COLUMNS = (
    ("ics205_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
    ("ics205_special_instructions", "TEXT"),
)


def _add_columns(cursor, table, columns, added):
    existing = {row[1] for row in cursor.execute(f"PRAGMA table_info({table})")}
    for name, ddl in columns:
        if name in existing:
            print(f"Column {table}.{name} already exists. Skipping.")
            continue
        # "offset" is an SQL keyword; quote every name to be safe.
        cursor.execute(f'ALTER TABLE {table} ADD COLUMN "{name}" {ddl}')
        added.append(f"{table}.{name}")


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        added = []
        _add_columns(cursor, "frequencies", FREQUENCY_COLUMNS, added)
        _add_columns(cursor, "nets", SETTING_COLUMNS, added)
        _add_columns(cursor, "net_templates", SETTING_COLUMNS, added)

        tables = {row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'channel_plan_entries' not in tables:
            cursor.execute("""
                CREATE TABLE channel_plan_entries (
                    id INTEGER PRIMARY KEY,
                    net_id INTEGER REFERENCES nets(id) ON DELETE CASCADE,
                    template_id INTEGER REFERENCES net_templates(id) ON DELETE CASCADE,
                    frequency_id INTEGER NOT NULL REFERENCES frequencies(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL DEFAULT 0,
                    plan_role VARCHAR(16),
                    ics_function VARCHAR(16),
                    assignment VARCHAR(100),
                    remarks VARCHAR(255),
                    CONSTRAINT uq_channel_plan_net_frequency UNIQUE (net_id, frequency_id),
                    CONSTRAINT uq_channel_plan_template_frequency UNIQUE (template_id, frequency_id)
                )
            """)
            added.append("channel_plan_entries")
        else:
            print("Table channel_plan_entries already exists. Skipping.")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_channel_plan_entries_id ON channel_plan_entries (id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_channel_plan_entries_net_id ON channel_plan_entries (net_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_channel_plan_entries_template_id ON channel_plan_entries (template_id)")

        conn.commit()
        print(f"Migration 102 complete (added: {', '.join(added) or 'nothing'}).")
    except Exception as e:
        conn.rollback()
        print(f"Migration 102 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
