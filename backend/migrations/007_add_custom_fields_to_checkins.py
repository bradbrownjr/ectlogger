"""
Migration 007: Add custom_fields column to check_ins table

This migration adds a JSON text column for storing custom field values
that are defined via the admin field configuration.

Run this migration with:
    python migrations/007_add_custom_fields_to_checkins.py
"""

import sqlite3
import sys
from pathlib import Path

# Default database path
DB_PATH = Path(__file__).parent.parent / "ectlogger.db"


def migrate(db_path: str = None):
    """Add custom_fields column to check_ins table"""
    if db_path is None:
        db_path = str(DB_PATH)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(check_ins)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'custom_fields' in columns:
            print("Column 'custom_fields' already exists in check_ins table")
            return True
        
        # Add the new column
        cursor.execute("""
            ALTER TABLE check_ins 
            ADD COLUMN custom_fields TEXT DEFAULT '{}'
        """)
        
        conn.commit()
        print("Successfully added 'custom_fields' column to check_ins table")
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else None
    success = migrate(db_path)
    sys.exit(0 if success else 1)
