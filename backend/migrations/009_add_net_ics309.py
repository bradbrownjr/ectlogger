"""
Migration 009: Add ICS-309 enabled flag to nets

Description: Adds ics309_enabled column to nets table. When enabled by NCS,
all net close emails will use ICS-309 format regardless of user preference.
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
        cursor.execute("PRAGMA table_info(nets)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'ics309_enabled' in columns:
            print("ics309_enabled column already exists in nets. Skipping.")
            return
        
        print("Adding ics309_enabled column to nets table...")
        cursor.execute("""
            ALTER TABLE nets 
            ADD COLUMN ics309_enabled BOOLEAN DEFAULT 0
        """)
        
        conn.commit()
        print("Migration 009 completed successfully!")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
