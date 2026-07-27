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
async def test_duplicate_check_in_while_still_active_is_rejected(client, owner):
    """Checking in a callsign that is already checked in (self or NCS/logger
    re-adding them) must be rejected instead of creating a second live row —
    a recheck only makes sense once the station has checked out."""
    net_id = await _active_net(client, owner)

    first = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": _CALLSIGN},
        headers=auth_headers(owner),
    )
    assert first.status_code == 201

    second = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": _CALLSIGN, "location": "Updated Location"},
        headers=auth_headers(owner),
    )
    assert second.status_code == 400
    assert _CALLSIGN in second.json()["detail"]

    # No second row was created
    listing = await client.get(
        f"/api/check-ins/nets/{net_id}/check-ins",
        headers=auth_headers(owner),
    )
    all_callsigns = [c["callsign"] for c in listing.json()]
    assert all_callsigns.count(_CALLSIGN) == 1


@pytest.mark.asyncio
async def test_recheck_creates_child_row_not_duplicate(client, owner):
    """A check-in for a callsign that has since checked out must be marked
    is_recheck=True and point back to the original root via parent_check_in_id."""
    net_id = await _active_net(client, owner)

    first = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": _CALLSIGN},
        headers=auth_headers(owner),
    )
    root_id = first.json()["id"]

    checkout = await client.put(
        f"/api/check-ins/check-ins/{root_id}",
        json={"status": "checked_out"},
        headers=auth_headers(owner),
    )
    assert checkout.status_code == 200

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


# ---------------------------------------------------------------------------
# Check-in update permission (regression: PUT /check-ins/{id} had no
# permission check at all — any authenticated user could edit any other
# station's check-in, found during a full functional-test pass across roles)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_net_owner_can_edit_others_check_in(client, owner, other):
    net_id = await _active_net(client, owner)
    # `other` checks in under their own callsign so the row links to their user_id
    check_in = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": other.callsign},
        headers=auth_headers(other),
    )
    check_in_id = check_in.json()["id"]

    # The net owner is always authorized to edit any check-in on their net,
    # even though it isn't their own row.
    resp = await client.put(
        f"/api/check-ins/check-ins/{check_in_id}",
        json={"notes": "logged by NCS"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_bystander_with_no_role_cannot_edit_others_check_in(client, db, owner, other):
    """A third user who is neither the net owner, NCS/Logger, nor the
    check-in's own user must be rejected."""
    from app.models import User, UserRole

    bystander = User(email="bystander@test.com", callsign="KC1BYS", role=UserRole.USER, is_active=True)
    db.add(bystander)
    await db.commit()
    await db.refresh(bystander)

    net_id = await _active_net(client, owner)
    check_in = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": other.callsign},
        headers=auth_headers(other),
    )
    check_in_id = check_in.json()["id"]

    resp = await client.put(
        f"/api/check-ins/check-ins/{check_in_id}",
        json={"notes": "should not be allowed"},
        headers=auth_headers(bystander),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_own_check_in_editable_by_self(client, owner, other):
    net_id = await _active_net(client, owner)
    check_in = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": other.callsign},
        headers=auth_headers(other),
    )
    check_in_id = check_in.json()["id"]

    resp = await client.put(
        f"/api/check-ins/check-ins/{check_in_id}",
        json={"notes": "editing my own check-in"},
        headers=auth_headers(other),
    )
    assert resp.status_code == 200
    assert resp.json()["notes"] == "editing my own check-in"
