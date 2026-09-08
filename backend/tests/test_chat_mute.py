"""
Personal chat mute behavior.

Scoped to the personal-mute half of the "Chat Moderation" roadmap item only --
a viewer hiding one station's messages from their own view of one net. Rules
worth guarding here:

- a mute is per-viewer and per-net: muting a station doesn't affect what
  anyone else sees, and doesn't carry over to a different net;
- you cannot mute yourself;
- muting is idempotent, and unmuting a station you never muted is a no-op,
  not an error;
- listing mutes returns the muted station's current callsign, not just an id,
  so the client never needs a second lookup to render an unmute list.
"""
import pytest

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_mute_then_list_shows_muted_callsign(client, owner, other):
    net = await client.post("/api/nets/", json={"name": "Mute Test Net"}, headers=auth_headers(owner))
    net_id = net.json()["id"]

    resp = await client.post(
        f"/api/chat/nets/{net_id}/mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json() == {
        "muted_user_id": other.id,
        "callsign": other.callsign,
        "created_at": resp.json()["created_at"],
    }

    listed = await client.get(f"/api/chat/nets/{net_id}/mutes", headers=auth_headers(owner))
    assert listed.status_code == 200
    assert [m["muted_user_id"] for m in listed.json()] == [other.id]


@pytest.mark.asyncio
async def test_mute_is_per_viewer(client, owner, other, admin):
    net = await client.post("/api/nets/", json={"name": "Mute Test Net"}, headers=auth_headers(owner))
    net_id = net.json()["id"]

    await client.post(
        f"/api/chat/nets/{net_id}/mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )

    # A different viewer's mute list is untouched by owner's mute.
    admin_mutes = await client.get(f"/api/chat/nets/{net_id}/mutes", headers=auth_headers(admin))
    assert admin_mutes.json() == []


@pytest.mark.asyncio
async def test_mute_is_per_net(client, owner, other):
    net_a = await client.post("/api/nets/", json={"name": "Net A"}, headers=auth_headers(owner))
    net_b = await client.post("/api/nets/", json={"name": "Net B"}, headers=auth_headers(owner))

    await client.post(
        f"/api/chat/nets/{net_a.json()['id']}/mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )

    net_b_mutes = await client.get(f"/api/chat/nets/{net_b.json()['id']}/mutes", headers=auth_headers(owner))
    assert net_b_mutes.json() == []


@pytest.mark.asyncio
async def test_cannot_mute_self(client, owner):
    net = await client.post("/api/nets/", json={"name": "Mute Test Net"}, headers=auth_headers(owner))
    net_id = net.json()["id"]

    resp = await client.post(
        f"/api/chat/nets/{net_id}/mutes",
        json={"muted_user_id": owner.id},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_muting_twice_is_idempotent(client, owner, other):
    net = await client.post("/api/nets/", json={"name": "Mute Test Net"}, headers=auth_headers(owner))
    net_id = net.json()["id"]

    for _ in range(2):
        resp = await client.post(
            f"/api/chat/nets/{net_id}/mutes",
            json={"muted_user_id": other.id},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 201

    listed = await client.get(f"/api/chat/nets/{net_id}/mutes", headers=auth_headers(owner))
    assert len(listed.json()) == 1


@pytest.mark.asyncio
async def test_unmute_removes_it_and_is_a_no_op_when_absent(client, owner, other):
    net = await client.post("/api/nets/", json={"name": "Mute Test Net"}, headers=auth_headers(owner))
    net_id = net.json()["id"]

    await client.post(
        f"/api/chat/nets/{net_id}/mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )

    resp = await client.delete(f"/api/chat/nets/{net_id}/mutes/{other.id}", headers=auth_headers(owner))
    assert resp.status_code == 204

    listed = await client.get(f"/api/chat/nets/{net_id}/mutes", headers=auth_headers(owner))
    assert listed.json() == []

    # Unmuting again (already gone) is still a no-op success, not an error.
    resp2 = await client.delete(f"/api/chat/nets/{net_id}/mutes/{other.id}", headers=auth_headers(owner))
    assert resp2.status_code == 204


@pytest.mark.asyncio
async def test_mute_unknown_user_404s(client, owner):
    net = await client.post("/api/nets/", json={"name": "Mute Test Net"}, headers=auth_headers(owner))
    net_id = net.json()["id"]

    resp = await client.post(
        f"/api/chat/nets/{net_id}/mutes",
        json={"muted_user_id": 999999},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 404
