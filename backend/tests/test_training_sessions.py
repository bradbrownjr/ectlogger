"""
Training sessions (Help > Training, routers/training.py).

Admins post them; everyone reads the ones not over yet. A signed-out visitor is
told an online link exists but never receives it, so a Zoom room is not
published to the open web.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import AuditEvent, TrainingBannerDismissal, TrainingSession
from tests.conftest import auth_headers

URL = "/api/training/sessions"
LINK = "https://zoom.example.com/j/12345"


def _utc(hours: float) -> datetime:
    """Naive UTC, offset from now by the given hours (how times are stored)."""
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=hours)


def _iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _body(**over):
    body = {"title": "Net control basics", "starts_at": _iso(_utc(24)), "ends_at": _iso(_utc(25)),
            "location": "Town hall", "online_url": LINK, "details": "Bring a **laptop**."}
    body.update(over)
    return body


async def _add(db, **over):
    values = {"title": "Session", "starts_at": _utc(24), "ends_at": None, "online_url": LINK}
    values.update(over)
    session = TrainingSession(**values)
    db.add(session)
    await db.commit()
    return session


@pytest.mark.asyncio
async def test_guest_is_told_about_the_link_but_not_given_it(client, db):
    await _add(db)
    rows = (await client.get(URL)).json()
    assert len(rows) == 1
    assert rows[0]["online_url"] is None
    assert rows[0]["has_online_link"] is True
    assert "created_by" not in json.dumps(rows[0])


@pytest.mark.asyncio
async def test_signed_in_user_gets_the_link(client, db, other):
    await _add(db)
    rows = (await client.get(URL, headers=auth_headers(other))).json()
    assert rows[0]["online_url"] == LINK
    assert rows[0]["has_online_link"] is True


@pytest.mark.asyncio
async def test_session_without_a_link_says_so(client, db):
    await _add(db, online_url=None)
    row = (await client.get(URL)).json()[0]
    assert row["online_url"] is None
    assert row["has_online_link"] is False


@pytest.mark.asyncio
async def test_over_sessions_are_hidden_and_the_rest_are_soonest_first(client, db):
    await _add(db, title="Ended", starts_at=_utc(-5), ends_at=_utc(-4))
    await _add(db, title="No end, started 3h ago", starts_at=_utc(-3), ends_at=None)
    await _add(db, title="No end, started 1h ago", starts_at=_utc(-1), ends_at=None)
    await _add(db, title="Running now", starts_at=_utc(-1.5), ends_at=_utc(1))
    await _add(db, title="Later", starts_at=_utc(48), ends_at=None)
    await _add(db, title="Soon", starts_at=_utc(2), ends_at=None)
    titles = [r["title"] for r in (await client.get(URL)).json()]
    assert titles == ["Running now", "No end, started 1h ago", "Soon", "Later"]


@pytest.mark.asyncio
async def test_only_admins_write(client, db, owner, admin):
    session = await _add(db)
    for user in (None, owner):
        headers = auth_headers(user) if user else {}
        expected = 403 if user else 401
        assert (await client.post(URL, json=_body(), headers=headers)).status_code == expected
        assert (await client.put(f"{URL}/{session.id}", json=_body(), headers=headers)).status_code == expected
        assert (await client.delete(f"{URL}/{session.id}", headers=headers)).status_code == expected
    assert (await client.get(URL)).json()[0]["id"] == session.id

    made = await client.post(URL, json=_body(), headers=auth_headers(admin))
    assert made.status_code == 201
    assert made.json()["online_url"] == LINK


@pytest.mark.asyncio
async def test_times_are_stored_as_naive_utc(client, db, admin):
    start = _utc(24).replace(microsecond=0)
    resp = await client.post(
        URL, json=_body(starts_at=start.replace(tzinfo=timezone(timedelta(hours=-5))).isoformat(), ends_at=None),
        headers=auth_headers(admin))
    assert resp.status_code == 201
    stored = (await db.execute(select(TrainingSession))).scalar_one()
    assert stored.starts_at == start + timedelta(hours=5)
    assert stored.starts_at.tzinfo is None


@pytest.mark.asyncio
async def test_update_and_delete(client, db, admin):
    session = await _add(db)
    resp = await client.put(f"{URL}/{session.id}", json=_body(title="Renamed", online_url=None),
                            headers=auth_headers(admin))
    assert resp.status_code == 200
    assert resp.json()["title"] == "Renamed"
    assert resp.json()["has_online_link"] is False
    assert (await client.put(f"{URL}/9999", json=_body(), headers=auth_headers(admin))).status_code == 404
    assert (await client.delete(f"{URL}/{session.id}", headers=auth_headers(admin))).status_code == 204
    assert (await client.get(URL)).json() == []
    assert (await client.delete(f"{URL}/{session.id}", headers=auth_headers(admin))).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["javascript:alert(1)", "ftp://example.com/x", "zoom.example.com/j/1",
                                 "data:text/html,hi", "https://a b.example.com"])
async def test_only_web_links_are_accepted(client, admin, url):
    resp = await client.post(URL, json=_body(online_url=url), headers=auth_headers(admin))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_field_limits_and_end_after_start(client, admin):
    headers = auth_headers(admin)
    start = _utc(24)
    assert (await client.post(URL, json=_body(title="   "), headers=headers)).status_code == 422
    assert (await client.post(URL, json=_body(title="x" * 201), headers=headers)).status_code == 422
    assert (await client.post(URL, json=_body(location="x" * 301), headers=headers)).status_code == 422
    assert (await client.post(URL, json=_body(details="x" * 4001), headers=headers)).status_code == 422
    for end in (start, start - timedelta(hours=1)):
        resp = await client.post(URL, json=_body(starts_at=_iso(start), ends_at=_iso(end)), headers=headers)
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_each_change_is_in_the_activity_log(client, db, admin):
    headers = auth_headers(admin)
    body = _body()  # one body: its times are taken from the clock when built
    made = (await client.post(URL, json=body, headers=headers)).json()
    await client.put(f"{URL}/{made['id']}", json={**body, "title": "Renamed"}, headers=headers)
    # An unchanged save logs nothing.
    await client.put(f"{URL}/{made['id']}", json={**body, "title": "Renamed"}, headers=headers)
    await client.delete(f"{URL}/{made['id']}", headers=headers)

    events = (await db.execute(select(AuditEvent).order_by(AuditEvent.id))).scalars().all()
    assert [e.action for e in events] == ["training.session_created", "training.session_changed",
                                          "training.session_deleted"]
    assert all(e.actor_user_id == admin.id and e.target_id == made["id"] for e in events)
    assert json.loads(events[1].details)["changes"]["title"] == ["Net control basics", "Renamed"]


# ========== TRAINING BANNER DISMISSALS ==========

async def _dismissals(db):
    return (await db.execute(select(TrainingBannerDismissal.user_id, TrainingBannerDismissal.session_id))).all()


@pytest.mark.asyncio
async def test_closing_the_banner_is_saved_to_the_account(client, db, owner, other):
    first = await _add(db, title="First")
    second = await _add(db, title="Second", starts_at=_utc(30))
    for _ in range(2):  # closing twice is fine
        resp = await client.post(f"{URL}/{first.id}/dismiss-banner", headers=auth_headers(owner))
        assert resp.status_code == 204

    mine = {r["title"]: r["banner_dismissed"] for r in (await client.get(URL, headers=auth_headers(owner))).json()}
    assert mine == {"First": True, "Second": False}
    # Nobody else's banner, and never a guest's.
    theirs = (await client.get(URL, headers=auth_headers(other))).json()
    assert not any(r["banner_dismissed"] for r in theirs)
    assert not any(r["banner_dismissed"] for r in (await client.get(URL)).json())
    assert await _dismissals(db) == [(owner.id, first.id)]


@pytest.mark.asyncio
async def test_closing_needs_a_sign_in_and_a_real_session(client, db, owner):
    session = await _add(db)
    assert (await client.post(f"{URL}/{session.id}/dismiss-banner")).status_code == 401
    assert (await client.post(f"{URL}/9999/dismiss-banner", headers=auth_headers(owner))).status_code == 404


@pytest.mark.asyncio
async def test_closes_are_deleted_once_the_session_is_over_or_removed(client, db, owner, admin):
    ended = await _add(db, title="Ended", starts_at=_utc(-5), ends_at=_utc(-4))
    removed = await _add(db, title="Removed")
    upcoming = await _add(db, title="Upcoming", starts_at=_utc(30))
    db.add_all([TrainingBannerDismissal(user_id=owner.id, session_id=ended.id),
                TrainingBannerDismissal(user_id=owner.id, session_id=removed.id)])
    await db.commit()

    # Removing a session takes its closes with it, and clears any that are over.
    assert (await client.delete(f"{URL}/{removed.id}", headers=auth_headers(admin))).status_code == 204
    assert await _dismissals(db) == []

    db.add(TrainingBannerDismissal(user_id=owner.id, session_id=ended.id))
    await db.commit()
    await client.post(f"{URL}/{upcoming.id}/dismiss-banner", headers=auth_headers(owner))
    assert await _dismissals(db) == [(owner.id, upcoming.id)]
