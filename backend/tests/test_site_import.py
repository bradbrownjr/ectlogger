"""
Imported site lists (routers/coverage_sites.py): an EMA's shelter and
point-of-distribution lists, which are not public.

The rules pinned here:

- net staff see every site, with its notes and details; everyone else sees
  only the sites in use (supported, primary, a repeater or node, or with a
  check-in), and never notes or details
- only sites in use take part in the coverage rollup, for everyone
- a station without a role can't place itself at a site it can't see; staff
  placing a station there puts the site in use
- the spreadsheet reader returns cells as text, never evaluates a formula,
  and refuses non-editors and oversized files
"""
import io

import pytest
from openpyxl import Workbook

from app.models import Net, NetRole
from tests.conftest import auth_headers


async def _net(db, owner):
    net = Net(name="SET", owner_id=owner.id, status="active", propagation_logging_enabled=True)
    db.add(net)
    await db.commit()
    return net


SITES = [
    {"name": "Example County EOC", "location": "Windham, ME", "site_type": "eoc", "is_primary": True,
     "is_supported": False},
    {"name": "Naples Shelter", "location": "Naples, ME", "site_type": "shelter", "is_supported": True,
     "notes": "POC Jane Roe, 555-0100", "details": {"Emergency capacity": "150", "Generator": "Yes"}},
    {"name": "Fire Station", "location": "Gray, ME", "site_type": "pod", "is_supported": False,
     "address": "1 Main St", "latitude": 43.88, "longitude": -70.33, "notes": "Key at town office"},
]


async def _save(client, net, owner):
    resp = await client.put(f"/api/nets/{net.id}/coverage-sites", json=SITES, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    return {s["name"]: s for s in resp.json()}


@pytest.mark.asyncio
async def test_staff_see_every_site_and_its_details(client, db, owner):
    net = await _net(db, owner)
    sites = await _save(client, net, owner)
    assert set(sites) == {"Example County EOC", "Naples Shelter", "Fire Station"}
    assert sites["Example County EOC"]["site_type"] == "eoc"
    assert sites["Naples Shelter"]["details"] == {"Emergency capacity": "150", "Generator": "Yes"}
    assert sites["Fire Station"]["notes"] == "Key at town office"
    assert sites["Fire Station"]["in_use"] is False
    assert sites["Fire Station"]["latitude"] == 43.88


@pytest.mark.asyncio
async def test_everyone_else_sees_only_sites_in_use_without_details(client, db, owner, other):
    net = await _net(db, owner)
    await _save(client, net, owner)
    for headers in ({}, auth_headers(other)):
        resp = await client.get(f"/api/nets/{net.id}/coverage-sites", headers=headers)
        sites = {s["name"]: s for s in resp.json()}
        # The primary office and the supported shelter, not the unused POD.
        assert set(sites) == {"Example County EOC", "Naples Shelter"}
        assert sites["Naples Shelter"]["notes"] is None
        assert sites["Naples Shelter"]["details"] is None


@pytest.mark.asyncio
async def test_a_logger_sees_the_whole_list(client, db, owner, other):
    net = await _net(db, owner)
    await _save(client, net, owner)
    db.add(NetRole(net_id=net.id, user_id=other.id, role="LOGGER", is_active=True))
    await db.commit()
    resp = await client.get(f"/api/nets/{net.id}/coverage-sites", headers=auth_headers(other))
    assert len(resp.json()) == 3
    assert any(s["notes"] for s in resp.json())


@pytest.mark.asyncio
async def test_unused_sites_stay_out_of_the_rollup(client, db, owner):
    net = await _net(db, owner)
    await _save(client, net, owner)
    summary = (await client.get(f"/api/nets/{net.id}/site-coverage", headers=auth_headers(owner))).json()
    assert {n["name"] for n in summary["nodes"]} == {"Example County EOC", "Naples Shelter"}


@pytest.mark.asyncio
async def test_staff_placing_a_station_at_a_site_puts_it_in_use(client, db, owner, other):
    net = await _net(db, owner)
    sites = await _save(client, net, owner)
    pod = sites["Fire Station"]

    # A station with no role can't place itself at a site it can't see.
    resp = await client.post(
        f"/api/check-ins/nets/{net.id}/check-ins",
        json={"callsign": other.callsign, "coverage_site_id": pod["id"]},
        headers=auth_headers(other),
    )
    assert resp.status_code == 400

    # Net control can, and then the site is in use for everyone.
    resp = await client.post(
        f"/api/check-ins/nets/{net.id}/check-ins",
        json={"callsign": "W1TEST", "coverage_site_id": pod["id"]},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    public = {s["name"] for s in (await client.get(f"/api/nets/{net.id}/coverage-sites")).json()}
    assert "Fire Station" in public
    summary = (await client.get(f"/api/nets/{net.id}/site-coverage")).json()
    node = next(n for n in summary["nodes"] if n["name"] == "Fire Station")
    assert (node["latitude"], node["longitude"]) == (43.88, -70.33)


@pytest.mark.asyncio
async def test_a_station_can_place_itself_at_a_supported_site(client, db, owner, other):
    net = await _net(db, owner)
    sites = await _save(client, net, owner)
    resp = await client.post(
        f"/api/check-ins/nets/{net.id}/check-ins",
        json={"callsign": other.callsign, "coverage_site_id": sites["Naples Shelter"]["id"]},
        headers=auth_headers(other),
    )
    assert resp.status_code == 201, resp.text


def _xlsx(rows, sheet_title="Shelters", extra_sheet=None) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title
    for row in rows:
        ws.append(row)
    if extra_sheet:
        wb.create_sheet(extra_sheet).append(["other"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_reading_a_workbook_returns_text_and_never_runs_a_formula(client, db, owner):
    net = await _net(db, owner)
    data = _xlsx([
        ["Name", "Municipality", "Emergency Capacity", "Total"],
        ["Bonny Eagle HS", "Standish", 150.0, "=SUM(C2:C2)"],
        [None, None, None, None],
    ], extra_sheet="PODs")
    resp = await client.post(
        f"/api/nets/{net.id}/coverage-sites/read-file",
        files={"file": ("Shelter capacities.xlsx", data,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["sheets"] == ["Shelters", "PODs"]
    assert body["sheet"] == "Shelters"
    # The blank row is dropped; 150.0 reads as 150; the formula, which Excel
    # never calculated here, comes back empty rather than run or as its text.
    assert body["rows"] == [["Name", "Municipality", "Emergency Capacity", "Total"],
                            ["Bonny Eagle HS", "Standish", "150", ""]]

    resp = await client.post(
        f"/api/nets/{net.id}/coverage-sites/read-file",
        files={"file": ("Shelter capacities.xlsx", data, "application/octet-stream")},
        data={"sheet": "PODs"}, headers=auth_headers(owner),
    )
    assert resp.json()["rows"] == [["other"]]


@pytest.mark.asyncio
async def test_reading_a_csv(client, db, owner):
    net = await _net(db, owner)
    data = "﻿SITE NAME,CITY,LAT.,LONG.\nTown Hall,Gray,43.88,-70.33\n".encode("utf-8")
    resp = await client.post(
        f"/api/nets/{net.id}/coverage-sites/read-file",
        files={"file": ("pods.csv", data, "text/csv")}, headers=auth_headers(owner),
    )
    assert resp.json()["rows"] == [["SITE NAME", "CITY", "LAT.", "LONG."], ["Town Hall", "Gray", "43.88", "-70.33"]]


@pytest.mark.asyncio
async def test_reading_needs_edit_rights_and_a_small_file(client, db, owner, other):
    net = await _net(db, owner)
    resp = await client.post(
        f"/api/nets/{net.id}/coverage-sites/read-file",
        files={"file": ("pods.csv", b"a,b\n", "text/csv")}, headers=auth_headers(other),
    )
    assert resp.status_code == 403
    resp = await client.post(
        f"/api/nets/{net.id}/coverage-sites/read-file",
        files={"file": ("big.csv", b"x" * (5 * 1024 * 1024 + 1), "text/csv")}, headers=auth_headers(owner),
    )
    assert resp.status_code == 413
    resp = await client.post(
        f"/api/nets/{net.id}/coverage-sites/read-file",
        files={"file": ("list.pdf", b"%PDF-1.4", "application/pdf")}, headers=auth_headers(owner),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_a_coverage_report_cant_place_a_station_at_a_hidden_site(client, db, owner, other):
    from app.models import CheckIn
    net = await _net(db, owner)
    sites = await _save(client, net, owner)
    mine = CheckIn(net_id=net.id, callsign=other.callsign, user_id=other.id, name="", location="")
    db.add(mine)
    await db.commit()
    payload = {"reporter_check_in_id": mine.id, "heard_check_in_ids": [], "operating_position": "Fire Station, Gray, ME"}
    resp = await client.put(f"/api/nets/{net.id}/can-hear-reports",
                            json={**payload, "coverage_site_id": sites["Fire Station"]["id"]}, headers=auth_headers(other))
    assert resp.status_code == 400
    resp = await client.put(f"/api/nets/{net.id}/can-hear-reports",
                            json={**payload, "coverage_site_id": sites["Naples Shelter"]["id"]}, headers=auth_headers(other))
    assert resp.status_code == 200, resp.text
