"""
Migration 008: Add power field for power output

This adds a new 'power' column to check_ins table for tracking power output
(e.g., "100W", "50W mobile") separate from power_source (battery, generator, etc.)

Also adds the 'power' field to the field_definitions table.

Run manually:
    sqlite3 ectlogger.db < migrations/008_add_power_field.sql
    
Or in Python:
    python -c "from migrations.008_add_power_field import migrate; migrate('ectlogger.db')"
"""

import sqlite3
import json


def migrate(db_path: str = "ectlogger.db"):
    """Add power column to check_ins table and field definition."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if power column already exists
        cursor.execute("PRAGMA table_info(check_ins)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'power' not in columns:
            print("Adding 'power' column to check_ins table...")
            cursor.execute("ALTER TABLE check_ins ADD COLUMN power VARCHAR(255)")
            print("✓ Added 'power' column")
        else:
            print("✓ 'power' column already exists")
        
        # Check if power field definition exists
        cursor.execute("SELECT id FROM field_definitions WHERE name = 'power'")
        if not cursor.fetchone():
            print("Adding 'power' field definition...")
            cursor.execute("""
                INSERT INTO field_definitions (name, label, field_type, default_enabled, default_required, is_builtin, is_archived, sort_order)
                VALUES ('power', 'Power', 'text', 0, 0, 1, 0, 55)
            """)
            print("✓ Added 'power' field definition")
        else:
            print("✓ 'power' field definition already exists")
        
        # Update power_source field label to "Power Src"
        cursor.execute("UPDATE field_definitions SET label = 'Power Src' WHERE name = 'power_source'")
        print("✓ Updated power_source label to 'Power Src'")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
