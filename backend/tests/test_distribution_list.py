"""
A net's distribution list (GitHub #15, Brad 2026-11-19): one group address,
such as a groups.io list, that gets the reminder the day before and the
closing log; and sending a closed net's log again.

The list is not an account, so its copy is what a signed-out visitor sees
(contact details redacted, no off-net log entries) and carries no personal
unsubscribe link. The address is shown only to people who can edit the net
or schedule, and every change goes in the activity log.
"""
import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import AuditEvent, ChatMessage, CheckIn, Net, NetStatus, NetTemplate, OffNetLogEntry, StationStatus
from app.email import net_logs
from app.services import distribution_list, net_closure
from tests.conftest import auth_headers


GROUP = "club@groups.io"


@pytest.fixture()
def sent_emails(monkeypatch):
    """(address, subject, html) for every net log email built and sent."""
    sent = []

    async def _fake_send(email, rendered, unsubscribe_token):
        sent.append((email, rendered.subject, rendered.html, rendered.attachments))

    monkeypatch.setattr(net_logs, "_send", _fake_send)
    return sent


async def _net(client, db, owner, **fields):
    create = await client.post("/api/nets/", json={"name": "List Net", **fields}, headers=auth_headers(owner))
    assert create.status_code in (200, 201), create.text
    return create.json()


async def _closed_net(client, db, owner, **fields):
    net_id = (await _net(client, db, owner, **fields))["id"]
    net = await db.get(Net, net_id)
    net.status = NetStatus.ACTIVE
    net.started_at = datetime.utcnow() - timedelta(hours=1)
    await db.commit()
    return net_id


# ========== The setting ==========

@pytest.mark.asyncio
async def test_address_is_normalized_and_blank_clears(client, db, owner):
    net = await _net(client, db, owner, distribution_list="  Club@Groups.IO ")
    assert (await db.get(Net, net["id"])).distribution_list == GROUP

    resp = await client.put(f"/api/nets/{net['id']}", json={"distribution_list": ""}, headers=auth_headers(owner))
    assert resp.status_code == 200
    stored = await db.get(Net, net["id"])
    await db.refresh(stored)
    assert stored.distribution_list is None


@pytest.mark.asyncio
async def test_not_an_address_is_refused(client, db, owner):
    resp = await client.post("/api/nets/", json={"name": "Bad", "distribution_list": "not an address"},
                             headers=auth_headers(owner))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_only_editors_see_the_address(client, db, owner, other):
    net_id = (await _net(client, db, owner, distribution_list=GROUP))["id"]
    mine = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))
    assert mine.json()["distribution_list"] == GROUP
    theirs = await client.get(f"/api/nets/{net_id}", headers=auth_headers(other))
    assert theirs.json()["distribution_list"] is None
    guest = await client.get(f"/api/nets/{net_id}")
    assert guest.json()["distribution_list"] is None


@pytest.mark.asyncio
async def test_changes_go_in_the_activity_log(client, db, owner):
    net_id = (await _net(client, db, owner, distribution_list=GROUP))["id"]
    await client.put(f"/api/nets/{net_id}", json={"distribution_list": GROUP}, headers=auth_headers(owner))
    await client.put(f"/api/nets/{net_id}", json={"distribution_list": "other@groups.io"}, headers=auth_headers(owner))

    events = (await db.execute(
        select(AuditEvent).where(AuditEvent.action == "net.distribution_list_changed", AuditEvent.net_id == net_id)
        .order_by(AuditEvent.id)
    )).scalars().all()
    # Set at create, then changed once; saving the same address again is not a change
    assert [json.loads(e.details) for e in events] == [
        {"from": None, "to": GROUP},
        {"from": GROUP, "to": "other@groups.io"},
    ]


@pytest.mark.asyncio
async def test_schedule_address_is_copied_to_its_nets(client, db, owner):
    template = NetTemplate(name="Club Net", owner_id=owner.id, schedule_type="weekly",
                           schedule_config='{"time": "19:00", "day_of_week": 3, "timezone": "UTC"}')
    db.add(template)
    await db.commit()

    resp = await client.put(f"/api/templates/{template.id}", json={"distribution_list": GROUP},
                            headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["distribution_list"] == GROUP
    logged = (await db.execute(
        select(AuditEvent).where(AuditEvent.action == "schedule.distribution_list_changed")
    )).scalars().all()
    assert len(logged) == 1

    net_id = (await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))).json()["id"]
    assert (await db.get(Net, net_id)).distribution_list == GROUP


@pytest.mark.asyncio
async def test_settings_name_the_sending_address(client, owner):
    resp = await client.get("/api/settings", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["email_from_address"]


# ========== The closing log's list copy ==========

@pytest.mark.asyncio
async def test_close_sends_the_list_a_signed_out_copy(client, db, owner, sent_emails):
    net_id = await _closed_net(client, db, owner, distribution_list=GROUP)
    station = CheckIn(net_id=net_id, callsign="W1AW", name="Hiram", location="Newington",
                      status=StationStatus.CHECKED_IN, notes="call me at 207-555-0142 or hiram@example.com")
    db.add(station)
    db.add(ChatMessage(net_id=net_id, user_id=owner.id, message="reach me at 207-555-0199"))
    await db.commit()

    resp = await client.post(f"/api/nets/{net_id}/close", json={"ncs_check_in_id": station.id},
                             headers=auth_headers(owner))
    assert resp.status_code == 200

    to_list = [e for e in sent_emails if e[0] == GROUP]
    to_owner = [e for e in sent_emails if e[0] == owner.email]
    assert len(to_list) == 1 and len(to_owner) == 1

    _, _, html, attachments = to_list[0]
    everything = html + "".join(a[0] for a in attachments)
    assert "207-555-0142" not in everything and "hiram@example.com" not in everything
    assert "207-555-0199" not in everything
    assert "remove this address from the net's settings" in html
    assert "Unsubscribe" not in html
    # The owner's own copy is untouched
    owner_everything = to_owner[0][2] + "".join(a[0] for a in to_owner[0][3])
    assert "207-555-0199" in owner_everything


@pytest.mark.asyncio
async def test_ics309_list_copy_leaves_out_off_net_entries(client, db, owner, sent_emails):
    net_id = await _closed_net(client, db, owner, distribution_list=GROUP, ics309_enabled=True)
    station = CheckIn(net_id=net_id, callsign="W1AW", name="Hiram", location="Newington",
                      status=StationStatus.CHECKED_IN)
    db.add(station)
    db.add(OffNetLogEntry(net_id=net_id, occurred_at=datetime.utcnow(), from_station="W1AW",
                          to_station="York County EMA", message="Winlink sent", status="accepted"))
    await db.commit()

    resp = await client.post(f"/api/nets/{net_id}/close", json={"ncs_check_in_id": station.id},
                             headers=auth_headers(owner))
    assert resp.status_code == 200

    list_copy = next(e for e in sent_emails if e[0] == GROUP)
    owner_copy = next(e for e in sent_emails if e[0] == owner.email)
    assert "York County EMA" not in list_copy[2] + "".join(a[0] for a in list_copy[3])
    assert "York County EMA" in owner_copy[2] + "".join(a[0] for a in owner_copy[3])


@pytest.mark.asyncio
async def test_no_list_no_list_copy(client, db, owner, sent_emails):
    net_id = await _closed_net(client, db, owner)
    await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))
    assert [e[0] for e in sent_emails] == [owner.email]


# ========== Sending the log again ==========

@pytest.mark.asyncio
async def test_resend_to_each_audience(client, db, owner, sent_emails):
    net_id = await _closed_net(client, db, owner, distribution_list=GROUP)
    await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))
    sent_emails.clear()

    me = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "me"}, headers=auth_headers(owner))
    assert me.status_code == 202
    assert [e[0] for e in sent_emails] == [owner.email]
    sent_emails.clear()

    subs = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "subscribers"}, headers=auth_headers(owner))
    assert subs.status_code == 202
    assert [e[0] for e in sent_emails] == [owner.email]
    sent_emails.clear()

    group = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "list"}, headers=auth_headers(owner))
    assert group.status_code == 202
    assert [e[0] for e in sent_emails] == [GROUP]


@pytest.mark.asyncio
async def test_me_ignores_the_close_email_switch(client, db, owner, sent_emails):
    """Asking for a copy is asking: the Profile switch is about the automatic one."""
    owner.notify_net_close = False
    await db.commit()
    net_id = await _closed_net(client, db, owner)
    await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))
    assert sent_emails == []

    await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "me"}, headers=auth_headers(owner))
    assert [e[0] for e in sent_emails] == [owner.email]


@pytest.mark.asyncio
async def test_a_second_group_resend_waits(client, db, owner, sent_emails):
    net_id = await _closed_net(client, db, owner, distribution_list=GROUP)
    await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))

    first = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "list"}, headers=auth_headers(owner))
    assert first.status_code == 202
    second = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "list"}, headers=auth_headers(owner))
    assert second.status_code == 429
    # A different audience isn't held up
    subs = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "subscribers"}, headers=auth_headers(owner))
    assert subs.status_code == 202
    # Your own copy never waits
    me = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "me"}, headers=auth_headers(owner))
    me_again = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "me"}, headers=auth_headers(owner))
    assert me.status_code == me_again.status_code == 202


@pytest.mark.asyncio
async def test_resend_refusals(client, db, owner, other, sent_emails):
    net_id = await _closed_net(client, db, owner)
    # Still active
    early = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "me"}, headers=auth_headers(owner))
    assert early.status_code == 400

    await client.post(f"/api/nets/{net_id}/close", json={"hold_log": True}, headers=auth_headers(owner))
    held = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "me"}, headers=auth_headers(owner))
    assert held.status_code == 400

    await client.post(f"/api/nets/{net_id}/send-log", headers=auth_headers(owner))
    no_list = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "list"}, headers=auth_headers(owner))
    assert no_list.status_code == 400
    stranger = await client.post(f"/api/nets/{net_id}/resend-log", json={"to": "me"}, headers=auth_headers(other))
    assert stranger.status_code == 403


# ========== The reminder the day before ==========

@pytest.fixture()
def list_reminders(monkeypatch):
    sent = []

    async def _fake(**kwargs):
        sent.append(kwargs)

    from app.email_service import EmailService
    monkeypatch.setattr(EmailService, "send_list_reminder", staticmethod(_fake))
    return sent


async def _upcoming(db, owner, hours, **fields):
    values = {"status": NetStatus.SCHEDULED, "distribution_list": GROUP, **fields}
    net = Net(name="Upcoming Net", owner_id=owner.id,
              scheduled_start_time=datetime.utcnow() + timedelta(hours=hours), **values)
    db.add(net)
    await db.commit()
    return net


@pytest.mark.asyncio
async def test_reminder_goes_once_inside_the_day(db, owner, list_reminders):
    soon = await _upcoming(db, owner, 23.5)
    await _upcoming(db, owner, 30)  # too early
    await _upcoming(db, owner, 5, status=NetStatus.CANCELLED)

    assert await distribution_list.send_due_list_reminders(db) == 1
    assert [r["to_email"] for r in list_reminders] == [GROUP]
    assert list_reminders[0]["net_name"] == "Upcoming Net"
    assert list_reminders[0]["net_url"].endswith(f"/nets/{soon.id}")

    assert await distribution_list.send_due_list_reminders(db) == 0
    await db.refresh(soon)
    assert soon.list_reminder_sent_at is not None


@pytest.mark.asyncio
async def test_draft_nets_get_the_reminder_too(db, owner, list_reminders):
    """A net created by hand from a schedule stays a draft until it starts."""
    await _upcoming(db, owner, 10, status=NetStatus.DRAFT)
    assert await distribution_list.send_due_list_reminders(db) == 1


@pytest.mark.asyncio
async def test_a_failed_reminder_is_not_retried_every_minute(db, owner, monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("SMTP down")

    from app.email_service import EmailService
    monkeypatch.setattr(EmailService, "send_list_reminder", staticmethod(_boom))
    net = await _upcoming(db, owner, 3)
    await distribution_list.send_due_list_reminders(db)
    await db.refresh(net)
    assert net.list_reminder_sent_at is not None
    assert await distribution_list.send_due_list_reminders(db) == 0


@pytest.mark.asyncio
async def test_reminder_email_has_no_account_footer(monkeypatch):
    from app.email import reminders
    captured = {}

    async def _fake_send_email(to_email, subject, html_content, **kwargs):
        captured.update(to=to_email, subject=subject, html=html_content, kwargs=kwargs)

    monkeypatch.setattr(reminders, "send_email", _fake_send_email)
    await reminders.send_list_reminder(
        to_email=GROUP, net_name="Club Net", net_date="Thursday, November 19, 2026",
        net_time="07:00 PM EST", frequencies=[{"frequency": "147.090", "mode": "FM"}],
        net_url="https://example.test/nets/1",
    )
    assert captured["to"] == GROUP
    assert "Club Net is on Thursday, November 19, 2026 at 07:00 PM EST." in captured["html"]
    assert "Hello" not in captured["html"]
    assert "profile settings" not in captured["html"]
    assert "remove this address from the net's settings" in captured["html"]
