"""
Migration 056: Add per-net / per-schedule traffic configuration columns.

Backs the net-settings Traffic block (components/forms/TrafficSettingsPanel.tsx),
which lets a net declare what traffic it actually takes:

- traffic_form_types      JSON array of form_type codes the net accepts.
                          NULL means "every enabled definition", so existing
                          nets keep today's behavior with no backfill.
- traffic_strip_form_type The RRI/WX strip type this net collects answers for,
                          pointing at a form_definitions.form_type.
- traffic_strip_template  A raw pasted origin strip, for the case where the NCS
                          wants the fields laid out from an example without
                          formally defining a reusable type first.

The last two are the two halves of the same "what fields do I enter?" question:
a net either points at a named type (labels come from the definition) or stores
the origin strip verbatim (fields are positional). Both are optional.

Note this migration deliberately does NOT touch nets.traffic_enabled. That
column's SQLAlchemy default flips to False in the same change so newly created
nets are opt-in like ICS-309 and coverage logging, but a column default only
applies to new rows -- existing nets keep whatever they have stored, which is
what keeps the panel from vanishing out from under anyone mid-stream.
"""

import sqlite3
import os


# (table, column, DDL type) -- same three settings on both nets and the
# templates that seed them, matching how ics309_enabled/traffic_enabled are
# already mirrored across the pair.
COLUMNS = [
    ("nets", "traffic_form_types", "TEXT"),
    ("nets", "traffic_strip_form_type", "VARCHAR(32)"),
    ("nets", "traffic_strip_template", "TEXT"),
    ("net_templates", "traffic_form_types", "TEXT"),
    ("net_templates", "traffic_strip_form_type", "VARCHAR(32)"),
    ("net_templates", "traffic_strip_template", "TEXT"),
]


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        for table, column, ddl_type in COLUMNS:
            cursor.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cursor.fetchall()}
            if column in existing:
                print(f"Column {column} already exists in {table} — skipping.")
                continue
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")
            print(f"Added {column} to {table}.")

        conn.commit()
        print("Migration 056 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 056 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
