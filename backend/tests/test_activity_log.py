"""
The activity log (app/audit.py, routers/audit.py) and self-service email
change (services/account_email.py).

Until 2026-10-23 the only audited action was an admin editing another
user's account, and nothing could read it, so "who deleted my net?" had no
answer. These pin the parts that make the log trustworthy: events land with
the change, carry who and from where, survive the thing they describe being
deleted, are admin-only, and age out on schedule.
"""
import importlib.util
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone

import pyotp
import pytest
from sqlalchemy import select

from app.audit import prune_audit_events, AUDIT_RETENTION_DAYS, AUDIT_IP_RETENTION_DAYS
from app.auth import encrypt_mfa_secret, hash_password
from app.email_service import EmailService
from app.models import AuditEvent, Net, NetTemplate, User
from tests.conftest import auth_headers

FROM = {"X-Forwarded-For": "203.0.113.7", "User-Agent": "TestBrowser/1.0"}


async def _events(db, action=None):
    query = select(AuditEvent).order_by(AuditEvent.id)
    if action:
        query = query.where(AuditEvent.action == action)
    return (await db.execute(query)).scalars().all()


# ========== READING THE LOG ==========

@pytest.mark.asyncio
async def test_only_admins_can_read_the_log(client, owner, admin):
    assert (await client.get("/api/audit", headers=auth_headers(owner))).status_code == 403
    assert (await client.get("/api/audit")).status_code in (401, 403)
    assert (await client.get("/api/audit", headers=auth_headers(admin))).status_code == 200


@pytest.mark.asyncio
async def test_deleted_net_names_who_and_from_where(client, db, owner, admin):
    create = await client.post("/api/nets/", json={"name": "Tuesday Practice Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    resp = await client.delete(f"/api/nets/{net_id}", headers={**auth_headers(owner), **FROM})
    assert resp.status_code == 204

    [event] = await _events(db, "net.deleted")
    assert (event.actor_user_id, event.actor_label) == (owner.id, owner.callsign)
    assert (event.target_label, event.net_id) == ("Tuesday Practice Net", net_id)
    assert event.ip == "203.0.113.7"
    assert event.user_agent == "TestBrowser/1.0"

    # The admin finds it by net, though the net itself is gone.
    page = (await client.get(f"/api/audit?net_id={net_id}", headers=auth_headers(admin))).json()
    assert [e["action"] for e in page["items"]] == ["net.deleted"]


@pytest.mark.asyncio
async def test_filter_by_person_finds_what_they_did_and_what_was_done_to_them(client, db, owner, other, admin):
    await client.put(f"/api/users/{other.id}/ban", headers=auth_headers(admin))
    await client.put("/api/users/me", json={"name": "Owen"}, headers=auth_headers(owner))

    page = (await client.get(f"/api/audit?user_id={other.id}", headers=auth_headers(admin))).json()
    assert [(e["action"], e["actor_user_id"]) for e in page["items"]] == [("user.banned", admin.id)]

    group = (await client.get("/api/audit?action=user.", headers=auth_headers(admin))).json()
    assert {e["action"] for e in group["items"]} == {"user.banned", "user.profile_changed"}


@pytest.mark.asyncio
async def test_accounts_seen_from_one_address(client, db, owner, other, admin):
    await client.put("/api/users/me", json={"name": "A"}, headers={**auth_headers(owner), **FROM})
    await client.put("/api/users/me", json={"name": "B"}, headers={**auth_headers(other), **FROM})
    await client.put("/api/users/me", json={"name": "C"}, headers={**auth_headers(other), **FROM})

    rows = (await client.get("/api/audit/ip-accounts?ip=203.0.113.7", headers=auth_headers(admin))).json()
    assert [(r["label"], r["events"]) for r in rows] == [("KC1OTH", 2), ("KC1OWN", 1)]


# ========== WHAT GETS LOGGED ==========

@pytest.mark.asyncio
async def test_profile_change_logs_old_and_new_and_a_resave_logs_nothing(client, db, owner):
    body = {"name": "Owen", "callsign": "KC1NEW", "callsigns": [], "location": ""}
    await client.put("/api/users/me", json=body, headers=auth_headers(owner))
    [event] = await _events(db, "user.profile_changed")
    changes = json.loads(event.details)["changes"]
    assert changes == {"name": [None, "Owen"], "callsign": ["KC1OWN", "KC1NEW"]}

    # The form sends every field on every save; an unchanged save is silent.
    await client.put("/api/users/me", json=body, headers=auth_headers(owner))
    assert len(await _events(db, "user.profile_changed")) == 1


@pytest.mark.asyncio
async def test_failed_password_is_logged_only_for_a_real_account(client, db, owner):
    owner.password_hash = hash_password("Correct-horse-battery-9")
    await db.commit()

    await client.post("/api/auth/login", json={"identifier": owner.email, "password": "wrong"}, headers=FROM)
    await client.post("/api/auth/login", json={"identifier": "nobody@example.com", "password": "wrong"})
    [event] = await _events(db, "auth.password_failed")
    assert (event.actor_user_id, event.ip) == (owner.id, "203.0.113.7")

    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "Correct-horse-battery-9"})
    assert resp.status_code == 200
    assert len(await _events(db, "auth.signed_in")) == 1


@pytest.mark.asyncio
async def test_password_change_is_logged(client, db, owner):
    resp = await client.post("/api/auth/password/set", json={"new_password": "Correct-horse-battery-9"},
                             headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert [e.action for e in await _events(db)] == ["user.password_set"]


@pytest.mark.asyncio
async def test_schedule_delete_is_logged(client, db, owner):
    template = NetTemplate(name="Sunday Net", owner_id=owner.id, schedule_type="weekly",
                           schedule_config='{"day_of_week": 0, "time": "19:00"}')
    db.add(template)
    await db.commit()
    assert (await client.delete(f"/api/templates/{template.id}", headers=auth_headers(owner))).status_code == 204
    [event] = await _events(db, "schedule.deleted")
    assert (event.target_label, event.template_id, event.actor_user_id) == ("Sunday Net", template.id, owner.id)


@pytest.mark.asyncio
async def test_a_failed_change_leaves_no_event(client, db, owner, other):
    """Written in the change's own transaction: a refused delete logs nothing."""
    create = await client.post("/api/nets/", json={"name": "Not Yours"}, headers=auth_headers(owner))
    resp = await client.delete(f"/api/nets/{create.json()['id']}", headers=auth_headers(other))
    assert resp.status_code == 403
    assert await _events(db, "net.deleted") == []


@pytest.mark.asyncio
async def test_deleting_an_account_keeps_its_history_but_not_its_id(client, db, other, admin):
    await client.put("/api/users/me", json={"name": "Griefer"}, headers=auth_headers(other))
    other_id = other.id
    assert (await client.delete(f"/api/users/{other_id}", headers=auth_headers(admin))).status_code == 204

    events = await _events(db)
    assert all(other_id not in (e.actor_user_id, e.subject_user_id) for e in events)
    assert [(e.action, e.actor_label) for e in events] == [
        ("user.profile_changed", "KC1OTH"), ("user.deleted", "KC1ADM"),
    ]
    assert events[1].target_label == "KC1OTH"


# ========== RETENTION ==========

@pytest.mark.asyncio
async def test_retention_blanks_addresses_after_a_year_and_deletes_after_three(db):
    now = datetime.now(timezone.utc)
    for days in (10, AUDIT_IP_RETENTION_DAYS + 5, AUDIT_RETENTION_DAYS + 5):
        db.add(AuditEvent(action=f"test.{days}", ip="198.51.100.1", user_agent="x",
                          created_at=now - timedelta(days=days)))
    await db.commit()

    deleted, blanked = await prune_audit_events(db, now)
    assert (deleted, blanked) == (1, 1)
    rows = {e.action: e for e in await _events(db)}
    assert set(rows) == {"test.10", f"test.{AUDIT_IP_RETENTION_DAYS + 5}"}
    assert rows["test.10"].ip == "198.51.100.1"
    assert (rows[f"test.{AUDIT_IP_RETENTION_DAYS + 5}"].ip, rows[f"test.{AUDIT_IP_RETENTION_DAYS + 5}"].user_agent) == (None, None)


# ========== SELF-SERVICE EMAIL CHANGE ==========

@pytest.fixture()
def sent_links(monkeypatch):
    """Capture the confirmation token instead of emailing it."""
    tokens = []

    async def _capture(new_email, token):
        tokens.append((new_email, token))

    monkeypatch.setattr(EmailService, "send_email_change_link", staticmethod(_capture))
    return tokens


@pytest.mark.asyncio
async def test_email_change_happens_only_when_the_new_address_confirms(client, db, owner, sent_links):
    owner.oauth_provider, owner.oauth_id = "email", owner.email
    await db.commit()

    resp = await client.post("/api/auth/email-change/request", json={"new_email": "New@Example.com"},
                             headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    [(to, token)] = sent_links
    assert to == "new@example.com"
    await db.refresh(owner)
    assert owner.email == "owner@test.com"  # nothing yet

    resp = await client.post("/api/auth/email-change/confirm", json={"token": token})
    assert resp.status_code == 200, resp.text
    await db.refresh(owner)
    assert (owner.email, owner.oauth_id) == ("new@example.com", "new@example.com")
    assert [e.action for e in await _events(db)] == ["user.email_change_requested", "user.email_changed"]

    # Single use: the account no longer has the address the link was for.
    again = await client.post("/api/auth/email-change/confirm", json={"token": token})
    assert again.status_code == 400


@pytest.mark.asyncio
async def test_a_link_to_the_old_address_no_longer_signs_in(client, db, owner, sent_links):
    """oauth_id held the sign-up address and was matched first, so before
    apply_email_change a sign-in link to the replaced address still opened
    the account."""
    from app.auth import create_magic_link_token

    owner.oauth_provider, owner.oauth_id = "email", owner.email
    await db.commit()
    await client.post("/api/auth/email-change/request", json={"new_email": "new@example.com"}, headers=auth_headers(owner))
    await client.post("/api/auth/email-change/confirm", json={"token": sent_links[0][1]})

    resp = await client.post("/api/auth/magic-link/verify", json={"token": create_magic_link_token("owner@test.com")})
    assert resp.status_code == 200
    assert resp.json()["user"]["id"] != owner.id


@pytest.mark.asyncio
async def test_email_change_needs_the_two_factor_code_when_enabled(client, db, owner, sent_links):
    secret = pyotp.random_base32()
    owner.mfa_enabled, owner.mfa_secret_encrypted = True, encrypt_mfa_secret(secret)
    await db.commit()

    refused = await client.post("/api/auth/email-change/request", json={"new_email": "new@example.com"},
                                headers=auth_headers(owner))
    assert refused.status_code == 401 and sent_links == []
    ok = await client.post("/api/auth/email-change/request",
                           json={"new_email": "new@example.com", "totp_code": pyotp.TOTP(secret).now()},
                           headers=auth_headers(owner))
    assert ok.status_code == 200
    assert [e.action for e in await _events(db)] == ["auth.mfa_failed", "user.email_change_requested"]


@pytest.mark.asyncio
async def test_email_change_refuses_an_address_in_use(client, owner, other, sent_links):
    resp = await client.post("/api/auth/email-change/request", json={"new_email": other.email},
                             headers=auth_headers(owner))
    assert resp.status_code == 409 and sent_links == []


@pytest.mark.asyncio
async def test_admin_email_change_also_moves_the_sign_in_link(client, db, owner, admin):
    owner.oauth_provider, owner.oauth_id = "email", owner.email
    await db.commit()
    resp = await client.put(f"/api/users/{owner.id}", json={"email": "moved@example.com"}, headers=auth_headers(admin))
    assert resp.status_code == 200, resp.text
    await db.refresh(owner)
    assert owner.oauth_id == "moved@example.com"


# ========== MIGRATION ==========

def test_migration_088_copies_admin_audit_log_and_drops_it(tmp_path):
    db_path = tmp_path / "ectlogger.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, callsign TEXT, email TEXT)")
    conn.execute("INSERT INTO users VALUES (1, 'KC1JMH', 'a@example.com'), (2, 'NB9D', 'b@example.com')")
    conn.execute("CREATE TABLE admin_audit_log (id INTEGER PRIMARY KEY, admin_id INTEGER, target_user_id INTEGER, "
                 "field TEXT, old_value TEXT, new_value TEXT, created_at DATETIME)")
    conn.execute("INSERT INTO admin_audit_log VALUES (1, 1, 2, 'name', 'Old', 'New', '2026-09-01 12:00:00')")
    conn.execute("INSERT INTO admin_audit_log VALUES (2, 1, 2, 'callsigns', '[\"NEIL\"]', '[]', '2026-09-01 12:00:00')")
    conn.commit()
    conn.close()

    path = os.path.join(os.path.dirname(__file__), "..", "migrations", "088_audit_events.py")
    spec = importlib.util.spec_from_file_location("m088", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.migrate(str(db_path))
    module.migrate(str(db_path))  # safe to re-run

    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT action, actor_user_id, actor_label, target_label, subject_user_id, details, created_at "
                        "FROM audit_events ORDER BY id").fetchall()
    assert rows == [
        ("user.admin_edited", 1, "KC1JMH", "NB9D", 2,
         json.dumps({"changes": {"name": ["Old", "New"]}}), "2026-09-01 12:00:00"),
        ("user.admin_edited", 1, "KC1JMH", "NB9D", 2,
         json.dumps({"changes": {"callsigns": [["NEIL"], []]}}), "2026-09-01 12:00:00"),
    ]
    assert conn.execute("SELECT name FROM sqlite_master WHERE name='admin_audit_log'").fetchone() is None


@pytest.mark.asyncio
async def test_an_admin_email_lock_blocks_the_change(client, db, owner, sent_links):
    owner.locked_fields = json.dumps(["email"])
    await db.commit()
    resp = await client.post("/api/auth/email-change/request", json={"new_email": "new@example.com"},
                             headers=auth_headers(owner))
    assert resp.status_code == 403 and sent_links == []


@pytest.mark.asyncio
async def test_a_lock_set_after_the_link_went_out_still_holds(client, db, owner, sent_links):
    await client.post("/api/auth/email-change/request", json={"new_email": "new@example.com"}, headers=auth_headers(owner))
    owner.locked_fields = json.dumps(["email"])
    await db.commit()
    resp = await client.post("/api/auth/email-change/confirm", json={"token": sent_links[0][1]})
    assert resp.status_code == 403
    await db.refresh(owner)
    assert owner.email == "owner@test.com"
