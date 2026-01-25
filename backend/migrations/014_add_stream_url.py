"""
Migration 014: Add stream_url to nets table
"""

import sqlite3
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if stream_url column already exists
        cursor.execute("PRAGMA table_info(nets)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'stream_url' in columns:
            print("stream_url column already exists. Skipping.")
            return
        
        print("Adding stream_url column to nets table...")
        cursor.execute("""
            ALTER TABLE nets ADD COLUMN stream_url VARCHAR(500)
        """)
        
        conn.commit()
        print("Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
