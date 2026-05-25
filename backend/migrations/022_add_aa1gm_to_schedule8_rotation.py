"""
Migration 022: Add AA1GM (Joel Huntress) to the NCS rotation for schedule 8
(Weekly Strafford Cty, NH ARES Net).

The net manager is not automatically included in the rotation list, so this
one-time script adds them as rotation member #1 (or appends if others already
exist) and ensures they are also in the template_staff table.

Run with:
    cd ~/ectlogger
    python3 backend/migrations/022_add_aa1gm_to_schedule8_rotation.py
    sudo systemctl restart ectlogger
"""
import sqlite3
import os
import sys

TEMPLATE_ID = 8
CALLSIGN = "AA1GM"


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # 1. Find AA1GM's user ID
        cursor.execute("SELECT id, callsign, name FROM users WHERE callsign = ?", (CALLSIGN,))
        user = cursor.fetchone()
        if not user:
            print(f"ERROR: User {CALLSIGN} not found in the database.")
            sys.exit(1)
        user_id = user["id"]
        print(f"Found {CALLSIGN} (id={user_id}, name={user['name']})")

        # 2. Confirm template 8 exists
        cursor.execute("SELECT id, name, owner_id FROM net_templates WHERE id = ?", (TEMPLATE_ID,))
        template = cursor.fetchone()
        if not template:
            print(f"ERROR: Template id={TEMPLATE_ID} not found.")
            sys.exit(1)
        print(f"Template: '{template['name']}' (owner_id={template['owner_id']})")

        # 3. Ensure AA1GM is in template_staff
        cursor.execute(
            "SELECT id FROM template_staff WHERE template_id = ? AND user_id = ?",
            (TEMPLATE_ID, user_id)
        )
        if cursor.fetchone():
            print(f"{CALLSIGN} is already in template_staff for template {TEMPLATE_ID}. Skipping staff add.")
        else:
            cursor.execute(
                "INSERT INTO template_staff (template_id, user_id, is_active) VALUES (?, ?, 1)",
                (TEMPLATE_ID, user_id)
            )
            conn.commit()
            print(f"Added {CALLSIGN} to template_staff for template {TEMPLATE_ID}.")

        # 4. Ensure AA1GM is in ncs_rotation_members
        cursor.execute(
            "SELECT id FROM ncs_rotation_members WHERE template_id = ? AND user_id = ?",
            (TEMPLATE_ID, user_id)
        )
        if cursor.fetchone():
            print(f"{CALLSIGN} is already in the NCS rotation for template {TEMPLATE_ID}. Skipping rotation add.")
        else:
            # Find the next available position
            cursor.execute(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM ncs_rotation_members WHERE template_id = ?",
                (TEMPLATE_ID,)
            )
            next_pos = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO ncs_rotation_members (template_id, user_id, position, is_active) VALUES (?, ?, ?, 1)",
                (TEMPLATE_ID, user_id, next_pos)
            )
            conn.commit()
            print(f"Added {CALLSIGN} to NCS rotation at position {next_pos} for template {TEMPLATE_ID}.")

        print("Migration 022 complete.")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else None
    migrate(db_path)
