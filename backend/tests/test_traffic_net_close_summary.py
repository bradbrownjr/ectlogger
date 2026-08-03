"""
Tests for the Assisted Traffic Handling net-close summary
(TRAFFIC-HANDLING-DESIGN.md section 3.5, Phase 9 item 3): per-net traffic
counts, plus the outstanding/stale count from the existing
/traffic/nets/{net_id}/summary computation, added to the net-close email
that routers/nets_core.py::close_net already sends -- not a new email path.

These tests monkeypatch the leaf SMTP-sending functions in app/email/base.py
(send_email_with_attachment/s) rather than actually sending mail, so they
never touch the network regardless of the test environment's EMAIL_ENABLED/
SMTP settings. This exercises the real template-rendering and argument-
wiring code in app/email/net_logs.py and routers/nets_core.py::close_net.
"""
from datetime import datetime

import pytest
from sqlalchemy import select

from tests.conftest import auth_headers
from app.email.net_logs import send_ics309_log, send_net_log
from app.models import Form, FormDefinition, Net, TrafficAction
from app.traffic.definitions import upsert_form_definitions
from app.traffic.log import append_entry


# ---------------------------------------------------------------------------
# Unit-level: the email-builder functions themselves render (or omit) the
# traffic summary/rows exactly as instructed, with no network involved.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_net_log_includes_traffic_summary_when_provided(monkeypatch):
    captured = {}

    async def _fake_send_with_attachment(*, to_email, subject, html_content, attachment_data,
                                          attachment_filename, attachment_type="text/csv", unsubscribe_token=None):
        captured["html"] = html_content

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _fake_send_with_attachment)

    await send_net_log(
        email="ncs@example.com",
        net_name="Test Net",
        net_description="",
        ncs_name="KC1OWN",
        check_ins=[],
        started_at="2026-08-03 10:00:00",
        closed_at="2026-08-03 11:00:00",
        traffic_enabled=True,
        traffic_summary={"draft": 0, "pending": 1, "relayed": 2, "delivered": 3, "cancelled": 0, "outstanding": 1},
    )

    assert "html" in captured
    assert "Traffic Handled" in captured["html"]
    assert ">1<" in captured["html"] or "1</strong>" in captured["html"]  # pending or outstanding count rendered


@pytest.mark.asyncio
async def test_send_net_log_omits_traffic_summary_when_disabled(monkeypatch):
    captured = {}

    async def _fake_send_with_attachment(*, to_email, subject, html_content, attachment_data,
                                          attachment_filename, attachment_type="text/csv", unsubscribe_token=None):
        captured["html"] = html_content

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _fake_send_with_attachment)

    await send_net_log(
        email="ncs@example.com",
        net_name="Test Net",
        net_description="",
        ncs_name="KC1OWN",
        check_ins=[],
        started_at="2026-08-03 10:00:00",
        closed_at="2026-08-03 11:00:00",
        traffic_enabled=False,
        traffic_summary=None,
    )

    assert "Traffic Handled" not in captured["html"]


@pytest.mark.asyncio
async def test_send_ics309_log_includes_traffic_rows(monkeypatch):
    captured = {}

    async def _fake_send_with_attachments(*, to_email, subject, html_content, attachments, unsubscribe_token=None):
        captured["html"] = html_content

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachments", _fake_send_with_attachments)

    await send_ics309_log(
        email="ncs@example.com",
        net_name="Test Net",
        net_description="",
        ncs_name="KC1OWN",
        ncs_callsign="KC1OWN",
        check_ins=[],
        started_at="2026-08-03 10:00:00",
        closed_at="2026-08-03 11:00:00",
        traffic_log_rows=[
            {"time": "10:05", "from_station": "KC1OWN", "to_station": "NET",
             "message": "Radiogram NR 21 R for Jim Kutsch KY2D — originated"},
        ],
    )

    assert "Radiogram NR 21 R for Jim Kutsch KY2D" in captured["html"]


# ---------------------------------------------------------------------------
# End-to-end: closing a net with traffic on it wires the counts/rows through
# routers/nets_core.py::close_net without a parallel summary path.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_close_net_passes_traffic_summary_to_net_log_email(client, db, owner, monkeypatch):
    captured = {}

    async def _fake_send_net_log(*args, **kwargs):
        captured.update(kwargs)

    # EmailService.send_net_log is a staticmethod bound to the module-level
    # function imported into nets_core.py; patch it where nets_core looks it
    # up (on the EmailService class) so close_net's own code path is exercised.
    monkeypatch.setattr("app.email_service.EmailService.send_net_log", staticmethod(_fake_send_net_log))

    await upsert_form_definitions(db)
    net = Net(name="Close Summary Net", owner_id=owner.id, ics309_enabled=False, traffic_enabled=True)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    definition = (await db.execute(
        select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM")
    )).scalar_one()
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        net_id=net.id,
        created_by_id=owner.id,
        field_values="{}",
        message_number="1",
    )
    db.add(form)
    await db.flush()
    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id,
                        net_id=net.id, occurred_at=datetime.utcnow())
    await db.commit()

    resp = await client.post(f"/api/nets/{net.id}/close", headers=auth_headers(owner))
    assert resp.status_code == 200

    assert "traffic_summary" in captured
    assert captured["traffic_summary"] is not None
    assert captured["traffic_summary"]["pending"] == 1
    assert captured["traffic_enabled"] is True
