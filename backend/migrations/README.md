# Database Migrations

This folder contains database migration scripts for ECTLogger.

## How Migrations Work

Migration scripts are one-time Python scripts that modify the database schema (add columns, tables, etc.) for existing installations. Once a migration has been applied to all environments, the script file can be deleted.

Fresh installations don't need migrations - they get the current schema from `models.py`.

## Running a Migration

```bash
cd ~/ectlogger
python3 backend/migrations/XXX_migration_name.py
sudo systemctl restart ectlogger
```

## Creating a New Migration

1. Create a new file: `XXX_description.py`
2. Use this template:

```python
"""
Migration XXX: Description of what this migration does
"""
import sqlite3
import os

def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(table_name)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'new_column' not in columns:
            print("Adding 'new_column' to table_name...")
            cursor.execute("ALTER TABLE table_name ADD COLUMN new_column TEXT")
            conn.commit()
            print("Migration completed!")
        else:
            print("Column already exists. Skipping.")
            
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
```
