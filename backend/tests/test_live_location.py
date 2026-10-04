"""
Live (GPS) location as a town: reverse-lookup formatting, the location update
endpoint, callsign lookup, and the grid square a check-in keeps behind its town.

Net control reads check-in locations on the air, and a grid square tells them
nothing about which town a station is in. The town replaces the grid in the
location field; the grid survives on the check-in only while it describes the
same place, for the hover.
"""
from datetime import UTC, datetime, timedelta

import pytest

import app.routers.geocode as geocode
from app.routers.geocode import format_town
from tests.conftest import auth_headers


# ==========================================================================
# Formatting (fixtures are real Nominatim zoom=10 address blocks)
# ==========================================================================

def test_us_town_uses_state_code():
    assert format_town({
        "town": "Waterboro", "county": "York County", "state": "Maine",
        "ISO3166-2-lvl4": "US-ME", "country": "United States", "country_code": "us",
    }) == "Waterboro, ME"


def test_canadian_city_uses_province_code():
    assert format_town({
        "city": "Ottawa", "state": "Ontario", "ISO3166-2-lvl4": "CA-ON",
        "country": "Canada", "country_code": "ca",
    }) == "Ottawa, ON"


def test_other_countries_use_the_country_name():
    """A subdivision code like GB-ENG is not something listeners know."""
    assert format_town({
        "city": "Guildford", "county": "Surrey", "state": "England",
        "ISO3166-2-lvl4": "GB-ENG", "country": "United Kingdom", "country_code": "gb",
    }) == "Guildford, United Kingdom"


def test_place_keys_in_order_then_county_fallback():
    assert format_town({"village": "Cornish", "ISO3166-2-lvl4": "US-ME", "country_code": "us"}) == "Cornish, ME"
    # Unorganized territory: no populated place, the county is the best name there is
    assert format_town({"county": "Piscataquis County", "ISO3166-2-lvl4": "US-ME", "country_code": "us"}) \
        == "Piscataquis County, ME"
    assert format_town({"country": "Antarctica"}) is None


# ==========================================================================
# PUT /users/me/location
# ==========================================================================

@pytest.fixture()
def fake_town(monkeypatch):
    """Stand in for Nominatim; records the coordinates it was asked about."""
    calls = []

    async def _reverse(lat, lon):
        calls.append((lat, lon))
        return "Waterboro, ME"

    monkeypatch.setattr(geocode, "reverse_geocode_town", _reverse)
    return calls


@pytest.mark.asyncio
async def test_location_update_stores_grid_and_town(client, owner, fake_town):
    resp = await client.put(
        "/api/users/me/location",
        json={"location": "fn43ql", "lat": 43.54, "lon": -70.72},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200
    assert resp.json()["live_location"] == "FN43QL"
    assert resp.json()["live_location_town"] == "Waterboro, ME"
    assert fake_town == [(43.54, -70.72)]

    me = (await client.get("/api/users/me", headers=auth_headers(owner))).json()
    assert me["live_location_town"] == "Waterboro, ME"


@pytest.mark.asyncio
async def test_grid_only_update_from_an_older_tab_still_works(client, owner, fake_town):
    """A tab loaded before this change sends only the grid: no town, no error."""
    resp = await client.put("/api/users/me/location", json={"location": "FN43QL"}, headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["live_location_town"] is None
    assert fake_town == []


@pytest.mark.asyncio
async def test_clearing_location_clears_the_town(client, owner, fake_town):
    await client.put("/api/users/me/location", json={"location": "FN43QL", "lat": 43.54, "lon": -70.72},
                     headers=auth_headers(owner))
    resp = await client.put("/api/users/me/location", json={"location": ""}, headers=auth_headers(owner))
    assert resp.json()["live_location"] is None
    assert resp.json()["live_location_town"] is None


# ==========================================================================
# Callsign lookup and check-ins
# ==========================================================================

async def _set_live(db, user, town="Waterboro, ME", grid="FN43QL", age=timedelta(minutes=2)):
    user.live_location = grid
    user.live_location_town = town
    user.live_location_updated = datetime.now(UTC) - age
    await db.commit()


async def _active_net(client, owner):
    net_id = (await client.post("/api/nets/", json={"name": "Town Net"}, headers=auth_headers(owner))).json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    return net_id


@pytest.mark.asyncio
async def test_callsign_lookup_offers_the_town(client, db, owner, other):
    other.location = "Somewhere, ME"
    await _set_live(db, other)
    resp = await client.get(f"/api/users/lookup/{other.callsign}", headers=auth_headers(owner))
    assert resp.json()["location"] == "Waterboro, ME"


@pytest.mark.asyncio
async def test_callsign_lookup_falls_back_to_grid_then_profile(client, db, owner, other):
    other.location = "Somewhere, ME"
    await _set_live(db, other, town=None)
    resp = await client.get(f"/api/users/lookup/{other.callsign}", headers=auth_headers(owner))
    assert resp.json()["location"] == "FN43QL"

    await _set_live(db, other, age=timedelta(hours=2))  # stale
    resp = await client.get(f"/api/users/lookup/{other.callsign}", headers=auth_headers(owner))
    assert resp.json()["location"] == "Somewhere, ME"


@pytest.mark.asyncio
async def test_check_in_from_the_live_town_keeps_the_grid(client, db, owner, other):
    """Net control entered the station with the town the lookup filled in."""
    await _set_live(db, other)
    net_id = await _active_net(client, owner)
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": other.callsign, "location": "Waterboro, ME"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    assert resp.json()["grid_square"] == "FN43QL"


@pytest.mark.asyncio
async def test_check_in_from_somewhere_else_has_no_grid(client, db, owner, other):
    await _set_live(db, other)
    net_id = await _active_net(client, owner)
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": other.callsign, "location": "Portland, ME", "grid_square": "AA00AA"},
        headers=auth_headers(owner),
    )
    # Neither the mismatched town nor a client-sent grid puts a grid on the row
    assert resp.json()["grid_square"] is None


@pytest.mark.asyncio
async def test_editing_the_location_drops_the_grid(client, db, owner, other):
    await _set_live(db, other)
    net_id = await _active_net(client, owner)
    check_in = (await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": other.callsign, "location": "Waterboro, ME"},
        headers=auth_headers(owner),
    )).json()
    assert check_in["grid_square"] == "FN43QL"

    edited = await client.put(
        f"/api/check-ins/check-ins/{check_in['id']}",
        json={"location": "Lyman, ME"},
        headers=auth_headers(owner),
    )
    assert edited.status_code == 200
    assert edited.json()["grid_square"] is None


@pytest.mark.asyncio
async def test_starting_a_net_checks_ncs_in_from_their_live_town(client, db, owner):
    """The automatic NCS check-in on start follows the same rule as the form."""
    owner.location = "Somewhere, ME"
    owner.location_awareness = True
    await _set_live(db, owner)
    net_id = await _active_net(client, owner)
    rows = (await client.get(f"/api/check-ins/nets/{net_id}/check-ins", headers=auth_headers(owner))).json()
    assert [(r["location"], r["grid_square"]) for r in rows] == [("Waterboro, ME", "FN43QL")]


@pytest.mark.asyncio
async def test_starting_a_net_without_location_awareness_uses_the_profile(client, db, owner):
    owner.location = "Somewhere, ME"
    owner.location_awareness = False
    await _set_live(db, owner)
    net_id = await _active_net(client, owner)
    rows = (await client.get(f"/api/check-ins/nets/{net_id}/check-ins", headers=auth_headers(owner))).json()
    assert [(r["location"], r["grid_square"]) for r in rows] == [("Somewhere, ME", None)]
