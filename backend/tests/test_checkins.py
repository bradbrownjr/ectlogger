"""
Check-in smoke tests: first check-in, recheck deduplication, and gate checks.
"""
import pytest
from tests.conftest import auth_headers

_CALLSIGN = "W1TEST"


async def _active_net(client, owner):
    """Helper: create and start a net, return its id."""
    create = await client.post(
        "/api/nets/",
        json={"name": "Check-in Test Net"},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    return net_id


@pytest.mark.asyncio
async def test_check_in_to_active_net(client, owner):
    net_id = await _active_net(client, owner)
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": _CALLSIGN},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["callsign"] == _CALLSIGN
    assert data["is_recheck"] is False


@pytest.mark.asyncio
async def test_recheck_creates_child_row_not_duplicate(client, owner):
    """A second check-in for the same callsign must be marked is_recheck=True
    and point back to the original root via parent_check_in_id."""
    net_id = await _active_net(client, owner)

    first = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": _CALLSIGN},
        headers=auth_headers(owner),
    )
    root_id = first.json()["id"]

    second = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": _CALLSIGN, "location": "Updated Location"},
        headers=auth_headers(owner),
    )
    assert second.status_code == 201
    data = second.json()
    assert data["is_recheck"] is True
    assert data["parent_check_in_id"] == root_id

    # Listing check-ins returns both rows (root + recheck)
    listing = await client.get(
        f"/api/check-ins/nets/{net_id}/check-ins",
        headers=auth_headers(owner),
    )
    all_callsigns = [c["callsign"] for c in listing.json()]
    # There are at least 2 rows for W1TEST (root + recheck);
    # the NCS auto-check-in from /start is also present.
    assert all_callsigns.count(_CALLSIGN) == 2


@pytest.mark.asyncio
async def test_cannot_check_in_to_draft_net(client, owner):
    create = await client.post(
        "/api/nets/",
        json={"name": "Draft Net"},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": _CALLSIGN},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_cannot_check_in_unauthenticated(client, owner):
    net_id = await _active_net(client, owner)
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": _CALLSIGN},
    )
    assert resp.status_code in (401, 403)
