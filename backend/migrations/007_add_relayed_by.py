"""
Migration 007: Add relayed_by field to check_ins table

This migration adds a relayed_by column to track which station relayed a check-in.
This allows marking any check-in as being relayed, not just authenticated users.

To run:
    python -m migrations.007_add_relayed_by
"""

import asyncio
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add relayed_by column to check_ins table"""
    
    async with engine.begin() as conn:
        # Check if column already exists
        result = await conn.execute(text("""
            SELECT COUNT(*) FROM pragma_table_info('check_ins') 
            WHERE name='relayed_by'
        """))
        exists = result.scalar()
        
        if exists:
            print("Column 'relayed_by' already exists in check_ins table")
            return
        
        # Add the relayed_by column
        print("Adding 'relayed_by' column to check_ins table...")
        await conn.execute(text("""
            ALTER TABLE check_ins ADD COLUMN relayed_by VARCHAR(50)
        """))
        
        print("Migration completed successfully!")


if __name__ == "__main__":
    asyncio.run(migrate())
