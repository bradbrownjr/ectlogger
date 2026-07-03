"""
Template merge integration tests — ported from the ad-hoc backend/test_merge.py.

Tests merge simulation, conflict detection, and permission checking using an
in-memory SQLite database with real models.  No HTTP client needed here; the
merge logic is exercised directly via SQLAlchemy sessions.
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func
from sqlalchemy.pool import StaticPool

from app.models import (
    Base, User, UserRole, NetTemplate, Net, NetStatus,
    NetTemplateSubscription, TemplateStaff, NCSRotationMember,
    NCSScheduleOverride, TopicHistory, Frequency,
)


@pytest_asyncio.fixture()
async def merge_engine():
    """Fresh in-memory engine for merge tests."""
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def merge_session(merge_engine):
    factory = sessionmaker(merge_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest_asyncio.fixture()
async def populated_db(merge_engine):
    """Three templates (target=1, sources=2,3) with nets, subscriptions, staff,
    rotation members, schedule overrides, and topic history pre-loaded."""
    factory = sessionmaker(merge_engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as db:
        users = [
            User(id=1, email="admin@test.com", role=UserRole.ADMIN, callsign="ADMIN1"),
            User(id=2, email="owner@test.com", role=UserRole.USER, callsign="KC1OWN"),
            User(id=3, email="user3@test.com", role=UserRole.USER, callsign="KC1USR"),
            User(id=4, email="user4@test.com", role=UserRole.USER, callsign="KC1FOU"),
            User(id=5, email="user5@test.com", role=UserRole.USER, callsign="KC1FIV"),
        ]
        db.add_all(users)
        await db.flush()

        templates = [
            NetTemplate(
                id=1, name="SKYWARN Monday", owner_id=2,
                schedule_type="weekly", schedule_config='{"day_of_week":1,"time":"19:00"}',
                ics309_enabled=True, topic_of_week_enabled=False,
            ),
            NetTemplate(
                id=2, name="SKYWARN Wed", owner_id=2,
                schedule_type="weekly", schedule_config='{"day_of_week":3,"time":"20:00"}',
                ics309_enabled=False, topic_of_week_enabled=True,
                topic_of_week_prompt="Weather update?",
            ),
            NetTemplate(
                id=3, name="SKYWARN Friday", owner_id=2,
                schedule_type="weekly", schedule_config='{"day_of_week":5,"time":"19:00"}',
                ics309_enabled=True, topic_of_week_enabled=False,
            ),
        ]
        db.add_all(templates)
        await db.flush()

        nets = [
            Net(id=i, name=f"Net #{i}", owner_id=2, template_id=tmpl_id, status=NetStatus.CLOSED)
            for i, tmpl_id in enumerate([1, 1, 2, 2, 2, 3], start=1)
        ]
        db.add_all(nets)
        await db.flush()

        # Subscriptions (user 3 is on both target and source A — duplicate)
        db.add_all([
            NetTemplateSubscription(template_id=1, user_id=2),
            NetTemplateSubscription(template_id=1, user_id=3),
            NetTemplateSubscription(template_id=2, user_id=3),
            NetTemplateSubscription(template_id=2, user_id=4),
            NetTemplateSubscription(template_id=3, user_id=5),
            NetTemplateSubscription(template_id=3, user_id=3),
        ])
        await db.flush()

        # Staff
        db.add_all([
            TemplateStaff(template_id=1, user_id=2),
            TemplateStaff(template_id=1, user_id=3),
            TemplateStaff(template_id=2, user_id=3),
            TemplateStaff(template_id=2, user_id=4),
        ])
        await db.flush()

        # NCS rotation
        db.add_all([
            NCSRotationMember(template_id=1, user_id=2, position=1),
            NCSRotationMember(template_id=1, user_id=3, position=2),
            NCSRotationMember(template_id=2, user_id=3, position=1),
            NCSRotationMember(template_id=2, user_id=4, position=2),
            NCSRotationMember(template_id=3, user_id=5, position=1),
        ])
        await db.flush()

        # Schedule overrides
        db.add_all([
            NCSScheduleOverride(
                template_id=2,
                scheduled_date=datetime(2026, 3, 25, tzinfo=timezone.utc),
                reason="swap",
            ),
            NCSScheduleOverride(
                template_id=3,
                scheduled_date=datetime(2026, 3, 28, tzinfo=timezone.utc),
                reason="cancel",
            ),
        ])
        await db.flush()

        # Topic history
        db.add_all([
            TopicHistory(template_id=2, topic="Storm prep", used_date=datetime.now(timezone.utc), net_id=3),
            TopicHistory(template_id=3, topic="County update", used_date=datetime.now(timezone.utc), net_id=6),
        ])
        await db.commit()

    return factory


# ---------------------------------------------------------------------------
# Merge simulation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_merge_moves_all_nets(populated_db):
    factory = populated_db
    target_id = 1
    source_ids = [2, 3]

    async with factory() as db:
        # Verify pre-condition
        r = await db.execute(select(func.count(Net.id)).where(Net.template_id == 1))
        assert r.scalar() == 2

        # Reassociate nets
        result = await db.execute(select(Net).where(Net.template_id.in_(source_ids)))
        for net in result.scalars().all():
            net.template_id = target_id
        await db.commit()

    async with factory() as db:
        r = await db.execute(select(func.count(Net.id)).where(Net.template_id == target_id))
        assert r.scalar() == 6, "All 6 nets should be on the target template"


@pytest.mark.asyncio
async def test_merge_deduplicates_subscriptions(populated_db):
    factory = populated_db
    target_id = 1
    source_ids = [2, 3]

    async with factory() as db:
        target_subs = (
            await db.execute(
                select(NetTemplateSubscription.user_id).where(
                    NetTemplateSubscription.template_id == target_id
                )
            )
        ).fetchall()
        existing = {r[0] for r in target_subs}

        source_subs = (
            await db.execute(
                select(NetTemplateSubscription).where(
                    NetTemplateSubscription.template_id.in_(source_ids)
                )
            )
        ).scalars().all()

        for sub in source_subs:
            if sub.user_id not in existing:
                sub.template_id = target_id
                existing.add(sub.user_id)
            else:
                await db.delete(sub)
        await db.commit()

    async with factory() as db:
        r = await db.execute(
            select(NetTemplateSubscription.user_id)
            .where(NetTemplateSubscription.template_id == target_id)
            .order_by(NetTemplateSubscription.user_id)
        )
        sub_users = [row[0] for row in r.fetchall()]
        assert sub_users == [2, 3, 4, 5], f"Expected [2,3,4,5], got {sub_users}"

        # No orphan subs on deleted templates
        r = await db.execute(
            select(func.count(NetTemplateSubscription.id))
            .where(NetTemplateSubscription.template_id.in_([2, 3]))
        )
        assert r.scalar() == 0


@pytest.mark.asyncio
async def test_merge_rotation_appends_positions(populated_db):
    factory = populated_db
    target_id = 1
    source_ids = [2, 3]

    async with factory() as db:
        existing_rot = (
            await db.execute(
                select(NCSRotationMember)
                .where(NCSRotationMember.template_id == target_id)
                .order_by(NCSRotationMember.position.desc())
            )
        ).scalars().all()
        existing_users = {m.user_id for m in existing_rot}
        max_pos = max((m.position for m in existing_rot), default=0)

        source_rot = (
            await db.execute(
                select(NCSRotationMember)
                .where(NCSRotationMember.template_id.in_(source_ids))
                .order_by(NCSRotationMember.position)
            )
        ).scalars().all()

        for member in source_rot:
            if member.user_id not in existing_users:
                max_pos += 1
                member.template_id = target_id
                member.position = max_pos
                existing_users.add(member.user_id)
            else:
                await db.delete(member)
        await db.commit()

    async with factory() as db:
        r = await db.execute(
            select(NCSRotationMember.user_id, NCSRotationMember.position)
            .where(NCSRotationMember.template_id == target_id)
            .order_by(NCSRotationMember.position)
        )
        rotation = [(row[0], row[1]) for row in r.fetchall()]
        # user5 (pos 1 from source 3) lands before user4 (pos 2 from source 2)
        # because source templates are iterated in order and source_ids=[2,3]
        # means source 2's members come first: user3 (dup), user4 → pos 3
        # then source 3's member: user5 → pos 4
        assert rotation == [(2, 1), (3, 2), (4, 3), (5, 4)], f"Got {rotation}"


@pytest.mark.asyncio
async def test_merge_moves_schedule_overrides_and_topic_history(populated_db):
    factory = populated_db
    target_id = 1
    source_ids = [2, 3]

    async with factory() as db:
        overrides = (
            await db.execute(
                select(NCSScheduleOverride).where(NCSScheduleOverride.template_id.in_(source_ids))
            )
        ).scalars().all()
        for o in overrides:
            o.template_id = target_id

        topics = (
            await db.execute(
                select(TopicHistory).where(TopicHistory.template_id.in_(source_ids))
            )
        ).scalars().all()
        for t in topics:
            t.template_id = target_id

        await db.commit()

    async with factory() as db:
        r = await db.execute(
            select(func.count(NCSScheduleOverride.id))
            .where(NCSScheduleOverride.template_id == target_id)
        )
        assert r.scalar() == 2

        r = await db.execute(
            select(func.count(TopicHistory.id)).where(TopicHistory.template_id == target_id)
        )
        assert r.scalar() == 2


# ---------------------------------------------------------------------------
# Conflict detection
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_conflict_detection(merge_engine):
    from app.routers.templates import _compare_template_fields
    factory = sessionmaker(merge_engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as db:
        db.add_all([
            User(id=1, email="a@test.com", role=UserRole.ADMIN, callsign="TEST1"),
            NetTemplate(
                id=1, name="Target", owner_id=1,
                schedule_type="weekly", schedule_config='{"day_of_week":1}',
                ics309_enabled=True, topic_of_week_enabled=False,
                info_url="https://example.com/target",
            ),
            NetTemplate(
                id=2, name="Source", owner_id=1,
                schedule_type="daily", schedule_config='{"time":"20:00"}',
                ics309_enabled=False,
                topic_of_week_enabled=True,
                topic_of_week_prompt="What's new?",
                info_url="https://example.com/source",
            ),
        ])
        await db.commit()

    async with factory() as db:
        target = (await db.execute(select(NetTemplate).where(NetTemplate.id == 1))).scalar_one()
        source = (await db.execute(select(NetTemplate).where(NetTemplate.id == 2))).scalar_one()
        conflicts = _compare_template_fields(target, source)

    assert len(conflicts) >= 4
    fields = {c.field for c in conflicts}
    assert "Schedule type" in fields
    assert "ICS-309 enabled" in fields
    assert "Topic of the Week enabled" in fields
    assert "Info URL" in fields


# ---------------------------------------------------------------------------
# Permission checks
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_merge_permission_checks(merge_engine):
    from app.routers.templates import _check_merge_permission
    factory = sessionmaker(merge_engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as db:
        admin_u = User(id=1, email="admin@test.com", role=UserRole.ADMIN, callsign="ADM")
        owner_a = User(id=2, email="a@test.com", role=UserRole.USER, callsign="OWN_A")
        owner_b = User(id=3, email="b@test.com", role=UserRole.USER, callsign="OWN_B")
        db.add_all([admin_u, owner_a, owner_b])
        db.add_all([
            NetTemplate(id=1, name="A's Schedule", owner_id=2),
            NetTemplate(id=2, name="B's Schedule", owner_id=3),
        ])
        await db.commit()

    async with factory() as db:
        t_a = (await db.execute(select(NetTemplate).where(NetTemplate.id == 1))).scalar_one()
        t_b = (await db.execute(select(NetTemplate).where(NetTemplate.id == 2))).scalar_one()
        admin_u = (await db.execute(select(User).where(User.id == 1))).scalar_one()
        owner_a = (await db.execute(select(User).where(User.id == 2))).scalar_one()
        owner_b = (await db.execute(select(User).where(User.id == 3))).scalar_one()

        assert await _check_merge_permission(t_a, admin_u, db) is True
        assert await _check_merge_permission(t_b, admin_u, db) is True
        assert await _check_merge_permission(t_a, owner_a, db) is True
        assert await _check_merge_permission(t_b, owner_a, db) is False
        assert await _check_merge_permission(t_a, owner_b, db) is False
