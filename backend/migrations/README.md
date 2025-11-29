# Database Migrations

This folder contains database migration scripts for ECTLogger.

## How Migrations Work

Migration scripts are one-time Python scripts that modify the database schema (add columns, tables, etc.). Once a migration has been applied to all environments (development and production), the script file can be deleted.

## Running a Migration

```bash
cd ~/ectlogger
python3 backend/migrations/XXX_migration_name.py
sudo systemctl restart ectlogger
```

## Creating a New Migration

1. Create a new file with the next number: `XXX_description.py`
2. Use this template:

```python
"""
Migration XXX: Description of what this migration does
"""
import sqlite3
import os

def migrate(db_path: str = None):
    """Description of the migration."""
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column/table already exists
        cursor.execute("PRAGMA table_info(table_name)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'new_column' not in columns:
            print("Adding 'new_column' to table_name...")
            cursor.execute("ALTER TABLE table_name ADD COLUMN new_column TEXT")
            conn.commit()
            print("Migration XXX completed successfully!")
        else:
            print("Column already exists. Skipping.")
            
    except Exception as e:
        conn.rollback()
        print(f"Migration XXX failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
```

## Applied Migrations History

- 002: Add digital mode support
- 003: Make frequency nullable
- 004: Add multiple callsigns
- 005: Add field config
- 006: Add net templates
- 007: Add power field
- 008: Add net script field
- 009: Add template script field
