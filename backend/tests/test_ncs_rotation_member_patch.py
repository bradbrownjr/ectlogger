"""
Regression test for PATCH /templates/{id}/ncs-rotation/members/{member_id}.

The NCS Rotation list's active/inactive switch (StaffRotationTab.tsx,
NCSStaffModal.tsx) called this route as a PUT, which never existed on the
backend -- every toggle click 405'd and failed silently (only Authorized Net
Staff's identical switch, backed by a real PATCH /staff/{id} route, worked).
"""
import pytest
from sqlalchemy import select

from app.models import Frequency, NetTemplate, NCSRotationMember, User, UserRole, net_template_frequencies
from tests.conftest import auth_headers


async def _template_with_member(db, owner_id: int, member_id: int) -> tuple[NetTemplate, NCSRotationMember]:
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()

    template = NetTemplate(
        name="Rotation Net",
        owner_id=owner_id,
        schedule_type="ad_hoc",
        schedule_config="{}",
    )
    db.add(template)
    await db.flush()

    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    member = NCSRotationMember(template_id=template.id, user_id=member_id, position=1, is_active=True)
    db.add(member)
    await db.commit()
    await db.refresh(template)
    await db.refresh(member)
    return template, member


@pytest.mark.asyncio
async def test_toggle_rotation_member_active(client, db, owner, other):
    template, member = await _template_with_member(db, owner.id, other.id)
    template_id, member_id = template.id, member.id
    # Captured before any expire_all() below -- auth_headers() reads
    # user.id, and touching an expired ORM attribute triggers a *sync*
    # lazy-load under async SQLAlchemy and blows up.
    owner_headers = auth_headers(owner)

    resp = await client.patch(
        f"/api/templates/{template_id}/ncs-rotation/members/{member_id}",
        json={"is_active": False},
        headers=owner_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # The PATCH request ran against a different session (see conftest's
    # client fixture) -- expire this session's identity map so the re-query
    # below actually re-reads from storage instead of returning the
    # already-loaded, now-stale `member` object. Note: expire_all() then
    # touching an ORM attribute (e.g. member.id) triggers a *sync* lazy-load
    # under async SQLAlchemy and blows up -- that's why template_id/member_id
    # were captured as plain ints above, before expiring.
    db.expire_all()
    result = await db.execute(select(NCSRotationMember).where(NCSRotationMember.id == member_id))
    assert result.scalar_one().is_active is False

    # Toggle back on.
    resp = await client.patch(
        f"/api/templates/{template_id}/ncs-rotation/members/{member_id}",
        json={"is_active": True},
        headers=owner_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_toggle_rotation_member_forbidden_for_unrelated_user(client, db, owner, other):
    # `other` itself is a legitimate manager here (check_template_permission
    # grants access to any active rotation member, not just the owner), so
    # the forbidden case needs a genuinely unrelated third user.
    template, member = await _template_with_member(db, owner.id, other.id)
    bystander = User(email="bystander@test.com", callsign="KC1BYS", role=UserRole.USER, is_active=True)
    db.add(bystander)
    await db.commit()
    await db.refresh(bystander)

    resp = await client.patch(
        f"/api/templates/{template.id}/ncs-rotation/members/{member.id}",
        json={"is_active": False},
        headers=auth_headers(bystander),
    )
    assert resp.status_code == 403
