"""
Migration: Add callsigns JSON array field to users table

This migration adds a callsigns field to store multiple callsigns per user
(e.g., Amateur Radio, GMRS, tactical callsigns). The existing callsign field
is kept as the primary callsign for backward compatibility.

Date: 2025-11-22
"""

import sqlite3
import os
import json


def get_db_path():
    """Get the database path from environment or use default."""
    db_path = os.getenv('DATABASE_URL', 'sqlite:///./ectlogger.db')
    if db_path.startswith('sqlite:///'):
        db_path = db_path.replace('sqlite:///', '')
    return db_path


def migrate():
    """Add callsigns JSON field to users table."""
    db_path = get_db_path()
    
    print(f"Migrating database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if callsigns column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'callsigns' in columns:
            print("Migration already applied: callsigns column exists")
            return
        
        print("Adding callsigns column to users table...")
        
        # Add callsigns column
        cursor.execute("""
            ALTER TABLE users 
            ADD COLUMN callsigns TEXT DEFAULT '[]'
        """)
        
        # Migrate existing callsign values to callsigns array
        print("Migrating existing callsign values...")
        cursor.execute("SELECT id, callsign FROM users WHERE callsign IS NOT NULL")
        users_with_callsigns = cursor.fetchall()
        
        for user_id, callsign in users_with_callsigns:
            callsigns_json = json.dumps([callsign])
            cursor.execute(
                "UPDATE users SET callsigns = ? WHERE id = ?",
                (callsigns_json, user_id)
            )
        
        conn.commit()
        print(f"✓ Migration complete: Added callsigns field and migrated {len(users_with_callsigns)} existing callsigns")
        
    except Exception as e:
        conn.rollback()
        print(f"✗ Migration failed: {e}")
        raise
    finally:
        conn.close()


def rollback():
    """Remove callsigns column."""
    db_path = get_db_path()
    
    print(f"Rolling back migration on database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if callsigns column exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'callsigns' not in columns:
            print("Rollback not needed: callsigns column doesn't exist")
            return
        
        print("Removing callsigns column...")
        
        # SQLite doesn't support DROP COLUMN directly, need to recreate table
        # For simplicity, we'll just note that rollback would require table recreation
        print("Note: SQLite doesn't support DROP COLUMN. Manual rollback required.")
        print("To rollback: Recreate users table without callsigns column")
        
    except Exception as e:
        print(f"✗ Rollback failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback()
    else:
        migrate()
