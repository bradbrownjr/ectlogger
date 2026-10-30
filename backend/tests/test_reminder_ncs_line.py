"""
The 1-hour subscriber reminder names the NCS on duty, as the staff reminder
does (services/ncs_attribution.py::ncs_on_duty, email/reminders.py).

Joel AA1GM, 2026-10-29: his schedule's members keep asking "who's NCS this
week?", and the reminder he gets as the schedule's manager (the subscriber
one) didn't say. The three reminders also each built their own frequency
list, and the subscriber copy had a talkgroup's name and number swapped.

Brad, 2026-10-29: the Office Hours Tech Net's reminder named nobody. Its
manager W1BKW is the only one who runs it (no rotation, no staff list) and
takes NCS only when opening the lobby, after the reminder has gone out. The
net-started email had no NCS line at all.
"""
import pytest

from app.email import reminders
from app.email import net_lifecycle
from app.models import Frequency, NCSRotationMember, Net, NetRole, NetStatus, NetTemplate, TemplateStaff
from app.ncs_reminder_service import _reminder_frequencies
from app.services.ncs_attribution import ncs_on_duty


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

    ncs_name, ncs_callsign = await ncs_on_duty(db, net.id, None)
    assert other.callsign in (ncs_name, ncs_callsign)
    assert await ncs_on_duty(db, None, None) == (None, None)


async def _schedule(db, owner):
    owner.name = "Brian"
    template = NetTemplate(name="Office Hours", owner_id=owner.id, schedule_type="ad_hoc", schedule_config="{}")
    db.add(template)
    await db.flush()
    net = Net(name="Office Hours", owner_id=owner.id, template_id=template.id, status=NetStatus.SCHEDULED)
    db.add(net)
    await db.commit()
    return template, net


@pytest.mark.asyncio
async def test_a_schedule_only_its_manager_runs_names_the_manager(db, owner):
    template, net = await _schedule(db, owner)
    assert await ncs_on_duty(db, net.id, template.id) == ("Brian", "KC1OWN")
    # The manager listed as their own staff is still the only one.
    db.add(TemplateStaff(template_id=template.id, user_id=owner.id))
    await db.commit()
    assert await ncs_on_duty(db, net.id, template.id) == ("Brian", "KC1OWN")


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["staff", "rotation", "callsign_only"])
async def test_a_staffed_schedule_names_nobody_until_someone_takes_ncs(db, owner, other, entry):
    template, net = await _schedule(db, owner)
    if entry == "staff":
        db.add(TemplateStaff(template_id=template.id, user_id=other.id))
    elif entry == "rotation":
        db.add(NCSRotationMember(template_id=template.id, user_id=other.id, position=1, is_active=True))
    else:
        db.add(TemplateStaff(template_id=template.id, callsign="W1NEW"))
    await db.commit()
    assert await ncs_on_duty(db, net.id, template.id) == (None, None)

    db.add(NetRole(net_id=net.id, user_id=other.id, role="NCS"))
    await db.commit()
    assert "KC1OTH" in await ncs_on_duty(db, net.id, template.id)


@pytest.mark.asyncio
async def test_net_started_email_names_the_ncs(monkeypatch):
    mails = []

    async def fake_send_email(**kwargs):
        mails.append(kwargs)

    monkeypatch.setattr(net_lifecycle, "send_email", fake_send_email)
    await net_lifecycle.send_net_notification(["kc1jmh@example.com"], "Office Hours", 1,
                                              ncs_name="Brian", ncs_callsign="W1BKW")
    await net_lifecycle.send_net_notification(["kc1jmh@example.com"], "Office Hours", 1)
    assert "NCS on duty:</strong> Brian (W1BKW)" in mails[0]["html_content"]
    assert "NCS on duty" not in mails[1]["html_content"]


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
