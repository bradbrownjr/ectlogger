"""Migration 016: Add contacts table.

Contacts store station info from check-in history. Auto-populated when
a callsign checks in for the first time. Admin can edit to fix names,
add emails, and send invites. When a contact creates an account, their
user_id links here for auto-fill during future check-ins.
"""

import sqlite3
import os

def migrate():
    # Determine database path
    db_path = os.environ.get('DATABASE_PATH', os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db'))
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if table already exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'")
    if cursor.fetchone():
        print("Table 'contacts' already exists, skipping migration.")
        conn.close()
        return
    
    cursor.execute("""
        CREATE TABLE contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            callsign VARCHAR(50) NOT NULL UNIQUE,
            name VARCHAR(255),
            location VARCHAR(255),
            email VARCHAR(255),
            skywarn_number VARCHAR(50),
            notes TEXT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        )
    """)
    
    # Create index on callsign for fast lookups
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_contacts_callsign ON contacts (callsign)")
    
    # Seed contacts from existing check-in history (unique callsigns not linked to users)
    # Take the most recent name/location for each callsign
    cursor.execute("""
        INSERT INTO contacts (callsign, name, location, skywarn_number, created_at)
        SELECT 
            ci.callsign,
            ci.name,
            ci.location,
            ci.skywarn_number,
            MIN(ci.checked_in_at)
        FROM check_ins ci
        LEFT JOIN users u ON (
            u.callsign = ci.callsign 
            OR u.gmrs_callsign = ci.callsign
        )
        WHERE u.id IS NULL
          AND ci.callsign IS NOT NULL
          AND ci.callsign != ''
        GROUP BY ci.callsign
    """)
    
    seeded_count = cursor.rowcount
    
    conn.commit()
    conn.close()
    
    print(f"Migration 016 complete: Created 'contacts' table and seeded {seeded_count} contacts from check-in history.")


if __name__ == "__main__":
    migrate()
