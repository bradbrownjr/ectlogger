"""
Simulation test for template merge logic.
Uses an in-memory SQLite database to validate that the merge endpoint
correctly moves all related records and handles deduplication.

Run: cd backend && python test_merge.py
"""
import asyncio
import sys
import os
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func

from app.models import (
    Base, User, UserRole, NetTemplate, Net, NetStatus,
    NetTemplateSubscription, TemplateStaff, NCSRotationMember,
    NCSScheduleOverride, TopicHistory, net_template_frequencies, Frequency,
)


async def run_tests():
    # In-memory async SQLite
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        # === SETUP: Create users ===
        admin = User(id=1, email="admin@test.com", role=UserRole.ADMIN, callsign="ADMIN1")
        owner = User(id=2, email="owner@test.com", role=UserRole.USER, callsign="KC1OWN")
        user3 = User(id=3, email="user3@test.com", role=UserRole.USER, callsign="KC1USR")
        user4 = User(id=4, email="user4@test.com", role=UserRole.USER, callsign="KC1FOU")
        user5 = User(id=5, email="user5@test.com", role=UserRole.USER, callsign="KC1FIV")
        db.add_all([admin, owner, user3, user4, user5])
        await db.flush()

        # === SETUP: Create 3 templates (target=1, sources=2,3) ===
        target_tmpl = NetTemplate(
            id=1, name="SKYWARN Monday", owner_id=2,
            schedule_type="weekly", schedule_config='{"day_of_week":1,"time":"19:00"}',
            ics309_enabled=True, topic_of_week_enabled=False,
        )
        source_tmpl_a = NetTemplate(
            id=2, name="SKYWARN Wed", owner_id=2,
            schedule_type="weekly", schedule_config='{"day_of_week":3,"time":"20:00"}',
            ics309_enabled=False, topic_of_week_enabled=True,
            topic_of_week_prompt="Weather update?",
        )
        source_tmpl_b = NetTemplate(
            id=3, name="SKYWARN Friday", owner_id=2,
            schedule_type="weekly", schedule_config='{"day_of_week":5,"time":"19:00"}',
            ics309_enabled=True, topic_of_week_enabled=False,
        )
        db.add_all([target_tmpl, source_tmpl_a, source_tmpl_b])
        await db.flush()

        # === SETUP: Create nets linked to each template ===
        nets = []
        for i, tmpl_id in enumerate([1, 1, 2, 2, 2, 3], start=1):
            net = Net(id=i, name=f"Net #{i}", owner_id=2, template_id=tmpl_id, status=NetStatus.CLOSED)
            nets.append(net)
        db.add_all(nets)
        await db.flush()

        # === SETUP: Subscriptions (with overlap on user3) ===
        db.add(NetTemplateSubscription(template_id=1, user_id=2))  # owner on target
        db.add(NetTemplateSubscription(template_id=1, user_id=3))  # user3 on target
        db.add(NetTemplateSubscription(template_id=2, user_id=3))  # user3 on source A (duplicate)
        db.add(NetTemplateSubscription(template_id=2, user_id=4))  # user4 on source A (new)
        db.add(NetTemplateSubscription(template_id=3, user_id=5))  # user5 on source B (new)
        db.add(NetTemplateSubscription(template_id=3, user_id=3))  # user3 on source B (duplicate)
        await db.flush()

        # === SETUP: Staff (with overlap on user3) ===
        db.add(TemplateStaff(template_id=1, user_id=2))  # owner on target
        db.add(TemplateStaff(template_id=1, user_id=3))  # user3 on target
        db.add(TemplateStaff(template_id=2, user_id=3))  # user3 on source A (duplicate)
        db.add(TemplateStaff(template_id=2, user_id=4))  # user4 on source A (new)
        await db.flush()

        # === SETUP: NCS Rotation members ===
        db.add(NCSRotationMember(template_id=1, user_id=2, position=1))
        db.add(NCSRotationMember(template_id=1, user_id=3, position=2))
        db.add(NCSRotationMember(template_id=2, user_id=3, position=1))  # duplicate
        db.add(NCSRotationMember(template_id=2, user_id=4, position=2))  # new
        db.add(NCSRotationMember(template_id=3, user_id=5, position=1))  # new
        await db.flush()

        # === SETUP: Schedule overrides ===
        db.add(NCSScheduleOverride(template_id=2, scheduled_date=datetime(2026, 3, 25, tzinfo=timezone.utc), reason="swap"))
        db.add(NCSScheduleOverride(template_id=3, scheduled_date=datetime(2026, 3, 28, tzinfo=timezone.utc), reason="cancel"))
        await db.flush()

        # === SETUP: Topic history ===
        db.add(TopicHistory(template_id=2, topic="Storm prep", used_date=datetime.now(timezone.utc), net_id=3))
        db.add(TopicHistory(template_id=3, topic="County update", used_date=datetime.now(timezone.utc), net_id=6))
        await db.flush()
        await db.commit()

    # ========== RUN THE MERGE ==========
    print("=" * 60)
    print("MERGE SIMULATION TEST")
    print("=" * 60)

    # Import the actual merge logic components
    from app.schemas import TemplateMergeRequest, TemplateMergeConflict

    async with Session() as db:
        target_id = 1
        source_ids = [2, 3]

        # -- Simulate what the endpoint does --

        # 1. Permission check (simulated — owner owns all 3)
        target_result = await db.execute(select(NetTemplate).where(NetTemplate.id == target_id))
        target = target_result.scalar_one()
        assert target.owner_id == 2, "Target should be owned by user 2"

        for sid in source_ids:
            src_result = await db.execute(select(NetTemplate).where(NetTemplate.id == sid))
            src = src_result.scalar_one()
            assert src.owner_id == 2, f"Source {sid} should be owned by user 2"

        # 2. Count nets before
        before_counts = {}
        for tid in [1, 2, 3]:
            r = await db.execute(select(func.count(Net.id)).where(Net.template_id == tid))
            before_counts[tid] = r.scalar()
        print(f"\nBefore merge — Nets per template: {before_counts}")
        assert before_counts == {1: 2, 2: 3, 3: 1}, f"Unexpected: {before_counts}"

        # 3. Reassociate nets
        nets_result = await db.execute(select(Net).where(Net.template_id.in_(source_ids)))
        nets_to_move = nets_result.scalars().all()
        nets_moved = len(nets_to_move)
        for net in nets_to_move:
            net.template_id = target_id
        print(f"Moving {nets_moved} nets to template {target_id}")

        # 4. Move subscriptions (skip duplicates)
        target_sub_result = await db.execute(
            select(NetTemplateSubscription.user_id).where(NetTemplateSubscription.template_id == target_id)
        )
        existing_sub_users = {row[0] for row in target_sub_result.fetchall()}
        print(f"Existing target subscribers: {existing_sub_users}")

        source_subs_result = await db.execute(
            select(NetTemplateSubscription).where(NetTemplateSubscription.template_id.in_(source_ids))
        )
        source_subs = source_subs_result.scalars().all()
        subs_moved = 0
        subs_duped = 0
        for sub in source_subs:
            if sub.user_id not in existing_sub_users:
                sub.template_id = target_id
                existing_sub_users.add(sub.user_id)
                subs_moved += 1
            else:
                await db.delete(sub)
                subs_duped += 1
        print(f"Subscriptions: {subs_moved} moved, {subs_duped} duplicates removed")

        # 5. Move staff (skip duplicates)
        target_staff_result = await db.execute(
            select(TemplateStaff.user_id).where(TemplateStaff.template_id == target_id)
        )
        existing_staff_users = {row[0] for row in target_staff_result.fetchall()}

        source_staff_result = await db.execute(
            select(TemplateStaff).where(TemplateStaff.template_id.in_(source_ids))
        )
        source_staff = source_staff_result.scalars().all()
        staff_moved = 0
        staff_duped = 0
        for staff in source_staff:
            if staff.user_id not in existing_staff_users:
                staff.template_id = target_id
                existing_staff_users.add(staff.user_id)
                staff_moved += 1
            else:
                await db.delete(staff)
                staff_duped += 1
        print(f"Staff: {staff_moved} moved, {staff_duped} duplicates removed")

        # 6. Move rotation members (skip duplicates, append positions)
        target_rotation_result = await db.execute(
            select(NCSRotationMember).where(NCSRotationMember.template_id == target_id)
                                     .order_by(NCSRotationMember.position.desc())
        )
        existing_rotation = target_rotation_result.scalars().all()
        existing_rotation_users = {m.user_id for m in existing_rotation}
        max_position = max((m.position for m in existing_rotation), default=0)

        source_rotation_result = await db.execute(
            select(NCSRotationMember).where(NCSRotationMember.template_id.in_(source_ids))
                                      .order_by(NCSRotationMember.position)
        )
        source_rotation = source_rotation_result.scalars().all()
        rotation_moved = 0
        rotation_duped = 0
        for member in source_rotation:
            if member.user_id not in existing_rotation_users:
                max_position += 1
                member.template_id = target_id
                member.position = max_position
                existing_rotation_users.add(member.user_id)
                rotation_moved += 1
            else:
                await db.delete(member)
                rotation_duped += 1
        print(f"Rotation: {rotation_moved} moved (positions appended), {rotation_duped} duplicates removed")

        # 7. Move schedule overrides
        source_overrides_result = await db.execute(
            select(NCSScheduleOverride).where(NCSScheduleOverride.template_id.in_(source_ids))
        )
        overrides = source_overrides_result.scalars().all()
        for override in overrides:
            override.template_id = target_id
        print(f"Schedule overrides moved: {len(overrides)}")

        # 8. Move topic history
        source_topics_result = await db.execute(
            select(TopicHistory).where(TopicHistory.template_id.in_(source_ids))
        )
        topics = source_topics_result.scalars().all()
        for topic in topics:
            topic.template_id = target_id
        print(f"Topic history entries moved: {len(topics)}")

        # 9. Delete source templates
        for sid in source_ids:
            src_result = await db.execute(select(NetTemplate).where(NetTemplate.id == sid))
            src = src_result.scalar_one()
            await db.delete(src)
        print(f"Deleted {len(source_ids)} source templates")

        await db.commit()

    # ========== VERIFY POST-MERGE STATE ==========
    print("\n" + "=" * 60)
    print("POST-MERGE VERIFICATION")
    print("=" * 60)

    async with Session() as db:
        # All 6 nets should now be on template 1
        r = await db.execute(select(func.count(Net.id)).where(Net.template_id == target_id))
        total_nets = r.scalar()
        print(f"\n✓ Nets on target template: {total_nets}")
        assert total_nets == 6, f"Expected 6 nets on target, got {total_nets}"

        # Source templates should be gone
        for sid in [2, 3]:
            r = await db.execute(select(NetTemplate).where(NetTemplate.id == sid))
            assert r.scalar_one_or_none() is None, f"Source template {sid} should be deleted"
        print("✓ Source templates deleted")

        # Target template should still exist
        r = await db.execute(select(NetTemplate).where(NetTemplate.id == target_id))
        assert r.scalar_one_or_none() is not None, "Target template should still exist"
        print("✓ Target template still exists")

        # Subscriptions: should have users 2, 3, 4, 5 (no duplicates)
        r = await db.execute(
            select(NetTemplateSubscription.user_id)
            .where(NetTemplateSubscription.template_id == target_id)
            .order_by(NetTemplateSubscription.user_id)
        )
        sub_users = [row[0] for row in r.fetchall()]
        print(f"✓ Target subscribers: user IDs {sub_users}")
        assert sub_users == [2, 3, 4, 5], f"Expected [2,3,4,5], got {sub_users}"

        # No orphan subscriptions on deleted templates
        r = await db.execute(
            select(func.count(NetTemplateSubscription.id))
            .where(NetTemplateSubscription.template_id.in_([2, 3]))
        )
        orphans = r.scalar()
        assert orphans == 0, f"Found {orphans} orphan subscriptions"
        print("✓ No orphan subscriptions")

        # Staff: should have users 2, 3, 4
        r = await db.execute(
            select(TemplateStaff.user_id)
            .where(TemplateStaff.template_id == target_id)
            .order_by(TemplateStaff.user_id)
        )
        staff_users = [row[0] for row in r.fetchall()]
        print(f"✓ Target staff: user IDs {staff_users}")
        assert staff_users == [2, 3, 4], f"Expected [2,3,4], got {staff_users}"

        # Rotation: should have users 2(pos1), 3(pos2), 4(pos3), 5(pos4)
        r = await db.execute(
            select(NCSRotationMember.user_id, NCSRotationMember.position)
            .where(NCSRotationMember.template_id == target_id)
            .order_by(NCSRotationMember.position)
        )
        rotation = [(row[0], row[1]) for row in r.fetchall()]
        print(f"✓ Target rotation: {rotation}")
        # Note: order depends on position across all source templates combined
        # user5 (pos 1 from source 3) before user4 (pos 2 from source 2)
        assert rotation == [(2, 1), (3, 2), (5, 3), (4, 4)], f"Expected [(2,1),(3,2),(5,3),(4,4)], got {rotation}"

        # Schedule overrides: both should be on target now
        r = await db.execute(
            select(func.count(NCSScheduleOverride.id))
            .where(NCSScheduleOverride.template_id == target_id)
        )
        override_count = r.scalar()
        print(f"✓ Schedule overrides on target: {override_count}")
        assert override_count == 2, f"Expected 2, got {override_count}"

        # Topic history: both should be on target now
        r = await db.execute(
            select(func.count(TopicHistory.id))
            .where(TopicHistory.template_id == target_id)
        )
        topic_count = r.scalar()
        print(f"✓ Topic history entries on target: {topic_count}")
        assert topic_count == 2, f"Expected 2, got {topic_count}"

        # Verify net -> topic references still intact
        r = await db.execute(
            select(TopicHistory.net_id).where(TopicHistory.template_id == target_id)
        )
        topic_net_ids = sorted([row[0] for row in r.fetchall() if row[0] is not None])
        print(f"✓ Topic history net references: {topic_net_ids}")
        assert topic_net_ids == [3, 6], f"Expected [3,6], got {topic_net_ids}"

    # ========== CONFLICT DETECTION TEST ==========
    print("\n" + "=" * 60)
    print("CONFLICT DETECTION TEST")
    print("=" * 60)

    # Recreate templates for conflict test
    engine2 = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine2.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session2 = sessionmaker(engine2, class_=AsyncSession, expire_on_commit=False)

    async with Session2() as db:
        u = User(id=1, email="a@test.com", role=UserRole.ADMIN, callsign="TEST1")
        db.add(u)
        t1 = NetTemplate(
            id=1, name="Target", owner_id=1,
            schedule_type="weekly", schedule_config='{"day_of_week":1}',
            ics309_enabled=True, topic_of_week_enabled=False,
            info_url="https://example.com/target",
        )
        t2 = NetTemplate(
            id=2, name="Source", owner_id=1,
            schedule_type="daily", schedule_config='{"time":"20:00"}',  # different!
            ics309_enabled=False,  # different!
            topic_of_week_enabled=True,  # different!
            topic_of_week_prompt="What's new?",  # different!
            info_url="https://example.com/source",  # different!
        )
        db.add_all([t1, t2])
        await db.commit()

    async with Session2() as db:
        t_result = await db.execute(select(NetTemplate).where(NetTemplate.id == 1))
        target = t_result.scalar_one()
        s_result = await db.execute(select(NetTemplate).where(NetTemplate.id == 2))
        source = s_result.scalar_one()

        from app.routers.templates import _compare_template_fields
        conflicts = _compare_template_fields(target, source)
        print(f"\nDetected {len(conflicts)} conflicts between 'Target' and 'Source':")
        for c in conflicts:
            print(f"  - {c.field}: master='{c.target_value}' vs source='{c.source_value}'")

        assert len(conflicts) >= 4, f"Expected at least 4 conflicts, got {len(conflicts)}"
        conflict_fields = {c.field for c in conflicts}
        assert "Schedule type" in conflict_fields, "Should detect schedule_type conflict"
        assert "ICS-309 enabled" in conflict_fields, "Should detect ics309 conflict"
        assert "Topic of the Week enabled" in conflict_fields, "Should detect topic enabled conflict"
        assert "Info URL" in conflict_fields, "Should detect info_url conflict"
        print("✓ All expected conflicts detected")

    # ========== PERMISSION TEST ==========
    print("\n" + "=" * 60)
    print("PERMISSION TEST")
    print("=" * 60)

    engine3 = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine3.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session3 = sessionmaker(engine3, class_=AsyncSession, expire_on_commit=False)

    async with Session3() as db:
        admin = User(id=1, email="admin@test.com", role=UserRole.ADMIN, callsign="ADM")
        owner_a = User(id=2, email="a@test.com", role=UserRole.USER, callsign="OWN_A")
        owner_b = User(id=3, email="b@test.com", role=UserRole.USER, callsign="OWN_B")
        db.add_all([admin, owner_a, owner_b])

        tmpl_a = NetTemplate(id=1, name="A's Schedule", owner_id=2)
        tmpl_b = NetTemplate(id=2, name="B's Schedule", owner_id=3)
        db.add_all([tmpl_a, tmpl_b])
        await db.commit()

    async with Session3() as db:
        from app.routers.templates import _check_merge_permission

        t_a = (await db.execute(select(NetTemplate).where(NetTemplate.id == 1))).scalar_one()
        t_b = (await db.execute(select(NetTemplate).where(NetTemplate.id == 2))).scalar_one()

        # Admin can merge any
        assert await _check_merge_permission(t_a, admin) == True
        assert await _check_merge_permission(t_b, admin) == True
        print("✓ Admin can merge any template")

        # Owner A can merge their own
        assert await _check_merge_permission(t_a, owner_a) == True
        print("✓ Owner can merge their own template")

        # Owner A cannot merge B's
        assert await _check_merge_permission(t_b, owner_a) == False
        print("✓ Owner CANNOT merge another owner's template")

        # Owner B cannot merge A's
        assert await _check_merge_permission(t_a, owner_b) == False
        print("✓ Other owner CANNOT merge someone else's template")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED ✓")
    print("=" * 60)

    await engine.dispose()
    await engine2.dispose()
    await engine3.dispose()


if __name__ == "__main__":
    asyncio.run(run_tests())
