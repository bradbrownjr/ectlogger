#!/usr/bin/env python3
"""
Migration 015: Add announcements field to nets and topic_history table
- Adds announcements column to nets table for general traffic/announcements
- Creates topic_history table to track previously used topics per template
"""

import sqlite3
import sys
from pathlib import Path

def migrate():
    """Run the migration"""
    # Use the backend database path
    db_path = Path(__file__).parent.parent / 'ectlogger.db'
    print(f"Using database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Add announcements column to nets table
        print("Adding announcements column to nets table...")
        cursor.execute("""
            ALTER TABLE nets ADD COLUMN announcements TEXT
        """)
        
        # Create topic_history table
        print("Creating topic_history table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS topic_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL,
                topic TEXT NOT NULL,
                used_date TIMESTAMP NOT NULL,
                net_id INTEGER,
                FOREIGN KEY (template_id) REFERENCES net_templates(id) ON DELETE CASCADE,
                FOREIGN KEY (net_id) REFERENCES nets(id) ON DELETE SET NULL
            )
        """)
        
        # Create index on template_id for faster lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_topic_history_template_id 
            ON topic_history(template_id)
        """)
        
        conn.commit()
        print("Migration completed successfully!")
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
