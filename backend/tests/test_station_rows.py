"""
One row per station per place (services/station_rows.py) and channels
marked offline (routers/channel_marks.py).

Brad, 2026-10-30, after the SET (net 137, 74 rows for 17 callsigns): "I want
to know what channels a station is available on or what their capabilities
are at a given site." Rows group by station and place; each group lists the
channels worked (checked in on) and those only listed, and a channel net
control marks offline stays on the row, greyed, until brought back: "I
wouldn't remove channels - the site is still reachable there."

The frontend mirror, utils/stationRows.ts, is held to the same cases in
utils/stationRows.test.ts.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest

from app.models import Frequency, Net, NetStatus, net_frequencies
from app.services.station_rows import group_station_rows
from tests.conftest import auth_headers

T0 = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)


@dataclass
class Row:
    id: int
    callsign: str
    coverage_site_id: Optional[int]
    frequency_id: Optional[int]
    minutes: int
    available_frequencies: str = "[]"
    operating_position: Optional[str] = None
    status: str = "checked_in"
    location: Optional[str] = None

    @property
    def checked_in_at(self):
        return T0 + timedelta(minutes=self.minutes)


@dataclass
class Mark:
    station_key: str
    frequency_id: int
    offline_at: datetime
    restored_at: Optional[datetime] = None


def test_rechecks_at_one_place_are_one_station_with_every_channel():
    rows = [
        Row(1, "KD1OM", 4, 3, 0),
        Row(2, "KD1OM", 4, 37, 2, available_frequencies="[37, 1]"),
        Row(3, "KD1OM", 9, 3, 60),   # moved to Westbrook
        Row(4, "WO1J", 14, 3, 5),
    ]
    groups = group_station_rows(rows)
    assert [g["key"] for g in groups] == ["KD1OM|site:4", "WO1J|site:14", "KD1OM|site:9"]
    gorham = groups[0]
    assert [r.id for r in gorham["rows"]] == [1, 2]
    assert gorham["row"].id == 2
    assert gorham["worked"] == [3, 37]
    assert gorham["listed"] == [1]


def test_in_person_has_no_channels():
    groups = group_station_rows([Row(1, "KC1WGO", 12, None, 0, status="in_person")])
    assert groups[0]["worked"] == [] and groups[0]["listed"] == []


def test_offline_marks_stay_on_the_row_until_restored():
    rows = [Row(1, "KD1OM", 4, 3, 0), Row(2, "KD1OM", 4, 37, 2)]
    marks = [
        Mark("KD1OM|site:4", 37, T0 + timedelta(minutes=30)),
        Mark("KD1OM|site:4", 3, T0 + timedelta(minutes=10), restored_at=T0 + timedelta(minutes=20)),
    ]
    group = group_station_rows(rows, marks)[0]
    assert group["worked"] == [3, 37]
    assert group["offline"] == {37: T0 + timedelta(minutes=30)}


# ========== Marking a channel offline ==========

async def _net_with_two_channels(client, db, owner):
    create = await client.post("/api/nets/", json={"name": "SET"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    net = await db.get(Net, net_id)
    net.status = NetStatus.ACTIVE
    f1 = Frequency(frequency="147.090", mode="FM")
    f2 = Frequency(frequency="155.760", mode="FM")
    db.add_all([f1, f2])
    await db.flush()
    await db.execute(net_frequencies.insert().values([{"net_id": net_id, "frequency_id": f1.id}, {"net_id": net_id, "frequency_id": f2.id}]))
    await db.commit()
    return net_id, f1.id, f2.id


@pytest.mark.asyncio
async def test_net_control_marks_a_channel_offline_and_back(client, db, owner, other):
    net_id, f1, f2 = await _net_with_two_channels(client, db, owner)
    ci = await client.post(f"/api/check-ins/nets/{net_id}/check-ins",
                           json={"callsign": "KD1OM", "frequency_id": f1}, headers=auth_headers(owner))
    assert ci.status_code == 201, ci.text
    ci_id = ci.json()["id"]

    refused = await client.post(f"/api/check-ins/check-ins/{ci_id}/channels/{f1}/offline", headers=auth_headers(other))
    assert refused.status_code == 403

    off = await client.post(f"/api/check-ins/check-ins/{ci_id}/channels/{f1}/offline", headers=auth_headers(owner))
    assert off.status_code == 200, off.text
    assert off.json()["restored_at"] is None
    again = await client.post(f"/api/check-ins/check-ins/{ci_id}/channels/{f1}/offline", headers=auth_headers(owner))
    assert again.status_code == 400

    back = await client.post(f"/api/check-ins/check-ins/{ci_id}/channels/{f1}/online", headers=auth_headers(owner))
    assert back.status_code == 200
    assert back.json()["restored_at"] is not None

    marks = await client.get(f"/api/check-ins/nets/{net_id}/channel-marks")
    assert [m["frequency_id"] for m in marks.json()] == [f1]

    # The station's check-in row is untouched: the channel stays.
    rows = (await client.get(f"/api/check-ins/nets/{net_id}/check-ins")).json()
    assert rows[0]["frequency_id"] == f1


@pytest.mark.asyncio
async def test_not_a_net_frequency_is_refused(client, db, owner):
    net_id, f1, _ = await _net_with_two_channels(client, db, owner)
    ci = await client.post(f"/api/check-ins/nets/{net_id}/check-ins",
                           json={"callsign": "KD1OM", "frequency_id": f1}, headers=auth_headers(owner))
    resp = await client.post(f"/api/check-ins/check-ins/{ci.json()['id']}/channels/99999/offline", headers=auth_headers(owner))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_a_coverage_report_belongs_to_the_station_not_one_row(client, db, owner):
    # Known issue #10: a report saved from a station's first row didn't
    # show, and wasn't replaced, when the dialog was opened from its recheck.
    net_id, f1, f2 = await _net_with_two_channels(client, db, owner)
    net = await db.get(Net, net_id)
    net.propagation_logging_enabled = True
    await db.commit()

    async def check_in(callsign, freq):
        resp = await client.post(f"/api/check-ins/nets/{net_id}/check-ins",
                                 json={"callsign": callsign, "frequency_id": freq}, headers=auth_headers(owner))
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    first = await check_in("KD1OM", f1)
    recheck = await check_in("KD1OM", f2)   # same place, second channel
    wo1j = await check_in("WO1J", f1)

    async def save(reporter, heard):
        resp = await client.put(f"/api/nets/{net_id}/can-hear-reports",
                                json={"reporter_check_in_id": reporter, "heard_check_in_ids": heard, "frequency_id": f1},
                                headers=auth_headers(owner))
        assert resp.status_code == 200, resp.text
        return resp.json()

    await save(first, [wo1j])
    from_recheck = await save(recheck, [wo1j])
    assert [(r["reporter_check_in_id"], r["heard_check_in_id"]) for r in from_recheck] == [(first, wo1j)]
    assert await save(recheck, []) == []


@pytest.mark.asyncio
async def test_closing_email_lists_one_row_per_station_and_every_check_in_in_the_csv(monkeypatch):
    import csv
    import io
    from app.email.net_logs import send_net_log
    captured = {}

    async def _fake_send(*, to_email, subject, html_content, attachment_data,
                         attachment_filename, attachment_type="text/csv", unsubscribe_token=None):
        captured["html"] = html_content
        captured["csv"] = attachment_data

    monkeypatch.setattr("app.email.net_logs.send_email_with_attachment", _fake_send)
    check_ins = [
        {"time": "08:17", "callsign": "KD1OM", "frequency": "147.090 FM", "fields": {}},
        {"time": "08:18", "callsign": "KD1OM", "frequency": "155.760 FM", "fields": {}},
    ]
    stations = [{"time": "08:17", "callsign": "KD1OM", "check_in_count": 2,
                 "frequency": "147.090 FM, 155.760 FM (offline)", "frequencies": "", "fields": {}}]
    await send_net_log(
        email="ncs@example.com", net_name="SET", net_description="", ncs_name="WS1EC",
        check_ins=check_ins, stations=stations, started_at="2026-10-24 08:00:00", closed_at="2026-10-24 12:40:00",
        frequencies=["147.090 FM", "155.760 FM"],
    )
    html = captured["html"]
    assert "KD1OM (2 check-ins)" in html
    assert "<th>Checked in on</th>" in html
    assert "155.760 FM (offline)" in html
    assert "2 from 1 station" in html
    assert len(list(csv.DictReader(io.StringIO(captured["csv"])))) == 2
