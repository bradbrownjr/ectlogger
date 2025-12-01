"""
Migration: Add location_awareness column to users table
Date: 2024-12-01
Description: Adds location_awareness boolean column to enable browser geolocation 
             for showing Maidenhead grid square in navbar
"""

import sqlite3
import os

def migrate(db_path: str = None):
    """Run the migration"""
    if db_path is None:
        # Default to the standard database location
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'location_awareness' not in columns:
            print("Adding location_awareness column to users table...")
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN location_awareness BOOLEAN DEFAULT 0
            """)
            conn.commit()
            print("Migration completed successfully!")
        else:
            print("Column location_awareness already exists, skipping migration.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
