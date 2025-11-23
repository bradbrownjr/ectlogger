"""
Migration: Make frequency column nullable for digital modes

This migration removes the NOT NULL constraint from the frequency column
to allow digital modes (DMR, YSF, etc.) that don't use traditional frequencies.

Date: 2025-11-23
"""

import sqlite3
import os


def get_db_path():
    """Get the database path from environment or use default."""
    db_path = os.getenv('DATABASE_URL', 'sqlite:///./ectlogger.db')
    if db_path.startswith('sqlite:///'):
        db_path = db_path.replace('sqlite:///', '')
    return db_path


def migrate():
    """Make frequency column nullable."""
    db_path = get_db_path()
    
    print(f"Migrating database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # SQLite doesn't support ALTER COLUMN directly
        # We need to recreate the table
        
        print("Creating new frequencies table with nullable frequency column...")
        
        # Create new table with correct schema
        cursor.execute("""
            CREATE TABLE frequencies_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                frequency VARCHAR(50),
                mode VARCHAR(50) NOT NULL,
                network VARCHAR(100),
                talkgroup VARCHAR(50),
                description VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        print("Copying data from old table...")
        
        # Copy data from old table
        cursor.execute("""
            INSERT INTO frequencies_new (id, frequency, mode, network, talkgroup, description, created_at)
            SELECT id, frequency, mode, network, talkgroup, description, created_at
            FROM frequencies
        """)
        
        print("Dropping old table...")
        
        # Drop old table
        cursor.execute("DROP TABLE frequencies")
        
        print("Renaming new table...")
        
        # Rename new table
        cursor.execute("ALTER TABLE frequencies_new RENAME TO frequencies")
        
        # Recreate the many-to-many relationship table if it exists
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='net_frequencies'
        """)
        
        if cursor.fetchone():
            print("Recreating net_frequencies foreign keys...")
            # The foreign keys should still work since we preserved the IDs
            # Just verify the table exists
            cursor.execute("SELECT COUNT(*) FROM net_frequencies")
            count = cursor.fetchone()[0]
            print(f"✓ net_frequencies table has {count} entries")
        
        conn.commit()
        print("\n✓ Migration completed successfully!")
        print("Frequency column is now nullable for digital modes.")
        
    except sqlite3.Error as e:
        print(f"\n✗ Migration failed: {e}")
        conn.rollback()
        raise
    
    finally:
        conn.close()


def rollback():
    """Rollback would require a backup."""
    print("To rollback this migration, restore from your database backup.")
    print("The frequency column would be NOT NULL again.")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback()
    else:
        # Create a backup first
        db_path = get_db_path()
        import shutil
        from datetime import datetime
        
        backup_path = f"{db_path}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        print(f"Creating backup: {backup_path}")
        shutil.copy2(db_path, backup_path)
        print("✓ Backup created")
        print()
        
        migrate()
