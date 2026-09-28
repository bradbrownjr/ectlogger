"""
The Schedule page calendar's merge of real nets and projections
(app/services/schedule_occurrences.py) and its endpoint, plus the RSS feed that
shares it.

A weekly Sunday 14:00 UTC schedule; "now" is Wednesday 2026-09-16 12:00 UTC, so
in September 2026 the 6th and 13th are past and the 20th and 27th are ahead.
"""
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from app.models import CheckIn, NCSRotationMember, NCSScheduleOverride, Net, NetStatus, NetTemplate, User, UserRole
from app.services.schedule_occurrences import get_occurrences

NOW = datetime(2026, 9, 16, 12, 0)
SEPT = (datetime(2026, 9, 1), datetime(2026, 10, 1))


@pytest_asyncio.fixture()
async def template(db, owner):
    t = NetTemplate(
        name="Sunday Net",
        owner_id=owner.id,
        schedule_type="weekly",
        schedule_config='{"time": "14:00", "day_of_week": 0, "timezone": "UTC"}',
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


async def _rotation(db, template):
    """Two-member rotation; returns their callsigns in position order."""
    users = []
    for i, call in enumerate(["KC1AAA", "KC1BBB"], start=1):
        u = User(email=f"{call.lower()}@test.com", callsign=call, role=UserRole.USER, is_active=True)
        db.add(u)
        await db.flush()
        db.add(NCSRotationMember(template_id=template.id, user_id=u.id, position=i, is_active=True))
        users.append(u)
    await db.commit()
    return users


def _days(occurrences, **match):
    return [o.start.day for o in occurrences if all(getattr(o, k) == v for k, v in match.items())]


@pytest.mark.asyncio
async def test_never_projects_into_the_past(db, template):
    occ = await get_occurrences(db, *SEPT, now=NOW)
    assert _days(occ, source="projected") == [20, 27]


@pytest.mark.asyncio
async def test_past_comes_from_real_nets_with_check_in_count(db, template, owner):
    net = Net(
        name="Sunday Net", owner_id=owner.id, template_id=template.id, status=NetStatus.CLOSED,
        scheduled_start_time=datetime(2026, 9, 13, 14, 0), started_at=datetime(2026, 9, 13, 14, 1),
    )
    db.add(net)
    await db.flush()
    for call in ("W1AAA", "W1BBB"):
        db.add(CheckIn(net_id=net.id, callsign=call, name="x", location="y"))
    await db.commit()

    occ = await get_occurrences(db, *SEPT, now=NOW)
    real = [o for o in occ if o.source == "net"]
    assert [(o.start.day, o.net_id, o.check_in_count, o.status) for o in real] == [(13, net.id, 2, "closed")]
    assert real[0].start.tzinfo is not None


@pytest.mark.asyncio
async def test_real_row_suppresses_projection_for_its_slot(db, template, owner):
    # Two minutes off the computed slot: still the same slot (scheduler's +/- 5 min).
    db.add(Net(name="Renamed Sunday Net", owner_id=owner.id, template_id=template.id,
               status=NetStatus.SCHEDULED, scheduled_start_time=datetime(2026, 9, 20, 14, 2)))
    await db.commit()

    occ = await get_occurrences(db, *SEPT, now=NOW)
    on_20 = [o for o in occ if o.start.day == 20]
    assert [(o.source, o.name) for o in on_20] == [("net", "Renamed Sunday Net")]


@pytest.mark.asyncio
async def test_cancelled_net_is_returned_flagged(db, template, owner):
    db.add(Net(name="Sunday Net", owner_id=owner.id, template_id=template.id, status=NetStatus.CANCELLED,
               cancel_reason="Field Day", scheduled_start_time=datetime(2026, 9, 27, 14, 0)))
    await db.commit()

    occ = await get_occurrences(db, *SEPT, now=NOW)
    on_27 = [o for o in occ if o.start.day == 27]
    assert len(on_27) == 1
    assert on_27[0].is_cancelled and on_27[0].cancel_reason == "Field Day"


@pytest.mark.asyncio
async def test_rotation_advances_and_override_cancel_is_flagged(db, template):
    users = await _rotation(db, template)
    occ = await get_occurrences(db, *SEPT, now=NOW)
    ncs = [o.ncs_callsign for o in occ if o.source == "projected"]
    assert set(ncs) == {u.callsign for u in users}  # alternates, not stuck on position 1

    db.add(NCSScheduleOverride(template_id=template.id, scheduled_date=datetime(2026, 9, 27, 14, 0),
                               original_user_id=users[0].id, replacement_user_id=None, reason="Hamfest"))
    await db.commit()
    db.expunge_all()  # reload the template with its new override

    occ = await get_occurrences(db, *SEPT, now=NOW)
    on_27 = [o for o in occ if o.start.day == 27][0]
    assert on_27.is_cancelled and on_27.cancel_reason == "Hamfest" and on_27.ncs_callsign is None
    on_20 = [o for o in occ if o.start.day == 20][0]
    assert not on_20.is_cancelled and on_20.ncs_callsign in {u.callsign for u in users}


@pytest.mark.asyncio
async def test_net_without_schedule_is_included(db, owner):
    db.add(Net(name="Storm Net", owner_id=owner.id, status=NetStatus.CLOSED,
               started_at=datetime(2026, 9, 3, 22, 0)))
    await db.commit()
    occ = await get_occurrences(db, *SEPT, now=NOW)
    assert [(o.name, o.template_id, o.start.day) for o in occ] == [("Storm Net", None, 3)]


@pytest.mark.asyncio
async def test_inactive_schedule_is_not_projected(db, template):
    template.is_active = False
    await db.commit()
    assert await get_occurrences(db, *SEPT, now=NOW) == []


# ========== ENDPOINT ==========

@pytest.mark.asyncio
async def test_calendar_route_is_not_captured_by_template_id(client, template):
    r = await client.get("/api/templates/calendar",
                         params={"start": "2026-09-01T00:00:00Z", "end": "2026-10-01T00:00:00Z"})
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_calendar_rejects_oversized_window(client):
    r = await client.get("/api/templates/calendar",
                         params={"start": "2026-01-01T00:00:00Z", "end": "2026-06-01T00:00:00Z"})
    assert r.status_code == 400


# ========== RSS FEED ==========

@pytest.mark.asyncio
async def test_feed_leaves_out_cancelled_occurrences(client, db, owner):
    soon = datetime.utcnow() + timedelta(hours=2)
    db.add(Net(name="Cancelled One", owner_id=owner.id, status=NetStatus.CANCELLED, scheduled_start_time=soon))
    db.add(Net(name="Kept One", owner_id=owner.id, status=NetStatus.SCHEDULED, scheduled_start_time=soon))
    await db.commit()
    r = await client.get("/feed/schedule.xml")
    assert r.status_code == 200
    assert "Kept One" in r.text
    assert "Cancelled One" not in r.text
