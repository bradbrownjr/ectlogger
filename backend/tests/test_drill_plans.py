"""
Drill plans (routers/drill_plans.py): the exercise plan on a net, its
objectives and ratings, and the schedule rows whose prepared ICS-213 is
filed as drill traffic when sent.

The rules pinned here:

- only the net's editors change the plan; net control staff read it and
  send its messages; other stations can't see it
- saving keeps rows by id and never lets a request set or change a sent
  row's form
- sending files a real ICS-213, marked as drill traffic, with the
  exercise marking at the start and end of its text, once
- a removed site takes its rows' site link with it
"""
import pytest
from sqlalchemy import select

from app.models import Form, Net, NetRole, TrafficTestCategory
from app.traffic.definitions import upsert_form_definitions
from app.traffic.exercise import mark_exercise_text
from tests.conftest import auth_headers


async def _net(db, owner):
    net = Net(name="Cumberland SET", owner_id=owner.id, status="active", propagation_logging_enabled=True)
    db.add(net)
    await db.commit()
    return net


MESSAGE = {
    "to_name": "MEMA Operations",
    "from_name": "Naples Shelter Manager",
    "subject": "Request for cots",
    "message": "Shelter at capacity. Request 40 cots.",
    "priority": "Urgent",
    "reply_requested": "Yes",
}


def _plan(**overrides):
    plan = {
        "exercise_name": "2026 Cumberland County SET",
        "exercise_when": "Saturday, October 24, 2026, 0800 to 1200",
        "scenario": "Winter storm, wide power loss.",
        "objectives": [
            {"heading": "H. Cumberland County", "text": "Establish 2m simplex with adjacent counties"},
            {"heading": "H. Cumberland County", "text": "Send and retrieve Winlink traffic"},
        ],
        "events": [
            {"time_label": "08:00", "initiator": "NCS", "receiver": "All", "event_type": "Control",
             "method": "2m simplex", "description": "Net opens"},
            {"time_label": "09:15", "initiator": "Naples Shelter", "receiver": "CCEMA", "event_type": "Message",
             "method": "2m simplex", "description": "Request for support", "message": MESSAGE},
        ],
    }
    plan.update(overrides)
    return plan


@pytest.mark.asyncio
async def test_only_editors_change_the_plan(client, db, owner, other):
    net = await _net(db, owner)
    resp = await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(other))
    assert resp.status_code == 403
    resp = await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["can_edit"] is True
    assert [o["text"] for o in body["objectives"]][1] == "Send and retrieve Winlink traffic"
    assert body["events"][1]["message"]["subject"] == "Request for cots"


@pytest.mark.asyncio
async def test_stations_without_a_role_cant_read_it_but_net_control_can(client, db, owner, other):
    net = await _net(db, owner)
    await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(owner))
    assert (await client.get(f"/api/nets/{net.id}/drill-plan", headers=auth_headers(other))).status_code == 403

    db.add(NetRole(net_id=net.id, user_id=other.id, role="LOGGER", is_active=True))
    await db.commit()
    resp = await client.get(f"/api/nets/{net.id}/drill-plan", headers=auth_headers(other))
    assert resp.status_code == 200
    assert resp.json()["can_edit"] is False
    # A Logger can't change it.
    resp = await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(other))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_no_plan_is_a_404_and_the_net_says_so(client, db, owner):
    net = await _net(db, owner)
    assert (await client.get(f"/api/nets/{net.id}/drill-plan", headers=auth_headers(owner))).status_code == 404
    assert (await client.get(f"/api/nets/{net.id}", headers=auth_headers(owner))).json()["has_drill_plan"] is False
    await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(owner))
    assert (await client.get(f"/api/nets/{net.id}", headers=auth_headers(owner))).json()["has_drill_plan"] is True


@pytest.mark.asyncio
async def test_saving_keeps_rows_by_id_and_drops_the_rest(client, db, owner):
    net = await _net(db, owner)
    first = (await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(owner))).json()
    kept = first["objectives"][1]
    kept["rating"] = "S"
    kept["result_note"] = "Winlink worked only over HF"
    resp = await client.put(
        f"/api/nets/{net.id}/drill-plan",
        json=_plan(objectives=[kept], events=first["events"][1:]),
        headers=auth_headers(owner),
    )
    body = resp.json()
    assert [o["id"] for o in body["objectives"]] == [kept["id"]]
    assert body["objectives"][0]["rating"] == "S"
    assert [e["id"] for e in body["events"]] == [first["events"][1]["id"]]


@pytest.mark.asyncio
async def test_rows_from_another_plan_are_refused(client, db, owner):
    net = await _net(db, owner)
    other_net = await _net(db, owner)
    theirs = (await client.put(f"/api/nets/{other_net.id}/drill-plan", json=_plan(), headers=auth_headers(owner))).json()
    resp = await client.put(
        f"/api/nets/{net.id}/drill-plan", json=_plan(events=theirs["events"]), headers=auth_headers(owner)
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_sending_files_a_marked_drill_ics213_once(client, db, owner):
    await upsert_form_definitions(db)
    net = await _net(db, owner)
    plan = (await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(owner))).json()
    row = plan["events"][1]

    resp = await client.post(
        f"/api/nets/{net.id}/drill-plan/events/{row['id']}/send", json={"handled_by": "KC1HILL"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200, resp.text
    sent = resp.json()
    assert sent["form_status"] == "originated"
    assert sent["sent_at"] is not None

    form = (await db.execute(select(Form).where(Form.id == sent["form_id"]))).scalar_one()
    assert form.form_type == "ICS213"
    assert form.net_id == net.id
    assert form.test_category == TrafficTestCategory.DRILL
    import json
    values = json.loads(form.field_values)
    assert values["incident_name"] == "2026 Cumberland County SET"
    assert values["message"].startswith("THIS IS AN EXERCISE")
    assert values["message"].endswith("THIS IS AN EXERCISE")

    again = await client.post(
        f"/api/nets/{net.id}/drill-plan/events/{row['id']}/send", json={}, headers=auth_headers(owner)
    )
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_a_sent_row_keeps_its_form_and_message_when_saved(client, db, owner):
    await upsert_form_definitions(db)
    net = await _net(db, owner)
    plan = (await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(owner))).json()
    row = plan["events"][1]
    sent = (await client.post(
        f"/api/nets/{net.id}/drill-plan/events/{row['id']}/send", json={}, headers=auth_headers(owner)
    )).json()

    edited = dict(row, form_id=999, message=dict(MESSAGE, subject="Changed after sending"))
    body = (await client.put(
        f"/api/nets/{net.id}/drill-plan", json=_plan(events=[plan["events"][0], edited]), headers=auth_headers(owner)
    )).json()
    assert body["events"][1]["form_id"] == sent["form_id"]
    assert body["events"][1]["message"]["subject"] == "Request for cots"


@pytest.mark.asyncio
async def test_a_row_with_no_message_cant_be_sent(client, db, owner):
    net = await _net(db, owner)
    plan = (await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(), headers=auth_headers(owner))).json()
    resp = await client.post(
        f"/api/nets/{net.id}/drill-plan/events/{plan['events'][0]['id']}/send", json={}, headers=auth_headers(owner)
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_an_incomplete_message_is_refused_when_sent(client, db, owner):
    await upsert_form_definitions(db)
    net = await _net(db, owner)
    events = [{"time_label": "09:00", "message": {"subject": "No addressee yet"}}]
    plan = (await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(events=events), headers=auth_headers(owner))).json()
    resp = await client.post(
        f"/api/nets/{net.id}/drill-plan/events/{plan['events'][0]['id']}/send", json={}, headers=auth_headers(owner)
    )
    assert resp.status_code == 400
    assert "Missing required fields" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_rows_are_assigned_to_the_nets_own_sites(client, db, owner):
    net = await _net(db, owner)
    sites = (await client.put(
        f"/api/nets/{net.id}/coverage-sites",
        json=[{"name": "Naples Shelter", "location": "Naples, ME", "site_type": "shelter"}],
        headers=auth_headers(owner),
    )).json()
    site_id = sites[0]["id"]
    events = [{"time_label": "09:15", "site_id": site_id, "message": MESSAGE}]
    plan = (await client.put(f"/api/nets/{net.id}/drill-plan", json=_plan(events=events), headers=auth_headers(owner))).json()
    assert plan["events"][0]["site_id"] == site_id

    # Another net's site is refused.
    resp = await client.put(
        f"/api/nets/{net.id}/drill-plan", json=_plan(events=[{"site_id": site_id + 999}]), headers=auth_headers(owner)
    )
    assert resp.status_code == 400

    # Removing the site leaves the row for every site.
    await client.put(f"/api/nets/{net.id}/coverage-sites", json=[], headers=auth_headers(owner))
    plan = (await client.get(f"/api/nets/{net.id}/drill-plan", headers=auth_headers(owner))).json()
    assert plan["events"][0]["site_id"] is None


def test_marking_is_added_once():
    marked = mark_exercise_text("Request 40 cots.")
    assert marked == "THIS IS AN EXERCISE\n\nRequest 40 cots.\n\nTHIS IS AN EXERCISE"
    assert mark_exercise_text(marked) == marked
