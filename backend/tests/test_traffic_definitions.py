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


@pytest.mark.asyncio
async def test_strip_definition_response_publishes_its_wire_layout(db):
    """FormDefinitionResponse carries the strip's keyword and section breaks.

    The composer builds the canonical strip client-side while the operator
    types, so it needs the same layout format_rri_strip() uses. WXOBS keeps
    that layout pinned in Python (_STRIP_SPECS), which means the stored
    starts_new_section flags are all False -- the response has to stamp the
    real ones on or the preview would show a strip with no "/ /" breaks.
    """
    from sqlalchemy.orm import selectinload

    from app.schemas import FormDefinitionResponse

    await upsert_form_definitions(db)
    result = await db.execute(
        select(FormDefinition)
        .options(selectinload(FormDefinition.fields))
        .where(FormDefinition.form_type == "WXOBS")
    )
    body = FormDefinitionResponse.from_orm(result.scalar_one())

    assert body.strip_keyword == "WXOBS"
    starts = {f.name for f in body.fields if f.starts_new_section}
    # First field of each _WXOBS_SECTIONS section after the first.
    assert starts == {
        "observation_time", "wind_dir", "clouds", "temp", "barometer",
        "precip_type", "comments",
    }
    # call_sign opens the strip, so it does not start a new section.
    assert not next(f for f in body.fields if f.name == "call_sign").starts_new_section


@pytest.mark.asyncio
async def test_non_strip_definition_has_no_strip_keyword(db):
    """Only RRI strips get a wire keyword; a Radiogram has no such concept."""
    from sqlalchemy.orm import selectinload

    from app.schemas import FormDefinitionResponse

    await upsert_form_definitions(db)
    result = await db.execute(
        select(FormDefinition)
        .options(selectinload(FormDefinition.fields))
        .where(FormDefinition.form_type == "RADIOGRAM")
    )
    body = FormDefinitionResponse.from_orm(result.scalar_one())
    assert body.strip_keyword is None
