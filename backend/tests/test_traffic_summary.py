"""
Tests for GET /traffic/nets/{net_id}/summary (routers/traffic_forms.py): the
per-net traffic panel's summary strip. Verifies counts across all five
derived dispositions, the outstanding/stale placeholder count, and that the
same net-scoped view gate as GET /traffic/nets/{net_id}/forms applies (that
net's NCS/logger/owner/admin only -- TRAFFIC-HANDLING-DESIGN.md D3 rule 4).
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from tests.conftest import auth_headers
from app.models import Form, FormDefinition, Net, TrafficAction
from app.traffic.definitions import upsert_form_definitions
from app.traffic.log import append_entry

RADIOGRAM_VALUES = {
    "number": "1",
    "precedence": "R - Routine",
    "station_of_origin": "KC1OWN",
    "place_of_origin": "Portland ME",
    "to_name": "Jim Kutsch",
    "to_callsign": "KY2D",
    "to_address": "123 Main St",
    "to_city_state": "Newington CT",
    "to_zip": "06111",
    "text": "Test message",
    "signature": "Brad",
}


def _values(**overrides):
    values = dict(RADIOGRAM_VALUES)
    values.update(overrides)
    return values


@pytest.mark.asyncio
async def test_summary_counts_all_dispositions_and_outstanding(client, db, owner):
    await upsert_form_definitions(db)
    net = Net(name="Summary Test Net", owner_id=owner.id)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    definition = (await db.execute(
        select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM")
    )).scalar_one()

    def _make_form(number: str) -> Form:
        form = Form(
            definition_id=definition.id,
            form_type=definition.form_type,
            definition_version=definition.version,
            net_id=net.id,
            created_by_id=owner.id,
            field_values="{}",
            message_number=number,
        )
        db.add(form)
        return form

    # draft: no log entries at all.
    _make_form("draft-1")

    # pending, fresh: held less than the 24h staleness threshold.
    pending_fresh = _make_form("pending-fresh")
    await db.flush()
    await append_entry(
        db, pending_fresh, TrafficAction.ORIGINATED,
        reported_by_user_id=owner.id, net_id=net.id,
        occurred_at=datetime.utcnow(),
    )

    # pending, stale: held_since well past the 24h threshold -> outstanding.
    pending_stale = _make_form("pending-stale")
    await db.flush()
    await append_entry(
        db, pending_stale, TrafficAction.RECEIVED,
        reported_by_user_id=owner.id, net_id=net.id,
        occurred_at=datetime.utcnow() - timedelta(hours=48),
    )

    # relayed.
    relayed = _make_form("relayed-1")
    await db.flush()
    await append_entry(db, relayed, TrafficAction.ORIGINATED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow())
    await append_entry(db, relayed, TrafficAction.RELAYED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow())

    # delivered.
    delivered = _make_form("delivered-1")
    await db.flush()
    await append_entry(db, delivered, TrafficAction.ORIGINATED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow())
    await append_entry(db, delivered, TrafficAction.DELIVERED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow())

    # cancelled.
    cancelled = _make_form("cancelled-1")
    await db.flush()
    await append_entry(db, cancelled, TrafficAction.ORIGINATED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow())
    await append_entry(db, cancelled, TrafficAction.CANCELLED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow())

    await db.commit()

    resp = await client.get(f"/api/traffic/nets/{net.id}/summary", headers=auth_headers(owner))
    assert resp.status_code == 200
    data = resp.json()

    assert data["net_id"] == net.id
    assert data["draft"] == 1
    assert data["pending"] == 2  # pending_fresh + pending_stale
    assert data["relayed"] == 1
    assert data["delivered"] == 1
    assert data["cancelled"] == 1
    # Only the stale pending item (48h held) counts as outstanding, not the fresh one.
    assert data["outstanding"] == 1


@pytest.mark.asyncio
async def test_summary_denied_without_ncs_or_logger_role(client, db, owner, other):
    net = Net(name="Summary Perm Net", owner_id=owner.id)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    denied = await client.get(f"/api/traffic/nets/{net.id}/summary", headers=auth_headers(other))
    assert denied.status_code == 403

    granted = await client.get(f"/api/traffic/nets/{net.id}/summary", headers=auth_headers(owner))
    assert granted.status_code == 200


@pytest.mark.asyncio
async def test_summary_404_for_unknown_net(client, owner):
    resp = await client.get("/api/traffic/nets/999999/summary", headers=auth_headers(owner))
    assert resp.status_code == 404
