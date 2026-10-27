"""
Security alerts (app/security_alerts.py) and GeoIP lookups (app/geoip.py).

Failed sign-ins email the account's owner and every admin; a wrong
two-factor code alerts at once. Being muted by several different people
emails admins only, and personal mutes are counted without ever recording
who muted (Brad, 2026-10-23: "count only, no names").
"""
import importlib.util
import json
import os
import sqlite3

import pyotp
import pytest
from sqlalchemy import select

from app import geoip
from app.audit import private_actor_code
from app.auth import encrypt_mfa_secret, hash_password
from app.email_service import EmailService
from app.models import AppSettings, AuditEvent, User, UserRole
from tests.conftest import auth_headers

PASSWORD = "Correct-horse-battery-9"


@pytest.fixture()
def alerts(monkeypatch):
    """Capture alert emails instead of sending them."""
    sent = {"signin": [], "mute": []}

    async def _signin(to_email, account, attempts, two_factor, to_admin):
        sent["signin"].append({"to": to_email, "account": account, "attempts": attempts,
                               "two_factor": two_factor, "to_admin": to_admin})

    async def _mute(to_email, station, user_id, people, net_wide, nets, window_days):
        sent["mute"].append({"to": to_email, "station": station, "people": people, "net_wide": net_wide})

    monkeypatch.setattr(EmailService, "send_failed_sign_in_alert", staticmethod(_signin))
    monkeypatch.setattr(EmailService, "send_muted_often_alert", staticmethod(_mute))
    return sent


async def _events(db, action):
    return (await db.execute(select(AuditEvent).where(AuditEvent.action == action))).scalars().all()


async def _fail(client, user, times):
    for _ in range(times):
        await client.post("/api/auth/login", json={"identifier": user.email, "password": "wrong"},
                          headers={"X-Forwarded-For": "203.0.113.9"})


# ========== FAILED SIGN-INS ==========

@pytest.mark.asyncio
async def test_threshold_of_wrong_passwords_alerts_owner_and_admins_once(client, db, owner, admin, alerts):
    owner.password_hash = hash_password(PASSWORD)
    await db.commit()

    await _fail(client, owner, 4)
    assert alerts["signin"] == []

    await _fail(client, owner, 1)
    assert sorted((a["to"], a["to_admin"]) for a in alerts["signin"]) == [
        ("admin@test.com", True), ("owner@test.com", False),
    ]
    assert len(alerts["signin"][0]["attempts"]) == 5
    assert alerts["signin"][0]["attempts"][0]["ip"] == "203.0.113.9"
    assert len(await _events(db, "alert.failed_sign_ins")) == 1

    # Still inside the window: no second round of emails.
    owner.password_locked_until = None
    owner.failed_password_attempts = 0
    await db.commit()
    await _fail(client, owner, 2)
    assert len(alerts["signin"]) == 2


@pytest.mark.asyncio
async def test_a_wrong_two_factor_code_alerts_at_once(client, db, owner, admin, alerts):
    secret = pyotp.random_base32()
    owner.password_hash = hash_password(PASSWORD)
    owner.mfa_enabled, owner.mfa_secret_encrypted = True, encrypt_mfa_secret(secret)
    await db.commit()

    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": PASSWORD, "totp_code": "000000"})
    assert resp.json()["login_status"] == "mfa_required"
    owner_alert = next(a for a in alerts["signin"] if not a["to_admin"])
    assert owner_alert["two_factor"] is True
    assert owner_alert["attempts"][0]["what"] == "Wrong two-factor code"


@pytest.mark.asyncio
async def test_asking_for_a_code_is_not_a_failure(client, db, owner, alerts):
    """mfa_required with no code is the first step of a normal sign-in."""
    owner.password_hash = hash_password(PASSWORD)
    owner.mfa_enabled, owner.mfa_secret_encrypted = True, encrypt_mfa_secret(pyotp.random_base32())
    await db.commit()
    await client.post("/api/auth/login", json={"identifier": owner.email, "password": PASSWORD})
    assert alerts["signin"] == [] and await _events(db, "auth.mfa_failed") == []


@pytest.mark.asyncio
async def test_sign_in_alerts_can_be_turned_off(client, db, owner, admin, alerts):
    owner.password_hash = hash_password(PASSWORD)
    await db.commit()
    resp = await client.put("/api/settings", json={"signin_alert_enabled": False}, headers=auth_headers(admin))
    assert resp.status_code == 200, resp.text
    await _fail(client, owner, 5)
    assert alerts["signin"] == []


@pytest.mark.asyncio
async def test_alert_settings_are_bounded(client, admin):
    resp = await client.put("/api/settings", json={"signin_alert_threshold": 0}, headers=auth_headers(admin))
    assert resp.status_code == 422
    resp = await client.put("/api/settings", json={"mute_alert_threshold": 4, "mute_alert_window_days": 7},
                            headers=auth_headers(admin))
    assert (resp.json()["mute_alert_threshold"], resp.json()["mute_alert_window_days"]) == (4, 7)


# ========== MUTES ==========

async def _people(db, n, start=0):
    users = [User(email=f"p{i}@test.com", callsign=f"KC1P{i}", role=UserRole.USER, is_active=True)
             for i in range(start, start + n)]
    db.add_all(users)
    await db.commit()
    return users


async def _net(client, owner):
    return (await client.post("/api/nets/", json={"name": "Mute Test Net"}, headers=auth_headers(owner))).json()["id"]


async def _mute(client, net_id, muter, muted):
    return await client.post(f"/api/chat/nets/{net_id}/mutes", json={"muted_user_id": muted.id},
                             headers={**auth_headers(muter), "X-Forwarded-For": "198.51.100.3"})


@pytest.mark.asyncio
async def test_personal_mutes_are_logged_without_who(client, db, owner, other, alerts):
    net_id = await _net(client, owner)
    assert (await _mute(client, net_id, owner, other)).status_code == 201
    [event] = await _events(db, "chat.muted_by_peer")
    assert (event.actor_user_id, event.ip, event.user_agent) == (None, None, None)
    assert event.actor_label == "Another station"
    assert event.subject_user_id == other.id
    details = json.loads(event.details)
    # Only the muted station and an opaque code; the muter is never named.
    assert set(details) == {"station", "muter"}
    assert details["muter"] == private_actor_code(owner.id) and owner.callsign not in event.details


@pytest.mark.asyncio
async def test_muted_by_enough_different_people_alerts_admins_only(client, db, owner, other, admin, alerts):
    net_id = await _net(client, owner)
    a, b = await _people(db, 2)

    # The same person muting twice (here, on and off and on) counts once.
    await _mute(client, net_id, a, other)
    await client.delete(f"/api/chat/nets/{net_id}/mutes/{other.id}", headers=auth_headers(a))
    await _mute(client, net_id, a, other)
    await _mute(client, net_id, b, other)
    assert alerts["mute"] == []

    # A net-wide mute by net control is the third person.
    resp = await client.post(f"/api/chat/nets/{net_id}/net-mutes", json={"muted_user_id": other.id},
                             headers=auth_headers(owner))
    assert resp.status_code in (200, 201), resp.text
    assert [(m["to"], m["people"], m["net_wide"]) for m in alerts["mute"]] == [("admin@test.com", 3, 1)]
    assert all(m["to"] != other.email for m in alerts["mute"])

    # Throttled: a fourth person in the same window sends nothing new.
    [c] = await _people(db, 1, start=2)
    await _mute(client, net_id, c, other)
    assert len(alerts["mute"]) == 1


# ========== GEOIP ==========

class _FakeReader:
    def get(self, ip):
        if ip == "203.0.113.9":
            return {"city": {"names": {"en": "Bedford"}}, "subdivisions": [{"names": {"en": "New Hampshire"}}],
                    "country": {"iso_code": "US"}}
        if ip == "not-an-ip":
            raise ValueError
        return None


def test_lookup_formats_city_region_country(monkeypatch):
    monkeypatch.setattr(geoip, "_open_reader", lambda: _FakeReader())
    assert geoip.lookup("203.0.113.9") == "Bedford, New Hampshire, US"
    assert geoip.lookup("10.0.0.1") is None
    assert geoip.lookup("not-an-ip") is None
    assert geoip.lookup(None) is None


def test_lookup_without_a_database_is_none(monkeypatch, tmp_path):
    monkeypatch.setattr(geoip.settings, "geoip_db_path", str(tmp_path / "missing.mmdb"))
    assert geoip.lookup("8.8.8.8") is None


@pytest.mark.asyncio
async def test_events_carry_the_location(client, db, owner, monkeypatch):
    monkeypatch.setattr(geoip, "_open_reader", lambda: _FakeReader())
    owner.password_hash = hash_password(PASSWORD)
    await db.commit()
    await _fail(client, owner, 1)
    [event] = await _events(db, "auth.password_failed")
    assert event.location == "Bedford, New Hampshire, US"


@pytest.mark.asyncio
async def test_refresh_skips_a_recent_file(monkeypatch, tmp_path):
    path = tmp_path / "dbip.mmdb"
    path.write_bytes(b"x")
    monkeypatch.setattr(geoip.settings, "geoip_db_path", str(path))
    called = []
    monkeypatch.setattr(geoip, "_download", lambda month, dest: called.append(month))
    assert await geoip.refresh_database() is False and called == []
    path.unlink()
    assert await geoip.refresh_database() is True and len(called) == 1


# ========== MIGRATION ==========

def test_migration_089_adds_columns_and_is_rerunnable(tmp_path):
    db_path = tmp_path / "ectlogger.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE audit_events (id INTEGER PRIMARY KEY, ip VARCHAR(64))")
    conn.execute("CREATE TABLE app_settings (id INTEGER PRIMARY KEY)")
    conn.execute("INSERT INTO app_settings (id) VALUES (1)")
    conn.commit()
    conn.close()

    path = os.path.join(os.path.dirname(__file__), "..", "migrations", "089_security_alerts.py")
    spec = importlib.util.spec_from_file_location("m089", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.migrate(str(db_path))
    module.migrate(str(db_path))

    conn = sqlite3.connect(db_path)
    assert "location" in {r[1] for r in conn.execute("PRAGMA table_info(audit_events)")}
    assert conn.execute("SELECT signin_alert_enabled, signin_alert_threshold, mute_alert_window_days "
                        "FROM app_settings").fetchone() == (1, 5, 30)


# ========== CALLSIGN ALREADY HAS AN ACCOUNT ==========

@pytest.mark.asyncio
async def test_taken_callsign_explains_without_the_other_address_and_alerts_admins(client, db, owner, admin, monkeypatch):
    """K9NPD, 2026-10-27: signed up again with a new address, typed his
    callsign, and got only "already in use by another account"."""
    sent = []

    async def _taken(to_email, callsign, user, holder):
        sent.append((to_email, callsign, user.email, holder.email))

    monkeypatch.setattr(EmailService, "send_callsign_taken_alert", staticmethod(_taken))
    newcomer = User(email="newcomer@test.com", role=UserRole.USER, is_active=True)
    db.add(newcomer)
    await db.commit()

    for _ in range(2):
        r = await client.put("/api/users/me", json={"callsign": "KC1OWN"}, headers=auth_headers(newcomer))
        assert r.status_code == 409
        detail = r.json()["detail"]
        assert "KC1OWN already has an account" in detail
        assert "owner@test.com" not in detail

    # One alert a day, to admins only, naming both addresses.
    assert sent == [("admin@test.com", "KC1OWN", "newcomer@test.com", "owner@test.com")]
    assert len(await _events(db, "alert.callsign_taken")) == 1

    # Keeping your own callsign is never a conflict.
    r = await client.put("/api/users/me", json={"callsign": "KC1OWN", "name": "Pat"}, headers=auth_headers(owner))
    assert r.status_code == 200
