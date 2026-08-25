"""
Migration 062: Add test_category to forms.

Adds a nullable column marking a Form as DRILL (a full incident simulation --
kept subject to every rule real traffic follows, purely a label for
after-action review) or DEMO (throwaway test data -- excluded from the
reminder ladder and from ICS-309/Net Report/summary-count output, and
deletable by its creator or an admin regardless of log-entry history). NULL
means real traffic, the default/unmarked state.
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
        cursor.execute("PRAGMA table_info(forms)")
        existing = {row[1] for row in cursor.fetchall()}
        if "test_category" in existing:
            print("Column test_category already exists in forms — skipping.")
        else:
            cursor.execute("ALTER TABLE forms ADD COLUMN test_category VARCHAR(16)")
            print("Added test_category to forms.")

        conn.commit()
        print("Migration 062 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 062 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
