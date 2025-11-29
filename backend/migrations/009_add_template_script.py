"""
Migration 009: Add script field to net_templates table

This adds a script field to store net script templates.
"""
import sqlite3
import os

def migrate(db_path: str = None):
    """Add script column to net_templates table."""
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(net_templates)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'script' not in columns:
            print("Adding 'script' column to net_templates table...")
            cursor.execute("ALTER TABLE net_templates ADD COLUMN script TEXT")
            conn.commit()
            print("Migration 009 completed successfully!")
        else:
            print("Column 'script' already exists in net_templates table. Skipping.")
            
    except Exception as e:
        conn.rollback()
        print(f"Migration 009 failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
