"""
A built-in check-in field renamed by the admin ("Power" to "Power (W)") is
called that wherever a person reads it. The app takes labels from the field
list (frontend utils/checkInFields.ts::fieldLabel); the closing email takes
them from the same rows (services/check_in_columns.py). Reported 2026-10-23: the admin renamed
Power and the net still said "Power".
"""
import pytest

from types import SimpleNamespace

from app.models import FieldDefinition
from app.services.check_in_columns import LogField, load_field_definitions, net_log_fields
from app.services.field_labels import DEFAULT_FIELD_LABELS


@pytest.mark.asyncio
async def test_renamed_builtin_field_label_wins(db):
    db.add(FieldDefinition(name="power", label="Power (W)", is_builtin=True, sort_order=55))
    await db.commit()
    check_in = SimpleNamespace(power="50", custom_fields="{}")
    fields = net_log_fields({"power": {"enabled": True}}, await load_field_definitions(db), [check_in])
    assert [f.label for f in fields] == ["Power (W)"]


@pytest.mark.asyncio
async def test_closing_email_uses_the_admins_label(monkeypatch):
    from app.email.net_logs import send_net_log
    captured = {}

    async def _fake_send(*, to_email, subject, html_content, attachment_data,
                         attachment_filename, attachment_type="text/csv", unsubscribe_token=None):
        captured["html"] = html_content
        captured["csv"] = attachment_data

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _fake_send)
    await send_net_log(
        email="ncs@example.com", net_name="SET", net_description="", ncs_name="KC1OWN",
        check_ins=[{"time": "10:00", "callsign": "KC1HILL", "fields": {"power": "50"}}],
        started_at="2026-10-03 10:00:00", closed_at="2026-10-03 11:00:00",
        log_fields=[LogField("power", "Power (W)")],
    )
    assert "<th>Power (W)</th>" in captured["html"]


@pytest.mark.asyncio
async def test_relayed_by_is_a_field_a_net_turns_on(client):
    """Relayed By is a built-in field, off by default, so a net that never
    uses relays doesn't carry the box (it was on every entry row until
    2026-10-23)."""
    fields = (await client.get("/api/settings/fields")).json()
    relayed = next(f for f in fields if f["name"] == "relayed_by")
    assert relayed["is_builtin"] is True
    assert relayed["default_enabled"] is False
    assert relayed["label"] == DEFAULT_FIELD_LABELS["relayed_by"]
