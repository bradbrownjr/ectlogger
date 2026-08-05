"""
Per-net / per-schedule traffic configuration (migration 056).

A net declares what traffic it takes: whether the Traffic panel is on at all,
which form types its pickers offer, and which RRI/WX strip it collects (either
a defined type or a raw pasted origin strip). These settings live on both nets
and net_templates, and the template values seed the net -- the same
copy-forward relationship ics309_enabled already has, which is exactly the
thing that regressed once before when a copy list fell out of sync (see
test_templates.py's module docstring).
"""
import json

import pytest
from sqlalchemy import select

from tests.conftest import auth_headers
from app.models import Net, NetTemplate


@pytest.mark.asyncio
async def test_net_create_round_trips_traffic_config(client, owner):
    resp = await client.post(
        "/api/nets/",
        json={
            "name": "Traffic Net",
            "traffic_enabled": True,
            "traffic_form_types": ["RADIOGRAM", "WXOBS"],
            "traffic_strip_form_type": "WXOBS",
            "traffic_strip_template": "WXOBS/W1AW/PORTLAND/ME//",
        },
        headers=auth_headers(owner),
    )
    assert resp.status_code in (200, 201), resp.text
    data = resp.json()
    assert data["traffic_enabled"] is True
    # Stored as JSON text, returned as a real list.
    assert data["traffic_form_types"] == ["RADIOGRAM", "WXOBS"]
    assert data["traffic_strip_form_type"] == "WXOBS"
    assert data["traffic_strip_template"] == "WXOBS/W1AW/PORTLAND/ME//"


@pytest.mark.asyncio
async def test_net_defaults_traffic_off_and_unrestricted(client, owner):
    """Opt-in, matching ics309_enabled/propagation_logging_enabled. Null
    traffic_form_types means "every enabled definition", not "none"."""
    resp = await client.post("/api/nets/", json={"name": "Ragchew"}, headers=auth_headers(owner))
    data = resp.json()
    assert data["traffic_enabled"] is False
    assert data["traffic_form_types"] is None
    assert data["traffic_strip_form_type"] is None


@pytest.mark.asyncio
async def test_net_update_can_clear_the_form_type_restriction(client, db, owner):
    """An empty list means "no restriction" -- the same as null -- so it must
    not be stored as a literal "[]" that would then read back as "no types
    allowed" and empty every picker."""
    created = await client.post(
        "/api/nets/",
        json={"name": "N", "traffic_enabled": True, "traffic_form_types": ["RADIOGRAM"]},
        headers=auth_headers(owner),
    )
    net_id = created.json()["id"]

    resp = await client.put(
        f"/api/nets/{net_id}",
        json={"traffic_form_types": []},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["traffic_form_types"] is None

    stored = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    assert stored.traffic_form_types is None


@pytest.mark.asyncio
async def test_create_net_from_template_copies_traffic_config(client, db, owner):
    """Regression guard: the traffic settings must ride the template -> net
    copy list. They were already missed once on the auto-create path."""
    template = NetTemplate(
        name="ARES Schedule",
        owner_id=owner.id,
        schedule_type="ad_hoc",
        schedule_config="{}",
        traffic_enabled=True,
        traffic_form_types=json.dumps(["RADIOGRAM", "ICS213"]),
        traffic_strip_form_type="GYX-CAR-SKYWARN",
        traffic_strip_template="GYX-CAR WEATHER/W1AW//",
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    resp = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["traffic_enabled"] is True
    assert data["traffic_form_types"] == ["RADIOGRAM", "ICS213"]
    assert data["traffic_strip_form_type"] == "GYX-CAR-SKYWARN"
    assert data["traffic_strip_template"] == "GYX-CAR WEATHER/W1AW//"


@pytest.mark.asyncio
async def test_template_update_round_trips_traffic_config(client, db, owner):
    """Built directly rather than through POST /templates/ because schedule
    creation is gated on a 7-day-old account (see templates_core.py); the
    update path is what carries the JSON encode/decode anyway."""
    template = NetTemplate(
        name="SKYWARN Schedule", owner_id=owner.id, schedule_type="ad_hoc", schedule_config="{}",
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    resp = await client.put(
        f"/api/templates/{template.id}",
        json={
            "traffic_enabled": True,
            "traffic_form_types": ["WXOBS"],
            "traffic_strip_form_type": "WXOBS",
            "traffic_strip_template": "WXOBS/W1AW//",
        },
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["traffic_form_types"] == ["WXOBS"]
    assert resp.json()["traffic_strip_form_type"] == "WXOBS"

    # Clearing the restriction on a template behaves the same as on a net.
    updated = await client.put(
        f"/api/templates/{template.id}",
        json={"traffic_form_types": []},
        headers=auth_headers(owner),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["traffic_form_types"] is None


@pytest.mark.asyncio
async def test_malformed_stored_form_types_does_not_break_the_net_fetch(client, db, owner):
    """A junk value in the TEXT column degrades to "no restriction" rather
    than 500ing the whole net response."""
    created = await client.post("/api/nets/", json={"name": "N"}, headers=auth_headers(owner))
    net_id = created.json()["id"]

    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    net.traffic_form_types = "not json at all"
    await db.commit()

    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["traffic_form_types"] is None
