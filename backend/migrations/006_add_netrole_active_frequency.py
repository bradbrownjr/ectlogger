"""
Migration 006: Add active_frequency_id to net_roles

Description: Allows each NCS operator to claim a specific frequency they're monitoring.
This enables multi-NCS nets where each operator handles a different frequency.
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
        cursor.execute("PRAGMA table_info(net_roles)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'active_frequency_id' in columns:
            print("active_frequency_id column already exists in net_roles. Skipping.")
            return
        
        print("Adding active_frequency_id column to net_roles table...")
        cursor.execute("""
            ALTER TABLE net_roles 
            ADD COLUMN active_frequency_id INTEGER 
            REFERENCES frequencies(id) ON DELETE SET NULL
        """)
        
        conn.commit()
        print("Added active_frequency_id column successfully!")
        
        print("Migration 006 completed successfully!")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
