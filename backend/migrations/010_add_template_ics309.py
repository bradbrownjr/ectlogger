"""
Migration 010: Add ics309_enabled column to net_templates table

This allows schedule/template owners to enable ICS-309 format for all nets
created from this template/schedule.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import engine


async def migrate():
    async with engine.begin() as conn:
        # Check if column already exists
        result = await conn.execute(text("PRAGMA table_info(net_templates)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'ics309_enabled' not in columns:
            print("Adding ics309_enabled column to net_templates table...")
            await conn.execute(text(
                "ALTER TABLE net_templates ADD COLUMN ics309_enabled BOOLEAN DEFAULT 0"
            ))
            print("Migration 010 completed successfully!")
        else:
            print("Column ics309_enabled already exists in net_templates, skipping.")


if __name__ == "__main__":
    asyncio.run(migrate())
