"""
Migration 005: Add field_config to nets table
Adds a JSON field to store which check-in fields are enabled and required for each net.
"""

import sqlite3
import os

def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Add field_config column to nets table
        # Default config: callsign (always required), name and location enabled by default
        default_config = '''{
            "name": {"enabled": true, "required": false},
            "location": {"enabled": true, "required": false},
            "skywarn_number": {"enabled": false, "required": false},
            "weather_observation": {"enabled": false, "required": false},
            "power_source": {"enabled": false, "required": false},
            "feedback": {"enabled": false, "required": false},
            "notes": {"enabled": false, "required": false}
        }'''
        
        cursor.execute(f"""
            ALTER TABLE nets 
            ADD COLUMN field_config TEXT DEFAULT '{default_config}'
        """)
        
        # Update existing nets to have the default config
        cursor.execute(f"""
            UPDATE nets 
            SET field_config = '{default_config}'
            WHERE field_config IS NULL
        """)
        
        conn.commit()
        print("✓ Migration 005: Added field_config column to nets table")
        
    except sqlite3.Error as e:
        print(f"✗ Migration 005 failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

def rollback():
    """
    Note: SQLite doesn't support DROP COLUMN directly.
    To rollback, you would need to:
    1. Create new table without field_config
    2. Copy data
    3. Drop old table
    4. Rename new table
    """
    print("Manual rollback required for SQLite")

if __name__ == "__main__":
    migrate()
