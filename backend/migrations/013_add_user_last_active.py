#!/usr/bin/env python3
"""
Migration 013: Add last_active column to users table.

This tracks when users last made an API request, enabling "online" status display.
"""

import sqlite3
import os
import sys

def get_db_path():
    """Get the database path from environment or use default"""
    db_url = os.environ.get('DATABASE_URL', 'sqlite:///./ectlogger.db')
    if db_url.startswith('sqlite:///'):
        return db_url.replace('sqlite:///', '')
    return 'ectlogger.db'

def migrate():
    db_path = get_db_path()
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        print("This migration will be applied automatically when the database is created.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'last_active' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN last_active DATETIME")
            conn.commit()
            print("Added last_active column to users table")
        else:
            print("last_active column already exists")
        
    except Exception as e:
        print(f"Migration error: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
