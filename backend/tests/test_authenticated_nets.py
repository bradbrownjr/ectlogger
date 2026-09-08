"""
Authenticated nets: NCS/Logger-only TOTP identity verification.

Rules worth guarding here, since a future refactor could quietly break any
of them without another test catching it:

- only NCS/Logger (or owner/admin, via check_net_permission) may read a
  station's expected code or record a verification -- everyone else gets 403;
- the endpoint is a no-op (400) on a net that isn't flagged `authenticated`;
- the computed code is correct against the station's real secret, and no
  raw secret ever appears in a response;
- a station with no account, or an account with MFA not enrolled, reports
  `enrolled: false` rather than erroring;
- confirming sets identity_verified + stamps who/when; rejecting clears both
  rather than leaving a stale verification in place;
- a live WebSocket broadcast fires on verify/reject so every viewer's
  padlock stays in sync.
"""
from unittest.mock import AsyncMock, patch

import pyotp
import pytest

from app.auth import encrypt_mfa_secret
from app.models import CheckIn, Net, NetRole, StationStatus, User, UserRole
from tests.conftest import auth_headers


async def _make_net(db, owner, authenticated=True):
    net = Net(name="Authenticated Net Test", owner_id=owner.id, status="active", authenticated=authenticated)
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net


async def _grant_role(db, net_id, user_id, role):
    db.add(NetRole(net_id=net_id, user_id=user_id, role=role, is_active=True))
    await db.commit()


async def _enroll_mfa(db, user, secret="JBSWY3DPEHPK3PXP"):
    user.mfa_enabled = True
    user.mfa_secret_encrypted = encrypt_mfa_secret(secret)
    await db.commit()
    return secret


async def _check_in(db, net_id, user, status=StationStatus.CHECKED_IN):
    ci = CheckIn(net_id=net_id, user_id=user.id, callsign=user.callsign, name="", location="", status=status)
    db.add(ci)
    await db.commit()
    await db.refresh(ci)
    return ci


@pytest.mark.asyncio
async def test_non_staff_cannot_read_expected_code_or_verify(client, db, owner, other):
    net = await _make_net(db, owner)
    ci = await _check_in(db, net.id, other)

    resp = await client.get(f"/api/check-ins/check-ins/{ci.id}/expected-code", headers=auth_headers(other))
    assert resp.status_code == 403

    resp2 = await client.post(
        f"/api/check-ins/check-ins/{ci.id}/verify-identity", json={"verified": True}, headers=auth_headers(other)
    )
    assert resp2.status_code == 403


@pytest.mark.asyncio
async def test_expected_code_requires_authenticated_net(client, db, owner, other):
    net = await _make_net(db, owner, authenticated=False)
    ci = await _check_in(db, net.id, other)

    resp = await client.get(f"/api/check-ins/check-ins/{ci.id}/expected-code", headers=auth_headers(owner))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_expected_code_matches_real_totp_and_never_leaks_secret(client, db, owner, other):
    net = await _make_net(db, owner)
    secret = await _enroll_mfa(db, other)
    ci = await _check_in(db, net.id, other)

    resp = await client.get(f"/api/check-ins/check-ins/{ci.id}/expected-code", headers=auth_headers(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["enrolled"] is True
    assert body["current_code"] == pyotp.TOTP(secret).now()
    assert "secret" not in body
    assert secret not in resp.text


@pytest.mark.asyncio
async def test_expected_code_unenrolled_station_reports_not_enrolled(client, db, owner, other):
    net = await _make_net(db, owner)
    ci = await _check_in(db, net.id, other)  # other has no MFA enrolled

    resp = await client.get(f"/api/check-ins/check-ins/{ci.id}/expected-code", headers=auth_headers(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["enrolled"] is False
    assert body["current_code"] is None


@pytest.mark.asyncio
async def test_expected_code_guest_check_in_reports_not_enrolled(client, db, owner):
    net = await _make_net(db, owner)
    ci = CheckIn(net_id=net.id, user_id=None, callsign="GUEST1", name="", location="", status=StationStatus.CHECKED_IN)
    db.add(ci)
    await db.commit()
    await db.refresh(ci)

    resp = await client.get(f"/api/check-ins/check-ins/{ci.id}/expected-code", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["enrolled"] is False


@pytest.mark.asyncio
async def test_confirm_sets_verified_and_broadcasts(client, db, owner, other):
    net = await _make_net(db, owner)
    await _enroll_mfa(db, other)
    ci = await _check_in(db, net.id, other)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            f"/api/check-ins/check-ins/{ci.id}/verify-identity", json={"verified": True}, headers=auth_headers(owner)
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["identity_verified"] is True
        assert body["identity_verified_at"] is not None

        mock_broadcast.assert_awaited_once()
        payload, broadcast_net_id = mock_broadcast.call_args[0]
        assert payload["type"] == "identity_verified_changed"
        assert payload["data"]["identity_verified"] is True
        assert broadcast_net_id == net.id


@pytest.mark.asyncio
async def test_reject_clears_verification(client, db, owner, other):
    net = await _make_net(db, owner)
    await _enroll_mfa(db, other)
    ci = await _check_in(db, net.id, other)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock):
        await client.post(
            f"/api/check-ins/check-ins/{ci.id}/verify-identity", json={"verified": True}, headers=auth_headers(owner)
        )
        resp = await client.post(
            f"/api/check-ins/check-ins/{ci.id}/verify-identity", json={"verified": False}, headers=auth_headers(owner)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["identity_verified"] is False
        assert body["identity_verified_at"] is None


@pytest.mark.asyncio
async def test_ncs_role_can_verify_without_being_owner(client, db, owner, other):
    net = await _make_net(db, owner)
    ncs_user = User(email="ncs@test.com", callsign="KC1NCS", role=UserRole.USER, is_active=True)
    db.add(ncs_user)
    await db.commit()
    await db.refresh(ncs_user)
    await _grant_role(db, net.id, ncs_user.id, "NCS")
    await _enroll_mfa(db, other)
    ci = await _check_in(db, net.id, other)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock):
        resp = await client.post(
            f"/api/check-ins/check-ins/{ci.id}/verify-identity", json={"verified": True}, headers=auth_headers(ncs_user)
        )
        assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_check_in_response_exposes_identity_verifiable_flag(client, db, owner, other):
    net = await _make_net(db, owner)
    await _enroll_mfa(db, other)
    await _check_in(db, net.id, other)

    resp = await client.get(f"/api/check-ins/nets/{net.id}/check-ins", headers=auth_headers(owner))
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["identity_verifiable"] is True
    assert rows[0]["identity_verified"] is False
