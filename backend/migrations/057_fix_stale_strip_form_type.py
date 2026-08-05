"""
Migration 057: Clear traffic_strip_form_type values that point at a raw-text
strip definition instead of a real structured one.

TrafficSettingsPanel.tsx's "Strip type" dropdown briefly (2026-08-05, between
commits 90a20d8 and 09164b4) offered RRI_STRIP_OTHER -- the raw catch-all,
whose only fields are a generic Label/Call Sign/Strip Text blob -- as a
selectable "strip type this net collects." Picking it left
nets.traffic_strip_form_type = 'RRI_STRIP_OTHER'. The frontend then reads any
non-null traffic_strip_form_type as "a real named type is defined here, don't
show the ad-hoc field-by-field box built from the pasted origin strip" --
so any net saved during that window lost access to its own origin strip's
fields, falling straight through to the generic catch-all form. That's the
exact bug this migration cleans up.

Only RRI_STRIP_OTHER itself is affected (it's the only builtin definition
with output_format 'rri_strip_raw' -- every WXOBS/GYX-CAR-SKYWARN/
dynamically-defined type uses 'rri_strip'), so this nulls
traffic_strip_form_type wherever it equals 'RRI_STRIP_OTHER' on both nets and
net_templates. traffic_strip_template (the pasted origin strip itself) is
untouched -- nulling only the form_type pointer is what makes the ad-hoc
field-by-field box reappear for that net.
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
        for table in ('nets', 'net_templates'):
            cursor.execute("PRAGMA table_info(%s)" % table)
            if 'traffic_strip_form_type' not in {row[1] for row in cursor.fetchall()}:
                print(f"{table}.traffic_strip_form_type does not exist yet -- skipping (run migration 056 first).")
                continue
            cursor.execute(
                f"UPDATE {table} SET traffic_strip_form_type = NULL "
                f"WHERE traffic_strip_form_type = 'RRI_STRIP_OTHER'"
            )
            print(f"Cleared traffic_strip_form_type='RRI_STRIP_OTHER' on {cursor.rowcount} row(s) in {table}.")

        conn.commit()
        print("Migration 057 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 057 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
