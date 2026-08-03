"""
Migration 054: Add Assisted Traffic Handling reminder service tables/columns.

Adds:
  - traffic_reminder_logs: dedup log for the reminder ladder (D4), modeled
    directly on whats_new_send_log's atomic-insert-wins pattern. The
    UniqueConstraint(form_id, user_id, stage) is the cross-process lock:
    whichever uvicorn worker inserts first wins, the other gets an
    IntegrityError and skips the send.
  - users.notify_traffic_reminder: opt-out for the reminder ladder emails,
    default TRUE (unlike notify_whats_new) -- this is an operational
    obligation the user took on by accepting traffic, not a passive
    preference to discover.
  - net_templates.traffic_escalation_digest: opt-in weekly stale-traffic
    digest to the schedule's manager, default FALSE.
  - app_settings.traffic_reminder_enabled: instance-wide master switch,
    default TRUE.

See docs/concepts/TRAFFIC-HANDLING-DESIGN.md D4 and Phase 7.
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='traffic_reminder_logs'")
        if cursor.fetchone():
            print("Table traffic_reminder_logs already exists — skipping.")
        else:
            cursor.execute("""
                CREATE TABLE traffic_reminder_logs (
                    id INTEGER NOT NULL PRIMARY KEY,
                    form_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    stage INTEGER NOT NULL,
                    sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(form_id) REFERENCES forms (id) ON DELETE CASCADE,
                    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
                    CONSTRAINT uq_traffic_reminder_log_form_user_stage UNIQUE (form_id, user_id, stage)
                )
            """)
            cursor.execute("CREATE INDEX ix_traffic_reminder_logs_id ON traffic_reminder_logs (id)")
            cursor.execute("CREATE INDEX ix_traffic_reminder_logs_form_id ON traffic_reminder_logs (form_id)")
            cursor.execute("CREATE INDEX ix_traffic_reminder_logs_user_id ON traffic_reminder_logs (user_id)")
            print("Created table traffic_reminder_logs.")

        cursor.execute("PRAGMA table_info(users)")
        existing = {row[1] for row in cursor.fetchall()}
        if "notify_traffic_reminder" in existing:
            print("Column notify_traffic_reminder already exists in users — skipping.")
        else:
            cursor.execute(
                "ALTER TABLE users ADD COLUMN notify_traffic_reminder INTEGER NOT NULL DEFAULT 1"
            )
            print("Added notify_traffic_reminder to users.")

        cursor.execute("PRAGMA table_info(net_templates)")
        existing = {row[1] for row in cursor.fetchall()}
        if "traffic_escalation_digest" in existing:
            print("Column traffic_escalation_digest already exists in net_templates — skipping.")
        else:
            cursor.execute(
                "ALTER TABLE net_templates ADD COLUMN traffic_escalation_digest INTEGER NOT NULL DEFAULT 0"
            )
            print("Added traffic_escalation_digest to net_templates.")

        cursor.execute("PRAGMA table_info(app_settings)")
        existing = {row[1] for row in cursor.fetchall()}
        if "traffic_reminder_enabled" in existing:
            print("Column traffic_reminder_enabled already exists in app_settings — skipping.")
        else:
            cursor.execute(
                "ALTER TABLE app_settings ADD COLUMN traffic_reminder_enabled INTEGER NOT NULL DEFAULT 1"
            )
            print("Added traffic_reminder_enabled to app_settings.")

        conn.commit()
        print("Migration 054 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 054 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
