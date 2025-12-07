"""
Migration 007: Add schedule creation limit settings to app_settings

Description: Adds configurable settings to prevent abuse of schedule creation:
- schedule_min_account_age_days: Minimum account age (days) to create schedules
- schedule_min_net_participations: Minimum net check-ins required
- schedule_max_per_day: Maximum schedules a user can create per day
"""
import sqlite3
import os

def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(app_settings)")
        columns = [col[1] for col in cursor.fetchall()]
        
        columns_to_add = []
        
        if 'schedule_min_account_age_days' not in columns:
            columns_to_add.append(
                "ALTER TABLE app_settings ADD COLUMN schedule_min_account_age_days INTEGER DEFAULT 7"
            )
        
        if 'schedule_min_net_participations' not in columns:
            columns_to_add.append(
                "ALTER TABLE app_settings ADD COLUMN schedule_min_net_participations INTEGER DEFAULT 1"
            )
        
        if 'schedule_max_per_day' not in columns:
            columns_to_add.append(
                "ALTER TABLE app_settings ADD COLUMN schedule_max_per_day INTEGER DEFAULT 5"
            )
        
        if not columns_to_add:
            print("All schedule creation limit columns already exist. Skipping.")
            return
        
        for sql in columns_to_add:
            print(f"Executing: {sql}")
            cursor.execute(sql)
        
        conn.commit()
        print("Migration 007 completed successfully!")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
