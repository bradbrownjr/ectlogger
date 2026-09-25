"""
Regression tests for shared-frequency edit/delete, fixed 2026-09-25.

Frequencies are one list shared by every net and schedule. PUT and DELETE
/frequencies/{id} only required a signed-in user, and the net/schedule forms
offered edit and delete buttons to everyone, so any operator could rename or
remove another club's repeater. A delete also cascaded through
net_frequencies/net_template_frequencies, silently dropping the frequency
from every net and schedule, and left check-ins pointing at a deleted row.
"""
from sqlalchemy import insert

from app.models import CheckIn, Frequency, Net, NetTemplate, net_frequencies, net_template_frequencies
from tests.conftest import auth_headers

PAYLOAD = {"frequency": "146.940", "mode": "FM", "description": "Renamed"}


async def _freq(db, **kwargs) -> Frequency:
    freq = Frequency(frequency=kwargs.pop("frequency", "146.520"), mode=kwargs.pop("mode", "FM"), **kwargs)
    db.add(freq)
    await db.commit()
    await db.refresh(freq)
    return freq


async def test_non_admin_cannot_edit_or_delete(client, db, owner):
    freq = await _freq(db)
    r = await client.put(f"/api/frequencies/{freq.id}", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 403
    r = await client.delete(f"/api/frequencies/{freq.id}", headers=auth_headers(owner))
    assert r.status_code == 403


async def test_non_admin_can_still_create(client, owner):
    r = await client.post("/api/frequencies", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 201


async def test_admin_can_edit_and_delete_unused(client, db, admin):
    freq = await _freq(db)
    r = await client.put(f"/api/frequencies/{freq.id}", json=PAYLOAD, headers=auth_headers(admin))
    assert r.status_code == 200
    r = await client.delete(f"/api/frequencies/{freq.id}", headers=auth_headers(admin))
    assert r.status_code == 204


async def test_delete_refused_while_a_net_uses_it(client, db, admin, owner):
    freq = await _freq(db)
    net = Net(name="Net", owner_id=owner.id)
    db.add(net)
    await db.flush()
    await db.execute(insert(net_frequencies).values(net_id=net.id, frequency_id=freq.id))
    await db.commit()
    r = await client.delete(f"/api/frequencies/{freq.id}", headers=auth_headers(admin))
    assert r.status_code == 409
    assert "1 net" in r.json()["detail"]


async def test_delete_refused_while_a_schedule_uses_it(client, db, admin, owner):
    freq = await _freq(db)
    tpl = NetTemplate(name="Schedule", owner_id=owner.id)
    db.add(tpl)
    await db.flush()
    await db.execute(insert(net_template_frequencies).values(template_id=tpl.id, frequency_id=freq.id))
    await db.commit()
    r = await client.delete(f"/api/frequencies/{freq.id}", headers=auth_headers(admin))
    assert r.status_code == 409
    assert "1 schedule" in r.json()["detail"]


async def test_delete_refused_while_check_ins_reference_it(client, db, admin, owner):
    # The net no longer lists the frequency, but a station logged on it.
    freq = await _freq(db)
    net = Net(name="Net", owner_id=owner.id)
    db.add(net)
    await db.flush()
    db.add(CheckIn(net_id=net.id, callsign="W1PINE", name="Alex Reed", location="Bridgton, ME", frequency_id=freq.id))
    await db.commit()
    r = await client.delete(f"/api/frequencies/{freq.id}", headers=auth_headers(admin))
    assert r.status_code == 409
    assert "1 check-in" in r.json()["detail"]


async def test_admin_usage_list_reports_every_kind_of_use(client, db, admin, owner):
    used = await _freq(db, frequency="146.940")
    unused = await _freq(db, frequency="147.090")
    net = Net(name="Net", owner_id=owner.id, active_frequency_id=used.id)
    db.add(net)
    await db.flush()
    # Listed and active on the same net counts as one net, not two.
    await db.execute(insert(net_frequencies).values(net_id=net.id, frequency_id=used.id))
    tpl = NetTemplate(name="Schedule", owner_id=owner.id)
    db.add(tpl)
    await db.flush()
    await db.execute(insert(net_template_frequencies).values(template_id=tpl.id, frequency_id=used.id))
    db.add(CheckIn(net_id=net.id, callsign="W1PINE", name="Alex Reed", location="Bridgton, ME", frequency_id=used.id))
    await db.commit()

    r = await client.get("/api/frequencies/admin/with-usage", headers=auth_headers(admin))
    assert r.status_code == 200
    rows = {row["id"]: row for row in r.json()}
    assert (rows[used.id]["net_count"], rows[used.id]["schedule_count"], rows[used.id]["check_in_count"]) == (1, 1, 1)
    assert (rows[unused.id]["net_count"], rows[unused.id]["schedule_count"], rows[unused.id]["check_in_count"]) == (0, 0, 0)
