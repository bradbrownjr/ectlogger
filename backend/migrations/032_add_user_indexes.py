"""
Migration 032: Add indexes on users table columns used for Admin UI sorting/filtering.

The users table is indexed only on its unique-constraint columns (id, email, callsign,
oauth_id, gmrs_callsign, unsubscribe_token). The Admin UI sorts and filters against
last_active, created_at, is_active, and role -- none of which have indexes. At small
user counts this is invisible; under the expected inbound migration from ham.live's
closure it will become noticeable. CREATE INDEX IF NOT EXISTS is idempotent, so this
migration is safe to run multiple times.
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

    try:
        indexes = [
            ("ix_users_last_active", "users", "last_active"),
            ("ix_users_created_at", "users", "created_at"),
            ("ix_users_is_active", "users", "is_active"),
            ("ix_users_role", "users", "role"),
        ]

        for index_name, table, column in indexes:
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {index_name} ON {table}({column})"
            )
            print(f"Index {index_name} on {table}.{column} ensured.")

        conn.commit()
        print("Migration 032 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 032 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
