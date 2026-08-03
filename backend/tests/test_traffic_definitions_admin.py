"""
Endpoint tests for the admin-only PUT /traffic/definitions/{id}, focused on
the D1 guarantee that a builtin's field set is code-owned: an admin may
enable/disable, reorder, and override field label/description, but cannot
add, remove, or retarget a field. See TRAFFIC-HANDLING-DESIGN.md D1.
"""
import pytest
from sqlalchemy import select

from tests.conftest import auth_headers
from app.models import FormDefinition, FormDefinitionField
from app.traffic.definitions import upsert_form_definitions


@pytest.mark.asyncio
async def test_admin_can_enable_disable_and_reorder(client, db, admin):
    await upsert_form_definitions(db)
    definition = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))).scalar_one()

    resp = await client.put(
        f"/api/traffic/definitions/{definition.id}",
        json={"is_enabled": False, "sort_order": 7},
        headers=auth_headers(admin),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_enabled"] is False
    assert data["sort_order"] == 7


@pytest.mark.asyncio
async def test_admin_can_override_field_label_and_description(client, db, admin):
    await upsert_form_definitions(db)
    definition = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))).scalar_one()
    field_result = await db.execute(
        select(FormDefinitionField).where(
            FormDefinitionField.definition_id == definition.id,
            FormDefinitionField.name == "to_zip",
        )
    )
    to_zip = field_result.scalar_one()

    resp = await client.put(
        f"/api/traffic/definitions/{definition.id}",
        json={"field_overrides": [{"id": to_zip.id, "label": "Postal Code"}]},
        headers=auth_headers(admin),
    )
    assert resp.status_code == 200
    updated_field = next(f for f in resp.json()["fields"] if f["id"] == to_zip.id)
    assert updated_field["label"] == "Postal Code"
    # Structural metadata, not overridable via this path, is untouched.
    assert updated_field["validator"] == "us_zip"


@pytest.mark.asyncio
async def test_admin_field_set_change_attempt_is_rejected(client, db, admin):
    """Naming a field id that doesn't belong to this definition -- the only
    way this schema could be used to try to retarget/add a field -- must be
    refused with a 4xx, not silently ignored or applied to the wrong field."""
    await upsert_form_definitions(db)
    radiogram = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))).scalar_one()
    ics213 = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "ICS213"))).scalar_one()
    foreign_field = (
        await db.execute(
            select(FormDefinitionField).where(FormDefinitionField.definition_id == ics213.id)
        )
    ).scalars().first()

    resp = await client.put(
        f"/api/traffic/definitions/{radiogram.id}",
        json={"field_overrides": [{"id": foreign_field.id, "label": "Hijacked"}]},
        headers=auth_headers(admin),
    )
    assert resp.status_code == 400

    # And the field itself is untouched.
    await db.refresh(foreign_field)
    assert foreign_field.label != "Hijacked"


@pytest.mark.asyncio
async def test_non_admin_cannot_update_definition(client, db, owner):
    await upsert_form_definitions(db)
    definition = (await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))).scalar_one()

    resp = await client.put(
        f"/api/traffic/definitions/{definition.id}",
        json={"is_enabled": False},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 403
