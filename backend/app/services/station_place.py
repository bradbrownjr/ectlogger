"""Where a check-in row says its station is: the rule behind the Site box.

A row's place is one of:
- traveling: its status is Mobile. Wins over anything else on the row, since
  a station that has left a shelter is no longer at it.
- one of the net's sites (CheckIn.coverage_site_id)
- an operating position with no site ("Home", "Field Deployed", or typed
  text from the can-hear dialog), CheckIn.operating_position
- unknown: none of the above

Location is separate: it is where the station usually is (its town, filled
in from the saved Contact) or, at a site, the site's own place. A check-in
whose place is not the station's usual one (a site, traveling, deployed)
must not overwrite that saved town, or next week's regular net fills in
the shelter.

Pure functions, so the rules are unit-testable without a database
(tests/test_station_place.py). The frontend mirror is utils/stationPlace.ts.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

TRAVELING = "traveling"


def _status_value(status) -> str:
    return (getattr(status, "value", status) or "").lower()


def place_key(coverage_site_id: Optional[int], operating_position: Optional[str], status) -> Optional[str]:
    """A comparable key for a row's place, or None when it is unknown."""
    if _status_value(status) == "mobile":
        return TRAVELING
    if coverage_site_id is not None:
        return f"site:{coverage_site_id}"
    position = (operating_position or "").strip().lower()
    return f"position:{position}" if position else None


def is_home_position(operating_position: Optional[str]) -> bool:
    """Loose on purpose, the same match routers/users.py uses for the
    profile's home-station statistics: the can-hear dialog lets an operator
    type "home station"."""
    return "home" in (operating_position or "").lower()


def keeps_saved_location(coverage_site_id: Optional[int], operating_position: Optional[str], status) -> bool:
    """Whether this row's Location may update the station's saved town.
    Only a station at home, or one whose place is unknown, is somewhere it
    usually is."""
    key = place_key(coverage_site_id, operating_position, status)
    return key is None or (key.startswith("position:") and is_home_position(operating_position))


def place_label(coverage_site_id: Optional[int], operating_position: Optional[str], status,
                site_names: dict) -> Optional[str]:
    """The place as net control reads it in the chat log, or None when unknown."""
    key = place_key(coverage_site_id, operating_position, status)
    if key is None:
        return None
    if key == TRAVELING:
        return "Traveling"
    if coverage_site_id is not None:
        return site_names.get(coverage_site_id, "a site")
    return operating_position.strip()


def build_site_roster(sites: List[Tuple[int, str, Optional[str]]], rows) -> List[dict]:
    """Who was at each place over the whole net, for the closing email:
    `sites` are the net's reporting sites as (id, name, location) in the
    manager's order, `rows` every check-in row (callsign, coverage_site_id,
    operating_position, status). A station that moved shows at each place.
    Empty when nobody was placed anywhere. Mirrors the frontend
    utils/stationPlace.ts::buildSiteBoard (non-live), which the net report
    uses."""
    site_by_id = {sid: (name, location) for sid, name, location in sites}
    site_order = {sid: i for i, (sid, _, _) in enumerate(sites)}
    groups: Dict[str, dict] = {}
    for row in rows:
        site_id = row.coverage_site_id if row.coverage_site_id in site_by_id else None
        key = place_key(site_id, row.operating_position, row.status)
        if key is None:
            label, detail, rank = "Not at a site", None, (3, 0, "")
        elif key == TRAVELING:
            label, detail, rank = "Traveling", None, (1, 0, "")
        elif site_id is not None:
            label, detail = site_by_id[site_id]
            rank = (0, site_order[site_id], "")
        else:
            label = row.operating_position.strip()
            detail, rank = None, (2, 0 if is_home_position(label) else 1, label.lower())
        group = groups.setdefault(key or "none", {"place": label, "detail": detail, "rank": rank, "callsigns": []})
        callsign = row.callsign.upper()
        if callsign not in group["callsigns"]:
            group["callsigns"].append(callsign)
    if all(k == "none" for k in groups):
        return []
    return [
        {"place": g["place"], "detail": g["detail"], "callsigns": ", ".join(g["callsigns"])}
        for g in sorted(groups.values(), key=lambda g: g["rank"])
    ]
