"""
Backup sign-in addresses (models.UserEmail, services/account_email.py).

An account keeps one primary address and may add backups, each confirmed
from its own mailbox. Any of them signs in, one address belongs to one
account across both, and every change is told to every address on the
account (Brad, 2026-10-27: "a backup account in case we lose access to the
original account later").
"""
import pyotp
import pytest
from sqlalchemy import select

from app.auth import create_magic_link_token, encrypt_mfa_secret, hash_password
from app.email_service import EmailService
from app.models import AuditEvent, User, UserEmail
from tests.conftest import auth_headers


@pytest.fixture()
def mail(monkeypatch):
    """Capture confirmation links and address-change notices."""
    sent = {"links": [], "notices": []}

    async def _link(email, token):
        sent["links"].append((email, token))

    async def _notice(to_email, change, address, by_admin, other=""):
        sent["notices"].append((to_email, change, address))

    monkeypatch.setattr(EmailService, "send_backup_email_link", staticmethod(_link))
    monkeypatch.setattr(EmailService, "send_sign_in_address_notice", staticmethod(_notice))
    return sent


async def _add(client, user, email, mail, **extra):
    resp = await client.post("/api/auth/backup-emails/request", json={"email": email, **extra},
                             headers=auth_headers(user))
    assert resp.status_code == 200, resp.text
    resp = await client.post("/api/auth/backup-emails/confirm", json={"token": mail["links"][-1][1]})
    assert resp.status_code == 200, resp.text


async def _sign_in(client, email) -> int:
    resp = await client.post("/api/auth/magic-link/verify", json={"token": create_magic_link_token(email)})
    assert resp.status_code == 200, resp.text
    return resp.json()["user"]["id"]


async def _actions(db):
    return [e.action for e in (await db.execute(select(AuditEvent).order_by(AuditEvent.id))).scalars().all()]


@pytest.fixture()
async def magic_owner(db, owner):
    owner.oauth_provider, owner.oauth_id = "email", owner.email
    await db.commit()
    return owner


# ========== ADDING ONE ==========

@pytest.mark.asyncio
async def test_a_confirmed_backup_signs_in_to_the_same_account(client, db, magic_owner, mail):
    resp = await client.post("/api/auth/backup-emails/request", json={"email": "Backup@Example.com"},
                             headers=auth_headers(magic_owner))
    assert resp.status_code == 200
    [(to, token)] = mail["links"]
    assert to == "backup@example.com"
    assert (await client.get("/api/auth/backup-emails", headers=auth_headers(magic_owner))).json()["backups"] == []

    assert (await client.post("/api/auth/backup-emails/confirm", json={"token": token})).status_code == 200
    listing = (await client.get("/api/auth/backup-emails", headers=auth_headers(magic_owner))).json()
    assert listing["primary"] == "owner@test.com"
    assert [b["email"] for b in listing["backups"]] == ["backup@example.com"]
    assert sorted(mail["notices"]) == [
        ("backup@example.com", "added", "backup@example.com"),
        ("owner@test.com", "added", "backup@example.com"),
    ]

    assert await _sign_in(client, "backup@example.com") == magic_owner.id
    # Signing in with a backup leaves the sign-in lookup on the primary, so
    # removing the backup later really stops it.
    await db.refresh(magic_owner)
    assert magic_owner.oauth_id == "owner@test.com"
    assert await _sign_in(client, "owner@test.com") == magic_owner.id
    assert "user.backup_email_requested" in await _actions(db)
    assert "user.backup_email_added" in await _actions(db)

    # Opening the link again finds it already there.
    again = await client.post("/api/auth/backup-emails/confirm", json={"token": token})
    assert again.json().get("already") is True


@pytest.mark.asyncio
async def test_a_backup_signs_in_with_a_password_too(client, db, owner, mail):
    owner.password_hash = hash_password("Correct-horse-battery-9")
    await db.commit()
    await _add(client, owner, "backup@example.com", mail)
    resp = await client.post("/api/auth/login", json={"identifier": "Backup@example.com", "password": "Correct-horse-battery-9"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["id"] == owner.id


@pytest.mark.asyncio
async def test_one_address_belongs_to_one_account(client, db, owner, other, mail):
    await _add(client, owner, "backup@example.com", mail)

    # Not as another account's backup, nor its primary.
    taken = await client.post("/api/auth/backup-emails/request", json={"email": "backup@example.com"},
                              headers=auth_headers(other))
    assert taken.status_code == 409
    changed = await client.post("/api/auth/email-change/request", json={"new_email": "backup@example.com"},
                                headers=auth_headers(other))
    assert changed.status_code == 409
    taken = await client.post("/api/auth/backup-emails/request", json={"email": other.email},
                              headers=auth_headers(owner))
    assert taken.status_code == 409

    # And signing in with it never makes a second account.
    before = len((await db.execute(select(User))).scalars().all())
    assert await _sign_in(client, "backup@example.com") == owner.id
    assert len((await db.execute(select(User))).scalars().all()) == before


@pytest.mark.asyncio
async def test_a_link_confirmed_after_the_address_was_taken_is_refused(client, db, owner, other, mail):
    await client.post("/api/auth/backup-emails/request", json={"email": "shared@example.com"}, headers=auth_headers(owner))
    db.add(UserEmail(user_id=other.id, email="shared@example.com"))
    await db.commit()
    resp = await client.post("/api/auth/backup-emails/confirm", json={"token": mail["links"][0][1]})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_a_link_for_a_deleted_account_does_not_reach_its_reused_id(client, db, mail):
    """Links name the account by id, and SQLite reuses a freed highest id."""
    from datetime import datetime, timedelta, timezone
    gone = User(email="gone@example.com", is_active=True, created_at=datetime.now(timezone.utc) - timedelta(days=1))
    db.add(gone)
    await db.commit()
    gone_id = gone.id
    resp = await client.post("/api/auth/backup-emails/request", json={"email": "spare@example.com"},
                             headers=auth_headers(gone))
    assert resp.status_code == 200, resp.text
    await db.delete(gone)
    await db.commit()
    db.add(User(id=gone_id, email="next@example.com", is_active=True,
                created_at=datetime.now(timezone.utc) + timedelta(seconds=5)))
    await db.commit()

    resp = await client.post("/api/auth/backup-emails/confirm", json={"token": mail["links"][-1][1]})
    assert resp.status_code == 400
    assert (await db.execute(select(UserEmail))).scalars().all() == []


@pytest.mark.asyncio
async def test_at_most_three_backups(client, owner, mail):
    for n in range(3):
        await _add(client, owner, f"b{n}@example.com", mail)
    resp = await client.post("/api/auth/backup-emails/request", json={"email": "b3@example.com"},
                             headers=auth_headers(owner))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_own_addresses_are_refused_as_new_backups(client, owner, mail):
    await _add(client, owner, "backup@example.com", mail)
    for email in ("owner@test.com", "backup@example.com"):
        resp = await client.post("/api/auth/backup-emails/request", json={"email": email}, headers=auth_headers(owner))
        assert resp.status_code == 400
    # Changing the primary to a backup is Make primary's job.
    resp = await client.post("/api/auth/email-change/request", json={"new_email": "backup@example.com"},
                             headers=auth_headers(owner))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_changes_need_the_two_factor_code_and_honour_the_email_lock(client, db, owner, mail):
    await _add(client, owner, "backup@example.com", mail)
    secret = pyotp.random_base32()
    owner.mfa_enabled, owner.mfa_secret_encrypted = True, encrypt_mfa_secret(secret)
    await db.commit()

    for path, email in (("request", "new@example.com"), ("remove", "backup@example.com"),
                        ("make-primary", "backup@example.com")):
        resp = await client.post(f"/api/auth/backup-emails/{path}", json={"email": email}, headers=auth_headers(owner))
        assert resp.status_code == 401, path
    ok = await client.post("/api/auth/backup-emails/request",
                           json={"email": "new@example.com", "totp_code": pyotp.TOTP(secret).now()},
                           headers=auth_headers(owner))
    assert ok.status_code == 200

    owner.locked_fields = '["email"]'
    await db.commit()
    locked = await client.post("/api/auth/backup-emails/confirm", json={"token": mail["links"][-1][1]})
    assert locked.status_code == 403
    locked = await client.post("/api/auth/backup-emails/remove",
                               json={"email": "backup@example.com", "totp_code": pyotp.TOTP(secret).now()},
                               headers=auth_headers(owner))
    assert locked.status_code == 403


# ========== REMOVING AND PROMOTING ==========

@pytest.mark.asyncio
async def test_a_removed_backup_stops_signing_in(client, db, magic_owner, mail):
    await _add(client, magic_owner, "backup@example.com", mail)
    assert await _sign_in(client, "backup@example.com") == magic_owner.id
    mail["notices"].clear()

    resp = await client.post("/api/auth/backup-emails/remove", json={"email": "backup@example.com"},
                             headers=auth_headers(magic_owner))
    assert resp.status_code == 200 and resp.json()["backups"] == []
    # The removed address is told too.
    assert sorted(to for to, _, _ in mail["notices"]) == ["backup@example.com", "owner@test.com"]
    assert await _sign_in(client, "backup@example.com") != magic_owner.id


@pytest.mark.asyncio
async def test_make_primary_swaps_and_keeps_both(client, db, magic_owner, mail):
    await _add(client, magic_owner, "backup@example.com", mail)
    resp = await client.post("/api/auth/backup-emails/make-primary", json={"email": "backup@example.com"},
                             headers=auth_headers(magic_owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["primary"] == "backup@example.com"
    assert [b["email"] for b in resp.json()["backups"]] == ["owner@test.com"]
    await db.refresh(magic_owner)
    assert (magic_owner.email, magic_owner.oauth_id) == ("backup@example.com", "backup@example.com")
    assert await _sign_in(client, "owner@test.com") == magic_owner.id
    assert await _sign_in(client, "backup@example.com") == magic_owner.id


# ========== ADMINS ==========

@pytest.mark.asyncio
async def test_admin_sees_and_removes_backups(client, db, owner, admin, mail):
    await _add(client, owner, "backup@example.com", mail)
    listing = await client.get(f"/api/users/{owner.id}/backup-emails", headers=auth_headers(admin))
    assert listing.status_code == 200
    [backup] = listing.json()["backups"]
    assert (await client.get(f"/api/users/{owner.id}/backup-emails", headers=auth_headers(owner))).status_code == 403

    resp = await client.delete(f"/api/users/{owner.id}/backup-emails/{backup['id']}", headers=auth_headers(admin))
    assert resp.status_code == 200 and resp.json()["backups"] == []


@pytest.mark.asyncio
async def test_admin_setting_the_primary_to_a_backup_promotes_it(client, db, owner, admin, mail):
    await _add(client, owner, "backup@example.com", mail)
    resp = await client.put(f"/api/users/{owner.id}", json={"email": "backup@example.com"}, headers=auth_headers(admin))
    assert resp.status_code == 200, resp.text
    assert (await db.execute(select(UserEmail))).scalars().all() == []


@pytest.mark.asyncio
async def test_deleting_an_account_deletes_its_backups(client, db, owner, admin, mail):
    await _add(client, owner, "backup@example.com", mail)
    assert (await client.delete(f"/api/users/{owner.id}", headers=auth_headers(admin))).status_code == 204
    assert (await db.execute(select(UserEmail))).scalars().all() == []
