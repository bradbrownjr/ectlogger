"""
Migration 088: Activity log (audit_events)

One table for every audited action, read by admins in Admin > Activity.
See models.AuditEvent and app/audit.py.

Changes:
  audit_events     - new table
  admin_audit_log  - its rows are copied in as "user.admin_edited" events
                     (one per changed field, as before), then it is dropped

Safe to re-run: the copy only happens while admin_audit_log still exists.
Run after a database backup.
"""
import json
import os
import sqlite3


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                action VARCHAR(64) NOT NULL,
                actor_user_id INTEGER,
                actor_label VARCHAR(255),
                ip VARCHAR(64),
                user_agent VARCHAR(255),
                target_type VARCHAR(32),
                target_id INTEGER,
                target_label VARCHAR(255),
                subject_user_id INTEGER,
                net_id INTEGER,
                template_id INTEGER,
                details TEXT
            )
        """)
        for column in ("id", "created_at", "action", "actor_user_id", "ip", "subject_user_id", "net_id", "template_id"):
            cursor.execute(f"CREATE INDEX IF NOT EXISTS ix_audit_events_{column} ON audit_events ({column})")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_audit_log'")
        if cursor.fetchone():
            rows = cursor.execute("""
                SELECT a.created_at, a.admin_id, admin.callsign, admin.email,
                       a.target_user_id, target.callsign, target.email,
                       a.field, a.old_value, a.new_value
                FROM admin_audit_log a
                LEFT JOIN users admin ON admin.id = a.admin_id
                LEFT JOIN users target ON target.id = a.target_user_id
                ORDER BY a.id
            """).fetchall()
            for (created_at, admin_id, admin_cs, admin_email, target_id, target_cs,
                 target_email, field, old_value, new_value) in rows:
                cursor.execute(
                    """INSERT INTO audit_events (created_at, action, actor_user_id, actor_label,
                           target_type, target_id, target_label, subject_user_id, details)
                       VALUES (?, 'user.admin_edited', ?, ?, 'user', ?, ?, ?, ?)""",
                    (created_at, admin_id, admin_cs or admin_email, target_id,
                     target_cs or target_email, target_id,
                     json.dumps({"changes": {field: [old_value, new_value]}})),
                )
            cursor.execute("DROP TABLE admin_audit_log")
            print(f"Copied {len(rows)} admin_audit_log rows into audit_events and dropped admin_audit_log.")

        conn.commit()
        print("Migration 088 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 088 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
