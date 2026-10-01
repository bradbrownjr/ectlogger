"""
Schedule-creation requirements and the early access request.

GitHub #6 (2026-10-01): AE1RE met the 7-day account age, and his profile showed
two nets, but creating a schedule was refused for having attended none. Both of
his check-ins were logged by net control before he registered, so they carry
his callsign with ``user_id`` NULL. The requirement counted ``user_id`` alone
while the profile counts by callsign (utils.user_callsigns). These tests pin
the requirement to the profile's rule, and cover the request-early-access path
the refusal dialog now offers.
"""
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import auth_headers
from app.email_service import EmailService
from app.models import AppSettings, CheckIn, Net
from app.routers.templates_core import (
    SCHEDULE_REQUIREMENTS_NOT_MET,
    check_schedule_creation_eligibility,
)


async def _age(db, user, days: int):
    user.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    await db.commit()


async def _staff_logged_check_in(db, callsign: str) -> Net:
    """A check-in entered by NCS for a station with no account yet."""
    net = Net(name="Test Net")
    db.add(net)
    await db.flush()
    db.add(CheckIn(net_id=net.id, callsign=callsign, name="", location="", user_id=None))
    await db.commit()
    return net


@pytest.fixture
def sent(monkeypatch):
    calls = []

    async def _record(*args, **kwargs):
        calls.append(kwargs or args)

    monkeypatch.setattr(EmailService, "send_early_access_request", staticmethod(_record))
    monkeypatch.setattr(EmailService, "send_early_access_granted", staticmethod(_record))
    return calls


@pytest.mark.asyncio
async def test_check_in_logged_before_registering_counts(db, owner):
    await _age(db, owner, 30)
    await _staff_logged_check_in(db, owner.callsign)

    outcome = await check_schedule_creation_eligibility(db, owner)

    assert outcome.eligible
    assert outcome.nets_participated == 1


@pytest.mark.asyncio
async def test_previous_callsign_counts(db, owner):
    await _age(db, owner, 30)
    owner.previous_callsigns = '["KC1OLD"]'
    await db.commit()
    await _staff_logged_check_in(db, "KC1OLD")

    assert (await check_schedule_creation_eligibility(db, owner)).eligible


@pytest.mark.asyncio
async def test_no_nets_refused_with_code(client, db, owner):
    await _age(db, owner, 30)

    resp = await client.post("/api/templates/", json={"name": "Mine"}, headers=auth_headers(owner))

    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["code"] == SCHEDULE_REQUIREMENTS_NOT_MET
    assert "participate" in detail["message"]


@pytest.mark.asyncio
async def test_daily_limit_has_no_early_access_code(client, db, owner):
    """Early access doesn't lift the daily limit, so the dialog mustn't offer it."""
    await _age(db, owner, 30)
    await _staff_logged_check_in(db, owner.callsign)
    db.add(AppSettings(id=1, schedule_max_per_day=1))
    await db.commit()

    first = await client.post("/api/templates/", json={"name": "One"}, headers=auth_headers(owner))
    second = await client.post("/api/templates/", json={"name": "Two"}, headers=auth_headers(owner))

    assert first.status_code == 201
    assert second.status_code == 403
    assert isinstance(second.json()["detail"], str)


@pytest.mark.asyncio
async def test_request_early_access_emails_every_admin(client, db, owner, admin, sent):
    await _age(db, owner, 2)

    resp = await client.post(
        "/api/templates/early-access-request",
        json={"note": "Starting a club net"},
        headers=auth_headers(owner),
    )

    assert resp.status_code == 200
    assert len(sent) == 1
    assert sent[0]["to_email"] == admin.email
    assert sent[0]["requester_email"] == owner.email
    assert sent[0]["account_age_days"] == 2
    assert sent[0]["note"] == "Starting a club net"


@pytest.mark.asyncio
async def test_request_refused_when_already_eligible(client, db, owner, admin, sent):
    await _age(db, owner, 30)
    await _staff_logged_check_in(db, owner.callsign)

    resp = await client.post("/api/templates/early-access-request", json={}, headers=auth_headers(owner))

    assert resp.status_code == 400
    assert sent == []


@pytest.mark.asyncio
async def test_grant_lets_user_create_and_emails_them_once(client, db, owner, admin, sent):
    await _age(db, owner, 2)

    url = f"/api/users/{owner.id}/schedule-bypass?grant=true"
    assert (await client.put(url, headers=auth_headers(admin))).status_code == 200
    assert (await client.put(url, headers=auth_headers(admin))).status_code == 200

    assert sent == [(owner.email,)]
    resp = await client.post("/api/templates/", json={"name": "Mine"}, headers=auth_headers(owner))
    assert resp.status_code == 201
