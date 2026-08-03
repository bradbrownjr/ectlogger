"""
Tests for the Assisted Traffic Handling "traffic_handled" statistics rollup
added in statistics_user.py, statistics_net.py, and statistics_global.py
(TRAFFIC-HANDLING-DESIGN.md section 3.5, Phase 9). Verifies distinct-form
counting, the per-action breakdown, and net-scoping (TrafficLogEntry.net_id,
not Form.net_id -- see R4: a hop's own net_id is what counts for a net's
traffic stats).
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from tests.conftest import auth_headers
from app.models import Form, FormDefinition, Net, TrafficAction
from app.traffic.definitions import upsert_form_definitions
from app.traffic.log import append_entry


async def _make_definition(db):
    await upsert_form_definitions(db)
    result = await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))
    return result.scalar_one()


def _make_form(db, definition, net_id, owner_id, number):
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        net_id=net_id,
        created_by_id=owner_id,
        field_values="{}",
        message_number=number,
        station_of_origin="KC1OWN",
        addressee_display="PORTLAND ME",
    )
    db.add(form)
    return form


@pytest.mark.asyncio
async def test_user_stats_traffic_handled_counts_and_breakdown(client, db, owner):
    definition = await _make_definition(db)
    net = Net(name="Stats Traffic Net", owner_id=owner.id)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    # Form 1: originated then relayed by owner -- one distinct form, two actions logged by owner.
    form1 = _make_form(db, definition, net.id, owner.id, "1")
    await db.flush()
    await append_entry(db, form1, TrafficAction.ORIGINATED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow() - timedelta(hours=2))
    await append_entry(db, form1, TrafficAction.RELAYED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow() - timedelta(hours=1))

    # Form 2: delivered by owner -- a second distinct form.
    form2 = _make_form(db, definition, net.id, owner.id, "2")
    await db.flush()
    await append_entry(db, form2, TrafficAction.DELIVERED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow())

    resp = await client.get("/api/statistics/users/me", headers=auth_headers(owner))
    assert resp.status_code == 200
    data = resp.json()

    # Distinct forms: form1 and form2 -- NOT 3 (the number of log entries).
    assert data["traffic_handled"] == 2
    assert data["traffic_by_action"]["originated"] == 1
    assert data["traffic_by_action"]["relayed"] == 1
    assert data["traffic_by_action"]["delivered"] == 1

    drill_down_form_ids = {row["form_id"] for row in data["traffic_handled_list"]}
    assert drill_down_form_ids == {form1.id, form2.id}
    # Each drill-down row is the most recent action logged by this user for that form.
    row_by_form = {row["form_id"]: row for row in data["traffic_handled_list"]}
    assert row_by_form[form1.id]["action"] == "relayed"
    assert row_by_form[form2.id]["action"] == "delivered"


@pytest.mark.asyncio
async def test_user_stats_traffic_handled_zero_without_any_callsign(client, db, other):
    """A user with no callsigns at all still gets a correct (zero) traffic
    count via the early-return path -- traffic uses reported_by_user_id, not
    callsign matching, so this must not silently break."""
    resp = await client.get("/api/statistics/users/me", headers=auth_headers(other))
    assert resp.status_code == 200
    data = resp.json()
    assert data["traffic_handled"] == 0
    assert data["traffic_by_action"] == {}
    assert data["traffic_handled_list"] == []


@pytest.mark.asyncio
async def test_net_stats_traffic_handled_scoped_to_log_entry_net_id(client, db, owner):
    """Net-level traffic_handled counts hops whose own net_id matches this
    net -- not Form.net_id -- so a message received on net A and relayed on
    net B contributes to net B's count too (TRAFFIC-HANDLING-DESIGN.md R4)."""
    definition = await _make_definition(db)
    net_a = Net(name="Net A", owner_id=owner.id)
    net_b = Net(name="Net B", owner_id=owner.id)
    db.add_all([net_a, net_b])
    await db.commit()
    await db.refresh(net_a)
    await db.refresh(net_b)

    # Form filed under net_a, received there, then relayed during net_b's session.
    form = _make_form(db, definition, net_a.id, owner.id, "1")
    await db.flush()
    await append_entry(db, form, TrafficAction.RECEIVED, reported_by_user_id=owner.id,
                        net_id=net_a.id, occurred_at=datetime.utcnow() - timedelta(hours=1))
    await append_entry(db, form, TrafficAction.RELAYED, reported_by_user_id=owner.id,
                        net_id=net_b.id, occurred_at=datetime.utcnow())

    resp_a = await client.get(f"/api/statistics/nets/{net_a.id}", headers=auth_headers(owner))
    resp_b = await client.get(f"/api/statistics/nets/{net_b.id}", headers=auth_headers(owner))
    assert resp_a.status_code == 200 and resp_b.status_code == 200

    data_a, data_b = resp_a.json(), resp_b.json()
    assert data_a["traffic_handled"] == 1
    assert data_a["traffic_by_action"] == {"received": 1}
    assert data_b["traffic_handled"] == 1
    assert data_b["traffic_by_action"] == {"relayed": 1}


@pytest.mark.asyncio
async def test_global_stats_traffic_handled_counts_distinct_forms(client, db, owner):
    definition = await _make_definition(db)
    net = Net(name="Global Stats Net", owner_id=owner.id)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    form1 = _make_form(db, definition, net.id, owner.id, "1")
    form2 = _make_form(db, definition, net.id, owner.id, "2")
    await db.flush()
    await append_entry(db, form1, TrafficAction.ORIGINATED, reported_by_user_id=owner.id, net_id=net.id)
    await append_entry(db, form2, TrafficAction.ORIGINATED, reported_by_user_id=owner.id, net_id=net.id)
    await append_entry(db, form2, TrafficAction.DELIVERED, reported_by_user_id=owner.id, net_id=net.id)

    resp = await client.get("/api/statistics/global")
    assert resp.status_code == 200
    data = resp.json()

    assert data["traffic_handled"] == 2
    assert data["traffic_by_action"]["originated"] == 2
    assert data["traffic_by_action"]["delivered"] == 1
