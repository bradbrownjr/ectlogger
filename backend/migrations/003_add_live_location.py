"""
Migration 003: Add live_location field for GPS-derived grid square

This migration adds:
- live_location: GPS-derived grid square (updated automatically when location_awareness is enabled)
- live_location_updated: Timestamp of last GPS update

This keeps the user's manually-entered default location separate from their
live GPS location, so traveling SKYWARN spotters can have their current
position shown to NCS without overwriting their home grid square.
"""

import asyncio
from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add live_location columns to users table."""
    async with engine.begin() as conn:
        # Check if columns already exist
        result = await conn.execute(text("PRAGMA table_info(users)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'live_location' not in columns:
            print("Adding live_location column to users table...")
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN live_location VARCHAR(50)"
            ))
            print("Added live_location column")
        else:
            print("live_location column already exists")
        
        if 'live_location_updated' not in columns:
            print("Adding live_location_updated column to users table...")
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN live_location_updated DATETIME"
            ))
            print("Added live_location_updated column")
        else:
            print("live_location_updated column already exists")
    
    print("Migration 003 complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
