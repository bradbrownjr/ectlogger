"""One row per station per place: the check-in list as net control reads it.

Every check-in, recheck included, is its own CheckIn row, because each one
is a timestamped event the ICS-309 logs (routers/check_ins.py). Read as a
list, that left a SET's stations scattered over a row per channel: net 137
had 74 rows for 17 callsigns. What a coordinator wants to know is which
channels a station can be reached on at each place (Brad, 2026-10-30), so
the rows are grouped by station_place_key, and each group carries:

- worked: channels the station checked in on there, which a logged
  check-in proves two-way (site_coverage.check_in_contacts)
- listed: channels it said it could be reached on, not yet worked
- offline: channels net control marked offline (StationChannelMark), which
  stay on the row, greyed, and can be brought back

The rows themselves stay the timeline under the group. Pure functions over
plain values (tests/test_station_rows.py); the frontend mirror is
utils/stationRows.ts, held to the same cases.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

from app.services.station_place import station_place_key


def _frequency_ids(raw) -> List[int]:
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            return []
    return [int(v) for v in raw if v is not None]


def _when(row) -> datetime:
    at = row.checked_in_at
    if at is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    return at if at.tzinfo else at.replace(tzinfo=timezone.utc)


def row_station_key(row) -> str:
    """station_place_key for a CheckIn (or anything shaped like one)."""
    return station_place_key(row.callsign, row.coverage_site_id, row.operating_position, row.status, row.location)


def group_station_rows(rows: Iterable, marks: Iterable = ()) -> List[dict]:
    """The check-in rows as one entry per station per place, in the order
    each was first logged. `rows` are CheckIn-shaped (id, callsign,
    coverage_site_id, operating_position, status, location, frequency_id,
    available_frequencies, checked_in_at); `marks` are StationChannelMark-
    shaped (station_key, frequency_id, offline_at, restored_at)."""
    groups: Dict[str, List] = {}
    for row in sorted(rows, key=lambda r: (_when(r), r.id)):
        groups.setdefault(row_station_key(row), []).append(row)

    open_marks: Dict[str, Dict[int, datetime]] = {}
    for mark in marks:
        if mark.restored_at is None:
            open_marks.setdefault(mark.station_key, {})[mark.frequency_id] = mark.offline_at

    out = []
    for key, members in groups.items():
        worked: List[int] = []
        for row in members:
            if row.frequency_id is not None and row.frequency_id not in worked:
                worked.append(row.frequency_id)
        listed: List[int] = []
        for row in members:
            for fid in _frequency_ids(row.available_frequencies):
                if fid not in worked and fid not in listed:
                    listed.append(fid)
        out.append({
            "key": key,
            "row": members[-1],
            "rows": members,
            "worked": worked,
            "listed": listed,
            "offline": dict(open_marks.get(key, {})),
        })
    return out



async def station_row_ids(db, check_in) -> List[int]:
    """Every check-in row of this row's station at this row's place. A
    station's coverage report (can-hear, outside contacts, repeater
    results) belongs to the station there, not to one of its rows."""
    from sqlalchemy import select
    from app.models import CheckIn
    key = row_station_key(check_in)
    rows = (await db.execute(select(CheckIn).where(CheckIn.net_id == check_in.net_id))).scalars().all()
    return [r.id for r in rows if row_station_key(r) == key]
