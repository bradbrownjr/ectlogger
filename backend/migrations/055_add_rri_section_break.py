"""
Migration 055: Add starts_new_section to form_definition_fields.

Backs the RRI strip "define fields from a pasted template" flow
(routers/traffic_strip_templates.py): when a user labels the fields of a
new, dynamically-defined strip type, this flag records where RRI's "/ /"
section breaks fall in that strip's layout, so app/traffic/rri_strip.py's
data-driven fallback (used only for form_types outside the hardcoded
_STRIP_SPECS -- WXOBS and GYX-CAR-SKYWARN keep their pinned layout in code,
unaffected) can render/parse the canonical string correctly. Defaults to
False, meaning "no section break here" -- a template with no breaks at all
renders as one flat section, matching GYX-CAR-SKYWARN's own shape.
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
        cursor.execute("PRAGMA table_info(form_definition_fields)")
        existing = {row[1] for row in cursor.fetchall()}
        if "starts_new_section" in existing:
            print("Column starts_new_section already exists in form_definition_fields — skipping.")
        else:
            cursor.execute(
                "ALTER TABLE form_definition_fields ADD COLUMN starts_new_section INTEGER NOT NULL DEFAULT 0"
            )
            print("Added starts_new_section to form_definition_fields.")

        conn.commit()
        print("Migration 055 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 055 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
