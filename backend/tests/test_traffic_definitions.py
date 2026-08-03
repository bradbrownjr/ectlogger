"""
Tests for the builtin form-definition startup upsert (app/traffic/definitions.py).

Covers idempotency (running the upsert twice produces no duplicate rows) and
that an admin's override to label/description/is_enabled/sort_order survives
a second upsert run, per TRAFFIC-HANDLING-DESIGN.md D1.
"""
import pytest
from sqlalchemy import select

from app.models import FormDefinition, FormDefinitionField
from app.traffic.definitions import upsert_form_definitions


@pytest.mark.asyncio
async def test_upsert_is_idempotent(db):
    await upsert_form_definitions(db)
    await upsert_form_definitions(db)

    result = await db.execute(select(FormDefinition))
    definitions = result.scalars().all()
    form_types = [d.form_type for d in definitions]

    # No duplicate FormDefinition rows for the same form_type.
    assert len(form_types) == len(set(form_types))
    assert "RADIOGRAM" in form_types
    assert "ICS213" in form_types

    radiogram = next(d for d in definitions if d.form_type == "RADIOGRAM")
    fields_result = await db.execute(
        select(FormDefinitionField).where(FormDefinitionField.definition_id == radiogram.id)
    )
    fields = fields_result.scalars().all()
    field_names = [f.name for f in fields]

    # No duplicate FormDefinitionField rows for the same field name.
    assert len(field_names) == len(set(field_names))
    assert "station_of_origin" in field_names


@pytest.mark.asyncio
async def test_upsert_preserves_admin_definition_overrides(db):
    await upsert_form_definitions(db)

    result = await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))
    radiogram = result.scalar_one()
    radiogram.is_enabled = False
    radiogram.sort_order = 5
    await db.commit()

    await upsert_form_definitions(db)

    result = await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))
    radiogram = result.scalar_one()
    assert radiogram.is_enabled is False
    assert radiogram.sort_order == 5
    # Structural, code-owned metadata still gets synced from the JSON.
    assert radiogram.title == "ARRL Radiogram"
    assert radiogram.output_format == "nts_radiogram"


@pytest.mark.asyncio
async def test_upsert_preserves_admin_field_overrides(db):
    await upsert_form_definitions(db)

    result = await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))
    radiogram = result.scalar_one()
    fields_result = await db.execute(
        select(FormDefinitionField).where(
            FormDefinitionField.definition_id == radiogram.id,
            FormDefinitionField.name == "to_zip",
        )
    )
    to_zip = fields_result.scalar_one()
    to_zip.label = "Postal Code"
    to_zip.description = "Custom admin description"
    to_zip.sort_order = 999
    await db.commit()

    await upsert_form_definitions(db)

    fields_result = await db.execute(
        select(FormDefinitionField).where(
            FormDefinitionField.definition_id == radiogram.id,
            FormDefinitionField.name == "to_zip",
        )
    )
    to_zip = fields_result.scalar_one()
    assert to_zip.label == "Postal Code"
    assert to_zip.description == "Custom admin description"
    assert to_zip.sort_order == 999
    # Structural metadata (not admin-overridable) still gets synced.
    assert to_zip.validator == "us_zip"
    assert to_zip.max_length == 10
