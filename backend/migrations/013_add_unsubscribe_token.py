"""
Migration: Add unsubscribe_token field to users table

This field stores a unique token for one-click email unsubscribe functionality.
Required for CAN-SPAM/GDPR email compliance.
"""

import sqlite3
import os
import secrets


def generate_token():
    """Generate a secure random token"""
    return secrets.token_hex(32)  # 64 character hex string


def migrate():
    # Determine database path
    db_path = os.environ.get('DATABASE_PATH', 'ectlogger.db')
    
    # Handle both relative and absolute paths
    if not os.path.isabs(db_path):
        # Try current directory first
        if not os.path.exists(db_path):
            # Try backend directory
            backend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), db_path)
            if os.path.exists(backend_path):
                db_path = backend_path
    
    print(f"Migrating database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'unsubscribe_token' not in columns:
            print("Adding unsubscribe_token column to users table...")
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN unsubscribe_token VARCHAR(64) UNIQUE
            """)
            
            # Generate tokens for existing users
            cursor.execute("SELECT id FROM users")
            users = cursor.fetchall()
            
            for (user_id,) in users:
                token = generate_token()
                cursor.execute(
                    "UPDATE users SET unsubscribe_token = ? WHERE id = ?",
                    (token, user_id)
                )
            
            print(f"Generated unsubscribe tokens for {len(users)} existing users")
            conn.commit()
            print("Migration completed successfully!")
        else:
            print("Column unsubscribe_token already exists, skipping migration.")
        
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
