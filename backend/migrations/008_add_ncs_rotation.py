"""
Migration 008: Add NCS rotation tables

This migration adds support for NCS rotation scheduling:
- ncs_rotation_members: Stores rotation members and their order
- ncs_schedule_overrides: Stores swaps/cancellations for specific dates
- ncs_reminder_logs: Tracks sent reminders to prevent duplicates

Run this migration with:
    python migrations/008_add_ncs_rotation.py
"""

import asyncio
import sys
import os

# Add the parent directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    """Run the migration"""
    async with engine.begin() as conn:
        # Check if tables already exist
        result = await conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='ncs_rotation_members'"
        ))
        if result.fetchone():
            print("NCS rotation tables already exist, skipping migration")
            return
        
        print("Creating ncs_rotation_members table...")
        await conn.execute(text("""
            CREATE TABLE ncs_rotation_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL REFERENCES net_templates(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Create index for faster lookups
        await conn.execute(text("""
            CREATE INDEX idx_ncs_rotation_template ON ncs_rotation_members(template_id)
        """))
        
        print("Creating ncs_schedule_overrides table...")
        await conn.execute(text("""
            CREATE TABLE ncs_schedule_overrides (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL REFERENCES net_templates(id) ON DELETE CASCADE,
                scheduled_date TIMESTAMP NOT NULL,
                original_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                replacement_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                reason VARCHAR(500),
                created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Create index for faster lookups
        await conn.execute(text("""
            CREATE INDEX idx_ncs_override_template_date ON ncs_schedule_overrides(template_id, scheduled_date)
        """))
        
        print("Creating ncs_reminder_logs table...")
        await conn.execute(text("""
            CREATE TABLE ncs_reminder_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL REFERENCES net_templates(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                scheduled_date TIMESTAMP NOT NULL,
                reminder_type VARCHAR(20) NOT NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Create index for preventing duplicate reminders
        await conn.execute(text("""
            CREATE UNIQUE INDEX idx_ncs_reminder_unique 
            ON ncs_reminder_logs(template_id, user_id, scheduled_date, reminder_type)
        """))
        
        print("Migration completed successfully!")


async def rollback():
    """Rollback the migration"""
    async with async_engine.begin() as conn:
        print("Dropping NCS rotation tables...")
        await conn.execute(text("DROP TABLE IF EXISTS ncs_reminder_logs"))
        await conn.execute(text("DROP TABLE IF EXISTS ncs_schedule_overrides"))
        await conn.execute(text("DROP TABLE IF EXISTS ncs_rotation_members"))
        print("Rollback completed!")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        asyncio.run(rollback())
    else:
        asyncio.run(migrate())
