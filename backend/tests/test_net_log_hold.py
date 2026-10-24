"""
Closing a net without sending its log, and sending it later.

Brad, 2026-10-24 (WSSM SET, net 137): net control needs to close a net so
stations stop checking in and chatting, then finish the log (offline station
logs, off-net entries, corrections) before the closing email goes out. A net
closed with hold_log keeps Net.log_held_since set until POST
/nets/{id}/send-log; until then it can't be archived and its managers get a
daily reminder (services/net_log_hold.py).
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Net, NetStatus
from app.services import net_closure
from app.services.net_log_hold import reminder_due, send_due_log_hold_reminders
from tests.conftest import auth_headers


@pytest.fixture()
def sent_logs(monkeypatch):
    """Net ids whose closing email went out."""
    sent = []

    async def _fake_send(db, net):
        sent.append(net.id)

    monkeypatch.setattr(net_closure, "send_net_log", _fake_send)
    monkeypatch.setattr("app.routers.nets_core.send_net_log", _fake_send)
    return sent


async def _active_net(client, db, owner, **fields):
    create = await client.post("/api/nets/", json={"name": "Held Log Net"}, headers=auth_headers(owner))
    net = await db.get(Net, create.json()["id"])
    net.status = NetStatus.ACTIVE
    for key, value in fields.items():
        setattr(net, key, value)
    await db.commit()
    return net.id


async def _close(client, net_id, user, hold_log=None):
    body = None if hold_log is None else {"hold_log": hold_log}
    return await client.post(f"/api/nets/{net_id}/close", json=body, headers=auth_headers(user))


@pytest.mark.asyncio
async def test_plain_close_sends_the_log(client, db, owner, sent_logs):
    net_id = await _active_net(client, db, owner)
    resp = await _close(client, net_id, owner)
    assert resp.status_code == 200
    assert resp.json()["log_held_since"] is None
    assert sent_logs == [net_id]


@pytest.mark.asyncio
async def test_held_close_sends_nothing_and_blocks_archive(client, db, owner, sent_logs):
    net_id = await _active_net(client, db, owner)
    resp = await _close(client, net_id, owner, hold_log=True)
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"
    assert resp.json()["log_held_since"] is not None
    assert sent_logs == []

    archive = await client.post(f"/api/nets/{net_id}/archive", headers=auth_headers(owner))
    assert archive.status_code == 400


@pytest.mark.asyncio
async def test_send_log_sends_and_releases_archive(client, db, owner, sent_logs):
    net_id = await _active_net(client, db, owner)
    await _close(client, net_id, owner, hold_log=True)

    resp = await client.post(f"/api/nets/{net_id}/send-log", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["log_held_since"] is None
    assert sent_logs == [net_id]

    again = await client.post(f"/api/nets/{net_id}/send-log", headers=auth_headers(owner))
    assert again.status_code == 400
    assert sent_logs == [net_id]

    archive = await client.post(f"/api/nets/{net_id}/archive", headers=auth_headers(owner))
    assert archive.status_code == 200


@pytest.mark.asyncio
async def test_only_net_control_sends_the_log(client, db, owner, other, sent_logs):
    net_id = await _active_net(client, db, owner)
    await _close(client, net_id, owner, hold_log=True)
    resp = await client.post(f"/api/nets/{net_id}/send-log", headers=auth_headers(other))
    assert resp.status_code == 403
    assert sent_logs == []


@pytest.mark.asyncio
async def test_held_net_has_no_chat_grace_window(client, db, owner, sent_logs):
    net_id = await _active_net(client, db, owner, chat_grace_period_minutes=30)
    await _close(client, net_id, owner, hold_log=True)
    resp = await client.post(
        f"/api/chat/nets/{net_id}/messages", json={"message": "73"}, headers=auth_headers(owner)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_net_control_adds_check_ins_while_log_is_held(client, db, owner, other, sent_logs):
    net_id = await _active_net(client, db, owner)
    await _close(client, net_id, owner, hold_log=True)

    staff = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": "W1AW"}, headers=auth_headers(owner)
    )
    assert staff.status_code == 201

    station = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": other.callsign}, headers=auth_headers(other)
    )
    assert station.status_code == 403


@pytest.mark.asyncio
async def test_closed_and_sent_net_takes_no_check_ins(client, db, owner, sent_logs):
    net_id = await _active_net(client, db, owner)
    await _close(client, net_id, owner)
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": "W1AW"}, headers=auth_headers(owner)
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reminder_daily_until_sent(client, db, owner, sent_logs, monkeypatch):
    reminders = []

    async def _fake_reminder(**kwargs):
        reminders.append(kwargs["to_email"])

    monkeypatch.setattr("app.email_service.EmailService.send_log_hold_reminder", staticmethod(_fake_reminder))

    net_id = await _active_net(client, db, owner)
    await _close(client, net_id, owner, hold_log=True)
    net = await db.get(Net, net_id)
    await db.refresh(net)
    held = net.log_held_since if net.log_held_since.tzinfo else net.log_held_since.replace(tzinfo=timezone.utc)

    assert not reminder_due(net, held + timedelta(hours=23))
    assert await send_due_log_hold_reminders(db, held + timedelta(hours=23)) == 0

    assert await send_due_log_hold_reminders(db, held + timedelta(hours=25)) == 1
    assert reminders == [owner.email]

    # Not again the same day, then again the next.
    assert await send_due_log_hold_reminders(db, held + timedelta(hours=30)) == 0
    assert await send_due_log_hold_reminders(db, held + timedelta(hours=50)) == 1
    assert reminders == [owner.email, owner.email]

    await client.post(f"/api/nets/{net_id}/send-log", headers=auth_headers(owner))
    await db.refresh(net)
    assert await send_due_log_hold_reminders(db, held + timedelta(days=5)) == 0


@pytest.mark.asyncio
async def test_reminder_goes_to_schedule_managers_and_closer(db, owner, other, admin):
    from app.models import NetTemplate, TemplateStaff
    from app.services.net_log_hold import log_hold_recipients

    template = NetTemplate(name="SET schedule", owner_id=other.id)
    db.add(template)
    await db.flush()
    db.add(TemplateStaff(template_id=template.id, user_id=admin.id, is_co_manager=True, is_active=True))
    net = Net(name="SET", owner_id=owner.id, template_id=template.id, status=NetStatus.CLOSED,
              log_held_since=datetime.now(timezone.utc), log_held_by_user_id=owner.id)
    db.add(net)
    await db.commit()

    recipients = {u.id for u in await log_hold_recipients(db, net)}
    assert recipients == {owner.id, other.id, admin.id}
