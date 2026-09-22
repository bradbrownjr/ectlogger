"""
Regression test for the DATABASE_URL double-driver bug (roadmap 0.10, found
2026-09-18).

normalize_database_url() used to be a plain string .replace("sqlite:///",
"sqlite+aiosqlite:///") with no guard, and "sqlite:///" is a substring of
"sqlite+aiosqlite:///" -- so a DATABASE_URL that already named the async
driver got it inserted a second time ("sqlite+aiosqlite+aiosqlite:///..."),
which SQLAlchemy's dialect loader rejects and the app fails to start.
"""
import pytest

from app.database import normalize_database_url


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("sqlite:///./ectlogger.db", "sqlite+aiosqlite:///./ectlogger.db"),
        ("sqlite:///:memory:", "sqlite+aiosqlite:///:memory:"),
        # Already-async form must pass through unchanged, not double up.
        ("sqlite+aiosqlite:///./ectlogger.db", "sqlite+aiosqlite:///./ectlogger.db"),
        ("sqlite+aiosqlite:///:memory:", "sqlite+aiosqlite:///:memory:"),
        ("postgresql://u:p@host/db", "postgresql+asyncpg://u:p@host/db"),
        ("postgresql+asyncpg://u:p@host/db", "postgresql+asyncpg://u:p@host/db"),
        ("mysql://u:p@host/db", "mysql+aiomysql://u:p@host/db"),
        ("mysql+aiomysql://u:p@host/db", "mysql+aiomysql://u:p@host/db"),
    ],
)
def test_normalize_database_url(raw, expected):
    assert normalize_database_url(raw) == expected
