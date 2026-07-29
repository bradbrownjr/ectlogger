"""
Migration 045: Auto-open lobby before scheduled start.

Adds:
  net_templates.auto_lobby_minutes      - schedule default, NULL = disabled
  nets.auto_lobby_minutes               - per-occurrence copy, NULL = disabled
  nets.lobby_opened_automatically       - set only by the scheduler, so the
                                          stale sweep can archive a lobby that
                                          opened itself and nobody attended
  nets.start_notification_sent_at       - marks the single "net starting" email
                                          as sent, making the send idempotent

Off by default everywhere: existing schedules and nets keep NULL and behave
exactly as before.
"""

import sqlite3
import os


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # (table, column, DDL type) - all nullable/defaulted so existing rows are untouched
    columns = [
        ("net_templates", "auto_lobby_minutes", "INTEGER"),
        ("nets", "auto_lobby_minutes", "INTEGER"),
        ("nets", "lobby_opened_automatically", "INTEGER NOT NULL DEFAULT 0"),
        ("nets", "start_notification_sent_at", "DATETIME"),
    ]

    try:
        for table, column, ddl in columns:
            cursor.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cursor.fetchall()}
            if column in existing:
                print(f"Column {column} already exists in {table}, skipping.")
                continue
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
            print(f"Added {column} to {table}.")

        # Nets that already ran announced themselves under the old rules. Backfill
        # the marker so the now-idempotent notification never re-sends for them.
        # Status is stored as the uppercase enum NAME (SQLAlchemy's default for
        # Enum columns), not the lowercase value - verified against the beta DB.
        cursor.execute(
            "UPDATE nets SET start_notification_sent_at = COALESCE(started_at, created_at) "
            "WHERE start_notification_sent_at IS NULL "
            "AND status IN ('ACTIVE', 'CLOSED', 'ARCHIVED', 'LOBBY')"
        )
        print(f"Backfilled start_notification_sent_at on {cursor.rowcount} existing net(s).")

        conn.commit()
        print("Migration 045 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 045 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
