"""
Tests for the Phase 2b formatter layer: app/traffic/radiogram.py,
app/traffic/ics213.py, and the app/traffic/formatters.py registry.

Forms are created through the real POST /api/traffic/forms endpoint (as in
test_traffic_forms.py) so the promoted columns (message_number, precedence,
handling, station_of_origin, check_count, normalized_text) come from the
real app/traffic/promote.py path, not a hand-rolled stand-in -- the
formatter is supposed to read those columns rather than re-derive them.
"""
import re

import pytest
from sqlalchemy import select

from tests.conftest import auth_headers
from app.models import Form
from app.traffic.definitions import upsert_form_definitions
from app.traffic.formatters import FORMATTERS, format_form, get_formatter, parse_any
from app.traffic.ics213 import format_ics213, parse_ics213
from app.traffic.radiogram import format_nts_radiogram, parse_nts_radiogram

RADIOGRAM_VALUES = {
    "number": "123",
    "precedence": "R - Routine",
    "handling": "HXG",
    "station_of_origin": "KC1JMH",
    "place_of_origin": "Portland ME",
    "to_name": "Jim Kutsch",
    "to_callsign": "KY2D",
    "to_address": "123 Main St",
    "to_city_state": "Newington CT",
    "to_zip": "06111",
    "to_phone": "8605551234",
    "to_email": "jim@example.com",
    "text": "Please advise your status and 73",
    "signature": "Brad",
    "filed_time": "1432",
}

ICS213_VALUES = {
    "incident_name": "Coastal Storm Watch",
    "to_name": "Jane Smith",
    "to_position": "Operations Chief",
    "from_name": "Brad Brown",
    "from_position": "Net Control",
    "subject": "Shelter status update",
    "message": "Shelter at 123 Main St is open.\nCapacity is 40 of 80.",
    "priority": "Urgent",
    "reply_requested": "Yes",
}


async def _create_form(client, owner, form_type, values):
    resp = await client.post(
        "/api/traffic/forms",
        json={"form_type": form_type, "field_values": values},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _fetch_form(db, form_id) -> Form:
    result = await db.execute(select(Form).where(Form.id == form_id))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_format_nts_radiogram_matches_expected_plaintext(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "RADIOGRAM", RADIOGRAM_VALUES)
    form = await _fetch_form(db, form_id)

    output = format_nts_radiogram(form)
    lines = output.split("\n")

    filed_date = form.filed_at.strftime("%b %d").upper()
    expected_preamble = "NR 123 R HXG KC1JMH 6 PORTLAND ME 1432 {}".format(filed_date)

    expected_lines = [
        expected_preamble,
        "JIM KUTSCH KY2D",
        "123 MAIN ST",
        "NEWINGTON CT 06111",
        "TEL 860 555 1234",
        "EMAIL JIM AT EXAMPLE DOT COM",
        "BT",
        "PLEASE ADVISE YOUR STATUS AND",
        "73",
        "BT",
        "BRAD",
    ]
    assert lines == expected_lines

    # Exactly two BT breaks, never more or fewer.
    assert sum(1 for l in lines if l == "BT") == 2
    # Body is grouped 5 words per line (last group may be shorter).
    assert lines[7].split() == ["PLEASE", "ADVISE", "YOUR", "STATUS", "AND"]
    assert lines[8].split() == ["73"]


@pytest.mark.asyncio
async def test_radiogram_round_trip_recovers_field_values(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "RADIOGRAM", RADIOGRAM_VALUES)
    form = await _fetch_form(db, form_id)

    formatted = format_nts_radiogram(form)
    parsed = parse_nts_radiogram(formatted)

    assert parsed["form_type"] == "RADIOGRAM"
    fields = parsed["fields"]
    assert fields["number"]["value"] == "123"
    assert fields["precedence"]["value"] == "R"
    assert fields["handling"]["value"] == "HXG"
    assert fields["station_of_origin"]["value"] == "KC1JMH"
    assert fields["place_of_origin"]["value"] == "PORTLAND ME"
    assert fields["filed_time"]["value"] == "1432"
    assert fields["to_name"]["value"] == "JIM KUTSCH"
    assert fields["to_callsign"]["value"] == "KY2D"
    assert fields["to_address"]["value"] == "123 MAIN ST"
    assert fields["to_city_state"]["value"] == "NEWINGTON CT"
    assert fields["to_zip"]["value"] == "06111"
    assert fields["to_phone"]["value"] == "860 555 1234"
    assert fields["to_email"]["value"] == "jim@example.com"
    assert fields["signature"]["value"] == "BRAD"
    assert fields["text"]["value"] == "PLEASE ADVISE YOUR STATUS AND 73"

    # The stated check (from our own preamble) matches the recomputed one.
    assert parsed["check_stated"] == 6
    assert parsed["check_count"] == 6
    assert parsed["check_count"] == form.check_count
    assert not any("mismatch" in w or "does not match" in w for w in parsed["warnings"])

    # High confidence throughout a clean, well-formed round trip.
    for name in ("number", "precedence", "station_of_origin", "to_name", "to_zip", "signature", "text"):
        assert fields[name]["confidence"] == "high", (name, fields[name])
        assert fields[name]["source"] == "bt_block"


@pytest.mark.asyncio
async def test_parse_tolerates_missing_bt_breaks(client, db, owner):
    """D5: BT breaks are preferred, not required. Removing both BT lines
    must still yield a usable partial parse via positional heuristics, not
    an error."""
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "RADIOGRAM", RADIOGRAM_VALUES)
    form = await _fetch_form(db, form_id)

    formatted = format_nts_radiogram(form)
    without_bt = "\n".join(l for l in formatted.split("\n") if l != "BT")

    parsed = parse_nts_radiogram(without_bt)

    assert parsed["form_type"] == "RADIOGRAM"
    assert any("BT breaks missing" in w for w in parsed["warnings"])
    fields = parsed["fields"]
    # The heuristic path still recovers the address block, body, and signature.
    assert fields["to_zip"]["value"] == "06111"
    assert fields["to_phone"]["value"] == "860 555 1234"
    assert fields["signature"]["value"] == "BRAD"
    assert fields["text"]["value"] == "PLEASE ADVISE YOUR STATUS AND 73"
    assert fields["to_name"]["source"] == "heuristic"
    assert parsed["check_count"] == 6


@pytest.mark.asyncio
async def test_parse_reflowed_body_lines_parse_identically(client, db, owner):
    """D5: reflowed lines are harmless -- the body is rejoined on whitespace
    regardless of how it was line-wrapped on the wire."""
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "RADIOGRAM", RADIOGRAM_VALUES)
    form = await _fetch_form(db, form_id)

    formatted = format_nts_radiogram(form)
    lines = formatted.split("\n")
    bt_indices = [i for i, l in enumerate(lines) if l == "BT"]
    first_bt, second_bt = bt_indices

    # Replace the clean 5-word grouping with an odd, hand-relayed rewrap.
    reflowed = ["PLEASE ADVISE", "YOUR", "STATUS AND 73"]
    rewrapped_lines = lines[: first_bt + 1] + reflowed + lines[second_bt:]
    rewrapped_text = "\n".join(rewrapped_lines)

    parsed_original = parse_nts_radiogram(formatted)
    parsed_reflowed = parse_nts_radiogram(rewrapped_text)

    assert parsed_reflowed["fields"]["text"]["value"] == parsed_original["fields"]["text"]["value"]
    assert parsed_reflowed["check_count"] == parsed_original["check_count"]


@pytest.mark.asyncio
async def test_parse_reports_check_mismatch_without_erroring(client, db, owner):
    """D5: the check is never trusted from the wire. A deliberately wrong
    stated check must produce a mismatch warning with both values preserved,
    never an exception."""
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "RADIOGRAM", RADIOGRAM_VALUES)
    form = await _fetch_form(db, form_id)

    formatted = format_nts_radiogram(form)
    tampered = formatted.replace(" 6 PORTLAND", " 99 PORTLAND", 1)

    parsed = parse_nts_radiogram(tampered)

    assert parsed["check_stated"] == 99
    assert parsed["check_count"] == 6
    assert any("stated check 99" in w and "computed check 6" in w for w in parsed["warnings"])
    assert parsed["fields"]["text"]["confidence"] == "low"
    assert parsed["fields"]["check"]["value"] == 6


def test_parse_unparseable_input_never_raises():
    """D5: hard failure only on empty input or the size cap. Garbage text
    must degrade to form_type == 'unknown' with the input preserved, never
    a 500 (an exception, in this pure-function context)."""
    garbage = "asdlkfjaslkdfj\nqwername is not a radiogram\nnor ics213\n"

    result = parse_nts_radiogram(garbage)
    assert result["form_type"] == "unknown"
    assert result["raw_text"] == garbage

    result2 = parse_ics213(garbage)
    assert result2["form_type"] == "unknown"
    assert result2["raw_text"] == garbage

    result3 = parse_any(garbage)
    assert result3["form_type"] == "unknown"


def test_parse_empty_and_oversized_input_raises():
    with pytest.raises(ValueError):
        parse_nts_radiogram("")
    with pytest.raises(ValueError):
        parse_nts_radiogram("   \n  ")
    with pytest.raises(ValueError):
        parse_nts_radiogram("NR 1 R " + ("X" * (33 * 1024)))

    with pytest.raises(ValueError):
        parse_ics213("")


@pytest.mark.asyncio
async def test_ics213_format_and_parse_round_trip(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "ICS213", ICS213_VALUES)
    form = await _fetch_form(db, form_id)

    formatted = format_ics213(form)
    assert "ICS-213 GENERAL MESSAGE FORM" in formatted
    assert "To: Jane Smith (Operations Chief)" in formatted
    assert "From: Brad Brown (Net Control)" in formatted
    assert "Reply Requested: Yes" in formatted
    assert re.search(r"Date/Time: \d{4}-\d{2}-\d{2} \d{4}Z", formatted)

    parsed = parse_ics213(formatted)
    assert parsed["form_type"] == "ICS213"
    fields = parsed["fields"]
    assert fields["incident_name"]["value"] == "Coastal Storm Watch"
    assert fields["to_name"]["value"] == "Jane Smith"
    assert fields["to_position"]["value"] == "Operations Chief"
    assert fields["from_name"]["value"] == "Brad Brown"
    assert fields["from_position"]["value"] == "Net Control"
    assert fields["subject"]["value"] == "Shelter status update"
    assert fields["priority"]["value"] == "Urgent"
    assert fields["reply_requested"]["value"] == "Yes"
    assert fields["message"]["value"] == "Shelter at 123 Main St is open.\nCapacity is 40 of 80."
    assert not parsed["warnings"]


@pytest.mark.asyncio
async def test_formatters_registry_dispatches_by_output_format(client, db, owner):
    await upsert_form_definitions(db)

    assert get_formatter("nts_radiogram") == (format_nts_radiogram, parse_nts_radiogram)
    assert get_formatter("ics213") == (format_ics213, parse_ics213)
    assert set(FORMATTERS.keys()) == {"nts_radiogram", "ics213"}

    with pytest.raises(KeyError):
        get_formatter("does_not_exist")

    radiogram_id = await _create_form(client, owner, "RADIOGRAM", RADIOGRAM_VALUES)
    result = await db.execute(
        select(Form).where(Form.id == radiogram_id)
    )
    form = result.scalar_one()
    from sqlalchemy.orm import selectinload
    from app.models import FormDefinition
    result = await db.execute(
        select(Form).options(selectinload(Form.definition)).where(Form.id == radiogram_id)
    )
    form = result.scalar_one()

    assert format_form(form) == format_nts_radiogram(form)

    dispatched = parse_any(format_nts_radiogram(form))
    assert dispatched["form_type"] == "RADIOGRAM"

    ics213_id = await _create_form(client, owner, "ICS213", ICS213_VALUES)
    result = await db.execute(
        select(Form).options(selectinload(Form.definition)).where(Form.id == ics213_id)
    )
    ics213_form = result.scalar_one()
    dispatched_ics = parse_any(format_ics213(ics213_form))
    assert dispatched_ics["form_type"] == "ICS213"
