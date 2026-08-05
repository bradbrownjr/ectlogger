"""
Tests for the RRI strip formatter layer (app/traffic/rri_strip.py) and the
net-scoped bulk export it feeds (routers/nets_export.py::export_net_rri_strips).
See TRAFFIC-HANDLING-DESIGN.md's RRI strip section: WXOBS and GYX-CAR-SKYWARN
are fully-fielded strips (output_format "rri_strip"), RRI_STRIP_OTHER is the
paste-and-save catch-all for any strip type without a dedicated schema
(output_format "rri_strip_raw"). Forms are created through the real
POST /api/traffic/forms endpoint so promoted columns (including
normalized_text) come from the real app/traffic/promote.py path.
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from tests.conftest import auth_headers
from app.models import Form, Net, TrafficAction
from app.traffic.definitions import upsert_form_definitions
from app.traffic.formatters import format_form, parse_any
from app.traffic.log import append_entry
from app.traffic.rri_strip import format_rri_strip_raw, make_nts_safe, parse_rri_strip, tokenize_strip

WXOBS_VALUES = {
    "call_sign": "W1ABC",
    "skywarn_id": "NA",
    "city": "Portland",
    "state": "ME",
    "mgrs": "19TCH1234",
    "nws_cwa": "GYX",
    "observation_time": "121800Z",
    "wind_dir": "NW",
    "wind_speed": "12",
    "wind_gusts": "20",
    "clouds": "OVC",
    "temp": "-5",
    "barometer": "1012.3",
    "barometer_trend": "S",
    "precip_type": "RA",
    "precip_current": "0.25",
    "precip_storm_total": "1.10",
    "precip_liquid_equiv": "0.90",
    "comments": "Minor street flooding on Main St",
}

RRI_STRIP_OTHER_VALUES = {
    "subject": "SITREP - Route 4 bridge closure",
    "call_sign": "W1ABC",
    "strip_text": "SITREP/whatever RRI publishes next//",
}


async def _create_form(client, owner, form_type, values, net_id=None):
    payload = {"form_type": form_type, "field_values": values}
    if net_id is not None:
        payload["net_id"] = net_id
    resp = await client.post("/api/traffic/forms", json=payload, headers=auth_headers(owner))
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _fetch_form(db, form_id) -> Form:
    result = await db.execute(
        select(Form).options(selectinload(Form.definition)).where(Form.id == form_id)
    )
    return result.scalar_one()


@pytest.mark.asyncio
async def test_format_rri_strip_wxobs_matches_canonical_string(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "WXOBS", WXOBS_VALUES)
    form = await _fetch_form(db, form_id)

    expected = (
        "WXOBS/W1ABC/NA/PORTLAND/ME/19TCH1234/GYX/ /"
        "121800Z/ /"
        "NW/12/20/ /"
        "OVC/ /"
        "-5/ /"
        "1012.3/S/ /"
        "RA/0.25/1.10/0.90/ /"
        "MINOR STREET FLOODING ON MAIN ST//"
    )
    assert format_form(form) == expected
    # Cached at create time -- normalized_text is authoritative for export.
    assert form.normalized_text == expected
    # Never substituted by default -- the negative sign survives untouched.
    assert "-5" in form.normalized_text
    assert "M5" not in form.normalized_text


@pytest.mark.asyncio
async def test_wxobs_round_trip_recovers_field_values(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "WXOBS", WXOBS_VALUES)
    form = await _fetch_form(db, form_id)

    parsed = parse_rri_strip(format_form(form))
    assert parsed["form_type"] == "WXOBS"
    fields = parsed["fields"]
    assert fields["call_sign"]["value"] == "W1ABC"
    assert fields["city"]["value"] == "PORTLAND"
    assert fields["temp"]["value"] == "-5"
    assert fields["clouds"]["value"] == "OVC"
    assert fields["comments"]["value"] == "MINOR STREET FLOODING ON MAIN ST"
    assert parsed["warnings"] == []


@pytest.mark.asyncio
async def test_format_rri_strip_gyx_car_skywarn_matches_canonical_string(client, db, owner):
    await upsert_form_definitions(db)
    values = {
        "date": "08-04-2026",
        "time": "1200L",
        "call_sign": "W1ABC",
        "spotter_id": "NA",
        "source": "Trained Spotter",
        "location": "Portland",
        "state_cwa": "ME GYX",
        "current_weather": "Heavy Rain",
        "snow_sleet": "",
        "ice_accretion": "",
        "rainfall": "1.5in",
        "hail_size": "",
        "wind_dir_speed": "NW 20G30",
        "storm_damage": "Flooded intersection",
        "mode": "Voice",
        "net": "GYX SKYWARN Net",
    }
    form_id = await _create_form(client, owner, "GYX-CAR-SKYWARN", values)
    form = await _fetch_form(db, form_id)

    assert format_form(form).startswith("GYX-CAR WEATHER/08-04-2026/1200L/W1ABC/NA/TRAINED SPOTTER/PORTLAND/ME GYX/")
    assert format_form(form).endswith("//")
    # No "/ /" section breaks in GYX-CAR's spec -- one flat field sequence.
    assert " / " not in format_form(form).replace("/ /", "")


@pytest.mark.asyncio
async def test_format_rri_strip_raw_returns_verbatim_text(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "RRI_STRIP_OTHER", RRI_STRIP_OTHER_VALUES)
    form = await _fetch_form(db, form_id)

    assert format_form(form) == RRI_STRIP_OTHER_VALUES["strip_text"]
    assert form.normalized_text == RRI_STRIP_OTHER_VALUES["strip_text"]
    assert format_rri_strip_raw(form) == RRI_STRIP_OTHER_VALUES["strip_text"]


@pytest.mark.asyncio
async def test_promote_wxobs_subject_and_addressee_fall_back_to_location(client, db, owner):
    await upsert_form_definitions(db)
    form_id = await _create_form(client, owner, "WXOBS", WXOBS_VALUES)
    resp = await client.get(f"/api/traffic/forms/{form_id}", headers=auth_headers(owner))
    body = resp.json()

    # promote.py's generic fallback is case-preserving (it doesn't uppercase,
    # unlike format_rri_strip's own output) -- WXOBS_VALUES submits "Portland"/"ME".
    assert body["addressee_display"] == "Portland ME"
    assert body["subject"] == "Portland ME"


def test_parse_any_falls_through_to_rri_strip_raw_for_unknown_text():
    result = parse_any("Just some random text a net manager wants to save with this entry")
    assert result["form_type"] == "RRI_STRIP_OTHER"
    assert result["fields"]["strip_text"]["value"].startswith("Just some random text")


def test_make_nts_safe_substitutes_minus_for_m_only():
    text = "WXOBS/W1ABC/.../TEMP -5/BAROMETER 1012.3/COMMENT - dash stays//"
    safe = make_nts_safe(text)
    assert "M5" in safe
    assert "-5" not in safe
    # A bare hyphen not immediately followed by a digit is untouched -- this
    # transform only closes RRI's documented minus-sign gap, nothing more.
    assert "COMMENT - dash stays" in safe


@pytest.mark.asyncio
async def test_export_net_traffic_covers_every_form_type(client, db, owner):
    """Covers every form type on the net, not just RRI/WX strips -- a
    Radiogram-only net downloading a blank file (this endpoint's original,
    strip-only scope) was the actual bug the "Export traffic" button surfaced.

    There is only one output format now: "M" is how a negative number is
    written in an RRI strip per the strip spec itself, not an opt-in relay
    transform, so it's applied to strip lines unconditionally."""
    await upsert_form_definitions(db)
    net = Net(name="RRI Strip Export Net", owner_id=owner.id)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    await _create_form(client, owner, "WXOBS", WXOBS_VALUES, net_id=net.id)
    await _create_form(client, owner, "RRI_STRIP_OTHER", RRI_STRIP_OTHER_VALUES, net_id=net.id)
    await client.post(
        "/api/traffic/forms",
        json={
            "form_type": "RADIOGRAM",
            "net_id": net.id,
            "field_values": {
                "number": "1", "precedence": "R - Routine", "station_of_origin": "W1ABC",
                "place_of_origin": "Portland ME", "to_name": "Jim", "to_address": "1 Main St",
                "to_city_state": "Boston MA", "to_zip": "02101", "text": "hello", "signature": "Brad",
            },
        },
        headers=auth_headers(owner),
    )

    resp = await client.get(f"/api/nets/{net.id}/export/rri-strips", headers=auth_headers(owner))
    assert resp.status_code == 200
    text = resp.text
    assert "WXOBS/" in text
    # Every form type appears -- this is the generalization under test.
    assert "NR 1 R" in text
    # Strip lines are M-normalized (the WXOBS fixture carries a -5 temp).
    strip_line = next(line for line in text.split("\n") if line.startswith("WXOBS/"))
    assert "M5" in strip_line and "-5" not in strip_line


@pytest.mark.asyncio
async def test_export_rri_strips_endpoint_requires_net_permission(client, db, owner, other):
    # check_net_permission with no required_roles grants only the owner or an
    # admin -- any other authenticated user must be denied.
    net = Net(name="Someone Else's Net", owner_id=owner.id)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    resp = await client.get(f"/api/nets/{net.id}/export/rri-strips", headers=auth_headers(other))
    assert resp.status_code == 403


# ========== "define fields from a pasted example" (dynamically-defined strip types) ==========
# See routers/traffic_strip_templates.py. "RI" is Request for Information --
# defining a strip's fields once, so every station's answer shares the same
# structure, is the actual RRI mechanism this increment adds.

SITREP_EXAMPLE = "SITREP/04-08-2026/1830/PORTLAND ME/BRIDGE OUT ON RT 4//"


def test_tokenize_strip_splits_example_into_labelable_tokens():
    result = tokenize_strip(SITREP_EXAMPLE)
    assert result["suggested_form_type"] == "SITREP"
    assert [t["value"] for t in result["tokens"]] == [
        "04-08-2026", "1830", "PORTLAND ME", "BRIDGE OUT ON RT 4",
    ]
    assert all(t["starts_new_section"] is False for t in result["tokens"])


def test_tokenize_strip_marks_section_break_after_blank_token():
    result = tokenize_strip("SITREP/A/B/ /C/D//")
    assert [t["starts_new_section"] for t in result["tokens"]] == [False, False, True, False]


def test_tokenize_strip_rejects_empty_input():
    with pytest.raises(ValueError):
        tokenize_strip("   ")


@pytest.mark.asyncio
async def test_tokenize_endpoint_returns_ordered_tokens(client, owner):
    resp = await client.post(
        "/api/traffic/strip-templates/tokenize",
        json={"text": SITREP_EXAMPLE},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["suggested_form_type"] == "SITREP"
    assert len(body["tokens"]) == 4


@pytest.mark.asyncio
async def test_create_strip_template_defines_type_and_files_first_form(client, db, owner):
    await upsert_form_definitions(db)
    resp = await client.post(
        "/api/traffic/strip-templates",
        json={
            "form_type": "sitrep",
            "title": "Situation Report",
            "fields": [
                {"label": "Date", "starts_new_section": False, "value": "04-08-2026"},
                {"label": "Time", "starts_new_section": False, "value": "1830"},
                {"label": "Location", "starts_new_section": True, "value": "Portland ME"},
                {"label": "Status", "starts_new_section": False, "value": "Bridge out on RT 4"},
            ],
        },
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    # form_type normalized to uppercase.
    assert body["form"]["form_type"] == "SITREP"
    assert body["definition"]["title"] == "Situation Report"
    assert body["definition"]["is_builtin"] is False
    assert [f["name"] for f in body["definition"]["fields"]] == ["date", "time", "location", "status"]
    assert body["definition"]["fields"][2]["starts_new_section"] is True

    # The pasted example's own values became the first Form, in RRI's
    # canonical string, section break included, no NTS substitution applied.
    assert body["form"]["normalized_text"] == "SITREP/04-08-2026/1830/ /PORTLAND ME/BRIDGE OUT ON RT 4//"

    # A second station can now answer the SAME defined type through the
    # ordinary create-form endpoint -- no special-casing needed.
    answer_resp = await client.post(
        "/api/traffic/forms",
        json={
            "form_type": "SITREP",
            "field_values": {
                "date": "04-08-2026", "time": "1845", "location": "Route 4 north",
                "status": "Detour in place",
            },
        },
        headers=auth_headers(owner),
    )
    assert answer_resp.status_code == 201, answer_resp.text
    assert answer_resp.json()["normalized_text"] == "SITREP/04-08-2026/1845/ /ROUTE 4 NORTH/DETOUR IN PLACE//"


@pytest.mark.asyncio
async def test_create_strip_template_rejects_duplicate_form_type(client, db, owner):
    await upsert_form_definitions(db)
    resp = await client.post(
        "/api/traffic/strip-templates",
        json={"form_type": "WXOBS", "title": "Duplicate", "fields": [{"label": "X", "value": "1"}]},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_strip_template_dedupes_colliding_field_labels(client, owner):
    resp = await client.post(
        "/api/traffic/strip-templates",
        json={
            "form_type": "DUPTEST",
            "title": "Duplicate Label Test",
            "fields": [
                {"label": "Status", "value": "A"},
                {"label": "Status", "value": "B"},
            ],
        },
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    names = [f["name"] for f in resp.json()["definition"]["fields"]]
    assert names == ["status", "status_2"]


@pytest.mark.asyncio
async def test_create_strip_template_can_define_type_without_filing_a_form(client, owner):
    """Net settings (TrafficSettingsPanel.tsx) defines a strip type up front so
    the net knows what fields to collect -- filing a form of placeholder values
    at that moment would be noise, so file_first_form=False skips it."""
    resp = await client.post(
        "/api/traffic/strip-templates",
        json={
            "form_type": "DRILLCHK",
            "title": "Drill Check-In",
            "file_first_form": False,
            "fields": [
                {"label": "Time", "value": ""},
                {"label": "Callsign", "value": ""},
            ],
        },
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["form"] is None
    assert body["definition"]["form_type"] == "DRILLCHK"
    assert [f["label"] for f in body["definition"]["fields"]] == ["Time", "Callsign"]

    # The type is real and immediately usable -- nothing about skipping the
    # first form leaves it half-created.
    listed = await client.get("/api/traffic/definitions", headers=auth_headers(owner))
    assert "DRILLCHK" in [d["form_type"] for d in listed.json()]

    # ...and no traffic was filed as a side effect.
    forms = await client.get("/api/traffic/forms", headers=auth_headers(owner))
    assert forms.json()["items"] == []
