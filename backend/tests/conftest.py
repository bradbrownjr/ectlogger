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
# Without this, any code path that actually sends email (net close, password
# change, magic link) attempts a real SMTP connection with the fake
# credentials above and raises -- tests should never depend on network access.
os.environ.setdefault("EMAIL_ENABLED", "false")
# Point the module-level engine at in-memory SQLite so startup init_db() creates
# tables there and never touches the real dev database.  The test engine below
# (also in-memory, StaticPool) is what endpoints use via get_db override.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
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


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Per-route slowapi limiters (routers/auth.py, routers/feedback.py) keep
    in-memory counters for the life of the process, not per-test -- without
    this, a test file that calls a rate-limited endpoint more than its
    per-minute budget starts getting real 429s from earlier tests' traffic."""
    from app.routers.auth import _limiter as auth_limiter
    from app.routers.feedback import _limiter as feedback_limiter
    auth_limiter.reset()
    feedback_limiter.reset()
    yield


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
    # mfa_enabled=True: get_admin_user requires MFA enrollment on top of the
    # ADMIN role (see app.dependencies.get_admin_user), so an admin fixture
    # used against admin-only endpoints has to already be "enrolled" or every
    # such test would 403 on the MFA gate instead of testing what it means to.
    # test_password_mfa.py covers the un-enrolled-admin case directly.
    user = User(email="admin@test.com", callsign="KC1ADM", role=UserRole.ADMIN, is_active=True, mfa_enabled=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def auth_headers(user: User) -> dict:
    """Return Authorization headers for the given user."""
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}
