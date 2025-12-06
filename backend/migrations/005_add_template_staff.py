"""
Migration 005: Add template_staff table

Description: Creates a separate table for NCS staff who can run nets from a template,
independent from the rotation schedule.
"""
import sqlite3
import os

def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if table already exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='template_staff'")
        if cursor.fetchone():
            print("template_staff table already exists. Skipping.")
            return
        
        print("Creating template_staff table...")
        cursor.execute("""
            CREATE TABLE template_staff (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (template_id) REFERENCES net_templates(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE (template_id, user_id)
            )
        """)
        
        # Create index for faster lookups
        cursor.execute("CREATE INDEX idx_template_staff_template_id ON template_staff(template_id)")
        cursor.execute("CREATE INDEX idx_template_staff_user_id ON template_staff(user_id)")
        
        conn.commit()
        print("Created template_staff table successfully!")
        
        print("Migration 005 completed successfully!")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
