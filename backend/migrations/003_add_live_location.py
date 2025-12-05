"""
Migration 003: Add live_location field for GPS-derived grid square

This migration adds:
- live_location: GPS-derived grid square (updated automatically when location_awareness is enabled)
- live_location_updated: Timestamp of last GPS update

This keeps the user's manually-entered default location separate from their
live GPS location, so traveling SKYWARN spotters can have their current
position shown to NCS without overwriting their home grid square.
"""

import sqlite3
import os


def migrate(db_path: str = None):
    """Add live_location columns to users table."""
    if db_path is None:
        # Default to the standard database location
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'live_location' not in columns:
            print("Adding live_location column to users table...")
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN live_location VARCHAR(50)
            """)
            conn.commit()
            print("Added live_location column")
        else:
            print("live_location column already exists")
        
        if 'live_location_updated' not in columns:
            print("Adding live_location_updated column to users table...")
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN live_location_updated DATETIME
            """)
            conn.commit()
            print("Added live_location_updated column")
        else:
            print("live_location_updated column already exists")
        
        print("Migration 003 complete!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
