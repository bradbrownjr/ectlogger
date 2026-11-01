"""
Every check-in field a net turned on and filled in reaches its exports
(services/check_in_columns.py).

Ken N1KWG's net, 2026-10-29: its FLDIGI checkbox and Feedback field were on,
but the closing email showed neither, the CSV export had no FLDIGI column,
and neither export said which frequency a station checked in on.
"""
import csv
import io
import json
from types import SimpleNamespace

import pytest

from app.models import CheckIn, FieldDefinition, Frequency, Net, NetStatus
from app.services.check_in_columns import field_value, net_log_fields, LogField
from tests.conftest import auth_headers

FIELD_CONFIG = {
    "name": {"enabled": True},
    "feedback": {"enabled": True},
    "notes": {"enabled": True},
    "fldigi": {"enabled": True},
    "digital": {"enabled": True},
    "url": {"enabled": False},
}


async def _fldigi_net(db, owner) -> Net:
    db.add_all([
        FieldDefinition(name="fldigi", label="FLDIGI", field_type="checkbox", is_builtin=False, sort_order=100),
        FieldDefinition(name="digital", label="Digital", field_type="text", is_builtin=False, sort_order=100),
        FieldDefinition(name="url", label="URL", field_type="text", is_builtin=False, sort_order=100),
    ])
    voice = Frequency(frequency="146.520", mode="FM")
    data = Frequency(frequency="145.090", mode="Packet")
    net = Net(name="Manchester ARES", owner_id=owner.id, status=NetStatus.CLOSED,
              field_config=json.dumps(FIELD_CONFIG), frequencies=[voice, data])
    db.add(net)
    await db.flush()
    db.add_all([
        CheckIn(net_id=net.id, callsign="W1PINE", name="Alex", location="Bedford, NH", feedback="Good copy",
                frequency_id=data.id, custom_fields=json.dumps({"fldigi": "true", "url": "x"})),
        CheckIn(net_id=net.id, callsign="KC1HILL", name="Sam", location="Hooksett, NH", frequency_id=voice.id,
                custom_fields=json.dumps({"fldigi": "false"})),
    ])
    await db.commit()
    return net


def test_a_field_turned_on_but_never_filled_in_gets_no_column():
    check_ins = [SimpleNamespace(name="Alex", notes=None, feedback="", relayed_by=None,
                                 custom_fields=json.dumps({"fldigi": "false"}))]
    definitions = [SimpleNamespace(name="fldigi", label="FLDIGI", field_type="checkbox",
                                   is_builtin=False, sort_order=100)]
    fields = net_log_fields(FIELD_CONFIG, definitions, check_ins)
    # Name only: Notes and Feedback are empty, the FLDIGI box was never ticked.
    assert [f.name for f in fields] == ["name"]


def test_a_ticked_checkbox_reads_yes():
    field = LogField("fldigi", "FLDIGI", custom=True, checkbox=True)
    assert field_value(SimpleNamespace(custom_fields='{"fldigi": "true"}'), field) == "Yes"
    assert field_value(SimpleNamespace(custom_fields='{"fldigi": "false"}'), field) == ""


@pytest.mark.asyncio
async def test_csv_export_has_custom_fields_and_the_frequency(client, db, owner, other):
    net = await _fldigi_net(db, owner)
    r = await client.get(f"/api/nets/{net.id}/export/csv", headers=auth_headers(other))
    assert r.status_code == 200
    rows = list(csv.DictReader(io.StringIO(r.text)))
    pine = next(row for row in rows if row["Callsign"] == "W1PINE")
    assert pine["FLDIGI"] == "Yes"
    assert pine["Feedback"] == "Good copy"
    assert pine["Frequency"] == "145.090 Packet"
    # Digital is on but nobody filled it in; URL is filled in but turned off.
    assert "Digital" not in rows[0]
    assert "URL" not in rows[0]


@pytest.mark.asyncio
async def test_closing_email_shows_feedback_custom_fields_and_frequency(monkeypatch, db, owner):
    from app.services import net_closure
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    net = await _fldigi_net(db, owner)
    owner.email_notifications = True
    owner.notify_net_close = True
    await db.commit()
    captured = {}

    async def _fake_send(*, to_email, subject, html_content, attachment_data,
                         attachment_filename, attachment_type="text/csv", unsubscribe_token=None):
        captured["html"] = html_content
        captured["csv"] = attachment_data

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _fake_send)
    loaded = (await db.execute(
        select(Net).options(selectinload(Net.frequencies), selectinload(Net.check_ins).selectinload(CheckIn.frequency))
        .where(Net.id == net.id)
    )).scalar_one()
    await net_closure.send_net_log(db, loaded)

    html = captured["html"]
    # The email lists one row per station, so its channel column names every
    # channel the station checked in on (services/station_rows.py).
    for heading in ("<th>Feedback</th>", "<th>FLDIGI</th>", "<th>Checked in on</th>"):
        assert heading in html
    assert "<th>Digital</th>" not in html
    assert "<strong>Frequencies:</strong> 146.520 FM, 145.090 Packet" in html
    rows = list(csv.DictReader(io.StringIO(captured["csv"])))
    pine = next(row for row in rows if row["Callsign"] == "W1PINE")
    assert pine["FLDIGI"] == "Yes"
    assert pine["Feedback"] == "Good copy"
    assert pine["Frequency"] == "145.090 Packet"


@pytest.mark.asyncio
async def test_closing_email_escapes_check_in_text(monkeypatch):
    from app.email.net_logs import send_net_log
    captured = {}

    async def _fake_send(*, to_email, subject, html_content, attachment_data,
                         attachment_filename, attachment_type="text/csv", unsubscribe_token=None):
        captured["html"] = html_content

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _fake_send)
    await send_net_log(
        email="ncs@example.com", net_name="SET", net_description="", ncs_name="KC1OWN",
        check_ins=[{"time": "10:00", "callsign": "KC1HILL", "fields": {"notes": "<b>hi</b>"}}],
        started_at="2026-10-03 10:00:00", closed_at="2026-10-03 11:00:00",
        log_fields=[LogField("notes", "Notes")],
    )
    assert "<b>hi</b>" not in captured["html"]
    assert "&lt;b&gt;hi&lt;/b&gt;" in captured["html"]


@pytest.mark.asyncio
async def test_a_one_frequency_net_lists_it_in_the_summary(monkeypatch):
    """Office Hours Tech Net, 2026-10-29: one talkgroup, repeated in a column
    on every row of the closing email, crowding the table on a phone."""
    from app.email.net_logs import send_net_log
    captured = {}

    async def _fake_send(*, to_email, subject, html_content, attachment_data,
                         attachment_filename, attachment_type="text/csv", unsubscribe_token=None):
        captured["html"] = html_content
        captured["csv"] = attachment_data

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _fake_send)
    check_in = {"time": "20:01", "callsign": "KC1HILL", "frequency": "NEDECN TG8801",
                "frequencies": "NEDECN TG8801", "fields": {}}
    await send_net_log(
        email="ncs@example.com", net_name="Office Hours", net_description="", ncs_name="W1BKW",
        check_ins=[check_in], started_at="2026-10-29 20:00:00", closed_at="2026-10-29 20:45:00",
        frequencies=["NEDECN TG8801"],
    )
    html = captured["html"]
    assert "<strong>Frequency:</strong> NEDECN TG8801" in html
    assert "<th>Frequency</th>" not in html and "<th>Frequencies</th>" not in html
    assert next(csv.DictReader(io.StringIO(captured["csv"])))["Frequency"] == "NEDECN TG8801"
