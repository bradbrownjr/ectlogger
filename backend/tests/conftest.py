"""
Shared test fixtures for the ECTLogger backend.

Sets required env vars before any app imports so pydantic-settings picks them up
without needing a real .env file.  The test engine uses an in-memory SQLite
database; get_db is overridden so endpoint tests never touch the real database.
"""
import os

# Must happen before any app imports — pydantic-settings reads these at class creation.
os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-use-in-production")
os.environ.setdefault("SMTP_USER", "test@example.com")
os.environ.setdefault("SMTP_PASSWORD", "test-password")
os.environ.setdefault("SMTP_FROM_EMAIL", "test@example.com")
# Point the module-level engine at a temp file so startup init_db() doesn't
# touch the real dev database.  The test engine below is what endpoints use.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_ci.db")

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db, Base
from app.models import User, UserRole
from app.auth import create_access_token

# In-memory SQLite shared across all connections via StaticPool so that rows
# written by fixture sessions are visible to sessions created by HTTP handlers.
_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture()
async def engine():
    eng = create_async_engine(
        _TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def db(engine):
    """A session for test setup (creating users, nets, etc.)."""
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture()
async def client(engine):
    """An AsyncClient whose requests hit the real ASGI app with an overridden DB."""
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User helpers
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def owner(db):
    user = User(email="owner@test.com", callsign="KC1OWN", role=UserRole.USER, is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def other(db):
    user = User(email="other@test.com", callsign="KC1OTH", role=UserRole.USER, is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def admin(db):
    user = User(email="admin@test.com", callsign="KC1ADM", role=UserRole.ADMIN, is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def auth_headers(user: User) -> dict:
    """Return Authorization headers for the given user."""
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}
