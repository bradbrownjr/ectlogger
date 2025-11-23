"""
Migration: Add support for digital modes (DMR, YSF, D-STAR, P25)

This migration adds network and talkgroup fields to the frequencies table
to support digital modes that don't use traditional frequency assignments.

Date: 2025-11-22
"""

import sqlite3
import os
from pathlib import Path


def get_db_path():
    """Get the database path from environment or use default."""
    db_path = os.getenv('DATABASE_URL', 'sqlite:///./ectlogger.db')
    if db_path.startswith('sqlite:///'):
        db_path = db_path.replace('sqlite:///', '')
    return db_path


def migrate():
    """Add network and talkgroup columns to frequencies table."""
    db_path = get_db_path()
    
    print(f"Migrating database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(frequencies)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Add network column if it doesn't exist
        if 'network' not in columns:
            print("Adding 'network' column to frequencies table...")
            cursor.execute("""
                ALTER TABLE frequencies 
                ADD COLUMN network VARCHAR(100)
            """)
            print("✓ Added 'network' column")
        else:
            print("'network' column already exists")
        
        # Add talkgroup column if it doesn't exist
        if 'talkgroup' not in columns:
            print("Adding 'talkgroup' column to frequencies table...")
            cursor.execute("""
                ALTER TABLE frequencies 
                ADD COLUMN talkgroup VARCHAR(50)
            """)
            print("✓ Added 'talkgroup' column")
        else:
            print("'talkgroup' column already exists")
        
        conn.commit()
        print("\n✓ Migration completed successfully!")
        
    except sqlite3.Error as e:
        print(f"\n✗ Migration failed: {e}")
        conn.rollback()
        raise
    
    finally:
        conn.close()


def rollback():
    """Rollback migration (SQLite doesn't support DROP COLUMN easily)."""
    print("Note: SQLite doesn't support DROP COLUMN easily.")
    print("To rollback, you would need to:")
    print("1. Create a new table without the columns")
    print("2. Copy data from old table")
    print("3. Drop old table")
    print("4. Rename new table")
    print("\nOr restore from backup.")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback()
    else:
        migrate()
