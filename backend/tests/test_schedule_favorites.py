"""
Starred schedules are saved on the account (routers/schedule_favorites.py),
so they follow the person to every device. Until 2026-10-30 each browser
kept its own list (Brad): a star set on a phone never reached the laptop.
"""
import pytest
from sqlalchemy import func, select

from app.models import NetTemplate, ScheduleFavorite
from app.services.account_merge import merge_accounts
from tests.conftest import auth_headers

URL = "/api/users/me/favorite-schedules"


async def _schedules(db, owner, count=3):
    templates = [NetTemplate(name=f"Net {i}", owner_id=owner.id, schedule_type="ad_hoc", schedule_config="{}")
                 for i in range(count)]
    db.add_all(templates)
    await db.commit()
    return [t.id for t in templates]


@pytest.mark.asyncio
async def test_star_and_unstar(client, db, owner, other):
    a, b, _ = await _schedules(db, owner)
    assert (await client.put(f"{URL}/{b}", headers=auth_headers(other))).status_code == 204
    assert (await client.put(f"{URL}/{a}", headers=auth_headers(other))).status_code == 204
    # Starring twice changes nothing.
    assert (await client.put(f"{URL}/{a}", headers=auth_headers(other))).status_code == 204
    assert (await client.get(URL, headers=auth_headers(other))).json() == [a, b]
    # Each account sees only its own stars.
    assert (await client.get(URL, headers=auth_headers(owner))).json() == []

    assert (await client.delete(f"{URL}/{a}", headers=auth_headers(other))).status_code == 204
    assert (await client.get(URL, headers=auth_headers(other))).json() == [b]
    assert (await client.put(f"{URL}/99999", headers=auth_headers(other))).status_code == 404


@pytest.mark.asyncio
async def test_signed_out_has_no_account_stars(client):
    assert (await client.get(URL)).status_code == 401


@pytest.mark.asyncio
async def test_a_browsers_stars_are_added_to_the_account(client, db, owner, other):
    a, b, c = await _schedules(db, owner)
    await client.put(f"{URL}/{a}", headers=auth_headers(other))
    # Another browser's list: one already starred, one new, one deleted schedule.
    r = await client.post(URL, json={"template_ids": [a, c, 99999]}, headers=auth_headers(other))
    assert r.status_code == 200
    assert r.json() == [a, c]


@pytest.mark.asyncio
async def test_deleting_a_schedule_removes_its_stars(client, db, owner, other):
    a, b, _ = await _schedules(db, owner)
    await client.put(f"{URL}/{a}", headers=auth_headers(other))
    assert (await client.delete(f"/api/templates/{a}", headers=auth_headers(owner))).status_code in (200, 204)
    assert (await client.get(URL, headers=auth_headers(other))).json() == []
    count = (await db.execute(select(func.count(ScheduleFavorite.id)))).scalar()
    assert count == 0


@pytest.mark.asyncio
async def test_merging_schedules_keeps_the_star(client, db, owner, other):
    target, source, source2 = await _schedules(db, owner)
    await client.put(f"{URL}/{source}", headers=auth_headers(other))
    await client.put(f"{URL}/{target}", headers=auth_headers(owner))
    await client.put(f"{URL}/{source2}", headers=auth_headers(owner))
    r = await client.post("/api/templates/merge", headers=auth_headers(owner),
                          json={"target_template_id": target, "source_template_ids": [source, source2]})
    assert r.status_code == 200, r.text
    assert (await client.get(URL, headers=auth_headers(other))).json() == [target]
    # owner had starred the target and a source: one star, not two.
    assert (await client.get(URL, headers=auth_headers(owner))).json() == [target]


@pytest.mark.asyncio
async def test_merging_accounts_combines_stars(client, db, owner, other):
    a, b, _ = await _schedules(db, owner)
    await client.put(f"{URL}/{a}", headers=auth_headers(owner))
    await client.put(f"{URL}/{a}", headers=auth_headers(other))
    await client.put(f"{URL}/{b}", headers=auth_headers(other))
    await merge_accounts(db, source=other, target=owner)
    await db.commit()
    assert (await client.get(URL, headers=auth_headers(owner))).json() == [a, b]


@pytest.mark.asyncio
async def test_deleting_an_account_removes_its_stars(client, db, owner, other, admin):
    """SQLite reuses the id, and doesn't enforce the CASCADE: left behind, the
    stars would belong to whoever gets the id next."""
    a, _, _ = await _schedules(db, owner)
    await client.put(f"{URL}/{a}", headers=auth_headers(other))
    r = await client.delete(f"/api/users/{other.id}", headers=auth_headers(admin))
    assert r.status_code in (200, 204), r.text
    count = (await db.execute(select(func.count(ScheduleFavorite.id)))).scalar()
    assert count == 0


@pytest.mark.asyncio
async def test_a_star_added_twice_at_once_is_kept_once(db, owner, monkeypatch):
    """Two tabs (or React's doubled first load in development) can both find
    a star missing; the second insert hits the unique constraint and must
    not fail the request."""
    from app.routers import schedule_favorites as module
    a, _, _ = await _schedules(db, owner)
    owner_id = owner.id  # the rollback expires owner
    db.add(ScheduleFavorite(user_id=owner_id, template_id=a))  # the other request's
    await db.commit()
    real_add, calls = module._add, []

    async def racing_add(session, user_id, template_ids):
        calls.append(1)
        if len(calls) == 1:  # checked before the other request committed
            session.add(ScheduleFavorite(user_id=user_id, template_id=a))
        else:
            await real_add(session, user_id, template_ids)

    monkeypatch.setattr(module, "_add", racing_add)
    await module._add_and_commit(db, owner_id, [a])
    assert len(calls) == 2
    assert await module._favorite_ids(db, owner_id) == [a]
