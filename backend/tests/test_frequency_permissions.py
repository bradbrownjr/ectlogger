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


# ---------------------------------------------------------------------------
# The person who added a frequency may fix or remove it (2026-10-22), as long
# as no other net, schedule or check-in uses it. The form's own net or
# schedule (net_id / template_id) doesn't count as "other".
# ---------------------------------------------------------------------------

async def _attach_net(db, freq, owner_id, **kwargs) -> Net:
    net = Net(name=kwargs.pop("name", "Net"), owner_id=owner_id, **kwargs)
    db.add(net)
    await db.flush()
    await db.execute(insert(net_frequencies).values(net_id=net.id, frequency_id=freq.id))
    await db.commit()
    return net


async def test_create_records_who_added_it(client, db, owner):
    r = await client.post("/api/frequencies", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 201
    assert r.json()["edit_refused"] is None and r.json()["delete_refused"] is None
    freq = await db.get(Frequency, r.json()["id"])
    assert freq.created_by_id == owner.id


async def test_creator_can_edit_and_delete_unused(client, db, owner):
    freq = await _freq(db, created_by_id=owner.id)
    r = await client.put(f"/api/frequencies/{freq.id}", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 200
    r = await client.delete(f"/api/frequencies/{freq.id}", headers=auth_headers(owner))
    assert r.status_code == 204


async def test_someone_else_cannot_edit_a_creators_frequency(client, db, owner, other):
    freq = await _freq(db, created_by_id=owner.id)
    r = await client.put(f"/api/frequencies/{freq.id}", json=PAYLOAD, headers=auth_headers(other))
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "frequency_change_refused"


async def test_creator_can_edit_on_their_own_net(client, db, owner):
    freq = await _freq(db, created_by_id=owner.id)
    net = await _attach_net(db, freq, owner.id)
    # Without the form's net it counts as in use...
    r = await client.put(f"/api/frequencies/{freq.id}", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 403
    # ...from that net's own form it doesn't.
    r = await client.put(f"/api/frequencies/{freq.id}?net_id={net.id}", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 200
    r = await client.delete(f"/api/frequencies/{freq.id}?net_id={net.id}", headers=auth_headers(owner))
    assert r.status_code == 204


async def test_creator_cannot_edit_once_another_net_uses_it(client, db, owner, other):
    freq = await _freq(db, created_by_id=owner.id)
    mine = await _attach_net(db, freq, owner.id)
    await _attach_net(db, freq, other.id, name="Other club")
    r = await client.put(f"/api/frequencies/{freq.id}?net_id={mine.id}", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 403
    assert "1 other net" in r.json()["detail"]["message"]


async def test_naming_someone_elses_net_does_not_excuse_it(client, db, owner, other):
    freq = await _freq(db, created_by_id=owner.id)
    theirs = await _attach_net(db, freq, other.id)
    r = await client.put(f"/api/frequencies/{freq.id}?net_id={theirs.id}", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 403


async def test_check_ins_on_it_refuse_even_on_own_net(client, db, owner):
    freq = await _freq(db, created_by_id=owner.id)
    net = await _attach_net(db, freq, owner.id)
    db.add(CheckIn(net_id=net.id, callsign="W1PINE", name="Alex Reed", location="Bridgton, ME", frequency_id=freq.id))
    await db.commit()
    r = await client.put(f"/api/frequencies/{freq.id}?net_id={net.id}", json=PAYLOAD, headers=auth_headers(owner))
    assert r.status_code == 403
    assert "1 check-in" in r.json()["detail"]["message"]


async def test_list_reports_refusals_for_the_form(client, db, owner, other):
    mine = await _freq(db, frequency="146.520", created_by_id=owner.id)
    theirs = await _freq(db, frequency="147.090", created_by_id=other.id)
    net = await _attach_net(db, mine, owner.id)
    r = await client.get(f"/api/frequencies?net_id={net.id}", headers=auth_headers(owner))
    rows = {row["id"]: row for row in r.json()}
    assert rows[mine.id]["edit_refused"] is None
    assert rows[theirs.id]["edit_refused"]
    r = await client.get("/api/frequencies")  # signed out
    assert all(row["edit_refused"] for row in r.json())


async def test_change_request_only_when_refused(client, db, owner, other, admin, monkeypatch):
    sent = []

    async def fake_send(**kwargs):
        sent.append(kwargs)

    from app.email_service import EmailService
    monkeypatch.setattr(EmailService, "send_frequency_change_request", staticmethod(fake_send))

    freq = await _freq(db, created_by_id=owner.id)
    body = {"action": "edit", "proposed": PAYLOAD, "note": "Wrong mode"}
    # The creator can do it themselves.
    r = await client.post(f"/api/frequencies/{freq.id}/change-request", json=body, headers=auth_headers(owner))
    assert r.status_code == 400
    # Someone else asks the admins.
    r = await client.post(f"/api/frequencies/{freq.id}/change-request", json=body, headers=auth_headers(other))
    assert r.status_code == 200
    assert [s["to_email"] for s in sent] == [admin.email]
    assert sent[0]["proposed"].startswith("146.940 FM")
    # An edit request must say what to change it to.
    r = await client.post(f"/api/frequencies/{freq.id}/change-request", json={"action": "edit"}, headers=auth_headers(other))
    assert r.status_code == 422
