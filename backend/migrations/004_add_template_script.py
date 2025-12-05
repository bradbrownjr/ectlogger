"""
Migration 004: Add script column to net_templates table

Description: Adds script Text column to store net script templates.
"""
import sqlite3
import os

def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists in net_templates table
        cursor.execute("PRAGMA table_info(net_templates)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'script' not in columns:
            print("Adding 'script' to net_templates table...")
            cursor.execute("ALTER TABLE net_templates ADD COLUMN script TEXT")
            conn.commit()
            print("Added script column to net_templates table.")
        else:
            print("script column already exists in net_templates. Skipping.")
        
        print("Migration 004 completed successfully!")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
