"""
A closed net's ICS-214 Activity Log (services/ics214.py, routers/ics214.py).

Brad, 2026-10-30, after the SET (net 137): the 214 can be filled in from
travel and site arrivals, and net control finishes it on an edit page
before downloading it. Every line comes from a logged event, never a
roster (docs/ROADMAP.md, "Do not manufacture entries"), and says "on the
air from", never "arrived".
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import pytest
from sqlalchemy import select

from app.models import AuditEvent, NetStatus
from app.services.ics214 import apply_line_edits, build_activity_lines, build_resources
from tests.conftest import auth_headers

T0 = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
SITES = {4: "Gorham Shelter", 9: "Westbrook High School"}
CHANNELS = {3: "147.090 FM", 37: "155.760 FM"}


def at(minutes):
    return T0 + timedelta(minutes=minutes)


@dataclass
class Row:
    id: int
    callsign: str
    minutes: int
    frequency_id: Optional[int] = 3
    coverage_site_id: Optional[int] = None
    operating_position: Optional[str] = None
    status: str = "checked_in"
    out_minutes: Optional[int] = None
    user_id: Optional[int] = None
    checked_in_by_id: Optional[int] = None
    name: str = ""
    location: Optional[str] = None
    available_frequencies: str = "[]"
    time_not_recorded: bool = False
    in_person: bool = False

    def __post_init__(self):
        if self.out_minutes is not None:
            self.status = "checked_out"

    @property
    def checked_in_at(self):
        return at(self.minutes)

    @property
    def checked_out_at(self):
        return at(self.out_minutes) if self.out_minutes is not None else None


@dataclass
class Net:
    started_at: datetime = T0
    closed_at: datetime = at(240)
    frequencies: List = field(default_factory=list)


@dataclass
class Role:
    id: int
    user_id: int
    role: str
    assigned_at: datetime
    is_active: bool = True


@dataclass
class Mark:
    id: int
    station_key: str
    frequency_id: int
    offline_at: datetime
    restored_at: Optional[datetime] = None


def lines(rows, **kwargs):
    return build_activity_lines(
        net=kwargs.pop("net", Net()), rows=rows, site_names=SITES,
        channel=lambda fid: CHANNELS.get(fid),
        role_callsign=lambda role: {1: "WS1EC", 2: "KC1JMH"}.get(role.user_id),
        traffic_text=lambda hop: hop.text,
        **kwargs,
    )


def texts(result):
    return [l["text"] for l in result]


def test_on_the_air_from_a_site_then_a_move_and_a_new_channel():
    rows = [
        Row(1, "KD1OM", 10, coverage_site_id=4),
        Row(2, "KD1OM", 12, frequency_id=37, coverage_site_id=4),
        Row(3, "KD1OM", 14, coverage_site_id=4),  # a routine recheck: left out
        Row(4, "KD1OM", 60, coverage_site_id=9),
    ]
    rows[0].out_minutes = rows[1].out_minutes = rows[2].out_minutes = 60
    for r in rows[:3]:
        r.status = "checked_out"
    assert texts(lines(rows))[1:-1] == [
        "KD1OM on the air from Gorham Shelter on 147.090 FM",
        "KD1OM at Gorham Shelter now also on 155.760 FM",
        "KD1OM on the air from Westbrook High School on 147.090 FM (moved from Gorham Shelter)",
    ]


def test_net_opens_and_closes_and_nothing_says_arrived():
    result = lines([Row(1, "KD1OM", 10, coverage_site_id=4)])
    assert result[0]["key"] == "net:open" and result[-1]["key"] == "net:close"
    assert not any("arriv" in t.lower() for t in texts(result))


def test_a_station_leaving_on_its_own_is_logged_but_not_one_checked_out_at_the_close():
    result = texts(lines([
        Row(1, "W1MTW", 10, coverage_site_id=9, out_minutes=98),
        Row(2, "KD1OM", 10, out_minutes=240),
    ]))
    assert "W1MTW checked out of Westbrook High School" in result
    assert not any(t.startswith("KD1OM checked out") for t in result)


def test_a_place_left_for_another_is_not_also_a_check_out():
    # Net 137: W1MTW's Windham High School rows were stamped out at the final
    # 11:57 check-out, long after he was on the air from Home at 10:02.
    result = texts(lines([
        Row(1, "W1MTW", 10, coverage_site_id=9, out_minutes=180),
        Row(2, "W1MTW", 60, operating_position="Home", out_minutes=180),
    ]))
    assert [t for t in result if "checked out" in t] == ["W1MTW checked out of Home"]


def test_in_person_has_no_channel_and_traveling_reads_as_traveling():
    result = texts(lines([
        Row(1, "KC1WGO", 10, frequency_id=None, coverage_site_id=4, status="in_person", in_person=True),
        Row(2, "N1KWG", 20, status="mobile"),
    ]))
    assert "KC1WGO checked in in person at Gorham Shelter" in result
    assert "N1KWG on the air while traveling on 147.090 FM" in result


def test_a_station_from_a_paper_log_with_no_time_goes_last_with_no_time():
    result = lines([Row(1, "KC1WGO", 240, time_not_recorded=True), Row(2, "KD1OM", 10)])
    assert result[-1]["text"] == "KC1WGO checked in on 147.090 FM" and result[-1]["at"] is None


def test_offline_marks_and_roles_of_people_who_took_part():
    rows = [Row(1, "KD1OM", 10, coverage_site_id=4, checked_in_by_id=1)]
    result = texts(lines(
        rows,
        marks=[Mark(5, "KD1OM|site:4", 3, at(30), at(45))],
        roles=[Role(7, 1, "NCS", T0 - timedelta(hours=20)), Role(8, 2, "LOGGER", at(5))],
    ))
    assert "KD1OM at Gorham Shelter: 147.090 FM offline" in result
    assert "KD1OM at Gorham Shelter: 147.090 FM back online" in result
    # WS1EC logged a check-in; KC1JMH, assigned Logger, never took part
    assert "WS1EC took net control" in result
    assert not any("KC1JMH" in t for t in result)
    assert result.index("WS1EC took net control") == 1  # at the start, not 20 hours before


def test_edits_hide_and_reword_by_key():
    result = apply_line_edits(lines([Row(1, "KD1OM", 10)]), {
        "station:1": {"text": "KD1OM on the air from his truck"}, "net:open": {"hidden": True},
    })
    by_key = {l["key"]: l for l in result}
    assert by_key["station:1"]["text"] == "KD1OM on the air from his truck"
    assert by_key["station:1"]["default_text"] == "KD1OM checked in on 147.090 FM"
    assert by_key["net:open"]["hidden"] is True


def test_resources_are_everyone_who_took_part_with_their_roles():
    resources = build_resources(
        [Row(1, "WS1EC", 0, user_id=1, name="Club Station"), Row(2, "KC1WGO", 5, frequency_id=None, name="Andy"),
         Row(3, "WS1EC", 9, user_id=1)],
        [Role(7, 1, "NCS", T0)],
    )
    assert [(r["callsign"], r["name"], r["position"]) for r in resources] == [
        ("WS1EC", "Club Station", "Net Control"), ("KC1WGO", "Andy", ""),
    ]


# ========== The API ==========

async def _closed_net(client, db, owner):
    from app.models import Net as NetModel
    net_id = (await client.post("/api/nets/", json={"name": "SET 2026"}, headers=auth_headers(owner))).json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    await client.post(f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": "KD1OM"}, headers=auth_headers(owner))
    net = await db.get(NetModel, net_id)
    net.status = NetStatus.CLOSED
    net.closed_at = datetime.now(timezone.utc)
    await db.commit()
    return net_id


@pytest.mark.asyncio
async def test_only_net_control_and_only_once_closed(client, db, owner, other):
    net_id = (await client.post("/api/nets/", json={"name": "Open"}, headers=auth_headers(owner))).json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    assert (await client.get(f"/api/nets/{net_id}/ics214", headers=auth_headers(owner))).status_code == 400

    closed = await _closed_net(client, db, owner)
    assert (await client.get(f"/api/nets/{closed}/ics214", headers=auth_headers(other))).status_code == 403
    r = await client.get(f"/api/nets/{closed}/ics214", headers=auth_headers(owner))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["header"]["incident_name"] == "SET 2026"
    assert any(l["text"].startswith("KD1OM checked in") for l in body["lines"])
    assert "KD1OM" in [res["callsign"] for res in body["resources"]]
    net = (await client.get(f"/api/nets/{closed}", headers=auth_headers(owner))).json()
    assert net["actions"]["prepare_ics214"] is True


@pytest.mark.asyncio
async def test_saving_keeps_edits_and_lets_defaults_follow_the_net(client, db, owner):
    from app.models import Ics214Form
    net_id = await _closed_net(client, db, owner)
    form = (await client.get(f"/api/nets/{net_id}/ics214", headers=auth_headers(owner))).json()
    key = next(l["key"] for l in form["lines"] if l["text"].startswith("KD1OM"))
    header = {**form["header"], "home_agency": "Cumberland County ARES"}
    r = await client.put(f"/api/nets/{net_id}/ics214", headers=auth_headers(owner), json={
        "header": header,
        "line_edits": {key: {"text": "KD1OM on the air from his truck"}, "net:open": {"hidden": False}},
        "resource_edits": {"KD1OM": {"agency": "Gorham ARES"}},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["header"]["home_agency"] == "Cumberland County ARES"
    assert next(l for l in body["lines"] if l["key"] == key)["text"] == "KD1OM on the air from his truck"
    assert next(res for res in body["resources"] if res["callsign"] == "KD1OM")["agency"] == "Gorham ARES"

    stored = (await db.execute(select(Ics214Form).where(Ics214Form.net_id == net_id))).scalar_one()
    assert stored.incident_name is None  # unchanged, so still the net's name
    assert "net:open" not in stored.line_edits  # an edit that changes nothing isn't kept


@pytest.mark.asyncio
async def test_a_line_written_by_hand_and_deleting_it_is_logged(client, db, owner):
    net_id = await _closed_net(client, db, owner)
    r = await client.post(f"/api/nets/{net_id}/ics214/entries", headers=auth_headers(owner), json={
        "occurred_at": datetime.now(timezone.utc).isoformat(), "text": "Briefed shelter managers at the EOC",
    })
    assert r.status_code == 201, r.text
    line = next(l for l in r.json()["lines"] if l["kind"] == "entry")
    assert line["text"] == "Briefed shelter managers at the EOC"

    r = await client.delete(f"/api/nets/{net_id}/ics214/entries/{line['entry_id']}", headers=auth_headers(owner))
    assert r.status_code == 204
    events = (await db.execute(select(AuditEvent).where(AuditEvent.action == "net.activity_entry_deleted"))).scalars().all()
    assert len(events) == 1
