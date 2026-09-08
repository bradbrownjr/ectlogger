"""
Migration 070: Authenticated nets (TOTP station identity verification).

Adds:
  net_templates.authenticated           - schedule default, off by default
  nets.authenticated                    - per-occurrence copy, off by default
  check_ins.identity_verified           - NCS/Logger has confirmed the station's
                                          live TOTP code matched their account
  check_ins.identity_verified_at        - when it was confirmed
  check_ins.identity_verified_by_id     - which NCS/Logger confirmed it

Off by default everywhere: existing schedules, nets, and check-ins keep
NULL/False and behave exactly as before.
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
        ("net_templates", "authenticated", "BOOLEAN NOT NULL DEFAULT 0"),
        ("nets", "authenticated", "BOOLEAN NOT NULL DEFAULT 0"),
        ("check_ins", "identity_verified", "BOOLEAN NOT NULL DEFAULT 0"),
        ("check_ins", "identity_verified_at", "DATETIME"),
        ("check_ins", "identity_verified_by_id", "INTEGER"),
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

        conn.commit()
        print("Migration 070 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 070 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
