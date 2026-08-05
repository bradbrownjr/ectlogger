"""
Template -> net creation regression tests.

These cover the two code paths that broke silently when routers/nets.py
was split into a facade (2026-07-04): both imported `net_frequencies` from
`app.routers.nets`, which worked when nets.py was one file but stopped
re-exporting anything from app.models once it became a router-assembly
facade. Route-table diffing and the existing test suite didn't catch it
because nothing here was previously under test — these tests close that gap.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from tests.conftest import auth_headers
from app.models import Frequency, NetTemplate, net_template_frequencies


async def _make_template(db, owner_id: int, schedule_type: str = "ad_hoc") -> NetTemplate:
    """Create a NetTemplate with one linked frequency (exercises the
    net_frequencies copy-on-create path that regressed)."""
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()

    template = NetTemplate(
        name="Test Schedule",
        owner_id=owner_id,
        schedule_type=schedule_type,
        schedule_config="{}",
    )
    db.add(template)
    await db.flush()

    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    await db.commit()
    await db.refresh(template)
    return template


# ---------------------------------------------------------------------------
# POST /templates/{id}/create-net (manual "Create Net" from a schedule)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_net_from_template_success(client, db, owner):
    template = await _make_template(db, owner.id)

    resp = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))

    assert resp.status_code == 200
    data = resp.json()
    assert data["template_id"] == template.id
    assert data["owner_id"] == owner.id
    assert data["status"] == "draft"
    # Regression check: the frequency copy loop (net_frequencies insert) ran.
    assert len(data["frequencies"]) == 1
    assert data["frequencies"][0]["frequency"] == "146.520"


@pytest.mark.asyncio
async def test_create_net_from_template_forbidden_for_unrelated_user(client, db, owner, other):
    template = await _make_template(db, owner.id)

    resp = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(other))

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_net_from_template_404_for_missing_template(client, owner):
    resp = await client.post("/api/templates/999999/create-net", headers=auth_headers(owner))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# is_owner_or_staff — reported bug: an admin using the frontend's "View as
# Regular User" simulation could still create/edit a net or schedule they
# weren't actually staff of, because the simulation only fakes `role` in
# the browser's own state — it never touches the JWT a request actually
# authenticates with, so every existing can_manage/can_create_net field
# (computed via check_template_permission, which is admin-bypassable)
# stayed true for a real admin regardless of what the UI showed them.
# is_owner_or_staff is the non-admin-bypassable twin these tests confirm:
# true for genuine owner/staff/rotation access, false for an admin with no
# such access to that specific template — letting the frontend correctly
# hide controls while simulating even though can_manage stays true.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_template_is_owner_or_staff_true_for_actual_owner(client, db, owner):
    template = await _make_template(db, owner.id)

    resp = await client.get(f"/api/templates/{template.id}", headers=auth_headers(owner))

    assert resp.status_code == 200
    data = resp.json()
    assert data["can_manage"] is True
    assert data["is_owner_or_staff"] is True


@pytest.mark.asyncio
async def test_get_template_can_manage_true_but_is_owner_or_staff_false_for_admin(client, db, owner, admin):
    """The exact bug: an admin with no real relationship to this template
    gets can_manage=True (the admin-bypass field the app already used
    everywhere) but must get is_owner_or_staff=False, so the frontend can
    tell the two apart while simulating a regular user."""
    template = await _make_template(db, owner.id)

    resp = await client.get(f"/api/templates/{template.id}", headers=auth_headers(admin))

    assert resp.status_code == 200
    data = resp.json()
    assert data["can_manage"] is True
    assert data["is_owner_or_staff"] is False


@pytest.mark.asyncio
async def test_get_template_is_owner_or_staff_false_for_unrelated_user(client, db, owner, other):
    template = await _make_template(db, owner.id)

    resp = await client.get(f"/api/templates/{template.id}", headers=auth_headers(other))

    assert resp.status_code == 200
    data = resp.json()
    assert data["can_manage"] is False
    assert data["is_owner_or_staff"] is False


@pytest.mark.asyncio
async def test_list_templates_is_owner_or_staff_matches_get_template(client, db, owner, admin):
    """Same field, computed inline in the list endpoint rather than reused
    from get_template's code path -- covered separately since a duplicated
    computation is exactly the kind of place these two could drift apart."""
    await _make_template(db, owner.id)

    resp = await client.get("/api/templates/", headers=auth_headers(admin))

    assert resp.status_code == 200
    templates = resp.json()
    assert len(templates) >= 1
    for tmpl in templates:
        assert tmpl["can_manage"] is True
        assert tmpl["is_owner_or_staff"] is False


@pytest.mark.asyncio
async def test_create_net_from_template_accepts_scheduled_start_time_override(client, db, owner):
    """A one-time schedule has no recurrence to compute a start time from, so the
    caller supplies one directly - the only way a one-time net gets an official
    start time (and therefore an auto-lobby window) at all."""
    template = await _make_template(db, owner.id, schedule_type="one_time")
    start = (datetime.now(timezone.utc) + timedelta(days=3)).replace(microsecond=0)

    resp = await client.post(
        f"/api/templates/{template.id}/create-net",
        json={"scheduled_start_time": start.isoformat()},
        headers=auth_headers(owner),
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["scheduled_start_time"] is not None
    returned = datetime.fromisoformat(data["scheduled_start_time"].replace("Z", "+00:00"))
    assert returned == start


@pytest.mark.asyncio
async def test_create_net_from_template_without_override_leaves_one_time_unscheduled(client, db, owner):
    """No override, no body at all (matching the plain "Create Net" button call) -
    a one-time/ad-hoc net still gets no scheduled_start_time, same as before this
    endpoint gained the override parameter."""
    template = await _make_template(db, owner.id, schedule_type="one_time")

    resp = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))

    assert resp.status_code == 200
    assert resp.json()["scheduled_start_time"] is None


# ---------------------------------------------------------------------------
# NCSReminderService._get_or_create_scheduled_net (automatic background
# net creation ahead of a scheduled duty reminder)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reminder_service_auto_creates_scheduled_net(db, owner):
    from app.ncs_reminder_service import NCSReminderService
    from app.models import Net

    template = await _make_template(db, owner.id, schedule_type="weekly")
    # Reload with frequencies eagerly loaded, matching how the real caller
    # (the periodic reminder check) fetches templates.
    result = await db.execute(
        select(NetTemplate)
        .options(selectinload(NetTemplate.frequencies))
        .where(NetTemplate.id == template.id)
    )
    template = result.scalar_one()

    scheduled_dt = datetime.now(timezone.utc) + timedelta(hours=1)
    service = NCSReminderService()

    net_id = await service._get_or_create_scheduled_net(db, template, scheduled_dt)

    assert net_id is not None
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one()
    assert net.template_id == template.id
    assert net.status == "scheduled"
    # Regression check: the frequency copy loop (net_frequencies insert) ran.
    freq_result = await db.execute(select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id))
    assert len(freq_result.scalar_one().frequencies) == 1
