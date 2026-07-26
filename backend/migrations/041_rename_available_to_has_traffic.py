#!/usr/bin/env python3
"""
Migration: Rename 'available' status to 'has_traffic' in check_ins table.

This migration updates the status column in the check_ins table to use
'has_traffic' instead of 'available' for stations that have traffic to report.
"""

import sqlite3
import sys
from pathlib import Path

def migrate(db_path: str = None):
    """Run the migration."""
    if db_path is None:
        # Default to the database in the backend directory
        db_path = Path(__file__).parent.parent / "ectlogger.db"
    
    print(f"Running migration on: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Count records to update
        cursor.execute("SELECT COUNT(*) FROM check_ins WHERE status = 'available'")
        count = cursor.fetchone()[0]
        print(f"Found {count} check-ins with status 'available'")
        
        if count > 0:
            # Update the status
            cursor.execute("UPDATE check_ins SET status = 'has_traffic' WHERE status = 'available'")
            conn.commit()
            print(f"Successfully updated {cursor.rowcount} records from 'available' to 'has_traffic'")
        else:
            print("No records need updating")
        
        # Verify the update
        cursor.execute("SELECT COUNT(*) FROM check_ins WHERE status = 'available'")
        remaining = cursor.fetchone()[0]
        if remaining > 0:
            print(f"WARNING: {remaining} records still have 'available' status")
        else:
            print("Verification passed: No 'available' status records remain")
            
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        migrate(sys.argv[1])
    else:
        migrate()
