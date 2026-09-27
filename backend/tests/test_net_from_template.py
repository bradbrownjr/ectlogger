"""
A net takes every setting from its schedule, on both creation paths.

Regression guard for 2026-09-27: the background auto-create path (which makes
nearly every net for a recurring schedule) had its own copy list and never
copied chat_grace_period_minutes, mobile_priority_sort or
ics309_hide_muted_stations. "Keep chat open after net" was set on ME Dirigo
Net's schedule and missing from net 107 and 28 other production nets.

The template here gets a non-default value in *every* column the net takes
from it, generated from the models themselves, so a setting added to both
tables later is covered without editing this file.
"""
import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy import Boolean, Integer, select
from sqlalchemy.orm import selectinload

from app.models import Net, NetTemplate
from app.ncs_reminder_service import NCSReminderService
from app.services.net_from_template import NOT_COPIED_FROM_TEMPLATE, template_setting_columns
from tests.conftest import auth_headers

# Columns stored as JSON text, which the API parses on the way out.
JSON_VALUES = {
    'field_config': json.dumps({"name": {"enabled": False, "required": True}}),
    'traffic_form_types': json.dumps(["ICS213"]),
}


def _non_default(name: str):
    """A value for this column that differs from what a net gets by default."""
    if name in JSON_VALUES:
        return JSON_VALUES[name]
    column = Net.__table__.columns[name]
    default = column.default.arg if column.default is not None else None
    if isinstance(column.type, Boolean):
        return not bool(default)
    if isinstance(column.type, Integer):
        return 37
    return f"{name} from the schedule"


async def _template_with_every_setting(db, owner_id: int, schedule_type: str) -> NetTemplate:
    template = NetTemplate(
        owner_id=owner_id,
        schedule_type=schedule_type,
        schedule_config='{"time": "14:00", "day_of_week": 0, "timezone": "UTC"}',
        **{name: _non_default(name) for name in template_setting_columns()},
    )
    db.add(template)
    await db.commit()
    result = await db.execute(
        select(NetTemplate)
        .options(selectinload(NetTemplate.frequencies), selectinload(NetTemplate.rotation_members))
        .where(NetTemplate.id == template.id)
    )
    return result.scalar_one()


async def _assert_net_matches(db, net_id: int, template: NetTemplate):
    expected = {name: getattr(template, name) for name in template_setting_columns()}
    db.expire_all()  # read the net back from the database, not the session
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    missing = {
        name: (getattr(net, name), value)
        for name, value in expected.items()
        if getattr(net, name) != value
    }
    assert not missing, f"not copied from the schedule (net, schedule): {missing}"


def test_exclusions_are_real_shared_columns():
    """A typo or a dropped column in the exclusion list would silently copy
    something that must stay per-net."""
    net_cols = {c.name for c in Net.__table__.columns}
    template_cols = {c.name for c in NetTemplate.__table__.columns}
    assert NOT_COPIED_FROM_TEMPLATE <= (net_cols & template_cols)


def test_the_three_settings_that_were_lost_are_copied():
    assert {'chat_grace_period_minutes', 'mobile_priority_sort', 'ics309_hide_muted_stations'} <= set(
        template_setting_columns()
    )


@pytest.mark.asyncio
async def test_auto_created_net_takes_every_setting(db, owner):
    template = await _template_with_every_setting(db, owner.id, "weekly")
    net_id = await NCSReminderService()._get_or_create_scheduled_net(
        db, template, datetime.utcnow().replace(microsecond=0) + timedelta(days=1)
    )
    assert net_id is not None
    await _assert_net_matches(db, net_id, template)


@pytest.mark.asyncio
async def test_manually_created_net_takes_every_setting(client, db, owner):
    template = await _template_with_every_setting(db, owner.id, "ad_hoc")
    resp = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    await _assert_net_matches(db, resp.json()["id"], template)


@pytest.mark.asyncio
async def test_net_notes_start_blank(db, owner):
    """The schedule's announcements are read live; the net's own field is its
    one-night Notes and must not be seeded with them."""
    template = await _template_with_every_setting(db, owner.id, "weekly")
    template.announcements = "# Club news"
    await db.commit()
    net_id = await NCSReminderService()._get_or_create_scheduled_net(
        db, template, datetime.utcnow().replace(microsecond=0) + timedelta(days=1)
    )
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    assert not net.announcements
