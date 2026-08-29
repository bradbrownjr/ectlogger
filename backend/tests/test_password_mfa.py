"""
Password login (magic-link fallback) and TOTP MFA: login flows, lockout,
enumeration resistance, MFA enforcement for admins, backup codes, and the
admin recovery endpoints. See docs/PASSWORD-MFA.md for the design.
"""
import json

import pyotp
import pytest
from tests.conftest import auth_headers

from app.auth import (
    hash_password, encrypt_mfa_secret, generate_backup_codes, hash_backup_code,
)
from app.models import User, UserRole


async def _set_password(db, user: User, password: str):
    user.password_hash = hash_password(password)
    await db.commit()
    await db.refresh(user)


async def _enroll_mfa(db, user: User, secret: str = None) -> str:
    secret = secret or pyotp.random_base32()
    user.mfa_secret_encrypted = encrypt_mfa_secret(secret)
    user.mfa_enabled = True
    await db.commit()
    await db.refresh(user)
    return secret


@pytest.mark.asyncio
async def test_password_login_success(client, db, owner):
    await _set_password(db, owner, "correcthorsebattery")
    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "correcthorsebattery"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["login_status"] == "ok"
    assert data["access_token"]


@pytest.mark.asyncio
async def test_password_login_by_callsign(client, db, owner):
    await _set_password(db, owner, "correcthorsebattery")
    resp = await client.post("/api/auth/login", json={"identifier": owner.callsign.lower(), "password": "correcthorsebattery"})
    assert resp.status_code == 200
    assert resp.json()["login_status"] == "ok"


@pytest.mark.asyncio
async def test_password_login_wrong_password_generic_error(client, db, owner):
    await _set_password(db, owner, "correcthorsebattery")
    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Incorrect callsign/email or password"


@pytest.mark.asyncio
async def test_password_login_unknown_identifier_same_generic_error(client, db):
    resp = await client.post("/api/auth/login", json={"identifier": "nobody@example.com", "password": "whatever123"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Incorrect callsign/email or password"


@pytest.mark.asyncio
async def test_password_login_no_password_set_same_generic_error(client, db, owner):
    # owner fixture has no password_hash at all
    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "anything123"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Incorrect callsign/email or password"


@pytest.mark.asyncio
async def test_password_login_locks_after_max_attempts(client, db, owner):
    await _set_password(db, owner, "correcthorsebattery")
    for _ in range(5):
        resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "wrong"})
        assert resp.status_code == 401

    # 6th attempt, even with the CORRECT password, is blocked by the lockout
    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "correcthorsebattery"})
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_successful_login_resets_failed_attempt_counter(client, db, owner):
    await _set_password(db, owner, "correcthorsebattery")
    for _ in range(3):
        await client.post("/api/auth/login", json={"identifier": owner.email, "password": "wrong"})

    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "correcthorsebattery"})
    assert resp.status_code == 200

    await db.refresh(owner)
    assert owner.failed_password_attempts == 0


@pytest.mark.asyncio
async def test_set_password_requires_current_password_when_already_set(client, owner, db):
    await _set_password(db, owner, "originalpassword")
    resp = await client.post(
        "/api/auth/password/set",
        json={"new_password": "BrandNewPassword1!"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 401

    resp = await client.post(
        "/api/auth/password/set",
        json={"current_password": "originalpassword", "new_password": "BrandNewPassword1!"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_set_password_first_time_no_current_required(client, owner):
    resp = await client.post(
        "/api/auth/password/set",
        json={"new_password": "BrandNewPassword1!"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("weak_password", [
    "Short1!",  # too short
    "alllowercase123!",  # no uppercase
    "ALLUPPERCASE123!",  # no lowercase
    "NoDigitsHere!!",  # no digit
    "NoSpecialChars123",  # no special character
])
async def test_set_password_rejects_weak_passwords(client, owner, weak_password):
    resp = await client.post(
        "/api/auth/password/set",
        json={"new_password": weak_password},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_admin_login_without_mfa_returns_setup_required(client, db):
    # A fresh unenrolled admin, distinct from the conftest `admin` fixture
    # (which is pre-enrolled so it can be used against admin-only endpoints
    # elsewhere in the suite).
    fresh_admin = User(email="freshadmin@test.com", callsign="KC1NEW", role=UserRole.ADMIN, is_active=True)
    db.add(fresh_admin)
    await db.commit()
    await db.refresh(fresh_admin)
    await _set_password(db, fresh_admin, "adminpassword1")

    resp = await client.post("/api/auth/login", json={"identifier": fresh_admin.email, "password": "adminpassword1"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["login_status"] == "mfa_setup_required"
    assert data["access_token"]  # a token IS issued, scoped by get_admin_user elsewhere


@pytest.mark.asyncio
async def test_admin_login_with_mfa_requires_then_accepts_code(client, db, admin):
    await _set_password(db, admin, "adminpassword1")
    secret = await _enroll_mfa(db, admin)

    resp = await client.post("/api/auth/login", json={"identifier": admin.email, "password": "adminpassword1"})
    assert resp.status_code == 200
    assert resp.json()["login_status"] == "mfa_required"

    code = pyotp.TOTP(secret).now()
    resp = await client.post("/api/auth/login", json={"identifier": admin.email, "password": "adminpassword1", "totp_code": code})
    assert resp.status_code == 200
    assert resp.json()["login_status"] == "ok"


@pytest.mark.asyncio
async def test_non_admin_without_mfa_login_ok(client, db, owner):
    await _set_password(db, owner, "userpassword1")
    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "userpassword1"})
    assert resp.status_code == 200
    assert resp.json()["login_status"] == "ok"


@pytest.mark.asyncio
async def test_non_admin_with_mfa_enrolled_is_also_enforced_at_login(client, db, owner):
    # Optional for regular users, but once turned on it must actually gate
    # login -- an "optional" factor that's silently skipped would be worse
    # than not offering it.
    await _set_password(db, owner, "userpassword1")
    secret = await _enroll_mfa(db, owner)

    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "userpassword1"})
    assert resp.status_code == 200
    assert resp.json()["login_status"] == "mfa_required"

    code = pyotp.TOTP(secret).now()
    resp = await client.post("/api/auth/login", json={"identifier": owner.email, "password": "userpassword1", "totp_code": code})
    assert resp.json()["login_status"] == "ok"


@pytest.mark.asyncio
async def test_backup_code_is_single_use(client, db, admin):
    await _set_password(db, admin, "adminpassword1")
    await _enroll_mfa(db, admin)
    codes = generate_backup_codes()
    admin.mfa_backup_codes = json.dumps([hash_backup_code(c) for c in codes])
    await db.commit()

    resp = await client.post("/api/auth/login", json={"identifier": admin.email, "password": "adminpassword1", "totp_code": codes[0]})
    assert resp.status_code == 200
    assert resp.json()["login_status"] == "ok"

    # Same code again is rejected
    resp = await client.post("/api/auth/login", json={"identifier": admin.email, "password": "adminpassword1", "totp_code": codes[0]})
    assert resp.json()["login_status"] == "mfa_required"


@pytest.mark.asyncio
async def test_mfa_setup_flow_enables_mfa_and_returns_backup_codes(client, owner):
    headers = auth_headers(owner)
    start = await client.post("/api/auth/mfa/setup/start", headers=headers)
    assert start.status_code == 200
    secret = start.json()["secret"]
    assert start.json()["qr_code_data_uri"].startswith("data:image/png;base64,")

    code = pyotp.TOTP(secret).now()
    confirm = await client.post("/api/auth/mfa/setup/confirm", json={"totp_code": code}, headers=headers)
    assert confirm.status_code == 200
    assert len(confirm.json()["backup_codes"]) == 8

    me = await client.get("/api/users/me", headers=headers)
    assert me.json()["mfa_enabled"] is True


@pytest.mark.asyncio
async def test_mfa_setup_confirm_rejects_wrong_code(client, owner):
    headers = auth_headers(owner)
    await client.post("/api/auth/mfa/setup/start", headers=headers)
    resp = await client.post("/api/auth/mfa/setup/confirm", json={"totp_code": "000000"}, headers=headers)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_only_route_blocked_until_mfa_enrolled(client, db):
    fresh_admin = User(email="freshadmin2@test.com", callsign="KC1NE2", role=UserRole.ADMIN, is_active=True)
    db.add(fresh_admin)
    await db.commit()
    await db.refresh(fresh_admin)

    resp = await client.get("/api/users", headers=auth_headers(fresh_admin))
    assert resp.status_code == 403
    assert "two-factor" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_admin_cannot_reset_own_mfa(client, admin):
    resp = await client.post(f"/api/users/{admin.id}/mfa/reset", headers=auth_headers(admin))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_admin_can_reset_another_users_mfa(client, db, admin, owner):
    await _enroll_mfa(db, owner)
    resp = await client.post(f"/api/users/{owner.id}/mfa/reset", headers=auth_headers(admin))
    assert resp.status_code == 200

    await db.refresh(owner)
    assert owner.mfa_enabled is False
    assert owner.mfa_secret_encrypted is None


@pytest.mark.asyncio
async def test_admin_password_reset_returns_working_temp_password(client, admin, owner):
    resp = await client.post(f"/api/users/{owner.id}/password/reset", headers=auth_headers(admin))
    assert resp.status_code == 200
    temp_password = resp.json()["temporary_password"]

    login = await client.post("/api/auth/login", json={"identifier": owner.email, "password": temp_password})
    assert login.status_code == 200
    assert login.json()["login_status"] == "ok"


@pytest.mark.asyncio
async def test_non_admin_cannot_replace_or_disable_admin_mfa_self_service(client, db, admin):
    await _set_password(db, admin, "adminpassword1")
    resp = await client.post("/api/auth/mfa/replace/start", json={"password": "adminpassword1"}, headers=auth_headers(admin))
    assert resp.status_code == 403

    resp = await client.post("/api/auth/mfa/disable", json={"password": "adminpassword1"}, headers=auth_headers(admin))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_mfa_disable_requires_correct_password(client, db, owner):
    await _set_password(db, owner, "userpassword1")
    await _enroll_mfa(db, owner)

    resp = await client.post("/api/auth/mfa/disable", json={"password": "wrong"}, headers=auth_headers(owner))
    assert resp.status_code == 401

    resp = await client.post("/api/auth/mfa/disable", json={"password": "userpassword1"}, headers=auth_headers(owner))
    assert resp.status_code == 200

    await db.refresh(owner)
    assert owner.mfa_enabled is False
