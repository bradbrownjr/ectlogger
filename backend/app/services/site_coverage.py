"""Coverage by site: which places in a drill can reach which.

A read-time rollup over a net's CanHearReport rows, grouped by the site each
check-in row is at (CheckIn.coverage_site_id), the same "the per-net report
is the single source of truth" rule CanHearReport itself follows. Nothing
here is stored.

Grouping is per check-in ROW, never per callsign. An operator who checks out
at one shelter and rechecks from another has two rows at two sites, and the
reports made from each visit belong to that visit's site. A station with no
site (a home station, a mobile) is its own node keyed by callsign, so it
still shows up as a possible relay.

Pure functions over plain values, so the rules are unit-testable without a
database (tests/test_site_coverage.py). load_site_coverage() at the bottom
is the one place that reads the database for them.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class SiteIn:
    id: int
    name: str
    location: Optional[str]
    site_type: str
    is_primary: bool


@dataclass
class CheckInIn:
    id: int
    callsign: str
    coverage_site_id: Optional[int]


@dataclass
class ReportIn:
    reporter_check_in_id: int
    heard_check_in_id: int
    frequency_id: Optional[int]


@dataclass
class ContactIn:
    id: int
    reporter_check_in_id: int
    frequency_id: Optional[int]
    callsign: Optional[str]
    station: Optional[str]
    county: Optional[str]
    state: Optional[str]
    two_way: bool


@dataclass
class AccessIn:
    reporter_check_in_id: int
    target_site_id: int
    reached: bool
    note: Optional[str]


@dataclass
class Node:
    key: str
    kind: str  # "site" or "station"
    name: str
    site_id: Optional[int] = None
    site_type: Optional[str] = None
    is_primary: bool = False
    location: Optional[str] = None
    callsigns: List[str] = field(default_factory=list)


def parse_excluded_frequency_ids(raw: Optional[str]) -> Set[int]:
    """Net.coverage_excluded_frequency_ids is a JSON list in a TEXT column."""
    if not raw:
        return set()
    try:
        return {int(v) for v in json.loads(raw)}
    except (ValueError, TypeError):
        return set()


_GRID = re.compile(r"^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2})?)?$", re.IGNORECASE)


def site_line(name: str, location: Optional[str]) -> str:
    """A site as one line, the way a manager types it and the way it reads
    as a check-in's location: "Bonny Eagle HS, Standish, ME", or "Gray NWS
    FN43rv" for a grid square. Both forms still place on the map: the map
    reads a grid anywhere in the text, and geocoding drops leading
    comma-separated parts it can't find (utils/locationParser.ts). Mirrors
    frontend utils/coverageSites.ts::formatSiteLine."""
    location = (location or "").strip()
    if not location:
        return name
    return f"{name} {location}" if _GRID.match(location) else f"{name}, {location}"


def site_key(site_id: int) -> str:
    return f"site:{site_id}"


def _node_key_for(check_in: CheckInIn) -> str:
    if check_in.coverage_site_id is not None:
        return site_key(check_in.coverage_site_id)
    return f"station:{check_in.callsign.upper()}"


def build_site_coverage(
    sites: List[SiteIn],
    check_ins: List[CheckInIn],
    reports: Iterable[ReportIn],
    contacts: Iterable[ContactIn],
    excluded_frequency_ids: Set[int] = frozenset(),
    access: Iterable[AccessIn] = (),
    target_frequency_ids: Optional[Dict[int, Optional[int]]] = None,
) -> dict:
    """The site view of a net's coverage. Returns plain dicts for the API
    (schemas.SiteCoverageResponse) and the closing email.

    Sites of type "infrastructure" (repeaters, packet nodes, Winlink
    gateways) are not places anyone reports from: they come back as
    `targets`, with `access` saying which node got in."""
    infrastructure = [s for s in sites if s.site_type == "infrastructure"]
    sites = [s for s in sites if s.site_type != "infrastructure"]
    nodes: Dict[str, Node] = {}
    for site in sites:
        nodes[site_key(site.id)] = Node(
            key=site_key(site.id), kind="site", name=site.name, site_id=site.id,
            site_type=site.site_type, is_primary=bool(site.is_primary), location=site.location,
        )
    site_ids = {s.id for s in sites}
    check_in_by_id = {}
    for ci in check_ins:
        # A row pointing at a site that has since been removed counts as
        # having no site, rather than inventing a node for it.
        if ci.coverage_site_id is not None and ci.coverage_site_id not in site_ids:
            ci = CheckInIn(ci.id, ci.callsign, None)
        check_in_by_id[ci.id] = ci

    def node_for(check_in_id: int) -> Optional[Node]:
        ci = check_in_by_id.get(check_in_id)
        if ci is None:
            return None
        key = _node_key_for(ci)
        if key not in nodes:
            nodes[key] = Node(key=key, kind="station", name=ci.callsign.upper())
        node = nodes[key]
        if ci.callsign.upper() not in node.callsigns:
            node.callsigns.append(ci.callsign.upper())
        return node

    # Every operator at a site is listed on it, reporting or not.
    for ci in check_in_by_id.values():
        if ci.coverage_site_id is not None:
            node_for(ci.id)

    # ---- Directional links between nodes, per frequency ----
    heard: Set[Tuple[str, str, Optional[int]]] = set()
    for r in reports:
        if r.frequency_id in excluded_frequency_ids:
            continue
        a, b = node_for(r.reporter_check_in_id), node_for(r.heard_check_in_id)
        if a is None or b is None or a.key == b.key:
            # Two operators at one site hearing each other says nothing
            # about the site's reach.
            continue
        heard.add((a.key, b.key, r.frequency_id))

    links = []
    for (a, b, f) in sorted(heard, key=lambda t: (t[0], t[1], t[2] if t[2] is not None else -1)):
        links.append({"from_key": a, "to_key": b, "frequency_id": f, "two_way": (b, a, f) in heard})

    def two_way_freqs(a: str, b: str) -> List[Optional[int]]:
        return sorted({f for (x, y, f) in heard if x == a and y == b and (b, a, f) in heard},
                      key=lambda f: f if f is not None else -1)

    def one_way_freqs(a: str, b: str) -> List[Optional[int]]:
        out = {f for (x, y, f) in heard if x == a and y == b and (b, a, f) not in heard}
        out |= {f for (x, y, f) in heard if x == b and y == a and (a, b, f) not in heard}
        return sorted(out, key=lambda f: f if f is not None else -1)

    # ---- Reach: can each site get to each primary site? ----
    # Direct two-way is a working path. Failing that, a relay is any node
    # with a two-way path to both ends; the two legs may be on different
    # frequencies, since a relay site often has an HF and a VHF operator.
    # One relay hop only: past that, a drill wants a human looking at it.
    primaries = [n for n in nodes.values() if n.kind == "site" and n.is_primary]
    two_way_neighbors: Dict[str, Set[str]] = {}
    for (a, b, f) in heard:
        if (b, a, f) in heard:
            two_way_neighbors.setdefault(a, set()).add(b)
    reach = []
    for site in (n for n in nodes.values() if n.kind == "site"):
        targets = []
        for p in primaries:
            if p.key == site.key:
                continue
            tw = two_way_freqs(site.key, p.key)
            ow = one_way_freqs(site.key, p.key)
            relays = []
            if not tw:
                relays = sorted(
                    (two_way_neighbors.get(site.key, set()) & two_way_neighbors.get(p.key, set())) - {site.key, p.key}
                )
            if tw:
                status = "two_way"
            elif relays:
                status = "relay"
            elif ow:
                status = "one_way"
            else:
                status = "none"
            targets.append({
                "primary_key": p.key, "status": status,
                "two_way_frequency_ids": tw, "one_way_frequency_ids": ow, "relay_keys": relays,
            })
        reach.append({"site_key": site.key, "targets": targets})

    # ---- Contacts outside the net, and the counties they reached ----
    contact_rows = []
    counties: Dict[Tuple[str, str], dict] = {}
    for c in contacts:
        if c.frequency_id in excluded_frequency_ids:
            continue
        node = node_for(c.reporter_check_in_id)
        if node is None:
            continue
        reporter = check_in_by_id[c.reporter_check_in_id]
        contact_rows.append({
            "id": c.id, "from_key": node.key, "reporter_callsign": reporter.callsign.upper(),
            "frequency_id": c.frequency_id, "callsign": c.callsign, "station": c.station,
            "county": c.county, "state": c.state, "two_way": bool(c.two_way),
        })
        county = (c.county or "").strip()
        if not county:
            continue
        state = (c.state or "").strip()
        k = (county.lower(), state.lower())
        entry = counties.setdefault(k, {
            "county": county, "state": state or None, "from_keys": [], "frequency_ids": [], "two_way": False,
        })
        if node.key not in entry["from_keys"]:
            entry["from_keys"].append(node.key)
        if c.frequency_id not in entry["frequency_ids"]:
            entry["frequency_ids"].append(c.frequency_id)
        entry["two_way"] = entry["two_way"] or bool(c.two_way)

    # ---- Repeaters and nodes: did anyone at each node get in? ----
    # Reached if any operator there got in; failed if someone tried and
    # nobody did; absent if nobody tried. Every note is kept, with who wrote it.
    target_ids = {t.id for t in infrastructure}
    access_cells: Dict[Tuple[str, int], dict] = {}
    for a in access:
        if a.target_site_id not in target_ids:
            continue
        node = node_for(a.reporter_check_in_id)
        if node is None:
            continue
        cell = access_cells.setdefault((node.key, a.target_site_id), {
            "node_key": node.key, "target_site_id": a.target_site_id, "reached": False, "attempts": [],
        })
        cell["reached"] = cell["reached"] or bool(a.reached)
        cell["attempts"].append({
            "callsign": check_in_by_id[a.reporter_check_in_id].callsign.upper(),
            "reached": bool(a.reached), "note": (a.note or "").strip() or None,
        })

    # Sites in the manager's order first, then stations alphabetically.
    site_order = {site_key(s.id): i for i, s in enumerate(sites)}
    ordered = sorted(nodes.values(), key=lambda n: (0, site_order[n.key], "") if n.kind == "site" else (1, 0, n.name))

    return {
        "nodes": [
            {"key": n.key, "kind": n.kind, "name": n.name, "site_id": n.site_id, "site_type": n.site_type,
             "is_primary": n.is_primary, "location": n.location, "callsigns": n.callsigns}
            for n in ordered
        ],
        "links": links,
        "reach": reach,
        "contacts": contact_rows,
        "counties": sorted(counties.values(), key=lambda e: (e["state"] or "", e["county"])),
        "targets": [
            {"site_id": t.id, "name": t.name, "location": t.location,
             "frequency_id": (target_frequency_ids or {}).get(t.id)}
            for t in infrastructure
        ],
        "access": sorted(access_cells.values(), key=lambda c: (c["node_key"], c["target_site_id"])),
    }


async def load_site_coverage(db: AsyncSession, net) -> dict:
    """build_site_coverage() for one net, read from the database."""
    from app.models import CanHearReport, CheckIn, CoverageAccess, CoverageContact, CoverageSite

    sites = (await db.execute(
        select(CoverageSite).where(CoverageSite.net_id == net.id).order_by(CoverageSite.sort_order, CoverageSite.id)
    )).scalars().all()
    check_ins = (await db.execute(
        select(CheckIn.id, CheckIn.callsign, CheckIn.coverage_site_id).where(CheckIn.net_id == net.id)
    )).all()
    reports = (await db.execute(
        select(CanHearReport.reporter_check_in_id, CanHearReport.heard_check_in_id, CanHearReport.frequency_id)
        .where(CanHearReport.net_id == net.id)
    )).all()
    contacts = (await db.execute(
        select(CoverageContact).where(CoverageContact.net_id == net.id).order_by(CoverageContact.id)
    )).scalars().all()
    access = (await db.execute(
        select(CoverageAccess).where(CoverageAccess.net_id == net.id).order_by(CoverageAccess.id)
    )).scalars().all()

    return build_site_coverage(
        [SiteIn(s.id, s.name, s.location, s.site_type, bool(s.is_primary)) for s in sites],
        [CheckInIn(r.id, r.callsign, r.coverage_site_id) for r in check_ins],
        [ReportIn(r.reporter_check_in_id, r.heard_check_in_id, r.frequency_id) for r in reports],
        [ContactIn(c.id, c.reporter_check_in_id, c.frequency_id, c.callsign, c.station, c.county, c.state, bool(c.two_way))
         for c in contacts],
        parse_excluded_frequency_ids(net.coverage_excluded_frequency_ids),
        [AccessIn(a.reporter_check_in_id, a.target_site_id, bool(a.reached), a.note) for a in access],
        {s.id: s.frequency_id for s in sites},
    )


REACH_STATUS_LABELS = {
    "two_way": "Two-way",
    "relay": "Through a relay",
    "one_way": "One-way only",
    "none": "No path",
}


def describe_site_coverage(summary: dict, frequency_labels: Dict[int, str]) -> Optional[dict]:
    """The rollup as text rows for the closing email, or None when the net
    has neither sites nor outside contacts (an ordinary coverage net, whose
    station pairs the email already lists)."""
    has_sites = any(n["kind"] == "site" for n in summary["nodes"])
    if not has_sites and not summary["contacts"] and not summary["access"]:
        return None
    names = {n["key"]: n["name"] for n in summary["nodes"]}
    target_names = {t["site_id"]: t["name"] for t in summary["targets"]}

    def freq(fid: Optional[int]) -> str:
        if fid is None:
            return "No specific frequency"
        return frequency_labels.get(fid, "")

    def freqs(fids) -> str:
        return ", ".join(freq(f) for f in fids)

    # One line per pair of nodes, two-way frequencies first, then each
    # one-way direction ("A heard B") named.
    pairs: Dict[Tuple[str, str], dict] = {}
    for link in summary["links"]:
        a, b = sorted((link["from_key"], link["to_key"]))
        entry = pairs.setdefault((a, b), {"two_way": [], "one_way": []})
        if link["two_way"]:
            if link["frequency_id"] not in entry["two_way"]:
                entry["two_way"].append(link["frequency_id"])
        else:
            entry["one_way"].append(f'{names[link["from_key"]]} heard {names[link["to_key"]]} on {freq(link["frequency_id"])}')
    pair_rows = []
    for (a, b), entry in pairs.items():
        parts = []
        if entry["two_way"]:
            parts.append(f'Two-way on {freqs(entry["two_way"])}')
        parts.extend(entry["one_way"])
        pair_rows.append({"label": f"{names[a]} ↔ {names[b]}", "detail": "; ".join(parts)})

    reach_rows = []
    for row in summary["reach"]:
        for t in row["targets"]:
            if t["status"] == "two_way":
                detail = f'Two-way on {freqs(t["two_way_frequency_ids"])}'
            elif t["status"] == "relay":
                detail = "Through " + ", ".join(names[k] for k in t["relay_keys"])
            elif t["status"] == "one_way":
                detail = f'One-way only, on {freqs(t["one_way_frequency_ids"])}'
            else:
                detail = "No path reported"
            reach_rows.append({
                "site": names[row["site_key"]], "primary": names[t["primary_key"]],
                "status": REACH_STATUS_LABELS[t["status"]], "detail": detail,
            })

    contact_rows = [{
        "from": names[c["from_key"]],
        "station": " ".join(p for p in (c["callsign"], c["station"]) if p),
        "where": ", ".join(p for p in (c["county"], c["state"]) if p),
        "frequency": freq(c["frequency_id"]),
        "direction": "Two-way" if c["two_way"] else "Heard only",
    } for c in summary["contacts"]]

    county_rows = [{
        "county": ", ".join(p for p in (c["county"], c["state"]) if p),
        "from": ", ".join(names[k] for k in c["from_keys"]),
        "frequencies": freqs(c["frequency_ids"]),
    } for c in summary["counties"]]

    access_rows = [{
        "from": names[c["node_key"]],
        "target": target_names[c["target_site_id"]],
        "result": "Reached" if c["reached"] else "Couldn't reach",
        "notes": "; ".join(f'{a["callsign"]}: {a["note"]}' for a in c["attempts"] if a["note"]),
    } for c in summary["access"]]

    return {"pairs": pair_rows, "reach": reach_rows, "contacts": contact_rows, "counties": county_rows,
            "access": access_rows}
