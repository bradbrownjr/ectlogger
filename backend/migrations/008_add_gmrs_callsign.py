"""
Migration 008: Add GMRS callsign field to users table

Adds column:
- gmrs_callsign: GMRS callsign (e.g., WROP123)
"""

import asyncio
from sqlalchemy import text
from app.database import engine


async def run_migration():
    """Add gmrs_callsign column to users table"""
    async with engine.begin() as conn:
        # Check if column exists first
        result = await conn.execute(text("PRAGMA table_info(users)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'gmrs_callsign' not in columns:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN gmrs_callsign VARCHAR(50)"
            ))
            print("Added gmrs_callsign column")
        else:
            print("gmrs_callsign column already exists")
    
    print("Migration 008 complete!")


if __name__ == "__main__":
    asyncio.run(run_migration())
