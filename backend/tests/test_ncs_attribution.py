"""
Who is reported as "the NCS", across the three net shapes we actually run.

Companion to test_ncs_auto_grant_gate.py (which covers who *gets granted*
NCS). This file covers who gets *displayed* as NCS on the net cards, the net
view/report header, and the ICS-309 export -- the thing the 2026-08-30 ME
Dirigo Net report got wrong.

Net 79 (2026-08-30) held:
    KU1U   Cory Golob  NCS     active  auto_assigned=1  13:00:12
    W1BKW  Brian Wall  LOGGER          auto_assigned=0  13:52:41
    KC1HBM Peter       NCS     active  auto_assigned=0  13:53:40
and every display site resolved the NCS as "most recently assigned, ignoring
is_active", so all of them named Peter instead of Cory. That ordering is
structurally wrong for rotation nets: _assign_duty_ncs pre-assigns the
rotation's scheduled pick ~24h before the net, so *any* later grant outranks
the person actually running it.
"""
import pytest
from sqlalchemy import select

from app.models import Frequency, Net, NetRole, NetTemplate, NCSRotationMember, TemplateStaff, User
from app.models import net_template_frequencies
from app.database import Base  # noqa: F401  (ensures model metadata is registered)
from tests.conftest import auth_headers


async def _make_user(db, callsign: str, name: str) -> User:
    user = User(email=f"{callsign.lower()}@test.com", callsign=callsign, name=name, is_active=True)
    db.add(user)
    await db.flush()
    return user


async def _make_net(db, owner_id: int, template_id=None, name="Attribution Net") -> Net:
    net = Net(name=name, owner_id=owner_id, status="active", template_id=template_id)
    db.add(net)
    await db.flush()
    return net


async def _fetch_ncs_fields(client, net_id: int, user) -> tuple:
    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(user))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return body["ncs_callsign"], body["ncs_name"]


@pytest.mark.asyncio
async def test_rotation_net_reports_scheduled_ncs_not_a_later_grant(client, db, owner):
    """Single-NCS + rotation, reproducing net 79 exactly: the scheduled NCS is
    assigned first (pre-assigned ~24h ahead in production), an erroneous
    second NCS is granted later. The scheduled operator must be named first,
    not shadowed by the later row."""
    cory = await _make_user(db, "KU1U", "Cory Golob")
    peter = await _make_user(db, "KC1HBM", "Peter")
    net = await _make_net(db, owner.id, name="ME Dirigo Net")

    db.add(NetRole(net_id=net.id, user_id=cory.id, role="NCS", is_active=True, auto_assigned=True))
    await db.commit()
    # Separate commit so assigned_at (server_default=now()) orders Peter after Cory.
    db.add(NetRole(net_id=net.id, user_id=peter.id, role="NCS", is_active=True))
    await db.commit()

    callsign, name = await _fetch_ncs_fields(client, net.id, owner)
    assert callsign.split(", ")[0] == "KU1U", f"scheduled NCS must lead, got {callsign!r}"
    assert name.split(", ")[0] == "Cory Golob"


@pytest.mark.asyncio
async def test_stepped_down_ncs_is_not_reported(client, db, owner):
    """A genuine handover: the scheduled NCS steps down via the Acting as
    NCS/Standard toggle (is_active=False, row kept) and a backup takes over.
    Only the backup should be named."""
    cory = await _make_user(db, "KU1U", "Cory Golob")
    backup = await _make_user(db, "KC1BAK", "Backup Op")
    net = await _make_net(db, owner.id)

    db.add(NetRole(net_id=net.id, user_id=cory.id, role="NCS", is_active=False, auto_assigned=True))
    db.add(NetRole(net_id=net.id, user_id=backup.id, role="NCS", is_active=True))
    await db.commit()

    callsign, name = await _fetch_ncs_fields(client, net.id, owner)
    assert callsign == "KC1BAK"
    assert name == "Backup Op"


@pytest.mark.asyncio
async def test_multi_ncs_net_reports_all_of_them_in_order(client, db, owner):
    """Multi-desk exercise (net 15's shape): several simultaneous active NCS.
    All are reported, oldest assignment first -- not an arbitrary single one."""
    net = await _make_net(db, owner.id, name="GYX SKYWARN Exercise")
    for callsign, display in [("WO1J", "First Desk"), ("NB1T", "Second Desk"), ("N1HPR", "Third Desk")]:
        user = await _make_user(db, callsign, display)
        db.add(NetRole(net_id=net.id, user_id=user.id, role="NCS", is_active=True))
        await db.commit()  # separate commits so assigned_at strictly increases

    callsign, name = await _fetch_ncs_fields(client, net.id, owner)
    assert callsign == "WO1J, NB1T, N1HPR"
    assert name == "First Desk, Second Desk, Third Desk"


@pytest.mark.asyncio
async def test_logger_role_is_never_reported_as_ncs(client, db, owner):
    """Brian held LOGGER on net 79. A non-NCS role must never leak into the
    NCS attribution."""
    ncs = await _make_user(db, "KU1U", "Cory Golob")
    logger_op = await _make_user(db, "W1BKW", "Brian Wall")
    net = await _make_net(db, owner.id)

    db.add(NetRole(net_id=net.id, user_id=ncs.id, role="NCS", is_active=True))
    db.add(NetRole(net_id=net.id, user_id=logger_op.id, role="LOGGER", is_active=True))
    await db.commit()

    callsign, _ = await _fetch_ncs_fields(client, net.id, owner)
    assert callsign == "KU1U"
    assert "W1BKW" not in callsign


@pytest.mark.asyncio
async def test_net_with_no_active_ncs_reports_none(client, db, owner):
    """Everyone stepped down / nobody claimed it: no NCS, not a stale name."""
    stepped_down = await _make_user(db, "KC1OLD", "Stepped Down")
    net = await _make_net(db, owner.id)
    db.add(NetRole(net_id=net.id, user_id=stepped_down.id, role="NCS", is_active=False))
    await db.commit()

    callsign, name = await _fetch_ncs_fields(client, net.id, owner)
    assert callsign is None
    assert name is None
