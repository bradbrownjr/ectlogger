"""
Migration 078: Add backup tables

  backup_settings - singleton (id=1): schedule, retention, encryption key
  backup_targets  - off-site destinations (SFTP, S3-compatible)
  backup_runs     - one row per backup attempt, for the Admin > Backups history

All new tables; nothing existing changes. Backups stay off until an admin
turns them on from Admin > Backups.
"""
import os
import sqlite3
import sys

TABLES = {
    "backup_settings": """
        CREATE TABLE backup_settings (
            id INTEGER PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT 0,
            enabled_at DATETIME,
            schedule_mode VARCHAR(16) NOT NULL DEFAULT 'daily',
            daily_time VARCHAR(5) NOT NULL DEFAULT '03:00',
            schedule_timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
            interval_hours INTEGER NOT NULL DEFAULT 24,
            keep_daily INTEGER NOT NULL DEFAULT 7,
            keep_weekly INTEGER NOT NULL DEFAULT 4,
            keep_monthly INTEGER NOT NULL DEFAULT 6,
            notify_on_failure BOOLEAN NOT NULL DEFAULT 1,
            key_recipient VARCHAR(100),
            key_wrapped_identity TEXT,
            key_fingerprint VARCHAR(16),
            key_created_at DATETIME,
            last_scheduler_check_at DATETIME,
            overdue_alert_sent_at DATETIME,
            updated_at DATETIME
        )
    """,
    "backup_targets": """
        CREATE TABLE backup_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            config_json TEXT NOT NULL DEFAULT '{}',
            secret_encrypted TEXT,
            trusted_host_key TEXT,
            prune_enabled BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        )
    """,
    "backup_runs": """
        CREATE TABLE backup_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            "trigger" VARCHAR(16) NOT NULL,
            triggered_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'running',
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME,
            filename VARCHAR(100),
            size_bytes BIGINT,
            sha256 VARCHAR(64),
            key_fingerprint VARCHAR(16),
            target_results TEXT,
            error TEXT,
            verified_at DATETIME,
            verify_ok BOOLEAN,
            verify_detail TEXT
        )
    """,
}

INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_backup_targets_id ON backup_targets(id)",
    "CREATE INDEX IF NOT EXISTS ix_backup_runs_id ON backup_runs(id)",
    "CREATE INDEX IF NOT EXISTS ix_backup_runs_status ON backup_runs(status)",
    "CREATE INDEX IF NOT EXISTS ix_backup_runs_started_at ON backup_runs(started_at)",
]


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        for table, ddl in TABLES.items():
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
            if cursor.fetchone():
                print(f"Table {table} already exists. Skipping.")
            else:
                cursor.execute(ddl)
                print(f"Created {table}.")
        for statement in INDEXES:
            cursor.execute(statement)
        conn.commit()
        print("Migration 078 completed successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
