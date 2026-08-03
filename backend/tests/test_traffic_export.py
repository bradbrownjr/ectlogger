"""
Tests for GET /traffic/forms/{id}/export (routers/traffic_export.py). See
TRAFFIC-HANDLING-DESIGN.md section 3.4: text format is the ported RRI/NTS
plaintext (formatters.format_form), pdf is a printable rendering of the same
text, and there is no email-send endpoint anywhere in this router.
"""
import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from tests.conftest import auth_headers
from app.models import Form, FormDefinition
from app.traffic.definitions import upsert_form_definitions
from app.traffic.formatters import format_form

RADIOGRAM_VALUES = {
    "number": "123",
    "precedence": "R - Routine",
    "station_of_origin": "KC1JMH",
    "place_of_origin": "Portland ME",
    "to_name": "Jim Kutsch",
    "to_callsign": "KY2D",
    "to_address": "123 Main St",
    "to_city_state": "Newington CT",
    "to_zip": "06111",
    "text": "Please advise your status and 73",
    "signature": "Brad",
}


async def _create_form(client, owner, **overrides) -> int:
    values = dict(RADIOGRAM_VALUES)
    values.update(overrides)
    resp = await client.post(
        "/api/traffic/forms",
        json={"form_type": "RADIOGRAM", "field_values": values},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_export_text_matches_format_form_exactly(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner)

    resp = await client.get(
        f"/api/traffic/forms/{form_id}/export", params={"format": "text"}, headers=auth_headers(owner)
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/plain")

    result = await db.execute(
        select(Form).options(selectinload(Form.definition)).where(Form.id == form_id)
    )
    form = result.scalar_one()
    assert resp.text == format_form(form)


@pytest.mark.asyncio
async def test_export_defaults_to_text_format(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner)

    resp = await client.get(f"/api/traffic/forms/{form_id}/export", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/plain")


@pytest.mark.asyncio
async def test_export_pdf_returns_pdf_content_type(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner)

    resp = await client.get(
        f"/api/traffic/forms/{form_id}/export", params={"format": "pdf"}, headers=auth_headers(owner)
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"


@pytest.mark.asyncio
async def test_export_rejects_unknown_format(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner)

    resp = await client.get(
        f"/api/traffic/forms/{form_id}/export", params={"format": "docx"}, headers=auth_headers(owner)
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_export_denied_for_stranger(client, db, owner, other):
    """A standalone form (no net_id) is visible only to the submitter, the
    current holder, chain-of-custody, and admins -- a stranger gets 403 on
    export the same as on GET, per TRAFFIC-HANDLING-DESIGN.md D3."""
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner)

    resp = await client.get(
        f"/api/traffic/forms/{form_id}/export", params={"format": "text"}, headers=auth_headers(other)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_export_404_for_unknown_form(client, owner):
    resp = await client.get("/api/traffic/forms/999999/export", headers=auth_headers(owner))
    assert resp.status_code == 404
