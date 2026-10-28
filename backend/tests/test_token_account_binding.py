"""
A sign-in token opens only the account it was issued to
(app/auth.py::token_issued_to, dependencies.py::user_from_token_payload).

A token carries just the account id, and SQLite gives a freed id to the
next new account when the highest one is deleted or merged away. A browser
still signed in to the old account must not open the new one.
"""
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.auth import token_issued_to, verify_token
from app.config import settings
from app.models import User, UserRole
from app.session_config import DEFAULT_SESSION_LIFETIME_DAYS
from tests.conftest import auth_headers


def _bearer(payload: dict) -> dict:
    return {"Authorization": f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"}


def _legacy_token(user_id: int, issued: datetime) -> dict:
    """A token from before iat was added: sub and exp only."""
    exp = issued + timedelta(days=DEFAULT_SESSION_LIFETIME_DAYS)
    return _bearer({"sub": str(user_id), "exp": int(exp.timestamp())})


@pytest.mark.asyncio
async def test_a_freed_id_does_not_open_the_next_account(client, db):
    now = datetime.now(timezone.utc)
    old = User(email="old@example.com", callsign="KC1OLD", role=UserRole.USER, is_active=True,
               created_at=now - timedelta(days=30))
    db.add(old)
    await db.commit()
    old_id = old.id
    # Signed in a little while before the account below is made.
    headers = _bearer({"sub": str(old_id), "iat": int(now.timestamp()) - 10,
                       "exp": int((now + timedelta(days=1)).timestamp())})
    assert (await client.get("/api/users/me", headers=headers)).status_code == 200

    # The account goes and a new one is given the same id.
    await db.delete(old)
    await db.commit()
    new = User(id=old_id, email="new@example.com", role=UserRole.USER, is_active=True)
    db.add(new)
    await db.commit()

    assert (await client.get("/api/users/me", headers=headers)).status_code == 401
    assert (await client.get("/api/users/me", headers=auth_headers(new))).json()["email"] == "new@example.com"


@pytest.mark.asyncio
async def test_a_token_from_before_iat_still_works_and_is_replaced(client, db, owner):
    issued = datetime.now(timezone.utc) + timedelta(seconds=5)  # after the account was made
    resp = await client.get("/api/users/me", headers=_legacy_token(owner.id, issued))
    assert resp.status_code == 200
    renewed = verify_token(resp.headers["X-New-Token"])
    assert renewed["sub"] == str(owner.id) and renewed["iat"]


@pytest.mark.asyncio
async def test_a_token_from_before_iat_older_than_the_account_is_refused(client, db, owner):
    issued = datetime.now(timezone.utc) - timedelta(days=3)
    assert (await client.get("/api/users/me", headers=_legacy_token(owner.id, issued))).status_code == 401


def test_issued_in_the_same_second_as_the_account_counts():
    created = datetime(2026, 10, 28, 12, 0, 0)  # stored to the second, naive UTC
    user = User(created_at=created)
    at = int(created.replace(tzinfo=timezone.utc).timestamp())
    assert token_issued_to({"iat": at}, user, 90)
    assert not token_issued_to({"iat": at - 1}, user, 90)
    assert not token_issued_to({"sub": "1"}, user, 90)  # neither iat nor exp
