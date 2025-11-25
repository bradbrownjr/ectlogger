"""
Migration 009: Add system messages support

Adds is_system field to ChatMessage and show_activity_in_chat preference to User.

Run with: python -m migrations.009_add_system_messages
"""

import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add system message fields"""
    async with engine.begin() as conn:
        # Check if is_system column exists on chat_messages
        result = await conn.execute(text("PRAGMA table_info(chat_messages)"))
        columns = {row[1] for row in result.fetchall()}
        
        if 'is_system' not in columns:
            print("Adding is_system column to chat_messages table...")
            await conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN is_system BOOLEAN DEFAULT 0"
            ))
            print("✓ Added is_system column to chat_messages")
        else:
            print("✓ is_system column already exists on chat_messages")
        
        # Check if show_activity_in_chat column exists on users
        result = await conn.execute(text("PRAGMA table_info(users)"))
        columns = {row[1] for row in result.fetchall()}
        
        if 'show_activity_in_chat' not in columns:
            print("Adding show_activity_in_chat column to users table...")
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN show_activity_in_chat BOOLEAN DEFAULT 1"
            ))
            print("✓ Added show_activity_in_chat column to users")
        else:
            print("✓ show_activity_in_chat column already exists on users")
        
        print("\nMigration 009 complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
