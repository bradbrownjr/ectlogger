"""
Tests for POST /traffic/import/preview (routers/traffic_export.py::import_preview).
See TRAFFIC-HANDLING-DESIGN.md D5 and section 3.4: stateless, parse-only,
writes nothing to the database under any input. The endpoint is a thin
wrapper over app/traffic/formatters.py::parse_any() -- these tests exercise
the HTTP layer (auth, status codes, response shape) and the "writes
nothing" safety property; parse_any's own parsing correctness is already
covered by test_traffic_radiogram.py.
"""
import pytest
from sqlalchemy import func, select

from tests.conftest import auth_headers
from app.models import Form
from app.traffic.definitions import upsert_form_definitions

# A clean, well-formed radiogram with both BT breaks present -- mirrors the
# plaintext shape asserted in test_traffic_radiogram.py's
# test_format_nts_radiogram_matches_expected_plaintext, so a round trip here
# hits the same "high confidence, bt_block source" path.
CLEAN_RADIOGRAM_TEXT = "\n".join([
    "NR 123 R HXG KC1JMH 6 PORTLAND ME 1432 JAN 05",
    "JIM KUTSCH KY2D",
    "123 MAIN ST",
    "NEWINGTON CT 06111",
    "TEL 860 555 1234",
    "BT",
    "PLEASE ADVISE YOUR STATUS AND",
    "73",
    "BT",
    "BRAD",
])

# Same body/preamble, but both BT lines are missing -- exercises the
# positional-heuristic fallback path (D5: "BT breaks are preferred, not
# required").
RADIOGRAM_TEXT_NO_BT = "\n".join([
    "NR 123 R HXG KC1JMH 6 PORTLAND ME 1432 JAN 05",
    "JIM KUTSCH KY2D",
    "123 MAIN ST",
    "NEWINGTON CT 06111",
    "TEL 860 555 1234",
    "PLEASE ADVISE YOUR STATUS AND 73",
    "BRAD",
])

# Stated check (99) deliberately does not match the computed check (6).
RADIOGRAM_TEXT_CHECK_MISMATCH = CLEAN_RADIOGRAM_TEXT.replace(
    "NR 123 R HXG KC1JMH 6 PORTLAND ME 1432 JAN 05",
    "NR 123 R HXG KC1JMH 99 PORTLAND ME 1432 JAN 05",
)

CLEAN_ICS213_TEXT = "\n".join([
    "Incident/Event: Coastal Storm Watch",
    "To: Jane Smith (Operations Chief)",
    "From: Brad Brown (Net Control)",
    "Date/Time: 2026-08-03 1432Z",
    "Priority: Urgent",
    "Subject: Shelter status update",
    "Message: Shelter at 123 Main St is open.",
    "Reply Requested: Yes",
])

GARBAGE_TEXT = "asdlkfjaslkdfj\nqwername is not a radiogram\nnor ics213\n"


async def _form_count(db) -> int:
    result = await db.execute(select(func.count()).select_from(Form))
    return result.scalar() or 0


@pytest.mark.asyncio
async def test_import_preview_radiogram_round_trips_high_confidence(client, db, owner):
    await upsert_form_definitions(db)

    resp = await client.post(
        "/api/traffic/import/preview",
        json={"text": CLEAN_RADIOGRAM_TEXT},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["form_type"] == "RADIOGRAM"
    fields = body["fields"]
    assert fields["number"]["value"] == "123"
    assert fields["precedence"]["value"] == "R"
    assert fields["handling"]["value"] == "HXG"
    assert fields["station_of_origin"]["value"] == "KC1JMH"
    assert fields["to_zip"]["value"] == "06111"
    assert fields["signature"]["value"] == "BRAD"
    assert fields["text"]["value"] == "PLEASE ADVISE YOUR STATUS AND 73"

    assert body["check_stated"] == 6
    assert body["check_count"] == 6
    assert not any("mismatch" in w or "does not match" in w for w in body["warnings"])

    for name in ("number", "precedence", "station_of_origin", "to_zip", "signature", "text"):
        assert fields[name]["confidence"] == "high", (name, fields[name])
        assert fields[name]["source"] == "bt_block"


@pytest.mark.asyncio
async def test_import_preview_ics213_parses_correctly(client, db, owner):
    await upsert_form_definitions(db)

    resp = await client.post(
        "/api/traffic/import/preview",
        json={"text": CLEAN_ICS213_TEXT},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["form_type"] == "ICS213"
    fields = body["fields"]
    assert fields["incident_name"]["value"] == "Coastal Storm Watch"
    assert fields["to_name"]["value"] == "Jane Smith"
    assert fields["to_position"]["value"] == "Operations Chief"
    assert fields["from_name"]["value"] == "Brad Brown"
    assert fields["subject"]["value"] == "Shelter status update"
    assert fields["reply_requested"]["value"] == "Yes"
    assert not body["warnings"]
    # check_stated/check_count are radiogram-only.
    assert body["check_stated"] is None
    assert body["check_count"] is None


@pytest.mark.asyncio
async def test_import_preview_missing_bt_yields_partial_parse_with_heuristic_source(client, owner):
    resp = await client.post(
        "/api/traffic/import/preview",
        json={"text": RADIOGRAM_TEXT_NO_BT},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["form_type"] == "RADIOGRAM"
    assert any("BT breaks missing" in w for w in body["warnings"])
    fields = body["fields"]
    assert fields["to_zip"]["value"] == "06111"
    assert fields["signature"]["value"] == "BRAD"
    assert fields["text"]["value"] == "PLEASE ADVISE YOUR STATUS AND 73"
    # The heuristic fallback path is what D5 calls out as "some fields
    # source: heuristic" -- confirm at least one field actually reports it.
    assert any(f["source"] == "heuristic" for f in fields.values())


@pytest.mark.asyncio
async def test_import_preview_check_mismatch_warns_without_failing(client, owner):
    resp = await client.post(
        "/api/traffic/import/preview",
        json={"text": RADIOGRAM_TEXT_CHECK_MISMATCH},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["check_stated"] == 99
    assert body["check_count"] == 6
    assert any("stated check 99" in w and "computed check 6" in w for w in body["warnings"])
    assert body["fields"]["text"]["confidence"] == "low"


@pytest.mark.asyncio
async def test_import_preview_unparseable_garbage_returns_unknown_not_500(client, owner):
    resp = await client.post(
        "/api/traffic/import/preview",
        json={"text": GARBAGE_TEXT},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["form_type"] == "unknown"
    assert body["raw_text"] == GARBAGE_TEXT
    assert body["fields"] == {}


@pytest.mark.asyncio
async def test_import_preview_rejects_empty_input(client, owner):
    resp = await client.post(
        "/api/traffic/import/preview",
        json={"text": ""},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400

    resp2 = await client.post(
        "/api/traffic/import/preview",
        json={"text": "   \n  "},
        headers=auth_headers(owner),
    )
    assert resp2.status_code == 400


@pytest.mark.asyncio
async def test_import_preview_rejects_oversized_input(client, owner):
    oversized = "NR 1 R " + ("X" * (33 * 1024))
    resp = await client.post(
        "/api/traffic/import/preview",
        json={"text": oversized},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_preview_requires_auth(client):
    resp = await client.post("/api/traffic/import/preview", json={"text": CLEAN_RADIOGRAM_TEXT})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_import_preview_never_writes_to_database(client, db, owner):
    """The entire safety property of D5: this endpoint must never create a
    Form row, regardless of input shape (clean radiogram, ICS-213, garbage,
    or a rejected empty/oversized body)."""
    await upsert_form_definitions(db)
    before = await _form_count(db)

    for payload in (CLEAN_RADIOGRAM_TEXT, CLEAN_ICS213_TEXT, GARBAGE_TEXT, RADIOGRAM_TEXT_NO_BT):
        resp = await client.post(
            "/api/traffic/import/preview",
            json={"text": payload},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 200

    # Rejected inputs must not write either.
    await client.post("/api/traffic/import/preview", json={"text": ""}, headers=auth_headers(owner))

    after = await _form_count(db)
    assert after == before
