from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings


def normalize_database_url(url: str) -> str:
    """Ensure the URL names its async driver, without double-inserting one
    that is already there.

    "sqlite:///" is a substring of "sqlite+aiosqlite:///", so a plain
    .replace() on a URL that already names the async driver re-inserts it,
    producing "sqlite+aiosqlite+aiosqlite:///" and a dialect-loader crash.
    """
    if url.startswith("sqlite") and "+aiosqlite" not in url:
        return url.replace("sqlite:///", "sqlite+aiosqlite:///")
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("mysql://"):
        return url.replace("mysql://", "mysql+aiomysql://", 1)
    return url


# Convert database URL to async version if needed
database_url = normalize_database_url(settings.database_url)

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
