"""Admin mode (app/admin_mode.py): an admin acts as a regular user until they
enter a two-factor code, for one browser session, and it closes after 15 idle
minutes or on Lock admin. See docs/concepts/SIGN-IN-PROVIDERS-AND-ADMIN-MODE.md.

Every test here uses the real rule: conftest otherwise treats admins as
already in admin mode.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyotp
import pytest
from sqlalchemy import select

from app.admin_mode import ADMIN_MODE_IDLE_MINUTES, ADMIN_MODE_REQUIRED_DETAIL, ADMIN_MODE_WRONG_CODE_DETAIL
from app.auth import create_access_token, encrypt_mfa_secret, hash_backup_code
from app.dependencies import BACKGROUND_REQUEST_HEADER, MFA_SETUP_REQUIRED_DETAIL
from app.models import AdminSession, Net, NetStatus, User, UserRole

pytestmark = pytest.mark.real_admin_mode

ADMIN_ONLY = "/api/audit"
SECRET = pyotp.random_base32()


def _headers(user: User, sid="browser-a") -> dict:
    token = create_access_token(data={"sub": str(user.id), "sid": sid})
    return {"Authorization": f"Bearer {token}"}


async def _enroll(db, user: User, backup_codes=()):
    user.mfa_secret_encrypted = encrypt_mfa_secret(SECRET)
    user.mfa_backup_codes = json.dumps([hash_backup_code(c) for c in backup_codes])
    await db.commit()


async def _open(client, headers, code=None):
    return await client.post("/api/auth/admin-mode", headers=headers,
                             json={"totp_code": code or pyotp.TOTP(SECRET).now()})


async def test_admin_starts_as_a_regular_user(client, db, admin):
    await _enroll(db, admin)
    r = await client.get(ADMIN_ONLY, headers=_headers(admin))
    assert r.status_code == 403
    assert r.json()["detail"] == ADMIN_MODE_REQUIRED_DETAIL
    me = (await client.get("/api/users/me", headers=_headers(admin))).json()
    assert me["role"] == "admin" and me["admin_mode_open"] is False


async def test_code_opens_admin_mode_for_this_browser_only(client, db, admin):
    await _enroll(db, admin)
    r = await _open(client, _headers(admin))
    assert r.status_code == 200 and r.json()["admin_mode_open"] is True
    assert r.json()["admin_mode_closes_at"] is not None

    assert (await client.get(ADMIN_ONLY, headers=_headers(admin))).status_code == 200
    me = (await client.get("/api/users/me", headers=_headers(admin))).json()
    assert me["admin_mode_open"] is True
    # The same account in another browser is still a regular user.
    assert (await client.get(ADMIN_ONLY, headers=_headers(admin, "browser-b"))).status_code == 403


async def test_wrong_code_is_refused_and_logged(client, db, admin):
    await _enroll(db, admin)
    r = await _open(client, _headers(admin), code="000000")
    assert r.status_code == 403 and r.json()["detail"] == ADMIN_MODE_WRONG_CODE_DETAIL
    assert (await client.get(ADMIN_ONLY, headers=_headers(admin))).status_code == 403
    from app.models import AuditEvent
    actions = (await db.execute(select(AuditEvent.action))).scalars().all()
    assert "auth.mfa_failed" in actions


async def test_backup_code_opens_admin_mode_once(client, db, admin):
    await _enroll(db, admin, backup_codes=["ABCD-EFGH"])
    assert (await _open(client, _headers(admin), code="ABCD-EFGH")).status_code == 200
    assert (await _open(client, _headers(admin, "browser-b"), code="ABCD-EFGH")).status_code == 403


async def test_closes_after_idle_minutes(client, db, admin):
    await _enroll(db, admin)
    await _open(client, _headers(admin))
    row = (await db.execute(select(AdminSession))).scalar_one()
    row.last_used_at = datetime.now(timezone.utc) - timedelta(minutes=ADMIN_MODE_IDLE_MINUTES + 1)
    await db.commit()
    assert (await client.get(ADMIN_ONLY, headers=_headers(admin))).status_code == 403


async def test_requests_keep_it_open_but_background_polls_do_not(client, db, admin):
    await _enroll(db, admin)
    await _open(client, _headers(admin))
    row = (await db.execute(select(AdminSession))).scalar_one()
    earlier = datetime.now(timezone.utc) - timedelta(minutes=ADMIN_MODE_IDLE_MINUTES - 1)
    row.last_used_at = earlier
    await db.commit()

    poll = {**_headers(admin), BACKGROUND_REQUEST_HEADER: "1"}
    assert (await client.get("/api/users/me", headers=poll)).status_code == 200
    await db.refresh(row)
    assert abs((row.last_used_at.replace(tzinfo=timezone.utc) - earlier).total_seconds()) < 1

    assert (await client.get("/api/users/me", headers=_headers(admin))).status_code == 200
    await db.refresh(row)
    assert row.last_used_at.replace(tzinfo=timezone.utc) > earlier + timedelta(seconds=30)


async def test_switch_and_lock_report_the_new_state(client, db, admin):
    """The app reads admin mode from this header on every response; the
    switch and lock responses must describe the state after them."""
    await _enroll(db, admin)
    opened = await _open(client, _headers(admin))
    assert opened.headers["X-Admin-Mode-Closes-At"] != "closed"
    locked = await client.delete("/api/auth/admin-mode", headers=_headers(admin))
    assert locked.headers["X-Admin-Mode-Closes-At"] == "closed"


async def test_lock_admin_closes_it(client, db, admin):
    await _enroll(db, admin)
    await _open(client, _headers(admin))
    r = await client.delete("/api/auth/admin-mode", headers=_headers(admin))
    assert r.status_code == 200 and r.json()["admin_mode_open"] is False
    assert (await client.get(ADMIN_ONLY, headers=_headers(admin))).status_code == 403


async def test_token_without_session_id_gets_one(client, db, admin):
    """A token issued before admin mode has no sid. Opening admin mode hands
    back a token that has one, and admin mode belongs to that token."""
    await _enroll(db, admin)
    from jose import jwt
    from app.config import settings
    old = jwt.encode({"sub": str(admin.id), "iat": int(datetime.now(timezone.utc).timestamp()),
                      "exp": int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())},
                     settings.secret_key, algorithm=settings.algorithm)
    r = await _open(client, {"Authorization": f"Bearer {old}"})
    assert r.status_code == 200
    new = r.json()["access_token"]
    assert new and jwt.get_unverified_claims(new)["sid"]
    assert (await client.get(ADMIN_ONLY, headers={"Authorization": f"Bearer {new}"})).status_code == 200


async def test_renewed_token_keeps_its_session_id(client, db, admin):
    await _enroll(db, admin)
    from jose import jwt
    from app.config import settings
    now = datetime.now(timezone.utc)
    expiring = jwt.encode({"sub": str(admin.id), "sid": "browser-a", "iat": int(now.timestamp()),
                           "exp": int((now + timedelta(days=1)).timestamp())},
                          settings.secret_key, algorithm=settings.algorithm)
    r = await client.get("/api/users/me", headers={"Authorization": f"Bearer {expiring}"})
    renewed = r.headers.get("X-New-Token")
    assert renewed and jwt.get_unverified_claims(renewed)["sid"] == "browser-a"


async def test_non_admin_cannot_open_it(client, db, owner):
    await _enroll(db, owner)
    owner.mfa_enabled = True
    await db.commit()
    assert (await _open(client, _headers(owner))).status_code == 403


async def test_admin_without_two_factor_is_sent_to_set_it_up(client, db, admin):
    admin.mfa_enabled = False
    await db.commit()
    r = await _open(client, _headers(admin))
    assert r.status_code == 403 and r.json()["detail"] == MFA_SETUP_REQUIRED_DETAIL


async def test_admin_override_on_someone_elses_net_needs_admin_mode(client, db, admin, owner):
    """Outside admin mode an admin is a regular user on other people's nets
    too, not just in the Admin panel."""
    await _enroll(db, admin)
    net = Net(name="Owner's net", owner_id=owner.id, status=NetStatus.DRAFT)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    r = await client.get(f"/api/nets/{net.id}", headers=_headers(admin))
    assert r.status_code == 200 and r.json()["actions"]["edit"] is False
    await _open(client, _headers(admin))
    r = await client.get(f"/api/nets/{net.id}", headers=_headers(admin))
    assert r.json()["actions"]["edit"] is True


# A comparison of an instance's role to the admin role decides what someone may
# do without asking whether admin mode is open. Queries on the User.role column
# (who to email) are fine and don't match this pattern.
_RAW_ADMIN_CHECK = re.compile(
    r"""(?<![A-Za-z0-9_])[a-z_][A-Za-z0-9_]*\.role\s*(==|!=)\s*(UserRole\.ADMIN|["']admin["'])"""
    r"""|(UserRole\.ADMIN|["']admin["'])\s*(==|!=)\s*(?<![A-Za-z0-9_])[a-z_][A-Za-z0-9_]*\.role"""
)


def test_no_admin_check_skips_admin_mode():
    app_dir = Path(__file__).resolve().parent.parent / "app"
    offenders = []
    for path in app_dir.rglob("*.py"):
        if path.name == "admin_mode.py":
            continue
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if _RAW_ADMIN_CHECK.search(line) and "admin-mode-ok" not in line:
                offenders.append(f"{path.relative_to(app_dir)}:{n}: {line.strip()}")
    assert not offenders, (
        "Use permissions.is_admin(user), which also requires admin mode. A check on "
        "the account's role itself (sign-in rules) needs an '# admin-mode-ok: why' "
        "comment.\n" + "\n".join(offenders)
    )


def test_frontend_copies_match_the_server():
    """The app shows the idle limit and recognizes the refusal by its exact
    text (frontend/src/utils/adminMode.ts, services/api.ts)."""
    frontend = Path(__file__).resolve().parents[2] / "frontend" / "src"
    minutes = re.search(r"ADMIN_MODE_IDLE_MINUTES = (\d+);", (frontend / "utils" / "adminMode.ts").read_text())
    assert minutes and int(minutes.group(1)) == ADMIN_MODE_IDLE_MINUTES
    detail = re.search(r"ADMIN_MODE_REQUIRED_DETAIL = '([^']*)';", (frontend / "services" / "api.ts").read_text())
    assert detail and detail.group(1) == ADMIN_MODE_REQUIRED_DETAIL
