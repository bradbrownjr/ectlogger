"""
GET /users/me/can-hear-coverage: the Profile page's personal coverage map.

It shows what the caller's own station heard from home, whoever entered the
report. Until 2026-10-20 it also required the caller to have typed the report
in themselves, so a station whose reception Net Control logged by voice never
got a map, despite the Coverage tab telling them they would.
"""
import pytest

from app.models import CanHearReport, CheckIn, Net, StationStatus
from tests.conftest import auth_headers


async def _net_with_pair(db, owner, reporter_user, heard_callsign="KC1HEAR", position="Home"):
    net = Net(name="Coverage Test", owner_id=owner.id, status="active", propagation_logging_enabled=True)
    db.add(net)
    await db.commit()
    await db.refresh(net)
    reporter = CheckIn(net_id=net.id, user_id=reporter_user.id, callsign=reporter_user.callsign,
                       name="", location="", status=StationStatus.CHECKED_IN, operating_position=position)
    heard = CheckIn(net_id=net.id, user_id=None, callsign=heard_callsign,
                    name="", location="Alfred, ME", status=StationStatus.CHECKED_IN)
    db.add_all([reporter, heard])
    await db.commit()
    return net, reporter, heard


async def _report(db, net, reporter, heard, reported_by):
    db.add(CanHearReport(net_id=net.id, reporter_check_in_id=reporter.id,
                         heard_check_in_id=heard.id, reported_by_user_id=reported_by.id if reported_by else None))
    await db.commit()


@pytest.mark.asyncio
async def test_report_entered_by_net_control_appears_on_reporters_map(client, db, owner, other):
    """owner (as NCS) logs what other's station heard; other sees it."""
    net, reporter, heard = await _net_with_pair(db, owner, other)
    await _report(db, net, reporter, heard, reported_by=owner)

    resp = await client.get("/api/users/me/can-hear-coverage", headers=auth_headers(other))
    assert resp.status_code == 200
    assert [s["callsign"] for s in resp.json()] == ["KC1HEAR"]


@pytest.mark.asyncio
async def test_self_entered_report_still_appears(client, db, owner, other):
    net, reporter, heard = await _net_with_pair(db, owner, other)
    await _report(db, net, reporter, heard, reported_by=other)

    resp = await client.get("/api/users/me/can-hear-coverage", headers=auth_headers(other))
    assert [s["callsign"] for s in resp.json()] == ["KC1HEAR"]


@pytest.mark.asyncio
async def test_what_someone_else_heard_never_appears(client, db, owner, other):
    """The privacy line: entering a report for another station does not put
    what that station heard on your own map."""
    net, reporter, heard = await _net_with_pair(db, owner, other)
    await _report(db, net, reporter, heard, reported_by=owner)

    resp = await client.get("/api/users/me/can-hear-coverage", headers=auth_headers(owner))
    assert resp.json() == []


@pytest.mark.asyncio
async def test_field_deployed_reports_are_left_out(client, db, owner, other):
    net, reporter, heard = await _net_with_pair(db, owner, other, position="Field Deployed")
    await _report(db, net, reporter, heard, reported_by=owner)

    resp = await client.get("/api/users/me/can-hear-coverage", headers=auth_headers(other))
    assert resp.json() == []
