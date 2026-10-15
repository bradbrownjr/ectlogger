"""
A schedule's staff, rotation and NCS schedule are public, but not contact details.

Guests can open any schedule's Staff view, so these endpoints answer signed-out
requests. Until 2026-10-15 they also returned every staff and rotation member's
email address and full name to anyone (found while checking what a guest sees
of the 5th-week NCS). Nothing reads the email address, so it is gone for every
viewer; a guest sees first names only, as the net and schedule cards already do.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import auth_headers
from app.models import (
    NCSRotationMember, NCSScheduleOverride, NetTemplate, TemplateStaff, User, UserRole,
)

STAFF_EMAIL = "kc1stf@example.com"
FULL_NAME = "Pat Q Staffer"


@pytest.fixture()
async def staffed(db, owner):
    """A weekly schedule whose one staffer is on the rotation, an override and the 5th week."""
    staffer = User(email=STAFF_EMAIL, callsign="KC1STF", name=FULL_NAME,
                   role=UserRole.USER, is_active=True)
    db.add(staffer)
    await db.commit()
    await db.refresh(staffer)

    template = NetTemplate(
        name="Staffed Schedule", owner_id=owner.id, is_active=True,
        schedule_type="weekly", schedule_config=json.dumps({"day_of_week": 1, "time": "19:00"}),
        fifth_week_user_id=staffer.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    db.add_all([
        TemplateStaff(template_id=template.id, user_id=staffer.id, is_active=True),
        NCSRotationMember(template_id=template.id, user_id=staffer.id, position=1, is_active=True),
        NCSScheduleOverride(
            template_id=template.id,
            scheduled_date=datetime.now(timezone.utc) + timedelta(days=90),
            original_user_id=staffer.id, replacement_user_id=staffer.id,
        ),
    ])
    await db.commit()
    return template


def _paths(template_id: int):
    base = f"/api/templates/{template_id}"
    return [
        f"{base}",
        f"{base}/ncs-rotation/staff",
        f"{base}/ncs-rotation/members",
        f"{base}/ncs-rotation/schedule",
        f"{base}/ncs-rotation/next",
        f"{base}/ncs-rotation/overrides",
        "/api/templates/",
    ]


@pytest.mark.asyncio
async def test_guest_gets_no_email_and_first_name_only(client, staffed):
    for path in _paths(staffed.id):
        resp = await client.get(path)
        assert resp.status_code == 200, (path, resp.text)
        text = resp.text
        assert STAFF_EMAIL not in text, path
        assert "user_email" not in text, path
        assert FULL_NAME not in text, path
        assert "KC1STF" in text, path  # the roster itself stays public


@pytest.mark.asyncio
async def test_guest_sees_first_name(client, staffed):
    staff = (await client.get(f"/api/templates/{staffed.id}/ncs-rotation/staff")).json()
    assert staff[0]["user_name"] == "Pat"
    nxt = (await client.get(f"/api/templates/{staffed.id}/ncs-rotation/next")).json()
    assert nxt["user_name"] == "Pat"
    tpl = (await client.get(f"/api/templates/{staffed.id}")).json()
    assert tpl["fifth_week_user_name"] == "Pat"


@pytest.mark.asyncio
async def test_signed_in_sees_full_name_but_still_no_email(client, staffed, other):
    for path in _paths(staffed.id):
        resp = await client.get(path, headers=auth_headers(other))
        assert resp.status_code == 200, (path, resp.text)
        assert STAFF_EMAIL not in resp.text, path
        assert FULL_NAME in resp.text, path
