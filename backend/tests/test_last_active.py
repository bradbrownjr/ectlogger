"""
`last_active` bookkeeping: it must mean "this operator was using ECTLogger",
not "this operator has a browser tab open somewhere".

Regression context: the navbar's traffic-inbox badge polls every 60s from
every page, and every authenticated request stamped `last_active`. One user
therefore showed as active-within-a-minute continuously from the day they
registered -- a tab left open, not a person at the keyboard. That timestamp
orders the admin user list and gates whether production is safe to restart,
so a poll must not refresh it. See app/dependencies.py.
"""
import pytest
from sqlalchemy import select

from app.dependencies import BACKGROUND_REQUEST_HEADER
from app.models import User
from tests.conftest import auth_headers


async def _last_active(db, user_id: int):
    """Read the column directly rather than through the ORM object: the app
    commits on its own session, and touching an expired attribute on this
    session's User would trigger a lazy load in async context."""
    result = await db.execute(select(User.last_active).where(User.id == user_id))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_ordinary_request_stamps_last_active(client, db, owner):
    """A request the operator caused still counts as activity."""
    assert await _last_active(db, owner.id) is None

    resp = await client.get("/api/traffic/inbox", headers=auth_headers(owner))
    assert resp.status_code == 200

    assert await _last_active(db, owner.id) is not None


@pytest.mark.asyncio
async def test_background_poll_does_not_stamp_last_active(client, db, owner):
    """The same endpoint, marked as an automatic poll, must not count."""
    headers = {**auth_headers(owner), BACKGROUND_REQUEST_HEADER: "1"}

    resp = await client.get("/api/traffic/inbox", headers=headers)
    assert resp.status_code == 200

    assert await _last_active(db, owner.id) is None


@pytest.mark.asyncio
async def test_background_poll_does_not_refresh_an_existing_timestamp(client, db, owner):
    """A tab polling all night must not keep an old timestamp looking fresh --
    this is the exact behavior that made one user permanently 'active'."""
    await client.get("/api/traffic/inbox", headers=auth_headers(owner))
    stamped = await _last_active(db, owner.id)
    assert stamped is not None

    for _ in range(5):
        resp = await client.get(
            "/api/traffic/inbox",
            headers={**auth_headers(owner), BACKGROUND_REQUEST_HEADER: "1"},
        )
        assert resp.status_code == 200

    assert await _last_active(db, owner.id) == stamped


@pytest.mark.asyncio
async def test_background_marker_does_not_affect_authorization(client, db, owner):
    """The header is activity bookkeeping only. It must never let an
    unauthenticated or badly-authenticated caller through."""
    resp = await client.get(
        "/api/traffic/inbox", headers={BACKGROUND_REQUEST_HEADER: "1"}
    )
    assert resp.status_code in (401, 403)

    resp = await client.get(
        "/api/traffic/inbox",
        headers={"Authorization": "Bearer bad.token.here", BACKGROUND_REQUEST_HEADER: "1"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_only_the_exact_marker_value_counts(client, db, owner):
    """Anything other than the documented '1' is treated as a normal request,
    so a stray or malformed header can't silently hide real activity."""
    resp = await client.get(
        "/api/traffic/inbox",
        headers={**auth_headers(owner), BACKGROUND_REQUEST_HEADER: "true"},
    )
    assert resp.status_code == 200

    assert await _last_active(db, owner.id) is not None
