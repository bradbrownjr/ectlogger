"""
A station edits its own check-in (routers/check_ins.py::update_check_in),
from the pencil on its row and the toolbar's Edit check-in
(frontend EditOwnCheckInDialog).

Ken N1KWG, 2026-10-29: members who forgot the FLDIGI box at check-in had no
way to tick it afterwards, since the app only let them change their status.
"""
import pytest

from tests.conftest import auth_headers


async def _live_net(client, owner):
    create = await client.post("/api/nets/", json={"name": "Own Edit Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    return net_id


async def _self_check_in(client, user, net_id, callsign):
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": callsign},
        headers=auth_headers(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_station_fixes_its_own_custom_field_and_callsign(client, owner, other):
    net_id = await _live_net(client, owner)
    row = await _self_check_in(client, other, net_id, other.callsign)

    resp = await client.put(
        f"/api/check-ins/check-ins/{row['id']}",
        json={"custom_fields": {"fldigi": "true"}, "callsign": f"{other.callsign}/P"},
        headers=auth_headers(other),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["custom_fields"] == {"fldigi": "true"}
    assert body["callsign"] == f"{other.callsign}/P"
    # A new callsign typed on your own row keeps the row on your account.
    assert body["user_id"] == other.id


@pytest.mark.asyncio
async def test_station_cannot_edit_someone_elses_check_in(client, owner, other):
    net_id = await _live_net(client, owner)
    # Starting the net checked its manager in.
    rows = (await client.get(f"/api/check-ins/nets/{net_id}/check-ins", headers=auth_headers(owner))).json()
    row = next(r for r in rows if r["user_id"] == owner.id)

    resp = await client.put(
        f"/api/check-ins/check-ins/{row['id']}",
        json={"custom_fields": {"fldigi": "true"}},
        headers=auth_headers(other),
    )
    assert resp.status_code == 403
