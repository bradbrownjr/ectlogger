"""
The Reports tab: which optional sections the closing email carries
(services/report_sections.py), the email itself (email/net_logs.py), and the
preview (routers/closing_email.py).

A net or schedule whose report_sections is null was never set up on the
Reports tab and must get exactly the email it got before the tab existed.
That equivalence was checked against every closed net in beta's copy of
production when this shipped; the tests here hold the rules behind it.
"""
import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.email.markdown import markdown_to_email_html
from app.email.net_logs import (
    ICS309_DEFAULT_SECTIONS,
    PLAIN_DEFAULT_SECTIONS,
    build_ics309_log_email,
    build_net_log_email,
)
from app.models import (
    ChatMessage, CheckIn, Frequency, Net, NetStatus, NetTemplate, NetTemplateSubscription, StationStatus,
)
from app.services import net_closure
from app.services.net_figures import format_duration, net_figures
from app.services.report_sections import (
    LEGACY_ICS309,
    LEGACY_PLAIN,
    REPORT_SECTIONS,
    SECTION_KEYS,
    parse_sections,
    resolve_sections,
    sections_for_recipient,
)
from tests.conftest import auth_headers


def _settings(**overrides):
    values = dict(ics309_enabled=False, topic_of_week_enabled=False, poll_enabled=False,
                  propagation_logging_enabled=False, traffic_enabled=False, report_sections=None)
    values.update(overrides)
    return SimpleNamespace(**values)


ALL_ON = dict(ics309_enabled=True, topic_of_week_enabled=True, poll_enabled=True,
              propagation_logging_enabled=True, traffic_enabled=True)


# ========== CATALOGUE AND RESOLVING ==========

def test_catalogue_keys_match_the_contract():
    assert [s.key for s in REPORT_SECTIONS] == [
        "figures", "topic", "poll", "coverage", "traffic", "ics309_log", "announcements", "report_link", "chat_log",
    ]
    assert all(s.label and s.help for s in REPORT_SECTIONS)


def test_legacy_sets_are_the_old_email():
    assert LEGACY_PLAIN == {"topic", "poll", "coverage", "traffic", "chat_log"} == PLAIN_DEFAULT_SECTIONS
    assert LEGACY_ICS309 == {"ics309_log"} == ICS309_DEFAULT_SECTIONS


def test_null_resolves_to_the_legacy_set_for_the_nets_format():
    assert resolve_sections(_settings(), has_sites=False) == {"chat_log"}
    assert resolve_sections(_settings(**{**ALL_ON, "ics309_enabled": False}), has_sites=False) == LEGACY_PLAIN
    assert resolve_sections(_settings(**ALL_ON), has_sites=False) == {"ics309_log"}
    # Sites alone make coverage available
    assert "coverage" in resolve_sections(_settings(), has_sites=True)


def test_saved_list_is_filtered_by_what_the_net_has_on():
    everything = sorted(SECTION_KEYS)
    assert resolve_sections(_settings(report_sections=json.dumps(everything)), has_sites=False) == {
        "report_link", "figures", "announcements", "chat_log",
    }
    assert resolve_sections(_settings(**ALL_ON, report_sections=json.dumps(everything)), has_sites=False) == SECTION_KEYS
    assert resolve_sections(_settings(**ALL_ON, report_sections="[]"), has_sites=True) == set()


def test_format_per_recipient():
    plain_net = _settings()
    assert sections_for_recipient(plain_net, False, prefers_ics309=False) == ("plain", {"chat_log"})
    # A never-set-up net sends an ICS-309 preference holder the old ICS-309 email
    assert sections_for_recipient(plain_net, False, prefers_ics309=True) == ("ics309", {"ics309_log"})
    configured = _settings(report_sections=json.dumps(["figures", "chat_log"]))
    assert sections_for_recipient(configured, False, prefers_ics309=True) == ("ics309", {"figures", "chat_log"})
    ics_off = _settings(ics309_enabled=True, report_sections=json.dumps(["figures"]))
    assert sections_for_recipient(ics_off, False, prefers_ics309=False) == ("plain", {"figures"})


def test_parse_tolerates_junk():
    assert parse_sections(None) is None
    assert parse_sections("not json") is None
    assert parse_sections("[]") == []
    assert parse_sections('["chat_log", "bogus", "figures"]') == ["figures", "chat_log"]


# ========== THE EMAIL ==========

def _check_ins():
    return [
        {'time': '19:00', 'callsign': 'W1PINE', 'topic_response': 'J-pole', 'poll_response': 'Yes', 'fields': {}, 'status': 'checked_in'},
        {'time': '19:05', 'callsign': 'KC1HILL', 'topic_response': 'Dipole', 'poll_response': 'No', 'fields': {}, 'status': 'checked_in'},
    ]


def _full_kwargs(**overrides):
    kwargs = dict(
        net_name="Tuesday Evening Club Net", net_description="Weekly", ncs_name="W1PINE",
        check_ins=_check_ins(), started_at="2026-11-10 19:00:00", closed_at="2026-11-10 19:45:00",
        chat_messages=[{'timestamp': '19:01', 'callsign': 'K1COVE', 'message': 'Hello', 'user_id': 5}],
        topic_of_week_enabled=True, topic_of_week_prompt="Your antenna",
        poll_enabled=True, poll_question="Drill next week?",
        propagation_logging_enabled=True,
        coverage_edges=[{'reporter_callsign': 'W1PINE', 'heard_callsign': 'KC1HILL', 'frequency_label': '146.520 FM', 'reported_at': '19:10'}],
        site_roster=[{"place": "Bonny Eagle HS", "detail": None, "callsigns": "KC1HILL"}],
        traffic_enabled=True,
        traffic_summary={"draft": 0, "pending": 1, "relayed": 2, "delivered": 3, "cancelled": 0, "outstanding": 0},
        figures={"total_check_ins": 2, "unique_callsigns": 2, "rechecks": 0, "duration_minutes": 45},
        report_url="https://ectlogger.example/nets/5/report",
        announcements=[("Announcements", "# Club news\nField Day is in June."), ("Net notes", "Thanks, all.")],
        topic_answers=[{'callsign': 'W1PINE', 'answer': 'J-pole'}],
    )
    kwargs.update(overrides)
    return kwargs


MARKERS = {
    "report_link": "View the full report",
    "figures": "Unique Operators",
    "topic": "Topic of the Week",
    "poll": "Poll Results",
    "coverage": "Station Coverage",
    "traffic": "Traffic Handled",
    "announcements": "Field Day is in June.",
}


@pytest.mark.parametrize("key", sorted(MARKERS))
def test_each_switch_removes_its_block_from_the_plain_email(key):
    every = set(SECTION_KEYS) - {"ics309_log"}
    on = build_net_log_email(**_full_kwargs(sections=every)).html
    off = build_net_log_email(**_full_kwargs(sections=every - {key})).html
    assert MARKERS[key] in on
    assert MARKERS[key] not in off


@pytest.mark.parametrize("key", sorted(MARKERS))
def test_each_switch_removes_its_block_from_the_ics309_email(key):
    kwargs = _full_kwargs(sections=set(SECTION_KEYS), ncs_callsign="W1PINE", log_entries=[])
    on = build_ics309_log_email(**kwargs).html
    off = build_ics309_log_email(**{**kwargs, "sections": set(SECTION_KEYS) - {key}}).html
    assert MARKERS[key] in on
    assert MARKERS[key] not in off


def test_plain_email_order():
    html = build_net_log_email(**_full_kwargs(sections=set(SECTION_KEYS) - {"ics309_log"})).html
    positions = [html.index(text) for text in (
        "Unique Operators", "Net Summary", "Topic of the Week", "Poll Results",
        "Station Coverage", "Traffic Handled", "<h3>Check-ins</h3>", "Field Day is in June.", "Thanks, all.",
        "View the full report",
    )]
    assert positions == sorted(positions)


def test_ics309_email_keeps_the_form_first():
    html = build_ics309_log_email(**_full_kwargs(sections=set(SECTION_KEYS), ncs_callsign="W1PINE", log_entries=[])).html
    assert html.index("ICS 309") < html.index("SUBJECT/MESSAGE") < html.index("Field Day") < html.index("View the full report")


def test_left_out_sections_give_the_old_email():
    """A caller that passes no sections gets each email's long-standing set."""
    legacy = _full_kwargs(figures=None, report_url=None, announcements=None, topic_answers=None)
    assert build_net_log_email(**legacy).html == build_net_log_email(**{**legacy, "sections": LEGACY_PLAIN}).html
    html = build_net_log_email(**legacy).html
    for key in ("report_link", "figures", "announcements"):
        assert MARKERS[key] not in html
    ics = build_ics309_log_email(**_full_kwargs(ncs_callsign="W1PINE", log_entries=[]))
    for key in MARKERS:
        assert MARKERS[key] not in ics.html
    assert [a[1] for a in ics.attachments] == [
        "ICS309_Tuesday_Evening_Club_Net_2026-11-10.csv", "Tuesday_Evening_Club_Net_2026-11-10_checkins.csv",
    ]


def test_topic_answers_list_replaces_the_topic_column():
    with_answers = build_net_log_email(**_full_kwargs(sections={"topic"})).html
    assert "<th>Answer</th>" in with_answers and "<th>Topic</th>" not in with_answers
    legacy = build_net_log_email(**_full_kwargs(sections={"topic"}, topic_answers=None)).html
    assert "<th>Answer</th>" not in legacy and "<th>Topic</th>" in legacy
    off = build_net_log_email(**_full_kwargs(sections=set())).html
    assert "<th>Topic</th>" not in off and "<th>Poll</th>" not in off


def test_chat_attachment_follows_the_chat_log_switch():
    names = lambda r: [a[1] for a in r.attachments]
    assert names(build_net_log_email(**_full_kwargs(sections={"chat_log"}))) == [
        "Tuesday_Evening_Club_Net_2026-11-10.csv", "Tuesday_Evening_Club_Net_2026-11-10_chat.txt",
    ]
    assert len(build_net_log_email(**_full_kwargs(sections=set())).attachments) == 1
    ics = dict(ncs_callsign="W1PINE", log_entries=[])
    assert len(build_ics309_log_email(**_full_kwargs(sections={"ics309_log"}, **ics)).attachments) == 2
    with_chat = build_ics309_log_email(**_full_kwargs(sections={"ics309_log", "chat_log"}, **ics))
    assert with_chat.attachments[-1][1].endswith("_chat.txt")


# ========== ANNOUNCEMENTS MARKDOWN ==========

def test_markdown_renders_headings_lists_and_links():
    html = markdown_to_email_html("# News\n\n- one\n- two\n\n[ARRL](https://www.arrl.org) and **bold**\nnext line")
    assert "<h1>News</h1>" in html
    assert "<li>one</li>" in html
    assert '<a href="https://www.arrl.org" rel="noopener noreferrer">ARRL</a>' in html
    assert "<strong>bold</strong>" in html
    assert "<br>" in html  # a single line break is kept, as in the app


def test_markdown_is_sanitized():
    html = markdown_to_email_html(
        "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n"
        "[bad](javascript:alert(1)) [rel](/nets/5) [ok](mailto:w1pine@example.com)\n\n"
        "![pixel](https://tracker.example/p.gif)\n\n<iframe src=https://example.com></iframe>"
    )
    assert "<script" not in html and "<img" not in html and "<iframe" not in html
    assert "onerror=" not in html.replace("onerror=alert(1)&gt;", "")  # only as escaped text
    assert 'href="javascript:' not in html
    assert 'href="/nets/5"' not in html
    assert 'href="mailto:w1pine@example.com"' in html
    assert '<a href="https://tracker.example/p.gif" rel="noopener noreferrer">pixel</a>' in html


def test_empty_announcements_are_left_out():
    html = build_net_log_email(**_full_kwargs(sections={"announcements"}, announcements=[("Announcements", "  "), ("Net notes", None)])).html
    assert "Net notes" not in html and "<h3 style=\"margin-top: 0;\">Announcements" not in html


# ========== FIGURES ==========

def test_figures_match_the_statistics_definitions():
    start = datetime(2026, 11, 10, 19, 0)
    rows = [SimpleNamespace(callsign="W1PINE", is_recheck=False, checked_in_at=start, time_not_recorded=False),
            SimpleNamespace(callsign="W1PINE", is_recheck=True, checked_in_at=start, time_not_recorded=False),
            SimpleNamespace(callsign="K1COVE", is_recheck=False, checked_in_at=start, time_not_recorded=False)]
    net = SimpleNamespace(started_at=start, closed_at=start + timedelta(minutes=75), paused_at=None,
                          total_paused_seconds=600, scheduled_start_time=None)
    assert net_figures(net, rows) == {"total_check_ins": 3, "unique_callsigns": 2, "rechecks": 1, "duration_minutes": 65}
    assert format_duration(65) == "1h 5m" and format_duration(9) == "9m" and format_duration(None) == "—"


# ========== DATABASE: COLUMNS, API, CLOSE ==========

async def _closed_net(db, owner, **settings) -> Net:
    voice = Frequency(frequency="146.520", mode="FM")
    template = NetTemplate(name="Tuesday Evening Club Net", owner_id=owner.id,
                           announcements="## Club news\nThe swap meet is Saturday.")
    db.add(template)
    await db.flush()
    start = datetime.utcnow() - timedelta(hours=1)
    net = Net(name="Tuesday Evening Club Net", owner_id=owner.id, status=NetStatus.CLOSED,
              template_id=template.id, started_at=start, closed_at=start + timedelta(minutes=40),
              frequencies=[voice], announcements="Thanks to W1PINE for running it.", **settings)
    db.add(net)
    await db.flush()
    db.add_all([
        CheckIn(net_id=net.id, callsign="W1PINE", name="Alex Reed", location="Gorham, ME", frequency_id=voice.id, checked_in_at=start,
                topic_response="J-pole", status=StationStatus.CHECKED_IN),
        CheckIn(net_id=net.id, callsign="KC1HILL", name="Priya Nandan", location="Standish, ME", frequency_id=voice.id, checked_in_at=start + timedelta(minutes=5),
                topic_response="Dipole", status=StationStatus.CHECKED_IN),
        ChatMessage(net_id=net.id, user_id=owner.id, message="Good evening", created_at=start + timedelta(minutes=1)),
    ])
    await db.commit()
    return net


async def _load(db, net_id):
    # populate_existing, not expire_all: the test's user objects stay loaded
    return (await db.execute(
        select(Net).options(selectinload(Net.frequencies), selectinload(Net.check_ins).selectinload(CheckIn.frequency))
        .where(Net.id == net_id).execution_options(populate_existing=True)
    )).scalar_one()


@pytest.fixture
def sent(monkeypatch):
    """Every email the closing log would send, captured, never sent."""
    captured = []

    async def _one(*, to_email, subject, html_content, attachment_data, attachment_filename,
                   attachment_type="text/csv", unsubscribe_token=None):
        captured.append({"to": to_email, "subject": subject, "html": html_content, "attachments": [attachment_filename]})

    async def _many(*, to_email, subject, html_content, attachments, unsubscribe_token=None):
        captured.append({"to": to_email, "subject": subject, "html": html_content, "attachments": [a[1] for a in attachments]})

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _one)
    monkeypatch.setattr("app.email.net_logs.send_email_with_attachments", _many)
    return captured


@pytest.mark.asyncio
async def test_a_configured_net_sends_its_sections(db, owner, sent):
    owner.email_notifications = True
    owner.notify_net_close = True
    net = await _closed_net(db, owner, topic_of_week_enabled=True, topic_of_week_prompt="Your antenna",
                            report_sections=json.dumps(["report_link", "figures", "topic", "announcements"]))
    await net_closure.send_net_log(db, await _load(db, net.id))
    assert len(sent) == 1
    html = sent[0]["html"]
    assert f"/nets/{net.id}/report" in html
    assert "Unique Operators" in html and "40m" in html
    assert "<td>J-pole</td>" in html and "<td>Dipole</td>" in html
    assert "The swap meet is Saturday." in html and "Thanks to W1PINE for running it." in html
    assert html.index("<h3>Check-ins</h3>") < html.index("The swap meet is Saturday.") < html.index("Thanks to W1PINE")
    # chat_log is off: CSV only
    assert sent[0]["attachments"] == [a for a in sent[0]["attachments"] if a.endswith(".csv")]


@pytest.mark.asyncio
async def test_ics309_log_switch_and_the_recipients_preference(db, owner, other, sent):
    for user in (owner, other):
        user.email_notifications = True
        user.notify_net_close = True
    other.notify_ics309 = True
    net = await _closed_net(db, owner, ics309_enabled=True, report_sections=json.dumps(["figures", "chat_log"]))
    db.add(NetTemplateSubscription(template_id=net.template_id, user_id=other.id))
    await db.commit()
    await net_closure.send_net_log(db, await _load(db, net.id))
    by_to = {m["to"]: m for m in sent}
    # ics309_log is off for the net, so the owner gets the plain email...
    assert by_to[owner.email]["subject"].startswith("📻 Net Log")
    # ...and the preference still gives the subscriber the ICS-309, with the sections
    ics = by_to[other.email]
    assert ics["subject"].startswith("📋 ICS-309")
    assert "Unique Operators" in ics["html"]
    assert ics["attachments"][-1].endswith("_chat.txt")


@pytest.mark.asyncio
async def test_schema_rejects_unknown_keys_and_null_resets(client, db, owner):
    net = await _closed_net(db, owner)
    url = f"/api/nets/{net.id}"
    resp = await client.put(url, json={"report_sections": ["figures", "nope"]}, headers=auth_headers(owner))
    assert resp.status_code == 422
    resp = await client.put(url, json={"report_sections": ["chat_log", "figures"]}, headers=auth_headers(owner))
    assert resp.status_code == 200 and resp.json()["report_sections"] == ["figures", "chat_log"]
    # Leaving the field out keeps it
    resp = await client.put(url, json={"name": "Renamed"}, headers=auth_headers(owner))
    assert resp.json()["report_sections"] == ["figures", "chat_log"]
    resp = await client.put(url, json={"report_sections": []}, headers=auth_headers(owner))
    assert resp.json()["report_sections"] == []
    resp = await client.put(url, json={"report_sections": None}, headers=auth_headers(owner))
    assert resp.json()["report_sections"] is None
    assert (await _load(db, net.id)).report_sections is None

    t_url = f"/api/templates/{net.template_id}"
    resp = await client.put(t_url, json={"report_sections": ["bogus"]}, headers=auth_headers(owner))
    assert resp.status_code == 422
    resp = await client.put(t_url, json={"report_sections": ["announcements"]}, headers=auth_headers(owner))
    assert resp.status_code == 200 and resp.json()["report_sections"] == ["announcements"]
    resp = await client.put(t_url, json={"description": "x"}, headers=auth_headers(owner))
    assert resp.json()["report_sections"] == ["announcements"]
    resp = await client.put(t_url, json={"report_sections": None}, headers=auth_headers(owner))
    assert resp.json()["report_sections"] is None

    resp = await client.post("/api/nets/", json={"name": "New", "report_sections": ["x"]}, headers=auth_headers(owner))
    assert resp.status_code == 422
    resp = await client.post("/api/nets/", json={"name": "New", "report_sections": ["figures"]}, headers=auth_headers(owner))
    assert resp.status_code == 201 and resp.json()["report_sections"] == ["figures"]


@pytest.mark.asyncio
async def test_guests_see_report_sections_on_the_net(client, db, owner):
    """The report page is public and follows the saved sections."""
    net = await _closed_net(db, owner, report_sections=json.dumps(["figures"]))
    resp = await client.get(f"/api/nets/{net.id}")
    assert resp.status_code == 200
    assert resp.json()["report_sections"] == ["figures"]
    net2 = await _closed_net(db, owner)
    assert (await client.get(f"/api/nets/{net2.id}")).json()["report_sections"] is None


@pytest.mark.asyncio
async def test_report_sections_catalogue_endpoint(client, owner):
    assert (await client.get("/api/report-sections")).status_code in (401, 403)
    resp = await client.get("/api/report-sections", headers=auth_headers(owner))
    assert resp.status_code == 200
    entries = resp.json()
    assert [e["key"] for e in entries] == [s.key for s in REPORT_SECTIONS]
    assert set(entries[0]) == {"key", "label", "help", "requires_any", "legacy_plain", "legacy_ics309"}
    by_key = {e["key"]: e for e in entries}
    assert by_key["coverage"]["requires_any"] == ["propagation_logging_enabled", "has_sites"]
    assert by_key["figures"]["requires_any"] == []
    assert by_key["ics309_log"]["legacy_ics309"] and not by_key["ics309_log"]["legacy_plain"]


# ========== PREVIEW ==========

@pytest.fixture
def no_sending(monkeypatch):
    async def _refuse(*args, **kwargs):
        raise AssertionError("the preview sent an email")
    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _refuse)
    monkeypatch.setattr("app.email.net_logs.send_email_with_attachments", _refuse)


@pytest.mark.asyncio
async def test_net_preview(client, db, owner, other, no_sending):
    net = await _closed_net(db, owner, report_sections=json.dumps(["chat_log"]))
    url = f"/api/nets/{net.id}/closing-email-preview"
    assert (await client.post(url, json={"report_sections": None}, headers=auth_headers(other))).status_code == 403
    resp = await client.post(url, json={"report_sections": ["figures", "announcements"]}, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "net" and body["format"] == "plain"
    assert body["subject"] == "📻 Net Log: Tuesday Evening Club Net"
    assert "Unique Operators" in body["html"] and "The swap meet is Saturday." in body["html"]
    assert "W1PINE" in body["html"]
    # The stored value is untouched
    assert (await _load(db, net.id)).report_sections == json.dumps(["chat_log"])
    # null previews the never-set-up email
    resp = await client.post(url, json={"report_sections": None}, headers=auth_headers(owner))
    assert "Unique Operators" not in resp.json()["html"]
    assert (await client.post(url, json={"report_sections": ["bogus"]}, headers=auth_headers(owner))).status_code == 422


@pytest.mark.asyncio
async def test_net_preview_ics309_format_comes_from_the_sections(client, db, owner, no_sending):
    owner.notify_ics309 = True  # the viewer's own preference is ignored
    net = await _closed_net(db, owner, ics309_enabled=True)
    url = f"/api/nets/{net.id}/closing-email-preview"
    resp = await client.post(url, json={"report_sections": ["figures"]}, headers=auth_headers(owner))
    assert resp.json()["format"] == "plain"
    resp = await client.post(url, json={"report_sections": ["ics309_log", "figures"]}, headers=auth_headers(owner))
    assert resp.json()["format"] == "ics309" and "Unique Operators" in resp.json()["html"]


@pytest.mark.asyncio
async def test_template_preview_uses_the_latest_closed_net(client, db, owner, other, no_sending):
    net = await _closed_net(db, owner)
    url = f"/api/templates/{net.template_id}/closing-email-preview"
    assert (await client.post(url, json={"report_sections": None}, headers=auth_headers(other))).status_code == 403
    resp = await client.post(url, json={"report_sections": ["figures"]}, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["source"] == "net"
    assert "KC1HILL" in resp.json()["html"]


@pytest.mark.asyncio
async def test_net_preview_with_no_check_ins_links_to_the_nets_report(client, db, owner, no_sending):
    net = Net(name="Example Net", owner_id=owner.id, status=NetStatus.LOBBY)
    db.add(net)
    await db.commit()
    resp = await client.post(f"/api/nets/{net.id}/closing-email-preview",
                             json={"report_sections": ["report_link"]}, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["source"] == "example"
    assert f'href="{settings.frontend_url}/nets/{net.id}/report"' in resp.json()["html"]


@pytest.mark.asyncio
async def test_template_preview_with_no_closed_net_uses_example_data(client, db, owner, no_sending):
    template = NetTemplate(name="Example County ARES", owner_id=owner.id, topic_of_week_enabled=True,
                           traffic_enabled=True, announcements="**Drill** on Saturday.")
    db.add(template)
    await db.commit()
    before = (await db.execute(select(Net))).scalars().all()
    resp = await client.post(f"/api/templates/{template.id}/closing-email-preview",
                             json={"report_sections": ["report_link", "figures", "topic", "traffic", "announcements"]},
                             headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "example" and body["format"] == "plain"
    html = body["html"]
    assert "W1PINE" in html and "Topic of the Week" in html and "Traffic Handled" in html
    assert "<strong>Drill</strong> on Saturday." in html
    assert "6 from 5 stations" in html or "Total Check-ins:</strong> 6" in html
    # The report button goes somewhere real: the schedule's page, as it has no net yet
    assert f'href="{settings.frontend_url}/scheduler/{template.id}"' in html
    # Nothing was written
    db.expire_all()
    assert (await db.execute(select(Net))).scalars().all() == before


def test_traffic_box_hidden_when_no_traffic_was_handled():
    """The summary carries its net_id; that id once counted toward the total,
    so every traffic net showed the box with all zeros (fixed 2026-11-15)."""
    zero = {"net_id": 42, "draft": 0, "pending": 0, "relayed": 0, "delivered": 0, "cancelled": 0, "outstanding": 0}
    assert "Traffic Handled" not in build_net_log_email(**_full_kwargs(sections={"traffic"}, traffic_summary=zero)).html
    some = {**zero, "delivered": 1}
    assert "Traffic Handled" in build_net_log_email(**_full_kwargs(sections={"traffic"}, traffic_summary=some)).html
