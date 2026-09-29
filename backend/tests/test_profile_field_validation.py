"""
Profile field validation and admin field locks.

Prompted by the 2026-09-29 NH SKYWARN net: NB9D had "YOUTUBE.COM/@NB9D" in
his profile's spotter number. The NCS's check-in form auto-filled it into a
field the net didn't show, the check-in spam guard rejected it, and the NCS
couldn't check in anyone until they turned the field on to clear it. The
fix checks profile values when they're saved, gives spotter numbers one
character rule everywhere they're written, and lets an admin see and lock
every profile field (User.locked_fields).
"""
import json

import pytest

from app.models import CheckIn, Net, NetStatus, User
from app.schemas import CheckInResponse
from app.utils import normalize_spotter_number
from tests.conftest import auth_headers


# ========== SPOTTER NUMBER RULE ==========

# Every format seen on production (NWS Gray: county letters plus a number,
# written several ways), plus plain numbers used by other offices.
REAL_SPOTTER_NUMBERS = ["YO248", "CU-330", "ME-042", "RO-296", "WST150", "FR86", "21-028", "HL710", "12345", "OUN 42"]


@pytest.mark.parametrize("value", REAL_SPOTTER_NUMBERS)
def test_real_spotter_numbers_accepted(value):
    assert normalize_spotter_number(value) == value


def test_spotter_number_normalized():
    assert normalize_spotter_number("  yo  248 ") == "YO 248"
    assert normalize_spotter_number("   ") is None
    assert normalize_spotter_number(None) is None


@pytest.mark.parametrize("value", ["YOUTUBE.COM/@NB9D", "https://example.com", "me@example.com", "-248", "A" * 21])
def test_non_id_spotter_numbers_rejected(value):
    with pytest.raises(ValueError):
        normalize_spotter_number(value)


@pytest.mark.asyncio
async def test_stored_bad_spotter_number_still_reads(db, owner):
    """The rule is on the write schemas only. A check-in stored before it
    existed must still serialize, or every read of that net would 500."""
    net = Net(name="Legacy Net", owner_id=owner.id, status=NetStatus.CLOSED)
    db.add(net)
    await db.commit()
    check_in = CheckIn(net_id=net.id, callsign="NB9D", name="", location="", skywarn_number="YOUTUBE.COM/@NB9D")
    db.add(check_in)
    await db.commit()
    await db.refresh(check_in)
    assert CheckInResponse.from_orm(check_in).skywarn_number == "YOUTUBE.COM/@NB9D"


# ========== PROFILE SAVE ==========

@pytest.mark.asyncio
async def test_profile_rejects_link_in_spotter_number(client, owner):
    resp = await client.put("/api/users/me", json={"skywarn_number": "YOUTUBE.COM/@NB9D"}, headers=auth_headers(owner))
    assert resp.status_code == 422
    assert "Spotter #" in resp.text


@pytest.mark.asyncio
async def test_profile_normalizes_spotter_number(client, owner):
    resp = await client.put("/api/users/me", json={"skywarn_number": "yo248"}, headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["skywarn_number"] == "YO248"


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["name", "location"])
async def test_profile_rejects_link_in_name_and_location(client, owner, field):
    resp = await client.put("/api/users/me", json={field: "youtube.com/@NB9D"}, headers=auth_headers(owner))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_profile_website_may_hold_a_link(client, owner):
    resp = await client.put("/api/users/me", json={"website_url": "https://youtube.com/@NB9D"}, headers=auth_headers(owner))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_check_in_rejects_bad_spotter_number(client, owner):
    create = await client.post("/api/nets/", json={"name": "Spotter Rule Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "NB9D", "skywarn_number": "YOUTUBE.COM/@NB9D"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 422


# ========== ADMIN FIELD LOCKS ==========

@pytest.mark.asyncio
async def test_admin_edits_and_locks_spotter_number(client, db, admin, other):
    resp = await client.put(
        f"/api/users/{other.id}",
        json={"skywarn_number": "", "locked_fields": ["skywarn_number", "name"]},
        headers=auth_headers(admin),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["skywarn_number"] is None
    assert body["locked_fields"] == ["name", "skywarn_number"]

    # The user can no longer change it...
    resp = await client.put("/api/users/me", json={"skywarn_number": "YOUTUBE NB9D"}, headers=auth_headers(other))
    assert resp.status_code == 403
    assert "spotter number" in resp.json()["detail"]

    # ...but resubmitting the unchanged value (the Profile form sends the
    # whole object) still lets every other field save.
    resp = await client.put(
        "/api/users/me",
        json={"skywarn_number": "", "name": None, "location": "Manchester, NH"},
        headers=auth_headers(other),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["location"] == "Manchester, NH"


@pytest.mark.asyncio
async def test_locked_callsigns_ignore_order_and_case(client, db, admin, other):
    other.callsigns = json.dumps(["KC1AAA", "KC1BBB"])
    other.locked_fields = json.dumps(["callsigns"])
    await db.commit()

    resp = await client.put("/api/users/me", json={"callsigns": ["KC1BBB", "KC1AAA"]}, headers=auth_headers(other))
    assert resp.status_code == 200

    resp = await client.put("/api/users/me", json={"callsigns": ["KC1AAA"]}, headers=auth_headers(other))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_rejects_unknown_lock(client, admin, other):
    resp = await client.put(f"/api/users/{other.id}", json={"locked_fields": ["role"]}, headers=auth_headers(admin))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_admin_lock_change_is_audited(client, db, admin, other):
    from sqlalchemy import select
    from app.models import AdminAuditLog

    await client.put(f"/api/users/{other.id}", json={"locked_fields": ["location"]}, headers=auth_headers(admin))
    rows = (await db.execute(select(AdminAuditLog).where(AdminAuditLog.target_user_id == other.id))).scalars().all()
    assert [(r.field, r.new_value) for r in rows] == [("locked_fields", '["location"]')]


def test_migration_079_carries_locks_over(tmp_path):
    """Existing name/callsign/email locks (NB9D holds all three on
    production) survive the switch to locked_fields."""
    import importlib.util
    import os
    import sqlite3

    db_path = tmp_path / "ectlogger.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, callsign TEXT, name_locked BOOLEAN NOT NULL DEFAULT 0, "
        "callsign_locked BOOLEAN NOT NULL DEFAULT 0, email_locked BOOLEAN NOT NULL DEFAULT 0)"
    )
    conn.execute("INSERT INTO users VALUES (1, 'NB9D', 1, 1, 1)")
    conn.execute("INSERT INTO users VALUES (2, 'KC1JMH', 0, 1, 0)")
    conn.execute("INSERT INTO users VALUES (3, 'W1AW', 0, 0, 0)")
    conn.commit()
    conn.close()

    path = os.path.join(os.path.dirname(__file__), "..", "migrations", "079_user_locked_fields.py")
    spec = importlib.util.spec_from_file_location("m079", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.migrate(str(db_path))
    module.migrate(str(db_path))  # re-run is a no-op

    conn = sqlite3.connect(db_path)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    assert not columns & {"name_locked", "callsign_locked", "email_locked"}
    locks = dict(conn.execute("SELECT callsign, locked_fields FROM users"))
    assert json.loads(locks["NB9D"]) == ["callsign", "email", "name"]
    assert json.loads(locks["KC1JMH"]) == ["callsign"]
    assert json.loads(locks["W1AW"]) == []
    conn.close()


@pytest.mark.asyncio
async def test_admin_user_list_is_not_capped(client, db, admin):
    """The Admin Users tab filters this list in the browser, so every
    account must come back. It was capped at 100 until 2026-09-28."""
    for i in range(105):
        db.add(User(email=f"bulk{i}@test.com", callsign=f"KC1B{i:03d}"))
    await db.commit()
    resp = await client.get("/api/users", headers=auth_headers(admin))
    assert resp.status_code == 200
    assert len(resp.json()) == 106
