"""
Migration 025: Add is_co_manager column to template_staff table
Date: 2026-06-02
Description: Allows owners to promote NCS staff to co-manager role,
             showing a badge in the staff list and granting edit access.
"""
import sqlite3
import os


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(template_staff)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'is_co_manager' in columns:
            print("Column is_co_manager already exists. Skipping.")
            return

        print("Adding is_co_manager column to template_staff...")
        cursor.execute("ALTER TABLE template_staff ADD COLUMN is_co_manager BOOLEAN DEFAULT 0")
        conn.commit()
        print("Migration 025 completed successfully.")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
