"""
Migration 007: Add notification preferences to users table

Adds columns:
- notify_net_start: Notify when subscribed net starts (default True)
- notify_net_close: Notify when subscribed net closes with log (default True)  
- notify_net_reminder: Send reminder 1 hour before subscribed net (default False)
"""

import asyncio
from sqlalchemy import text
from app.database import engine


async def run_migration():
    """Add notification preference columns to users table"""
    async with engine.begin() as conn:
        # Check if columns exist first
        result = await conn.execute(text("PRAGMA table_info(users)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'notify_net_start' not in columns:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN notify_net_start BOOLEAN DEFAULT 1"
            ))
            print("Added notify_net_start column")
        else:
            print("notify_net_start column already exists")
        
        if 'notify_net_close' not in columns:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN notify_net_close BOOLEAN DEFAULT 1"
            ))
            print("Added notify_net_close column")
        else:
            print("notify_net_close column already exists")
        
        if 'notify_net_reminder' not in columns:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN notify_net_reminder BOOLEAN DEFAULT 0"
            ))
            print("Added notify_net_reminder column")
        else:
            print("notify_net_reminder column already exists")
    
    print("Migration 007 complete!")


if __name__ == "__main__":
    asyncio.run(run_migration())
