"""
Off-net log (routers/off_net_log.py), added 2026-10-22 for the WSSM SET.

A station's activity away from the net (a check-in to the Maine ARES Net, a
call on DMR TG 3123, a Winlink message sent to another county) logged as an
ICS-309 row. Staff entries count at once; a station's own entry waits for
net control. Guests never see any of it.
"""
from app.models import CheckIn, Net, NetRole, NetStatus
from tests.conftest import auth_headers

ENTRY = {
    "occurred_at": "2026-10-24T14:05:00Z",
    "to_station": "Maine ARES Net",
    "channel": "3.940 LSB",
    "message": "Checked in for Cumberland County",
}


async def _net(db, owner, status=NetStatus.ACTIVE) -> Net:
    net = Net(name="SET", owner_id=owner.id, status=status)
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net


async def _check_in(db, net, user, callsign):
    db.add(CheckIn(net_id=net.id, user_id=user.id, callsign=callsign, name="Test", location="Gray, ME"))
    await db.commit()


def _url(net, suffix=""):
    return f"/api/nets/{net.id}/off-net-log{suffix}"


async def test_staff_entry_is_accepted_and_names_any_station(client, db, owner):
    net = await _net(db, owner)
    r = await client.post(_url(net), json={**ENTRY, "from_station": "w1pine"}, headers=auth_headers(owner))
    assert r.status_code == 201
    assert r.json()["status"] == "accepted"
    assert r.json()["from_station"] == "W1PINE"


async def test_station_must_be_checked_in(client, db, owner, other):
    net = await _net(db, owner)
    r = await client.post(_url(net), json=ENTRY, headers=auth_headers(other))
    assert r.status_code == 403


async def test_station_entry_is_pending_and_uses_its_own_callsign(client, db, owner, other):
    net = await _net(db, owner)
    await _check_in(db, net, other, "KC1OTH")
    r = await client.post(_url(net), json={**ENTRY, "from_station": "W1FAKE"}, headers=auth_headers(other))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    assert body["from_station"] == "KC1OTH"
    assert body["can_edit"] is True


async def test_pending_entry_stays_off_the_ics309_until_accepted(client, db, owner, other):
    net = await _net(db, owner)
    await _check_in(db, net, other, "KC1OTH")
    entry_id = (await client.post(_url(net), json=ENTRY, headers=auth_headers(other))).json()["id"]

    def off_net_rows(resp):
        return [e for e in resp.json()["entries"] if e["message"].startswith("Off-net")]

    export = f"/api/nets/{net.id}/export/ics309"
    r = await client.get(export, params={"format": "json"}, headers=auth_headers(owner))
    assert off_net_rows(r) == []

    r = await client.post(_url(net, f"/{entry_id}/review"), json={"status": "accepted"}, headers=auth_headers(owner))
    assert r.status_code == 200
    r = await client.get(export, params={"format": "json"}, headers=auth_headers(owner))
    rows = off_net_rows(r)
    assert len(rows) == 1
    assert rows[0]["from_station"] == "KC1OTH"
    assert rows[0]["to_station"] == "Maine ARES Net"
    assert rows[0]["message"] == "Off-net via 3.940 LSB: Checked in for Cumberland County"


async def test_guest_ics309_has_no_off_net_rows(client, db, owner):
    net = await _net(db, owner)
    await client.post(_url(net), json={**ENTRY, "from_station": "W1PINE"}, headers=auth_headers(owner))
    r = await client.get(f"/api/nets/{net.id}/export/ics309", params={"format": "json"})
    assert r.status_code == 200
    assert not any(e["message"].startswith("Off-net") for e in r.json()["entries"])
    r = await client.get(_url(net))
    assert r.status_code in (401, 403)


async def test_relay_entry_counts_at_once(client, db, owner, other):
    net = await _net(db, owner)
    db.add(NetRole(net_id=net.id, user_id=other.id, role="RELAY", is_active=True))
    await db.commit()
    r = await client.post(_url(net), json={**ENTRY, "from_station": "W1PINE"}, headers=auth_headers(other))
    assert r.json()["status"] == "accepted"
    # Relay logs, but doesn't review.
    assert r.json()["can_review"] is False


async def test_station_sees_its_own_pending_entry(client, db, owner, other):
    net = await _net(db, owner)
    await _check_in(db, net, other, "KC1OTH")
    await client.post(_url(net), json=ENTRY, headers=auth_headers(other))
    r = await client.get(_url(net), headers=auth_headers(other))
    assert r.json()["pending_count"] == 1
    assert r.json()["can_review"] is False
    assert r.json()["adds_accepted"] is False


async def test_winlink_message_id_and_review_rules(client, db, owner, other):
    net = await _net(db, owner)
    await _check_in(db, net, other, "KC1OTH")
    payload = {**ENTRY, "to_station": "York County EMA", "channel": "Winlink",
               "message": "Sent shelter status", "message_id": "8F3K2LQ7XN1P"}
    entry_id = (await client.post(_url(net), json=payload, headers=auth_headers(other))).json()["id"]

    # A station can't review, even its own entry.
    r = await client.post(_url(net, f"/{entry_id}/review"), json={"status": "accepted"}, headers=auth_headers(other))
    assert r.status_code == 403

    r = await client.post(_url(net, "/accept-pending"), headers=auth_headers(owner))
    assert r.json() == {"accepted": 1}

    # Once accepted, the station can no longer change it.
    r = await client.put(_url(net, f"/{entry_id}"), json=payload, headers=auth_headers(other))
    assert r.status_code == 403

    r = await client.get(f"/api/nets/{net.id}/export/ics309", params={"format": "json"}, headers=auth_headers(owner))
    rows = [e for e in r.json()["entries"] if e["message"].startswith("Off-net")]
    assert rows[0]["message"] == "Off-net via Winlink: Sent shelter status (msg ID 8F3K2LQ7XN1P)"


async def test_draft_net_refuses_entries(client, db, owner):
    net = await _net(db, owner, status=NetStatus.DRAFT)
    r = await client.post(_url(net), json={**ENTRY, "from_station": "W1PINE"}, headers=auth_headers(owner))
    assert r.status_code == 400


async def test_time_with_an_offset_is_stored_as_utc(client, db, owner):
    net = await _net(db, owner)
    r = await client.post(_url(net), json={**ENTRY, "from_station": "W1PINE", "occurred_at": "2026-10-24T10:05:00-04:00"},
                          headers=auth_headers(owner))
    entry_id = r.json()["id"]
    r = await client.get(_url(net), headers=auth_headers(owner))
    stored = next(e for e in r.json()["entries"] if e["id"] == entry_id)
    assert stored["occurred_at"].startswith("2026-10-24T14:05:00")
