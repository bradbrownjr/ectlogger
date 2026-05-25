"""
Migration 023: Remove schedule owners from their own template_staff rows.

The schedule owner (Net Manager) is implicitly authorized to run nets and
appears separately as "Manager" in the staff UI. A template_staff row for
the owner is redundant and causes them to be listed twice in NCSStaffModal.

Migration 022 incorrectly added AA1GM to template_staff for schedule 8 —
this migration removes that row (and any other owner-in-staff rows to be
safe), while leaving their ncs_rotation_members entry intact.

Run with:
    cd ~/ectlogger
    python3 backend/migrations/023_remove_owner_from_template_staff.py
    sudo systemctl restart ectlogger
"""
import sqlite3
import os
import sys


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # Find any template_staff rows where the user is also the template owner.
        cursor.execute("""
            SELECT ts.id, ts.template_id, ts.user_id, u.callsign, nt.name AS template_name
            FROM template_staff ts
            JOIN net_templates nt ON nt.id = ts.template_id
            JOIN users u ON u.id = ts.user_id
            WHERE ts.user_id = nt.owner_id
        """)
        rows = cursor.fetchall()

        if not rows:
            print("No owner-in-staff rows found. Nothing to do.")
            return

        for row in rows:
            print(f"Removing {row['callsign']} from template_staff for "
                  f"template {row['template_id']} ('{row['template_name']}') — they are the owner.")
            cursor.execute("DELETE FROM template_staff WHERE id = ?", (row['id'],))

        conn.commit()
        print(f"Migration 023 complete. Removed {len(rows)} row(s).")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else None
    migrate(db_path)
