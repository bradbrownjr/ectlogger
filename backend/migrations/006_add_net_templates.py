"""
Migration 006: Add Net Templates and Subscriptions

This migration adds support for net templates that can be reused for recurring nets.
Users can subscribe to templates to receive notifications when new nets are created.
"""

from sqlalchemy import text
from app.database import engine
import asyncio


async def upgrade():
    """Add net templates and subscription tables"""
    async with engine.begin() as conn:
        # Create net_templates table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS net_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                owner_id INTEGER NOT NULL,
                field_config TEXT DEFAULT '{"name": {"enabled": true, "required": false}, "location": {"enabled": true, "required": false}, "skywarn_number": {"enabled": false, "required": false}, "weather_observation": {"enabled": false, "required": false}, "power_source": {"enabled": false, "required": false}, "feedback": {"enabled": false, "required": false}, "notes": {"enabled": false, "required": false}}',
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users(id)
            )
        """))
        
        # Create net_template_frequencies junction table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS net_template_frequencies (
                template_id INTEGER NOT NULL,
                frequency_id INTEGER NOT NULL,
                PRIMARY KEY (template_id, frequency_id),
                FOREIGN KEY (template_id) REFERENCES net_templates(id) ON DELETE CASCADE,
                FOREIGN KEY (frequency_id) REFERENCES frequencies(id) ON DELETE CASCADE
            )
        """))
        
        # Create net_template_subscriptions table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS net_template_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (template_id) REFERENCES net_templates(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(template_id, user_id)
            )
        """))
        
        # Add template_id to nets table
        await conn.execute(text("""
            ALTER TABLE nets ADD COLUMN template_id INTEGER REFERENCES net_templates(id)
        """))
        
        print("✓ Migration 006: Net templates and subscriptions created")


async def downgrade():
    """Remove net templates and subscription tables"""
    async with engine.begin() as conn:
        # Drop template_id column from nets (SQLite doesn't support DROP COLUMN easily)
        # We'll leave it for now as it won't cause issues
        
        await conn.execute(text("DROP TABLE IF EXISTS net_template_subscriptions"))
        await conn.execute(text("DROP TABLE IF EXISTS net_template_frequencies"))
        await conn.execute(text("DROP TABLE IF EXISTS net_templates"))
        
        print("✓ Migration 006: Net templates rolled back")


if __name__ == "__main__":
    print("Running migration 006...")
    asyncio.run(upgrade())
