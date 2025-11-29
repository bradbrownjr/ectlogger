"""
Migration 008: Add script field to nets table

This adds a text field for NCS net scripts.
"""

import asyncio
from sqlalchemy import text
from app.database import engine


async def migrate():
    async with engine.begin() as conn:
        # Check if column already exists
        result = await conn.execute(text("PRAGMA table_info(nets)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'script' not in columns:
            print("Adding 'script' column to nets table...")
            await conn.execute(text("ALTER TABLE nets ADD COLUMN script TEXT"))
            print("Done!")
        else:
            print("Column 'script' already exists in nets table.")


if __name__ == "__main__":
    asyncio.run(migrate())
