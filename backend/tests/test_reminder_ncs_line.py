"""
The 1-hour subscriber reminder names the NCS on duty, as the staff reminder
does (ncs_reminder_service._reminder_ncs, email/reminders.py).

Joel AA1GM, 2026-10-29: his schedule's members keep asking "who's NCS this
week?", and the reminder he gets as the schedule's manager (the subscriber
one) didn't say. The three reminders also each built their own frequency
list, and the subscriber copy had a talkgroup's name and number swapped.
"""
import pytest

from app.email import reminders
from app.models import Frequency, Net, NetRole, NetStatus, NetTemplate
from app.ncs_reminder_service import _reminder_frequencies, _reminder_ncs


@pytest.fixture
def sent(monkeypatch):
    mails = []

    async def fake_send_email(**kwargs):
        mails.append(kwargs)

    monkeypatch.setattr(reminders, "send_email", fake_send_email)
    return mails


async def _send(**extra):
    await reminders.send_subscriber_reminder(
        to_email="joel@example.com", recipient_name="Joel", recipient_callsign="AA1GM",
        net_name="Weekly ARES Net", net_date="Tuesday, November 03, 2026", net_time="08:00 PM",
        frequencies=[], net_url="https://example.com/nets/1", **extra,
    )


@pytest.mark.asyncio
async def test_subscriber_reminder_names_the_ncs(sent):
    await _send(ncs_name="Pat Smith", ncs_callsign="N1PAT")
    assert "NCS on duty:</strong> Pat Smith (N1PAT)" in sent[0]["html_content"]


@pytest.mark.asyncio
async def test_subscriber_reminder_without_an_ncs_has_no_line(sent):
    await _send()
    assert "NCS on duty" not in sent[0]["html_content"]


@pytest.mark.asyncio
async def test_reminder_ncs_reads_the_nets_active_ncs(db, owner, other):
    net = Net(name="Weekly ARES Net", owner_id=owner.id, status=NetStatus.SCHEDULED)
    db.add(net)
    await db.flush()
    db.add(NetRole(net_id=net.id, user_id=other.id, role="NCS"))
    await db.commit()

    ncs_name, ncs_callsign = await _reminder_ncs(db, net.id)
    assert other.callsign in (ncs_name, ncs_callsign)
    assert await _reminder_ncs(db, None) == (None, None)


def test_reminder_frequencies_put_the_talkgroup_name_first():
    template = NetTemplate(name="DMR Net")
    template.frequencies = [
        Frequency(frequency="146.940", mode="FM"),
        Frequency(talkgroup="31234", network="Brandmeister", mode="DMR"),
    ]
    assert _reminder_frequencies(template) == [
        {"frequency": "146.940", "mode": "FM"},
        {"talkgroup_name": "Brandmeister", "talkgroup_id": "31234"},
    ]
