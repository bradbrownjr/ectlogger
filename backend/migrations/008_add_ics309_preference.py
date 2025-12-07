"""
Migration 008: Add ICS-309 notification preference to users

Description: Adds notify_ics309 column to allow users to receive ICS-309 formatted
communications logs when nets close instead of the standard log format.
"""
import sqlite3
import os

def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'notify_ics309' in columns:
            print("notify_ics309 column already exists in users. Skipping.")
            return
        
        print("Adding notify_ics309 column to users table...")
        cursor.execute("""
            ALTER TABLE users 
            ADD COLUMN notify_ics309 BOOLEAN DEFAULT 0
        """)
        
        conn.commit()
        print("Migration 008 completed successfully!")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
