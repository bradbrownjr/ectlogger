"""
The net CSV export is open to anyone, like the ICS-309 and the net report
(opened 2026-09-25; it was net-manager and admin only while the Export
button showed for every viewer). A guest gets the same contact-info
redaction as the public check-in list.
"""
from app.models import CheckIn, Net, NetStatus
from tests.conftest import auth_headers


async def _closed_net(db, owner) -> Net:
    net = Net(name="Closed Net", owner_id=owner.id, status=NetStatus.CLOSED)
    db.add(net)
    await db.flush()
    db.add(CheckIn(net_id=net.id, callsign="W1PINE", name="Alex Reed", location="Bridgton, ME",
                   notes="call me at alex@example.com"))
    await db.commit()
    return net


async def test_a_participant_can_export(client, db, owner, other):
    net = await _closed_net(db, owner)
    r = await client.get(f"/api/nets/{net.id}/export/csv", headers=auth_headers(other))
    assert r.status_code == 200
    assert "alex@example.com" in r.text


async def test_a_guest_can_export_with_contact_details_redacted(client, db, owner):
    net = await _closed_net(db, owner)
    r = await client.get(f"/api/nets/{net.id}/export/csv")
    assert r.status_code == 200
    assert "W1PINE" in r.text
    assert "alex@example.com" not in r.text
