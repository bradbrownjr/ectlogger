"""
ICS-205 communications plan (migration 102, services/channel_plan.py).

Covers the frequency fields' validators, the channel plan's save rules
(replace, order, drop channels the net doesn't use), what a signed-out
viewer sees, the copy from a schedule to its nets on both creation paths,
and that a net with the feature off reads exactly as before.
"""
import importlib.util
import os
import re
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import ChannelPlanEntry, Frequency, Net, NetTemplate, net_template_frequencies
from app.ncs_reminder_service import NCSReminderService
from app.services.channel_plan import (
    CTCSS_TONES, DCS_CODES, ICS_FUNCTIONS, PLAN_ROLES, normalize_bandwidth, normalize_offset, normalize_tone,
)
from tests.conftest import auth_headers


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw, stored", [
    ("-0.6", "-0.600"), ("+5", "+5.000"), ("-0.600", "-0.600"), ("+0.6", "+0.600"),
    ("−0.600", "-0.600"),  # the minus sign the net view prints
    ("-0.6 MHz", "-0.600"), (" -1.6 ", "-1.600"), ("+12.000", "+12.000"),
    ("0", None), ("0.000", None), ("", None), (None, None), ("   ", None),
])
def test_offset_normalized(raw, stored):
    assert normalize_offset(raw) == stored


@pytest.mark.parametrize("raw", ["0.6", "5", "-600", "-0.6005", "minus 0.6", "-0.6kHz", "abc", "--0.6", "-"])
def test_bad_offset_refused(raw):
    with pytest.raises(ValueError):
        normalize_offset(raw)


def test_unsigned_offset_explains_the_sign():
    with pytest.raises(ValueError, match=r"\+ or - sign"):
        normalize_offset("0.6")


@pytest.mark.parametrize("raw, stored", [
    ("100", "100.0"), ("100.0", "100.0"), ("PL 100.0", "100.0"), ("pl100", "100.0"),
    ("CTCSS 88.5", "88.5"), ("88.5 Hz", "88.5"), ("T 141.3", "141.3"), ("67", "67.0"),
    ("69.4", "69.3"),  # NIFOG: "69.4 in some radios"
    ("254.1", "254.1"), ("159.8", "159.8"),
    ("D023", "D023"), ("d023", "D023"), ("023", "D023"), ("DCS 754", "D754"), ("DPL 131", "D131"),
    ("D131", "D131"),
    ("NAC 293", "NAC 293"), ("nac 293", "NAC 293"), ("NAC $F7E", "NAC F7E"), ("$293", "NAC 293"),
    ("NAC293", "NAC 293"),
    ("", None), (None, None),
])
def test_tone_normalized(raw, stored):
    assert normalize_tone(raw) == stored


@pytest.mark.parametrize("raw", [
    "100.5", "71.0", "300", "D024", "D999", "024", "NAC 29", "NAC GGG", "abc", "PL", "131.85",
])
def test_bad_tone_refused(raw):
    with pytest.raises(ValueError):
        normalize_tone(raw)


def test_bare_dcs_number_points_at_the_d():
    """131 is a DCS code and a likely typo for 131.8 Hz; it isn't guessed."""
    with pytest.raises(ValueError, match="D131"):
        normalize_tone("131")


def test_tone_lists_match_their_sources():
    assert len(CTCSS_TONES) == 50
    assert len(DCS_CODES) == 104
    assert all(len(c) == 3 and set(c) <= set("01234567") for c in DCS_CODES)


@pytest.mark.parametrize("raw, stored", [
    ("N", "N"), ("w", "W"), ("narrow", "N"), ("Wide", "W"), ("", None), (None, None),
])
def test_bandwidth_normalized(raw, stored):
    assert normalize_bandwidth(raw) == stored


def test_bad_bandwidth_refused():
    with pytest.raises(ValueError):
        normalize_bandwidth("M")


# ---------------------------------------------------------------------------
# Migration 102
# ---------------------------------------------------------------------------

def _load_migration():
    path = os.path.join(os.path.dirname(__file__), "..", "migrations", "102_add_ics205.py")
    spec = importlib.util.spec_from_file_location("migration_102", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_102_is_additive_and_idempotent(tmp_path):
    db_path = str(tmp_path / "old.db")
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE frequencies (id INTEGER PRIMARY KEY, frequency VARCHAR(50), mode VARCHAR(50));
        CREATE TABLE nets (id INTEGER PRIMARY KEY, name VARCHAR(255));
        CREATE TABLE net_templates (id INTEGER PRIMARY KEY, name VARCHAR(200));
        INSERT INTO frequencies (id, frequency, mode) VALUES (1, '146.940', 'FM');
        INSERT INTO nets (id, name) VALUES (1, 'Old net');
        INSERT INTO net_templates (id, name) VALUES (1, 'Old schedule');
    """)
    conn.commit()
    conn.close()

    migration = _load_migration()
    migration.migrate(db_path)
    migration.migrate(db_path)  # second run changes nothing

    conn = sqlite3.connect(db_path)
    cols = lambda t: {row[1] for row in conn.execute(f"PRAGMA table_info({t})")}
    assert {"offset", "tx_tone", "rx_tone", "bandwidth"} <= cols("frequencies")
    assert {"ics205_enabled", "ics205_special_instructions"} <= cols("nets")
    assert {"ics205_enabled", "ics205_special_instructions"} <= cols("net_templates")
    assert conn.execute("SELECT ics205_enabled FROM nets WHERE id = 1").fetchone() == (0,)
    assert conn.execute("SELECT ics205_enabled FROM net_templates WHERE id = 1").fetchone() == (0,)
    conn.execute("INSERT INTO channel_plan_entries (net_id, frequency_id, position) VALUES (1, 1, 0)")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO channel_plan_entries (net_id, frequency_id, position) VALUES (1, 1, 1)")
    conn.execute("INSERT INTO channel_plan_entries (template_id, frequency_id, position) VALUES (1, 1, 0)")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO channel_plan_entries (template_id, frequency_id, position) VALUES (1, 1, 1)")
    conn.close()


def test_migration_matches_the_model():
    """The columns migration 102 adds are the ones models.py declares."""
    migration = _load_migration()
    assert {n for n, _ in migration.FREQUENCY_COLUMNS} <= {c.name for c in Frequency.__table__.columns}
    for model in (Net, NetTemplate):
        assert {n for n, _ in migration.SETTING_COLUMNS} <= {c.name for c in model.__table__.columns}
    assert {"net_id", "template_id", "frequency_id", "position", "plan_role", "ics_function",
            "assignment", "remarks"} <= {c.name for c in ChannelPlanEntry.__table__.columns}


# ---------------------------------------------------------------------------
# Frequencies API
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_frequency_round_trip_with_repeater_fields(client, owner, admin):
    resp = await client.post("/api/frequencies", json={
        "frequency": "146.940", "mode": "FM", "offset": "-0.6",
        "tx_tone": "PL 100", "rx_tone": "100", "bandwidth": "w",
    }, headers=auth_headers(owner))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert (data["offset"], data["tx_tone"], data["rx_tone"], data["bandwidth"]) == ("-0.600", "100.0", "100.0", "W")

    # The creator may still fix it (the existing change rules apply unchanged).
    resp = await client.put(f"/api/frequencies/{data['id']}", json={
        "frequency": "146.940", "mode": "FM", "offset": "", "tx_tone": "D023", "rx_tone": None, "bandwidth": "N",
    }, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert (data["offset"], data["tx_tone"], data["rx_tone"], data["bandwidth"]) == (None, "D023", None, "N")

    usage = await client.get("/api/frequencies/admin/with-usage", headers=auth_headers(admin))
    row = next(r for r in usage.json() if r["id"] == data["id"])
    assert row["tx_tone"] == "D023" and row["bandwidth"] == "N"


@pytest.mark.asyncio
async def test_bad_repeater_fields_are_422(client, owner):
    for field, value in (("offset", "0.6"), ("tx_tone", "123.4"), ("rx_tone", "D024"), ("bandwidth", "X")):
        resp = await client.post("/api/frequencies", json={"frequency": "147.000", "mode": "FM", field: value},
                                 headers=auth_headers(owner))
        assert resp.status_code == 422, (field, resp.text)


@pytest.mark.asyncio
async def test_someone_elses_frequency_still_refused(client, owner, other):
    """The new fields follow the existing change rule."""
    created = await client.post("/api/frequencies", json={"frequency": "146.520", "mode": "FM"},
                                headers=auth_headers(owner))
    resp = await client.put(f"/api/frequencies/{created.json()['id']}",
                            json={"frequency": "146.520", "mode": "FM", "tx_tone": "100.0"},
                            headers=auth_headers(other))
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Net channel plans
# ---------------------------------------------------------------------------

async def _frequencies(db, n=3):
    rows = [Frequency(frequency=f"14{6 + i}.{i}00", mode="FM") for i in range(n)]
    db.add_all(rows)
    await db.commit()
    return [r.id for r in rows]


def _plan(*rows):
    return [dict(zip(("frequency_id", "plan_role", "ics_function", "assignment", "remarks"), r)) for r in rows]


@pytest.mark.asyncio
async def test_net_saves_plan_in_order_and_drops_unused_channels(client, db, owner):
    f1, f2, f3 = await _frequencies(db)
    headers = auth_headers(owner)  # db.expire_all() below expires the fixture
    resp = await client.post("/api/nets/", json={
        "name": "SET", "frequency_ids": [f1, f2],
        "ics205_enabled": True, "ics205_special_instructions": "  Check in by county.  ",
        "channel_plan": _plan(
            (f2, "primary", "command", "Net control", "Linked to 2m"),
            (f3, "alternate", None, None, None),       # not on the net: dropped
            (f1, "emergency", "tactical", "  ", ""),   # blanks are stored as null
        ),
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["ics205_enabled"] is True
    assert data["ics205_special_instructions"] == "Check in by county."
    assert data["channel_plan"] == _plan(
        (f2, "primary", "command", "Net control", "Linked to 2m"),
        (f1, "emergency", "tactical", None, None),
    )
    rows = (await db.execute(select(ChannelPlanEntry).where(ChannelPlanEntry.net_id == data["id"]))).scalars().all()
    assert sorted((r.frequency_id, r.position) for r in rows) == [(f1, 1), (f2, 0)]

    # Reorder and edit: same rows updated in place, new order kept.
    net_id = data["id"]
    resp = await client.put(f"/api/nets/{net_id}", json={"channel_plan": _plan(
        (f1, "primary", "command", "NCS", None),
        (f2, "alternate", "support", None, "Backup"),
    )}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert [e["frequency_id"] for e in resp.json()["channel_plan"]] == [f1, f2]

    # Leaving channel_plan out keeps it; taking a frequency off the net drops its line.
    resp = await client.put(f"/api/nets/{net_id}", json={"frequency_ids": [f2, f3]}, headers=headers)
    assert resp.json()["channel_plan"] == _plan((f2, "alternate", "support", None, "Backup"))
    db.expire_all()
    rows = (await db.execute(select(ChannelPlanEntry).where(ChannelPlanEntry.net_id == net_id))).scalars().all()
    assert [(r.frequency_id, r.position) for r in rows] == [(f2, 0)]

    # Turning the switch off keeps the plan for later; an explicit null is ignored.
    resp = await client.put(f"/api/nets/{net_id}", json={"ics205_enabled": False}, headers=headers)
    assert resp.json()["ics205_enabled"] is False and len(resp.json()["channel_plan"]) == 1
    resp = await client.put(f"/api/nets/{net_id}", json={"ics205_enabled": None}, headers=headers)
    assert resp.status_code == 200 and resp.json()["ics205_enabled"] is False

    # An empty list clears it.
    resp = await client.put(f"/api/nets/{net_id}", json={"channel_plan": []}, headers=headers)
    assert resp.json()["channel_plan"] == []


@pytest.mark.asyncio
async def test_bad_plans_are_422(client, db, owner):
    f1, f2, _ = await _frequencies(db)
    net = (await client.post("/api/nets/", json={"name": "N", "frequency_ids": [f1, f2]},
                             headers=auth_headers(owner))).json()
    for plan in (
        _plan((f1, "primary", None, None, None), (f1, "alternate", None, None, None)),  # duplicate
        _plan((f1, "secondary", None, None, None)),                                    # not a PACE role
        _plan((f1, None, "logistics", None, None)),                                    # not an ICS function
        _plan((f1, None, None, "x" * 101, None)),
        _plan((f1, None, None, None, "x" * 256)),
    ):
        resp = await client.put(f"/api/nets/{net['id']}", json={"channel_plan": plan}, headers=auth_headers(owner))
        assert resp.status_code == 422, plan
    resp = await client.put(f"/api/nets/{net['id']}", json={"ics205_special_instructions": "x" * 5001},
                            headers=auth_headers(owner))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_guest_sees_roles_only(client, db, owner):
    f1, f2, _ = await _frequencies(db)
    net = (await client.post("/api/nets/", json={
        "name": "Guest view", "frequency_ids": [f1, f2], "ics205_enabled": True,
        "ics205_special_instructions": "Shelter at the high school",
        "channel_plan": _plan((f1, "primary", "command", "EOC liaison", "Ask for Jane"),
                              (f2, "alternate", "tactical", "Shelter 3", "Cell 207-555-0100")),
    }, headers=auth_headers(owner))).json()

    signed_in = (await client.get(f"/api/nets/{net['id']}", headers=auth_headers(owner))).json()
    assert signed_in["ics205_special_instructions"] == "Shelter at the high school"
    assert signed_in["channel_plan"][0]["assignment"] == "EOC liaison"

    expected_guest = _plan((f1, "primary", None, None, None), (f2, "alternate", None, None, None))
    guest = (await client.get(f"/api/nets/{net['id']}")).json()
    assert guest["ics205_enabled"] is True
    assert guest["ics205_special_instructions"] is None
    assert guest["channel_plan"] == expected_guest
    listed = next(n for n in (await client.get("/api/nets/")).json() if n["id"] == net["id"])
    assert listed["ics205_special_instructions"] is None
    assert listed["channel_plan"] == expected_guest


@pytest.mark.asyncio
async def test_net_with_ics205_off_reads_as_before(client, db, owner):
    f1, _, _ = await _frequencies(db)
    net = (await client.post("/api/nets/", json={"name": "Plain", "frequency_ids": [f1]},
                             headers=auth_headers(owner))).json()
    for data in (net, (await client.get(f"/api/nets/{net['id']}")).json()):
        assert data["ics205_enabled"] is False
        assert data["ics205_special_instructions"] is None
        assert data["channel_plan"] == []
        assert data["frequencies"][0]["offset"] is None and data["frequencies"][0]["tx_tone"] is None


@pytest.mark.asyncio
async def test_clone_and_other_responses_still_build(client, db, owner):
    """Endpoints that build a net response from a new or reloaded net."""
    f1, _, _ = await _frequencies(db)
    net = (await client.post("/api/nets/", json={
        "name": "Clone me", "frequency_ids": [f1], "ics205_enabled": True,
        "channel_plan": _plan((f1, "primary", None, None, None)),
    }, headers=auth_headers(owner))).json()
    clone = await client.post(f"/api/nets/{net['id']}/clone", headers=auth_headers(owner))
    assert clone.status_code in (200, 201), clone.text
    assert clone.json()["channel_plan"] == []
    resp = await client.put(f"/api/nets/{net['id']}/active-frequency/{f1}", headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["channel_plan"][0]["frequency_id"] == f1


@pytest.mark.asyncio
async def test_deleting_a_frequency_drops_its_plan_line(client, db, owner):
    created = (await client.post("/api/frequencies", json={"frequency": "145.110", "mode": "FM"},
                                 headers=auth_headers(owner))).json()
    net = (await client.post("/api/nets/", json={
        "name": "Own net", "frequency_ids": [created["id"]],
        "channel_plan": _plan((created["id"], "primary", None, None, None)),
    }, headers=auth_headers(owner))).json()
    # The form's own net doesn't count as "another" use (change_refusal).
    resp = await client.delete(f"/api/frequencies/{created['id']}?net_id={net['id']}", headers=auth_headers(owner))
    assert resp.status_code == 204, resp.text
    left = (await db.execute(select(ChannelPlanEntry).where(ChannelPlanEntry.frequency_id == created["id"]))).scalars().all()
    assert left == []
    assert (await client.get(f"/api/nets/{net['id']}", headers=auth_headers(owner))).json()["channel_plan"] == []


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------

async def _schedule_with_plan(client, db, admin, schedule_type="weekly"):
    f1, f2, f3 = await _frequencies(db)
    resp = await client.post("/api/templates/", json={
        "name": "ARES weekly", "schedule_type": schedule_type,
        "schedule_config": {"time": "19:00", "day_of_week": 4, "timezone": "UTC"},
        "frequency_ids": [f1, f2],
        "ics205_enabled": True, "ics205_special_instructions": "Use tactical calls",
        "channel_plan": _plan((f2, "primary", "command", "NCS", "Repeater"),
                              (f1, "alternate", "tactical", None, "Simplex"),
                              (f3, "emergency", None, None, None)),  # not on the schedule
    }, headers=auth_headers(admin))
    assert resp.status_code == 201, resp.text
    return resp.json(), (f1, f2, f3)


@pytest.mark.asyncio
async def test_schedule_plan_and_guest_view(client, db, admin):
    template, (f1, f2, _) = await _schedule_with_plan(client, db, admin)
    assert template["channel_plan"] == _plan((f2, "primary", "command", "NCS", "Repeater"),
                                             (f1, "alternate", "tactical", None, "Simplex"))
    guest = (await client.get(f"/api/templates/{template['id']}")).json()
    assert guest["ics205_enabled"] is True
    assert guest["ics205_special_instructions"] is None
    assert guest["channel_plan"] == _plan((f2, "primary", None, None, None), (f1, "alternate", None, None, None))
    listed = next(t for t in (await client.get("/api/templates/")).json() if t["id"] == template["id"])
    assert listed["channel_plan"][0]["assignment"] is None


@pytest.mark.asyncio
async def test_save_to_schedule_shape(client, db, admin):
    """Edit Net's Save to Schedule sends the shared settings, frequency_ids
    included, to PUT /templates/{id}; the ids are the shared list's."""
    template, (f1, f2, f3) = await _schedule_with_plan(client, db, admin)
    resp = await client.put(f"/api/templates/{template['id']}", json={
        "name": "ARES weekly", "frequency_ids": [f3, f1],
        "ics205_enabled": True, "ics205_special_instructions": None,
        "channel_plan": _plan((f3, "primary", "command", "New repeater", None),
                              (f2, "alternate", None, None, None),   # dropped with the frequency
                              (f1, "contingency", "support", None, None)),
    }, headers=auth_headers(admin))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["ics205_special_instructions"] is None
    assert data["channel_plan"] == _plan((f3, "primary", "command", "New repeater", None),
                                         (f1, "contingency", "support", None, None))

    # Only the frequency list changes: lines for removed channels go.
    resp = await client.put(f"/api/templates/{template['id']}", json={"frequency_ids": [f1]},
                            headers=auth_headers(admin))
    assert resp.json()["channel_plan"] == _plan((f1, "contingency", "support", None, None))
    # Neither sent: the plan is untouched.
    resp = await client.put(f"/api/templates/{template['id']}", json={"name": "Renamed"},
                            headers=auth_headers(admin))
    assert len(resp.json()["channel_plan"]) == 1


@pytest.mark.asyncio
async def test_manually_created_net_copies_the_plan(client, db, admin):
    template, (f1, f2, _) = await _schedule_with_plan(client, db, admin, schedule_type="ad_hoc")
    resp = await client.post(f"/api/templates/{template['id']}/create-net", headers=auth_headers(admin))
    assert resp.status_code == 200, resp.text
    net = resp.json()
    assert net["ics205_enabled"] is True
    assert net["ics205_special_instructions"] == "Use tactical calls"
    assert net["channel_plan"] == template["channel_plan"]
    # A copy, not shared rows: editing the net leaves the schedule alone.
    await client.put(f"/api/nets/{net['id']}", json={"channel_plan": []}, headers=auth_headers(admin))
    again = (await client.get(f"/api/templates/{template['id']}", headers=auth_headers(admin))).json()
    assert again["channel_plan"] == template["channel_plan"]


@pytest.mark.asyncio
async def test_auto_created_net_copies_the_plan(client, db, admin):
    template_json, (f1, f2, _) = await _schedule_with_plan(client, db, admin)
    template = (await db.execute(select(NetTemplate).where(NetTemplate.id == template_json["id"]))).scalar_one()
    await db.refresh(template, ["frequencies"])
    net_id = await NCSReminderService()._get_or_create_scheduled_net(
        db, template, datetime.utcnow().replace(microsecond=0) + timedelta(days=1)
    )
    assert net_id is not None
    db.expire_all()
    rows = (await db.execute(
        select(ChannelPlanEntry).where(ChannelPlanEntry.net_id == net_id).order_by(ChannelPlanEntry.position)
    )).scalars().all()
    assert [(r.frequency_id, r.plan_role, r.ics_function, r.assignment, r.remarks) for r in rows] == [
        (f2, "primary", "command", "NCS", "Repeater"),
        (f1, "alternate", "tactical", None, "Simplex"),
    ]
    assert all(r.template_id is None for r in rows)
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    assert net.ics205_enabled is True and net.ics205_special_instructions == "Use tactical calls"


@pytest.mark.asyncio
async def test_deleting_a_schedule_or_net_removes_its_plan(client, db, admin):
    template, _ = await _schedule_with_plan(client, db, admin, schedule_type="ad_hoc")
    net = (await client.post(f"/api/templates/{template['id']}/create-net", headers=auth_headers(admin))).json()
    resp = await client.delete(f"/api/nets/{net['id']}", headers=auth_headers(admin))
    assert resp.status_code in (200, 204), resp.text
    resp = await client.delete(f"/api/templates/{template['id']}", headers=auth_headers(admin))
    assert resp.status_code in (200, 204), resp.text
    assert (await db.execute(select(ChannelPlanEntry))).scalars().all() == []


# ---------------------------------------------------------------------------
# The frontend's copy of the lists (frontend/src/utils/channelPlan.ts)
# ---------------------------------------------------------------------------
# The tone pickers offer only the frontend's lists, so a tone the server
# refuses, or one it accepts that the picker can't offer, is a drift between
# the two copies. Same guard as tests/test_frequency_modes.py.

FRONTEND_PLAN = Path(__file__).resolve().parents[2] / "frontend" / "src" / "utils" / "channelPlan.ts"


def _frontend_array(name: str) -> list[str]:
    source = FRONTEND_PLAN.read_text()
    body = source[source.index(f"export const {name}"):]
    body = body[body.index("= [") : body.index("\n]")]  # the array's closing bracket
    values = re.findall(r"value: '([^']+)'", body)
    return values or re.findall(r"'([^']+)'", body)


def test_frontend_ctcss_tones_match():
    assert _frontend_array("CTCSS_TONES") == sorted(CTCSS_TONES, key=float)


def test_frontend_dcs_codes_match():
    source = FRONTEND_PLAN.read_text()
    assert ".map((code) => `D${code}`)" in source[source.index("export const DCS_CODES"):]
    assert _frontend_array("DCS_CODES") == sorted(DCS_CODES)


def test_frontend_roles_and_functions_match():
    assert _frontend_array("PLAN_ROLES") == list(PLAN_ROLES)
    assert _frontend_array("ICS_FUNCTIONS") == list(ICS_FUNCTIONS)


def test_every_frontend_tone_option_is_stored_as_offered():
    """What a picker sends comes back unchanged: CTCSS "100.0", DCS "D023",
    and NAC "NAC 000" to "NAC FFF" (the frontend builds all 4096)."""
    offered = list(CTCSS_TONES) + [f"D{c}" for c in DCS_CODES] + [f"NAC {n:03X}" for n in range(4096)]
    assert "nacOptions" in FRONTEND_PLAN.read_text() and "length: 4096" in FRONTEND_PLAN.read_text()
    assert [normalize_tone(v) for v in offered] == offered
