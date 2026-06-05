"""
Migration 029: Re-add AA1GM to the NCS rotation for template 8
(Weekly Strafford Cty, NH ARES Net).

AA1GM was previously added by migration 022, but is no longer present in the
rotation. This migration restores AA1GM to the existing cycle without
reordering current members by appending to the end.

Run with:
    cd ~/ectlogger
    python3 backend/migrations/029_add_aa1gm_back_to_template8_rotation.py
    sudo systemctl restart ectlogger
"""

import os
import sqlite3
import sys

TEMPLATE_ID = 8
CALLSIGN = "AA1GM"


def migrate(db_path: str | None = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ectlogger.db")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # 1) Find AA1GM user id.
        cursor.execute("SELECT id, callsign, name FROM users WHERE callsign = ?", (CALLSIGN,))
        user = cursor.fetchone()
        if not user:
            print(f"ERROR: User {CALLSIGN} not found.")
            sys.exit(1)

        user_id = user["id"]
        print(f"Found {CALLSIGN} (id={user_id}, name={user['name']})")

        # 2) Confirm template exists.
        cursor.execute("SELECT id, name FROM net_templates WHERE id = ?", (TEMPLATE_ID,))
        template = cursor.fetchone()
        if not template:
            print(f"ERROR: Template id={TEMPLATE_ID} not found.")
            sys.exit(1)

        print(f"Template: '{template['name']}' (id={template['id']})")

        # 3) Ensure AA1GM is in rotation. If missing, append to preserve current order.
        cursor.execute(
            "SELECT id, position FROM ncs_rotation_members WHERE template_id = ? AND user_id = ?",
            (TEMPLATE_ID, user_id),
        )
        existing = cursor.fetchone()
        if existing:
            print(
                f"{CALLSIGN} already in template {TEMPLATE_ID} rotation at position {existing['position']}. Skipping."
            )
        else:
            cursor.execute(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM ncs_rotation_members WHERE template_id = ?",
                (TEMPLATE_ID,),
            )
            next_position = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO ncs_rotation_members (template_id, user_id, position, is_active) VALUES (?, ?, ?, 1)",
                (TEMPLATE_ID, user_id, next_position),
            )
            conn.commit()
            print(
                f"Added {CALLSIGN} to template {TEMPLATE_ID} rotation at position {next_position}."
            )

        print("Migration 029 complete.")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    override_db_path = sys.argv[1] if len(sys.argv) > 1 else None
    migrate(override_db_path)
