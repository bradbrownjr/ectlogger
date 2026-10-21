"""
Coverage by site (services/site_coverage.py) and the endpoints around it
(routers/coverage_sites.py, plus the site on check-ins and can-hear saves).

Built for an ARES Simulated Emergency Test, where teams go to shelters, the
NWS office and the EMA offices, and the question is which places can reach
each other, not which operators. The rules pinned here:

- grouping is per check-in ROW: an operator who checks out at one shelter
  and rechecks from another counts at each in turn
- two operators at one site hearing each other says nothing about the site
- a relay is one hop with a two-way leg on each side, legs on any frequency
- a net's excluded frequencies (its repeater, its DMR talkgroup) collect no
  reports
"""
import pytest

from app.models import CanHearReport, CheckIn, CoverageSite, Frequency, Net, StationStatus, net_frequencies
from app.services.site_coverage import (
    CheckInIn, ContactIn, ReportIn, SiteIn, build_site_coverage, describe_site_coverage, site_line,
)
from tests.conftest import auth_headers


# ========== The rollup, without a database ==========

EMA = SiteIn(1, "Windham EMA", "Windham, ME", "office", True)
SHELTER_A = SiteIn(2, "Bonny Eagle HS", "Standish, ME", "shelter", False)
SHELTER_B = SiteIn(3, "Gray NWS", "FN43rv", "office", False)


def _reach(summary, site_key, primary_key="site:1"):
    row = next(r for r in summary["reach"] if r["site_key"] == site_key)
    return next(t for t in row["targets"] if t["primary_key"] == primary_key)


def test_operators_at_one_site_count_as_the_site():
    check_ins = [CheckInIn(10, "W1EMA", 1), CheckInIn(11, "K1ONE", 2), CheckInIn(12, "K1TWO", 2)]
    # K1ONE hears the EMA, and the EMA hears K1TWO: both at Bonny Eagle, so
    # the shelter and the EMA heard each other.
    reports = [ReportIn(11, 10, 5), ReportIn(10, 12, 5)]
    summary = build_site_coverage([EMA, SHELTER_A], check_ins, reports, [])
    assert summary["links"] == [
        {"from_key": "site:1", "to_key": "site:2", "frequency_id": 5, "two_way": True},
        {"from_key": "site:2", "to_key": "site:1", "frequency_id": 5, "two_way": True},
    ]
    assert _reach(summary, "site:2")["status"] == "two_way"
    shelter = next(n for n in summary["nodes"] if n["key"] == "site:2")
    assert shelter["callsigns"] == ["K1ONE", "K1TWO"]


def test_operators_at_the_same_site_hearing_each_other_are_ignored():
    check_ins = [CheckInIn(11, "K1ONE", 2), CheckInIn(12, "K1TWO", 2)]
    summary = build_site_coverage([SHELTER_A], check_ins, [ReportIn(11, 12, 5), ReportIn(12, 11, 5)], [])
    assert summary["links"] == []


def test_a_recheck_from_another_site_keeps_each_visits_results_apart():
    """KC1HILL reports from Bonny Eagle, checks out, then rechecks from Gray.
    The first visit's report must stay with Bonny Eagle."""
    check_ins = [CheckInIn(10, "W1EMA", 1), CheckInIn(20, "KC1HILL", 2), CheckInIn(21, "KC1HILL", 3)]
    reports = [ReportIn(20, 10, 5), ReportIn(10, 20, 5), ReportIn(21, 10, 6)]
    summary = build_site_coverage([EMA, SHELTER_A, SHELTER_B], check_ins, reports, [])
    assert _reach(summary, "site:2") ["status"] == "two_way"
    gray = _reach(summary, "site:3")
    assert gray["status"] == "one_way"
    assert gray["one_way_frequency_ids"] == [6]


def test_relay_needs_a_two_way_leg_on_each_side_on_any_frequency():
    check_ins = [CheckInIn(10, "W1EMA", 1), CheckInIn(11, "K1ONE", 2), CheckInIn(12, "W1HOME", None)]
    reports = [
        ReportIn(11, 12, 5), ReportIn(12, 11, 5),   # shelter <-> home station on 2m
        ReportIn(12, 10, 7), ReportIn(10, 12, 7),   # home station <-> EMA on 80m
    ]
    summary = build_site_coverage([EMA, SHELTER_A], check_ins, reports, [])
    target = _reach(summary, "site:2")
    assert target["status"] == "relay"
    assert target["relay_keys"] == ["station:W1HOME"]


def test_a_one_way_leg_is_not_a_relay():
    check_ins = [CheckInIn(10, "W1EMA", 1), CheckInIn(11, "K1ONE", 2), CheckInIn(12, "W1HOME", None)]
    reports = [ReportIn(11, 12, 5), ReportIn(12, 11, 5), ReportIn(12, 10, 7)]
    assert _reach(build_site_coverage([EMA, SHELTER_A], check_ins, reports, []), "site:2")["status"] == "none"


def test_excluded_frequencies_are_left_out():
    check_ins = [CheckInIn(10, "W1EMA", 1), CheckInIn(11, "K1ONE", 2)]
    reports = [ReportIn(11, 10, 9), ReportIn(10, 11, 9)]
    summary = build_site_coverage([EMA, SHELTER_A], check_ins, reports, [], excluded_frequency_ids={9})
    assert summary["links"] == []
    assert _reach(summary, "site:2")["status"] == "none"


def test_counties_group_case_insensitively_and_list_who_reached_them():
    check_ins = [CheckInIn(11, "K1ONE", 2), CheckInIn(12, "W1HOME", None)]
    contacts = [
        ContactIn(1, 11, 7, "K1YCE", "York County EOC", "York", "ME", True),
        ContactIn(2, 12, 7, None, "Sanford EOC", "york", "me", False),
        ContactIn(3, 12, 7, "W1XYZ", None, None, None, False),
    ]
    summary = build_site_coverage([SHELTER_A], check_ins, [], contacts)
    assert len(summary["contacts"]) == 3
    assert summary["counties"] == [{
        "county": "York", "state": "ME", "from_keys": ["site:2", "station:W1HOME"],
        "frequency_ids": [7], "two_way": True,
    }]


def test_description_for_the_email():
    check_ins = [CheckInIn(10, "W1EMA", 1), CheckInIn(11, "K1ONE", 2)]
    summary = build_site_coverage([EMA, SHELTER_A], check_ins, [ReportIn(11, 10, 5)],
                                  [ContactIn(1, 11, 5, "K1YCE", None, "York", "ME", True)])
    text = describe_site_coverage(summary, {5: "146.520 FM"})
    assert text["reach"] == [{"site": "Bonny Eagle HS", "primary": "Windham EMA", "status": "One-way only",
                              "detail": "One-way only, on 146.520 FM"}]
    assert text["pairs"] == [{"label": "Windham EMA ↔ Bonny Eagle HS",
                              "detail": "Bonny Eagle HS heard Windham EMA on 146.520 FM"}]
    assert text["counties"][0]["county"] == "York, ME"


def test_site_line_reads_as_a_location():
    assert site_line("Bonny Eagle HS", "Standish, ME") == "Bonny Eagle HS, Standish, ME"
    assert site_line("Gray NWS", "FN43rv") == "Gray NWS FN43rv"
    assert site_line("Windham EMA", None) == "Windham EMA"


def test_no_description_without_sites_or_contacts():
    summary = build_site_coverage([], [CheckInIn(1, "K1ONE", None), CheckInIn(2, "K1TWO", None)], [ReportIn(1, 2, 5)], [])
    assert describe_site_coverage(summary, {}) is None


# ========== The endpoints ==========

async def _net(db, owner, excluded=None):
    net = Net(name="SET", owner_id=owner.id, status="active", propagation_logging_enabled=True,
              coverage_excluded_frequency_ids=excluded)
    db.add(net)
    simplex = Frequency(frequency="146.520", mode="FM")
    repeater = Frequency(frequency="147.090", mode="FM")
    db.add_all([simplex, repeater])
    await db.flush()
    await db.execute(net_frequencies.insert().values(net_id=net.id, frequency_id=simplex.id))
    await db.execute(net_frequencies.insert().values(net_id=net.id, frequency_id=repeater.id))
    await db.commit()
    return net, simplex, repeater


SITES = [
    {"name": "Windham EMA", "location": "Windham, ME", "site_type": "office", "is_primary": True},
    {"name": "Bonny Eagle HS", "location": "Standish, ME", "site_type": "shelter"},
]


@pytest.mark.asyncio
async def test_only_the_nets_manager_can_set_sites(client, db, owner, other):
    net, _, _ = await _net(db, owner)
    resp = await client.put(f"/api/nets/{net.id}/coverage-sites", json=SITES, headers=auth_headers(other))
    assert resp.status_code == 403
    resp = await client.put(f"/api/nets/{net.id}/coverage-sites", json=SITES, headers=auth_headers(owner))
    assert resp.status_code == 200
    assert [s["name"] for s in resp.json()] == ["Windham EMA", "Bonny Eagle HS"]
    # Guests can read them, like the check-in list.
    assert len((await client.get(f"/api/nets/{net.id}/coverage-sites")).json()) == 2


@pytest.mark.asyncio
async def test_editing_sites_keeps_check_ins_at_kept_sites_and_clears_removed_ones(client, db, owner):
    net, _, _ = await _net(db, owner)
    sites = (await client.put(f"/api/nets/{net.id}/coverage-sites", json=SITES, headers=auth_headers(owner))).json()
    ema, shelter = sites
    at_ema = CheckIn(net_id=net.id, callsign="W1EMA", name="", location="", coverage_site_id=ema["id"])
    at_shelter = CheckIn(net_id=net.id, callsign="K1ONE", name="", location="", coverage_site_id=shelter["id"])
    db.add_all([at_ema, at_shelter])
    await db.commit()

    resp = await client.put(f"/api/nets/{net.id}/coverage-sites",
                            json=[{**SITES[0], "id": ema["id"], "name": "Windham EMA EOC"}],
                            headers=auth_headers(owner))
    assert resp.status_code == 200
    assert [(s["id"], s["name"]) for s in resp.json()] == [(ema["id"], "Windham EMA EOC")]
    await db.refresh(at_ema)
    await db.refresh(at_shelter)
    assert at_ema.coverage_site_id == ema["id"]
    assert at_shelter.coverage_site_id is None


@pytest.mark.asyncio
async def test_a_name_may_repeat_in_another_place_but_not_the_same_one(client, db, owner):
    """Imported lists have a "Fire Station" in every town."""
    net, _, _ = await _net(db, owner)
    resp = await client.put(f"/api/nets/{net.id}/coverage-sites",
                            json=[SITES[0], {**SITES[1], "name": "windham ema", "location": "Windham, ME"}],
                            headers=auth_headers(owner))
    assert resp.status_code == 400
    resp = await client.put(f"/api/nets/{net.id}/coverage-sites",
                            json=[SITES[0], {**SITES[1], "name": "windham ema"}], headers=auth_headers(owner))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_check_in_at_a_site_takes_its_location_and_a_recheck_takes_the_new_one(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    ema, shelter = (await client.put(f"/api/nets/{net.id}/coverage-sites", json=SITES, headers=auth_headers(owner))).json()

    first = await client.post(f"/api/check-ins/nets/{net.id}/check-ins",
                              json={"callsign": "KC1HILL", "coverage_site_id": shelter["id"]}, headers=auth_headers(owner))
    assert first.status_code == 201
    assert first.json()["location"] == "Bonny Eagle HS, Standish, ME"
    assert first.json()["coverage_site_id"] == shelter["id"]

    out = await client.put(f"/api/check-ins/check-ins/{first.json()['id']}",
                           json={"status": "checked_out"}, headers=auth_headers(owner))
    assert out.status_code == 200, out.text

    second = await client.post(f"/api/check-ins/nets/{net.id}/check-ins",
                               json={"callsign": "KC1HILL", "coverage_site_id": ema["id"]}, headers=auth_headers(owner))
    assert second.status_code == 201
    assert second.json()["is_recheck"] is True
    # Not the first visit's location, which a recheck would otherwise reuse.
    assert second.json()["location"] == "Windham EMA, Windham, ME"
    assert second.json()["coverage_site_id"] == ema["id"]


@pytest.mark.asyncio
async def test_a_site_from_another_net_is_refused(client, db, owner):
    net, _, _ = await _net(db, owner)
    other_net = Net(name="Other", owner_id=owner.id, status="active")
    db.add(other_net)
    await db.flush()
    foreign = CoverageSite(net_id=other_net.id, name="Elsewhere", site_type="shelter")
    db.add(foreign)
    await db.commit()
    resp = await client.post(f"/api/check-ins/nets/{net.id}/check-ins",
                             json={"callsign": "KC1HILL", "coverage_site_id": foreign.id}, headers=auth_headers(owner))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_excluded_frequency_refuses_reports_and_contacts(client, db, owner):
    net, simplex, repeater = await _net(db, owner)
    net.coverage_excluded_frequency_ids = f"[{repeater.id}]"
    a = CheckIn(net_id=net.id, callsign="K1ONE", name="", location="")
    b = CheckIn(net_id=net.id, callsign="K1TWO", name="", location="")
    db.add_all([a, b])
    await db.commit()

    resp = await client.put(f"/api/nets/{net.id}/can-hear-reports",
                            json={"reporter_check_in_id": a.id, "heard_check_in_ids": [b.id], "frequency_id": repeater.id},
                            headers=auth_headers(owner))
    assert resp.status_code == 400
    resp = await client.put(f"/api/nets/{net.id}/can-hear-reports",
                            json={"reporter_check_in_id": a.id, "heard_check_in_ids": [b.id], "frequency_id": simplex.id},
                            headers=auth_headers(owner))
    assert resp.status_code == 200
    resp = await client.put(f"/api/nets/{net.id}/coverage-contacts",
                            json={"reporter_check_in_id": a.id,
                                  "contacts": [{"callsign": "k1yce", "county": "York", "frequency_id": repeater.id}]},
                            headers=auth_headers(owner))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_contacts_replace_the_set_and_follow_the_report_rule(client, db, owner, other):
    net, simplex, _ = await _net(db, owner)
    mine = CheckIn(net_id=net.id, user_id=other.id, callsign=other.callsign, name="", location="")
    theirs = CheckIn(net_id=net.id, callsign="K1TWO", name="", location="")
    db.add_all([mine, theirs])
    await db.commit()

    url = f"/api/nets/{net.id}/coverage-contacts"
    body = {"reporter_check_in_id": mine.id, "contacts": [
        {"callsign": "k1yce", "station": "York County EOC", "county": "York", "state": "ME", "frequency_id": simplex.id},
        {"station": "Sanford EOC", "county": "York", "two_way": False},
    ]}
    resp = await client.put(url, json=body, headers=auth_headers(other))
    assert resp.status_code == 200
    assert [c["callsign"] for c in resp.json()] == ["K1YCE", None]

    # A regular station can't record for someone else's row.
    resp = await client.put(url, json={**body, "reporter_check_in_id": theirs.id}, headers=auth_headers(other))
    assert resp.status_code == 403

    # Neither callsign nor station: refused.
    resp = await client.put(url, json={"reporter_check_in_id": mine.id, "contacts": [{"county": "York"}]},
                            headers=auth_headers(other))
    assert resp.status_code == 422

    resp = await client.put(url, json={"reporter_check_in_id": mine.id, "contacts": body["contacts"][:1]},
                            headers=auth_headers(other))
    assert len(resp.json()) == 1
    assert len((await client.get(url)).json()) == 1


@pytest.mark.asyncio
async def test_can_hear_save_places_the_reporter_at_a_site(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    ema, shelter = (await client.put(f"/api/nets/{net.id}/coverage-sites", json=SITES, headers=auth_headers(owner))).json()
    a = CheckIn(net_id=net.id, callsign="K1ONE", name="", location="")
    b = CheckIn(net_id=net.id, callsign="W1EMA", name="", location="", coverage_site_id=ema["id"])
    db.add_all([a, b])
    await db.commit()

    resp = await client.put(f"/api/nets/{net.id}/can-hear-reports",
                            json={"reporter_check_in_id": a.id, "heard_check_in_ids": [b.id], "frequency_id": simplex.id,
                                  "operating_position": "Bonny Eagle HS", "coverage_site_id": shelter["id"]},
                            headers=auth_headers(owner))
    assert resp.status_code == 200
    await db.refresh(a)
    assert a.coverage_site_id == shelter["id"]

    summary = (await client.get(f"/api/nets/{net.id}/site-coverage")).json()
    target = next(r for r in summary["reach"] if r["site_key"] == f"site:{shelter['id']}")["targets"][0]
    assert target["status"] == "one_way"

    # Sending a position with no site takes the station off its site.
    await client.put(f"/api/nets/{net.id}/can-hear-reports",
                     json={"reporter_check_in_id": a.id, "heard_check_in_ids": [b.id], "frequency_id": simplex.id,
                           "operating_position": "Home"},
                     headers=auth_headers(owner))
    await db.refresh(a)
    assert a.coverage_site_id is None


@pytest.mark.asyncio
async def test_net_keeps_its_excluded_frequencies(client, db, owner):
    net, simplex, repeater = await _net(db, owner)
    resp = await client.put(f"/api/nets/{net.id}", json={"coverage_excluded_frequency_ids": [repeater.id]},
                            headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["coverage_excluded_frequency_ids"] == [repeater.id]
    resp = await client.put(f"/api/nets/{net.id}", json={"coverage_excluded_frequency_ids": []},
                            headers=auth_headers(owner))
    assert resp.json()["coverage_excluded_frequency_ids"] == []


# ========== Repeaters and nodes ==========

def test_access_is_reached_if_anyone_at_the_site_got_in_and_failures_count():
    from app.services.site_coverage import AccessIn
    vhf = SiteIn(8, "EMA VHF repeater", "Windham, ME", "infrastructure", False)
    uhf = SiteIn(9, "EMA UHF repeater", "Windham, ME", "infrastructure", False)
    check_ins = [CheckInIn(11, "K1ONE", 2), CheckInIn(12, "K1TWO", 2)]
    access = [
        AccessIn(11, 8, False, "Weak"), AccessIn(12, 8, True, None),
        AccessIn(11, 9, False, "Packet antenna is lower on the tower"),
    ]
    summary = build_site_coverage([SHELTER_A, vhf, uhf], check_ins, [], [], access=access)
    # Repeaters aren't places anyone reports from.
    assert [n["key"] for n in summary["nodes"]] == ["site:2"]
    assert [t["name"] for t in summary["targets"]] == ["EMA VHF repeater", "EMA UHF repeater"]
    cells = {c["target_site_id"]: c for c in summary["access"]}
    assert cells[8]["reached"] is True and len(cells[8]["attempts"]) == 2
    assert cells[9]["reached"] is False
    text = describe_site_coverage(summary, {})
    assert text["access"][1] == {"from": "Bonny Eagle HS", "target": "EMA UHF repeater", "result": "Couldn't reach",
                                 "notes": "K1ONE: Packet antenna is lower on the tower"}


@pytest.mark.asyncio
async def test_access_endpoint_records_failures_and_rejects_non_infrastructure(client, db, owner):
    net, simplex, repeater = await _net(db, owner)
    sites = (await client.put(f"/api/nets/{net.id}/coverage-sites", json=SITES + [
        {"name": "EMA VHF repeater", "location": "Windham, ME", "site_type": "infrastructure",
         "is_primary": True, "frequency_id": repeater.id},
    ], headers=auth_headers(owner))).json()
    ema, shelter, rpt = sites
    assert rpt["is_primary"] is False and rpt["frequency_id"] == repeater.id
    a = CheckIn(net_id=net.id, callsign="K1ONE", name="", location="", coverage_site_id=shelter["id"])
    db.add(a)
    await db.commit()

    url = f"/api/nets/{net.id}/coverage-access"
    resp = await client.put(url, json={"reporter_check_in_id": a.id, "results": [
        {"target_site_id": rpt["id"], "reached": False, "note": "Antenna height"}]}, headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()[0]["reached"] is False
    resp = await client.put(url, json={"reporter_check_in_id": a.id, "results": [
        {"target_site_id": ema["id"], "reached": True}]}, headers=auth_headers(owner))
    assert resp.status_code == 400

    # Nobody can be checked in "at" a repeater.
    resp = await client.post(f"/api/check-ins/nets/{net.id}/check-ins",
                             json={"callsign": "K1TWO", "coverage_site_id": rpt["id"]}, headers=auth_headers(owner))
    assert resp.status_code == 400

    summary = (await client.get(f"/api/nets/{net.id}/site-coverage")).json()
    assert summary["access"][0]["attempts"][0]["note"] == "Antenna height"

    # Removing the repeater removes its results.
    await client.put(f"/api/nets/{net.id}/coverage-sites", json=[{**SITES[0], "id": ema["id"]}, {**SITES[1], "id": shelter["id"]}],
                     headers=auth_headers(owner))
    assert (await client.get(url)).json() == []


@pytest.mark.asyncio
async def test_deleting_a_check_in_removes_its_contacts_and_access(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    rpt = (await client.put(f"/api/nets/{net.id}/coverage-sites", json=[
        {"name": "Node", "site_type": "infrastructure"}], headers=auth_headers(owner))).json()[0]
    a = CheckIn(net_id=net.id, callsign="K1ONE", name="", location="")
    db.add(a)
    await db.commit()
    await client.put(f"/api/nets/{net.id}/coverage-access", json={"reporter_check_in_id": a.id, "results": [
        {"target_site_id": rpt["id"], "reached": True}]}, headers=auth_headers(owner))
    await client.put(f"/api/nets/{net.id}/coverage-contacts", json={"reporter_check_in_id": a.id, "contacts": [
        {"callsign": "K1YCE"}]}, headers=auth_headers(owner))
    resp = await client.delete(f"/api/check-ins/check-ins/{a.id}", headers=auth_headers(owner))
    assert resp.status_code in (200, 204)
    assert (await client.get(f"/api/nets/{net.id}/coverage-access")).json() == []
    assert (await client.get(f"/api/nets/{net.id}/coverage-contacts")).json() == []
