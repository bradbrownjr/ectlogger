"""
Net lifecycle smoke tests: create → active → close, plus 403 permission checks.
"""
import pytest
from tests.conftest import auth_headers


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_net(client, owner):
    resp = await client.post(
        "/api/nets/",
        json={"name": "Test Net"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Net"
    assert data["status"] == "draft"
    assert data["owner_id"] == owner.id


@pytest.mark.asyncio
async def test_list_nets(client, owner):
    await client.post("/api/nets/", json={"name": "Net A"}, headers=auth_headers(owner))
    await client.post("/api/nets/", json={"name": "Net B"}, headers=auth_headers(owner))
    resp = await client.get("/api/nets/", headers=auth_headers(owner))
    assert resp.status_code == 200
    names = [n["name"] for n in resp.json()]
    assert "Net A" in names
    assert "Net B" in names


@pytest.mark.asyncio
async def test_get_net_by_id(client, owner):
    create = await client.post("/api/nets/", json={"name": "Specific Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["id"] == net_id


@pytest.mark.asyncio
async def test_start_net_goes_active(client, owner):
    # No scheduled_start_time → goes straight to ACTIVE
    create = await client.post("/api/nets/", json={"name": "Live Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    resp = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_close_active_net(client, owner):
    create = await client.post("/api/nets/", json={"name": "Closing Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"


@pytest.mark.asyncio
async def test_full_lifecycle_draft_to_lobby_to_active_to_closed(client, owner):
    from datetime import datetime, timedelta, timezone

    # Create with a future scheduled time so /start goes to LOBBY
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    create = await client.post(
        "/api/nets/",
        json={"name": "Scheduled Net", "scheduled_start_time": future},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]
    assert create.json()["status"] == "draft"

    # /start → LOBBY
    start = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    assert start.status_code == 200
    assert start.json()["status"] == "lobby"

    # /go-live → ACTIVE
    live = await client.post(f"/api/nets/{net_id}/go-live", headers=auth_headers(owner))
    assert live.status_code == 200
    assert live.json()["status"] == "active"

    # /close → CLOSED
    close = await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))
    assert close.status_code == 200
    assert close.json()["status"] == "closed"


# ---------------------------------------------------------------------------
# Permission checks
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_non_owner_cannot_start_net(client, owner, other):
    create = await client.post("/api/nets/", json={"name": "Protected Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    resp = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(other))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_non_owner_cannot_close_net(client, owner, other):
    create = await client.post("/api/nets/", json={"name": "Owned Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(other))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_close_any_net(client, owner, admin):
    create = await client.post("/api/nets/", json={"name": "Admin Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(admin))
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Logger-role active-frequency permission (regression: these two endpoints
# checked required_roles=["NCS", "Logger"], but the only place a Logger role
# is ever actually assigned (RoleAssignmentDialog.tsx) stores it as "LOGGER"
# — the title-case check never matched a real Logger user. Found during a
# full functional-test pass across NCS/Logger/standard-user/guest roles.)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_logger_role_can_set_active_frequency(client, db, owner, other):
    from app.models import Frequency, NetRole, net_frequencies

    create = await client.post("/api/nets/", json={"name": "Logger Freq Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))

    freq = Frequency(frequency="146.520", mode="FM", description="Test")
    db.add(freq)
    await db.flush()
    await db.execute(net_frequencies.insert().values(net_id=net_id, frequency_id=freq.id))
    db.add(NetRole(net_id=net_id, user_id=other.id, role="LOGGER"))
    await db.commit()

    resp = await client.put(f"/api/nets/{net_id}/active-frequency/{freq.id}", headers=auth_headers(other))
    assert resp.status_code == 200
    assert resp.json()["active_frequency_id"] == freq.id

    resp2 = await client.delete(f"/api/nets/{net_id}/active-frequency", headers=auth_headers(other))
    assert resp2.status_code == 200
    assert resp2.json()["active_frequency_id"] is None
