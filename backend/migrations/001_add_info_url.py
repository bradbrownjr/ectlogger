"""
Migration 001: Add info_url column to nets and net_templates tables
"""
import sqlite3
import os

def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists in nets table
        cursor.execute("PRAGMA table_info(nets)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'info_url' not in columns:
            print("Adding 'info_url' to nets table...")
            cursor.execute("ALTER TABLE nets ADD COLUMN info_url VARCHAR(500)")
            conn.commit()
            print("Added info_url to nets table.")
        else:
            print("info_url column already exists in nets. Skipping.")
        
        # Check if column already exists in net_templates table
        cursor.execute("PRAGMA table_info(net_templates)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'info_url' not in columns:
            print("Adding 'info_url' to net_templates table...")
            cursor.execute("ALTER TABLE net_templates ADD COLUMN info_url VARCHAR(500)")
            conn.commit()
            print("Added info_url to net_templates table.")
        else:
            print("info_url column already exists in net_templates. Skipping.")
        
        print("Migration completed successfully!")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
