from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Convert database URL to async version if needed
database_url = settings.database_url
if database_url.startswith("sqlite"):
    database_url = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
elif database_url.startswith("mysql://"):
    database_url = database_url.replace("mysql://", "mysql+aiomysql://")

engine = create_async_engine(database_url, echo=True if settings.app_env == "development" else False)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        # Backward-compatible schema patch: some deployments update code
        # before running migrations, which can break template queries.
        # Ensure the fifth-week override column exists before ORM queries run.
        if database_url.startswith("sqlite"):
            def ensure_sqlite_columns(sync_conn):
                col_result = sync_conn.execute(text("PRAGMA table_info(net_templates)"))
                columns = {row[1] for row in col_result.fetchall()}
                if "fifth_week_user_id" not in columns:
                    sync_conn.execute(text("ALTER TABLE net_templates ADD COLUMN fifth_week_user_id INTEGER NULL"))

            await conn.run_sync(ensure_sqlite_columns)

        await conn.run_sync(Base.metadata.create_all)
