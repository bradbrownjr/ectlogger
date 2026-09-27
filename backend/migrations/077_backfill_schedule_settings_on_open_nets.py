"""
Migration 077: Copy three missed schedule settings onto nets that haven't closed

Until 2026-09-27 the background auto-create path (ncs_reminder_service) never
copied these from a net's schedule, so every automatically created net fell
back to the column default:

  chat_grace_period_minutes   ("Keep chat open after net"; default off)
  mobile_priority_sort        (default on)
  ics309_hide_muted_stations  (default on)

The creation code is fixed (app/services/net_from_template.py). This fills in
nets that are still DRAFT, SCHEDULED, LOBBY or ACTIVE, where the net holds the
column default and its schedule holds something else. Closed and archived nets
are left alone: the settings only matter while a net runs or as it closes.

A net whose manager deliberately switched one of these back to the default
looks identical to one that never got it, so every change is printed.
Safe to run more than once.
"""
import os
import sqlite3

OPEN_STATUSES = ('DRAFT', 'SCHEDULED', 'LOBBY', 'ACTIVE')

# column -> the net column's default, which is what a missed copy left behind
SETTINGS = {
    'chat_grace_period_minutes': None,
    'mobile_priority_sort': 1,
    'ics309_hide_muted_stations': 1,
}


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        changed = 0
        for column, default in SETTINGS.items():
            net_is_default = f"n.{column} IS NULL" if default is None else f"(n.{column} IS NULL OR n.{column} = {default})"
            template_differs = f"t.{column} IS NOT NULL" if default is None else f"t.{column} IS NOT NULL AND t.{column} != {default}"
            placeholders = ','.join('?' * len(OPEN_STATUSES))
            cursor.execute(
                f"""SELECT n.id, n.name, n.{column}, t.{column}
                    FROM nets n JOIN net_templates t ON t.id = n.template_id
                    WHERE UPPER(n.status) IN ({placeholders})
                      AND {net_is_default} AND {template_differs}""",
                OPEN_STATUSES,
            )
            for net_id, name, old, new in cursor.fetchall():
                cursor.execute(f"UPDATE nets SET {column} = ? WHERE id = ?", (new, net_id))
                print(f"Net {net_id} ({name}): {column} {old!r} -> {new!r}")
                changed += 1

        conn.commit()
        print(f"Migration 077 complete: {changed} setting(s) updated.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 077 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
