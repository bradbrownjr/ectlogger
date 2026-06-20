"""Migration 037: Add chat_grace_period_minutes to nets and net_templates."""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')


def run():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for table in ['nets', 'net_templates']:
        cursor.execute(f"PRAGMA table_info({table})")
        existing = {row[1] for row in cursor.fetchall()}
        if 'chat_grace_period_minutes' in existing:
            print(f"Column chat_grace_period_minutes already exists in {table} — skipping.")
        else:
            cursor.execute(
                f"ALTER TABLE {table} ADD COLUMN chat_grace_period_minutes INTEGER"
            )
            print(f"Added chat_grace_period_minutes to {table}.")

    conn.commit()
    conn.close()
    print("Migration 037 complete.")


if __name__ == '__main__':
    run()
