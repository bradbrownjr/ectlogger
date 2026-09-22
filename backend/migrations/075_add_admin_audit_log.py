"""
Migration 075: Add admin_audit_log table

Records every name/callsign/email/role change an admin makes to another
user's account via the new Admin Users "Edit User" dialog. No other admin
action (ban, password reset, delete, ...) is audited -- this table exists
because editing someone else's login email is account-recovery/takeover-
adjacent in a way those aren't.
"""
import os
import sqlite3
import sys


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_audit_log'")
        if cursor.fetchone():
            print("Table admin_audit_log already exists. Skipping.")
            return

        print("Creating admin_audit_log table...")
        cursor.execute("""
            CREATE TABLE admin_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                field VARCHAR(50) NOT NULL,
                old_value TEXT,
                new_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX ix_admin_audit_log_target_user_id ON admin_audit_log(target_user_id)")
        cursor.execute("CREATE INDEX ix_admin_audit_log_created_at ON admin_audit_log(created_at)")
        conn.commit()
        print("Migration 075 completed successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
