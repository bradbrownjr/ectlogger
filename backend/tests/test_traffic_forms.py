"""
Endpoint tests for routers/traffic_forms.py: create/read round trip (including
server-side normalization and check computation), visibility-scoped listing
proven at the WHERE-clause level, and the append-only 409 on PATCH. See
TRAFFIC-HANDLING-DESIGN.md sections 3.2 and D3.
"""
import pytest
from datetime import datetime
from sqlalchemy import select

from tests.conftest import auth_headers
from app.models import Form, FormDefinition, TrafficAction
from app.traffic.definitions import upsert_form_definitions
from app.traffic.log import append_entry

RADIOGRAM_VALUES = {
    "number": "123",
    "precedence": "R - Routine",
    "station_of_origin": "KC1OWN",
    "place_of_origin": "Portland ME",
    "to_name": "Jim Kutsch",
    "to_callsign": "KY2D",
    "to_address": "123 Main St",
    "to_city_state": "Newington CT",
    "to_zip": "06111",
    "text": "Please advise? Thanks and 73",
    "signature": "Brad",
}


def _values(**overrides):
    values = dict(RADIOGRAM_VALUES)
    values.update(overrides)
    return values


@pytest.mark.asyncio
async def test_create_then_read_round_trip_normalizes_and_computes_check(client, db, owner):
    await upsert_form_definitions(db)

    resp = await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "field_values": RADIOGRAM_VALUES},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    created = resp.json()

    # Promoted columns populated from the definition + values.
    assert created["message_number"] == "123"
    assert created["precedence"] == "R"
    assert created["station_of_origin"] == "KC1OWN"

    # nts_normalize field ("text") was normalized server-side, and the check
    # was computed from the normalized text, never trusted from the client.
    assert created["check_count"] is not None
    assert created["check_count"] > 0
    assert created["normalized_text"]
    assert "QUERY" in created["normalized_text"]  # "?" -> QUERY substitution
    assert created["field_values"]["text_raw"] == RADIOGRAM_VALUES["text"]
    assert created["field_values"]["text"] == created["normalized_text"]

    # The initial ORIGINATED entry was inserted in the same transaction.
    assert created["disposition"] == "pending"
    assert len(created["log_entries"]) == 1
    assert created["log_entries"][0]["action"] == "originated"

    get_resp = await client.get(f"/api/traffic/forms/{created['id']}", headers=auth_headers(owner))
    assert get_resp.status_code == 200
    fetched = get_resp.json()
    assert fetched["field_values"]["text"] == created["normalized_text"]
    assert fetched["definition"]["form_type"] == "RADIOGRAM"


@pytest.mark.asyncio
async def test_create_rejects_missing_required_field(client, db, owner):
    await upsert_form_definitions(db)
    values = _values()
    del values["to_zip"]

    resp = await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "field_values": values},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_is_visibility_scoped_at_where_clause_level(client, db, owner, other, admin):
    """Three forms exist; the caller (owner) may see only the one they
    created. total must reflect that -- not the full table -- proving the
    scoping happens in SQL rather than as a post-fetch filter that would
    otherwise leak the true count via pagination."""
    await upsert_form_definitions(db)

    await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "field_values": _values(number="1")},
        headers=auth_headers(owner),
    )
    await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "field_values": _values(number="2")},
        headers=auth_headers(other),
    )
    await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "field_values": _values(number="3")},
        headers=auth_headers(other),
    )

    resp = await client.get("/api/traffic/forms", headers=auth_headers(owner))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["message_number"] == "1"

    admin_resp = await client.get("/api/traffic/forms", headers=auth_headers(admin))
    assert admin_resp.json()["total"] == 3


@pytest.mark.asyncio
async def test_patch_returns_409_once_any_log_entry_exists(client, db, owner):
    """A form with no log entries is a draft and may be edited; the instant a
    log entry is appended it becomes append-only and PATCH must return 409,
    not 403 (FormPermissionResult.APPEND_ONLY vs DENIED)."""
    await upsert_form_definitions(db)
    definition = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))).scalar_one()
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        created_by_id=owner.id,
        field_values="{}",
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)

    resp = await client.patch(
        f"/api/traffic/forms/{form.id}",
        json={"field_values": {"number": "42"}},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    assert resp.json()["message_number"] == "42"

    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id, occurred_at=datetime.utcnow())

    resp = await client.patch(
        f"/api/traffic/forms/{form.id}",
        json={"field_values": {"number": "43"}},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_draft_succeeds_but_conflicts_once_logged(client, db, owner):
    await upsert_form_definitions(db)
    definition = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))).scalar_one()
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        created_by_id=owner.id,
        field_values="{}",
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)

    resp = await client.delete(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert resp.status_code == 204

    form2 = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        created_by_id=owner.id,
        field_values="{}",
    )
    db.add(form2)
    await db.commit()
    await db.refresh(form2)
    await append_entry(db, form2, TrafficAction.ORIGINATED, reported_by_user_id=owner.id, occurred_at=datetime.utcnow())

    resp = await client.delete(f"/api/traffic/forms/{form2.id}", headers=auth_headers(owner))
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_net_scoped_form_list_requires_ncs_or_logger(client, db, owner, other):
    from app.models import Net, NetRole

    await upsert_form_definitions(db)
    net = Net(name="Traffic Test Net", owner_id=owner.id)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    resp = await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "net_id": net.id, "field_values": _values(number="55")},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201

    denied = await client.get(f"/api/traffic/nets/{net.id}/forms", headers=auth_headers(other))
    assert denied.status_code == 403

    granted = await client.get(f"/api/traffic/nets/{net.id}/forms", headers=auth_headers(owner))
    assert granted.status_code == 200
    assert granted.json()["total"] == 1


@pytest.mark.asyncio
async def test_list_and_get_form_definitions(client, db, owner):
    await upsert_form_definitions(db)

    resp = await client.get("/api/traffic/definitions", headers=auth_headers(owner))
    assert resp.status_code == 200
    form_types = [d["form_type"] for d in resp.json()]
    assert "RADIOGRAM" in form_types
    assert "ICS213" in form_types

    single = await client.get("/api/traffic/definitions/RADIOGRAM", headers=auth_headers(owner))
    assert single.status_code == 200
    assert single.json()["form_type"] == "RADIOGRAM"
    assert any(f["name"] == "station_of_origin" for f in single.json()["fields"])


# ========== DRILL / DEMO LABELING ==========

@pytest.mark.asyncio
async def test_create_with_test_category(client, db, owner):
    await upsert_form_definitions(db)
    resp = await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "field_values": RADIOGRAM_VALUES, "test_category": "demo"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    assert resp.json()["test_category"] == "demo"


@pytest.mark.asyncio
async def test_set_test_category_works_regardless_of_log_entries(client, db, owner):
    """Unlike PATCH /forms/{id}, the label endpoint must succeed even once
    the form is append-only -- this is what lets an already-logged (and
    already nagging) strip get relabeled after the fact."""
    await upsert_form_definitions(db)
    definition = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))).scalar_one()
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        created_by_id=owner.id,
        field_values="{}",
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)
    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id, occurred_at=datetime.utcnow())

    resp = await client.patch(
        f"/api/traffic/forms/{form.id}/test-category",
        json={"test_category": "demo"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    assert resp.json()["test_category"] == "demo"

    # Clearing it back to real traffic works the same way.
    resp = await client.patch(
        f"/api/traffic/forms/{form.id}/test-category",
        json={"test_category": None},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    assert resp.json()["test_category"] is None


@pytest.mark.asyncio
async def test_set_test_category_denied_for_non_creator_non_admin(client, db, owner, other):
    await upsert_form_definitions(db)
    resp = await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "field_values": RADIOGRAM_VALUES},
        headers=auth_headers(owner),
    )
    form_id = resp.json()["id"]

    resp = await client.patch(
        f"/api/traffic/forms/{form_id}/test-category",
        json={"test_category": "demo"},
        headers=auth_headers(other),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_demo_form_succeeds_even_once_logged(client, db, owner):
    """DEMO carries no audit-trail requirement, so unlike ordinary traffic it
    stays deletable by its creator after being logged. A DRILL form, by
    contrast, gets no such exception -- it follows the same append-only rule
    real traffic does."""
    await upsert_form_definitions(db)
    definition = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))).scalar_one()

    demo_form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        created_by_id=owner.id,
        field_values="{}",
        test_category="demo",
    )
    drill_form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        created_by_id=owner.id,
        field_values="{}",
        test_category="drill",
    )
    db.add_all([demo_form, drill_form])
    await db.commit()
    await db.refresh(demo_form)
    await db.refresh(drill_form)
    await append_entry(db, demo_form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id, occurred_at=datetime.utcnow())
    await append_entry(db, drill_form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id, occurred_at=datetime.utcnow())

    resp = await client.delete(f"/api/traffic/forms/{demo_form.id}", headers=auth_headers(owner))
    assert resp.status_code == 204

    resp = await client.delete(f"/api/traffic/forms/{drill_form.id}", headers=auth_headers(owner))
    assert resp.status_code == 409
