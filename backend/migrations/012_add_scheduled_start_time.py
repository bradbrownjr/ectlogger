#!/usr/bin/env python3
"""
Migration 012: Add scheduled_start_time column to nets table.

This field stores the scheduled start time for nets, enabling countdown timers
before the net starts.
"""

import sqlite3
import os

def migrate():
    # Find the database file
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')
    if not os.path.exists(db_path):
        # Try alternate location (production)
        db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'backend', 'ectlogger.db')
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        print("This migration will be applied automatically when the database is created.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(nets)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'scheduled_start_time' not in columns:
            cursor.execute("ALTER TABLE nets ADD COLUMN scheduled_start_time DATETIME")
            conn.commit()
            print("Added scheduled_start_time column to nets table")
        else:
            print("scheduled_start_time column already exists")
        
        print("Migration 012 completed successfully!")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
