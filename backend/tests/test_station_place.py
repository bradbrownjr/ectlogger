"""
Where a station is (services/station_place.py) and what a check-in from
somewhere new does to its earlier one (routers/check_ins.py::create_check_in).

The rules pinned here:

- nobody is in two places at once: a live station checked in at a new place
  has its earlier rows checked out, even on the same frequency
- the same place on a second frequency keeps both rows live (coverage checks)
- the same place on the same frequency is still a duplicate, refused
- a recheck with no place given is at the same place as before
- a check-in at a site, traveling or deployed never overwrites the town the
  station's next net fills in; one at home does
- sites work on a net without coverage logging
"""
import pytest
from sqlalchemy import select

from app.models import CheckIn, Contact, Net, StationStatus
from types import SimpleNamespace

from app.services.station_place import TRAVELING, build_site_roster, keeps_saved_location, place_key, place_label
from tests.conftest import auth_headers
from tests.test_site_coverage import SITES, _net


# ========== The rule, without a database ==========

def test_traveling_wins_over_a_site():
    assert place_key(4, "Bonny Eagle HS", "mobile") == TRAVELING
    assert place_key(4, "Bonny Eagle HS", StationStatus.MOBILE) == TRAVELING


def test_place_keys():
    assert place_key(4, "Bonny Eagle HS", "checked_in") == "site:4"
    assert place_key(None, " Home ", "checked_in") == "position:home"
    assert place_key(None, "", "checked_in") is None
    assert place_key(None, None, None) is None


def test_only_home_or_unknown_keeps_the_saved_town():
    assert keeps_saved_location(None, None, "checked_in")
    assert keeps_saved_location(None, "Home", "checked_in")
    assert keeps_saved_location(None, "home station", "listening")
    assert not keeps_saved_location(4, "Bonny Eagle HS", "checked_in")
    assert not keeps_saved_location(None, "Field Deployed", "checked_in")
    assert not keeps_saved_location(None, "Home", "mobile")


def test_place_labels():
    assert place_label(4, "Bonny Eagle HS", "checked_in", {4: "Bonny Eagle HS"}) == "Bonny Eagle HS"
    assert place_label(None, "Home", "mobile", {}) == "Traveling"
    assert place_label(None, "Field Deployed", "checked_in", {}) == "Field Deployed"
    assert place_label(None, None, "checked_in", {}) is None


def _row(callsign, site=None, position=None, status="checked_out"):
    return SimpleNamespace(callsign=callsign, coverage_site_id=site, operating_position=position, status=status)


def test_roster_groups_by_place_and_shows_a_mover_at_each():
    sites = [(1, "Windham EMA", "Windham, ME"), (2, "Bonny Eagle HS", "Standish, ME")]
    rows = [
        _row("K1ONE", 2, "Bonny Eagle HS"), _row("K1TWO", None, "Home"), _row("k1one", 1, "Windham EMA"),
        _row("K1SIX"), _row("K1TWO", None, "Home"), _row("K1SEV", None, "Field Deployed"),
    ]
    assert build_site_roster(sites, rows) == [
        {"place": "Windham EMA", "detail": "Windham, ME", "callsigns": "K1ONE"},
        {"place": "Bonny Eagle HS", "detail": "Standish, ME", "callsigns": "K1ONE"},
        {"place": "Home", "detail": None, "callsigns": "K1TWO"},
        {"place": "Field Deployed", "detail": None, "callsigns": "K1SEV"},
        {"place": "Not at a site", "detail": None, "callsigns": "K1SIX"},
    ]


def test_roster_is_empty_when_nobody_was_placed():
    assert build_site_roster([(1, "Windham EMA", None)], [_row("K1ONE"), _row("K1TWO")]) == []


# ========== Through the API ==========

async def _sites(client, net, owner):
    return (await client.put(f"/api/nets/{net.id}/coverage-sites", json=SITES, headers=auth_headers(owner))).json()


async def _check_in(client, net, owner, **body):
    return await client.post(f"/api/check-ins/nets/{net.id}/check-ins",
                             json={"callsign": "KC1HILL", **body}, headers=auth_headers(owner))


async def _rows(db, net):
    return (await db.execute(
        select(CheckIn).where(CheckIn.net_id == net.id).order_by(CheckIn.id)
        .execution_options(populate_existing=True)
    )).scalars().all()


@pytest.mark.asyncio
async def test_a_check_in_at_a_new_site_checks_out_the_old_one(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    ema, shelter = await _sites(client, net, owner)

    first = await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)
    assert first.status_code == 201
    assert first.json()["operating_position"] == "Bonny Eagle HS"

    # Never checked out at the shelter; same frequency.
    second = await _check_in(client, net, owner, coverage_site_id=ema["id"], frequency_id=simplex.id)
    assert second.status_code == 201, second.text
    assert second.json()["location"] == "Windham EMA, Windham, ME"

    old, new = await _rows(db, net)
    assert old.status == StationStatus.CHECKED_OUT
    assert old.checked_out_at is not None
    assert new.status == StationStatus.CHECKED_IN
    assert new.is_recheck and new.parent_check_in_id == old.id


@pytest.mark.asyncio
async def test_the_same_site_on_the_same_frequency_is_still_a_duplicate(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    _, shelter = await _sites(client, net, owner)
    assert (await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)).status_code == 201
    again = await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)
    assert again.status_code == 400
    # No place given means the same place.
    assert (await _check_in(client, net, owner, frequency_id=simplex.id)).status_code == 400


@pytest.mark.asyncio
async def test_the_same_site_on_a_second_frequency_keeps_both_live(client, db, owner):
    net, simplex, repeater = await _net(db, owner)
    _, shelter = await _sites(client, net, owner)
    await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=repeater.id)
    second = await _check_in(client, net, owner, frequency_id=simplex.id)
    assert second.status_code == 201
    # Inherited the site and its location.
    assert second.json()["coverage_site_id"] == shelter["id"]
    assert second.json()["location"] == "Bonny Eagle HS, Standish, ME"
    assert [r.status for r in await _rows(db, net)] == [StationStatus.CHECKED_IN, StationStatus.CHECKED_IN]


@pytest.mark.asyncio
async def test_traveling_checks_out_the_site_and_arriving_is_somewhere_new(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    ema, shelter = await _sites(client, net, owner)
    await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)

    road = await _check_in(client, net, owner, status="mobile", frequency_id=simplex.id)
    assert road.status_code == 201, road.text
    # Arriving with no site given doesn't put them back at the shelter:
    # net control has to say where they are.
    arrived = await _check_in(client, net, owner, frequency_id=simplex.id)
    assert arrived.status_code == 400
    arrived = await _check_in(client, net, owner, coverage_site_id=ema["id"], frequency_id=simplex.id)
    assert arrived.status_code == 201

    shelter_row, road_row, ema_row = await _rows(db, net)
    assert shelter_row.status == StationStatus.CHECKED_OUT
    assert road_row.status == StationStatus.CHECKED_OUT
    assert ema_row.coverage_site_id == ema["id"]


@pytest.mark.asyncio
async def test_a_site_check_in_keeps_the_saved_town_and_home_fills_it_in(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    _, shelter = await _sites(client, net, owner)
    db.add(Contact(callsign="KC1HILL", location="Gorham, ME"))
    await db.commit()

    await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)
    contact = (await db.execute(
        select(Contact).where(Contact.callsign == "KC1HILL").execution_options(populate_existing=True)
    )).scalar_one()
    assert contact.location == "Gorham, ME"

    home = await _check_in(client, net, owner, operating_position="Home", frequency_id=simplex.id)
    assert home.status_code == 201, home.text
    assert home.json()["location"] == "Gorham, ME"
    assert home.json()["coverage_site_id"] is None


@pytest.mark.asyncio
async def test_sites_work_without_coverage_logging(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    net.propagation_logging_enabled = False
    await db.commit()
    _, shelter = await _sites(client, net, owner)
    resp = await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)
    assert resp.status_code == 201
    assert resp.json()["coverage_site_id"] == shelter["id"]


@pytest.mark.asyncio
async def test_editing_a_row_to_home_takes_it_off_its_site(client, db, owner):
    net, simplex, _ = await _net(db, owner)
    _, shelter = await _sites(client, net, owner)
    row = (await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)).json()
    resp = await client.put(f"/api/check-ins/check-ins/{row['id']}",
                            json={"operating_position": "Home"}, headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["coverage_site_id"] is None
    assert resp.json()["operating_position"] == "Home"


@pytest.mark.asyncio
async def test_closing_email_lists_who_was_at_each_site(client, db, owner, monkeypatch):
    """Close a net without coverage logging; the log email gets the roster."""
    captured = {}

    async def _fake_send_net_log(*args, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr("app.email_service.EmailService.send_net_log", staticmethod(_fake_send_net_log))
    net, simplex, _ = await _net(db, owner)
    net.propagation_logging_enabled = False
    await db.commit()
    _, shelter = await _sites(client, net, owner)
    hill = await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)
    await client.post(f"/api/check-ins/nets/{net.id}/check-ins",
                      json={"callsign": "K1HOME", "operating_position": "Home"}, headers=auth_headers(owner))

    # Nobody holds NCS, so closing names who ran it (services/ncs_attribution.py)
    resp = await client.post(f"/api/nets/{net.id}/close", json={"ncs_check_in_id": hill.json()["id"]},
                             headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert captured.get("site_roster") == [
        {"place": "Bonny Eagle HS", "detail": "Standish, ME", "callsigns": "KC1HILL"},
        {"place": "Home", "detail": None, "callsigns": "K1HOME"},
    ]


@pytest.mark.asyncio
async def test_net_log_email_renders_the_sites_section(monkeypatch):
    from app.email.net_logs import send_net_log
    captured = {}

    async def _fake_send(*, to_email, subject, html_content, attachment_data,
                         attachment_filename, attachment_type="text/csv", unsubscribe_token=None):
        captured["html"] = html_content

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _fake_send)
    await send_net_log(
        email="ncs@example.com", net_name="SET", net_description="", ncs_name="KC1OWN", check_ins=[],
        started_at="2026-10-03 10:00:00", closed_at="2026-10-03 11:00:00",
        site_roster=[{"place": "Bonny Eagle HS", "detail": "Standish, ME", "callsigns": "KC1HILL"}],
    )
    assert "Sites" in captured["html"] and "Bonny Eagle HS" in captured["html"] and "KC1HILL" in captured["html"]


@pytest.mark.asyncio
async def test_correcting_a_site_in_place_moves_nothing_and_home_gets_the_saved_town(client, db, owner):
    """A site picked by mistake is corrected on the row itself: no check-out,
    no second row, and Home brings back the station's usual town."""
    net, simplex, _ = await _net(db, owner)
    ema, shelter = await _sites(client, net, owner)
    db.add(Contact(callsign="KC1HILL", location="Gorham, ME"))
    await db.commit()
    row = (await _check_in(client, net, owner, coverage_site_id=shelter["id"], frequency_id=simplex.id)).json()

    fixed = await client.put(f"/api/check-ins/check-ins/{row['id']}",
                             json={"coverage_site_id": ema["id"], "location": "Windham EMA, Windham, ME"},
                             headers=auth_headers(owner))
    assert fixed.status_code == 200
    assert fixed.json()["operating_position"] == "Windham EMA"
    home = await client.put(f"/api/check-ins/check-ins/{row['id']}",
                            json={"coverage_site_id": None, "operating_position": "Home", "location": ""},
                            headers=auth_headers(owner))
    assert home.json()["location"] == "Gorham, ME"
    rows = await _rows(db, net)
    assert len(rows) == 1 and rows[0].status == StationStatus.CHECKED_IN
    # The correction to a site never taught the station's saved town the shelter.
    contact = (await db.execute(
        select(Contact).where(Contact.callsign == "KC1HILL").execution_options(populate_existing=True)
    )).scalar_one()
    assert contact.location == "Gorham, ME"


def test_station_place_key():
    # The same keys as frontend utils/stationPlace.test.ts "stationPlaceKey".
    from app.services.station_place import station_place_key
    assert station_place_key("kd1om", 4, None, "checked_in") == "KD1OM|site:4"
    assert station_place_key("W1MTW", None, "Home ", "checked_in") == "W1MTW|position:home"
    assert station_place_key("W1AEK", 13, None, "mobile") == "W1AEK|traveling"
    assert station_place_key("W1AW", None, None, "checked_in", "Newington, CT") == "W1AW|location:newington, ct"
    assert station_place_key("W1AW", None, None, "checked_in") == "W1AW|"
