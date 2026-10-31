"""A net's ICS-214 Activity Log, rendered from what was logged.

The ICS-214 records what a unit did: "notable activities", the reference
for an after-action report (FEMA ICS 214 instructions). It is written from
what happened, never generated from a roster, a plan or an assignment
(docs/ROADMAP.md, "Do not manufacture entries"), so every line here comes
from a logged event:

- the net opening and closing
- a station first on the air from a place, and each move to a new one
- a station adding a channel at a place (a routine recheck on a channel it
  already had is left out)
- a channel marked offline and back online (StationChannelMark)
- a station checking out, unless it moved or the net closed at that moment
- someone taking net control, logging or relay, if they took part
- each traffic hop (metadata only, as on the ICS-309)
- lines net control wrote by hand (ActivityEntry)

Wording says "on the air from", never "arrived": a check-in proves the
station was on the air from there, not when it got there (Brad, 2026-10-30).

Block 6, Resources Assigned, is everyone who took part, In person included.

Net control can hide or reword any line or resource (Ics214Form); the
edits are keyed by each line's `key`, which stays the same however often
the form is rendered. Pure functions over plain values
(tests/test_ics214.py); routers/ics214.py loads the data.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, Iterable, List, Optional

from app.services.station_place import place_label
from app.services.station_rows import group_station_rows

# A check-out this close to a move or the net's close is that move or close,
# not a station leaving on its own.
SAME_MOMENT = timedelta(seconds=90)

ROLE_POSITIONS = {"NCS": "Net Control", "LOGGER": "Logger", "RELAY": "Relay"}
ROLE_TAKEN = {"NCS": "took net control", "LOGGER": "took over logging", "RELAY": "took relay"}


def _aware(at: Optional[datetime]) -> Optional[datetime]:
    if at is None:
        return None
    return at if at.tzinfo else at.replace(tzinfo=timezone.utc)


def _status(row) -> str:
    return (getattr(row.status, "value", row.status) or "").lower()


def _line(key: str, at: Optional[datetime], text: str, kind: str, **extra) -> dict:
    return {"key": key, "at": _aware(at), "text": text, "kind": kind, **extra}


def build_activity_lines(
    *,
    net,
    rows: Iterable,
    marks: Iterable = (),
    roles: Iterable = (),
    traffic: Iterable = (),
    entries: Iterable = (),
    site_names: Dict[int, str],
    channel: Callable[[Optional[int]], Optional[str]],
    role_callsign: Callable[[object], Optional[str]],
    traffic_text: Callable[[object], str],
) -> List[dict]:
    """Every block 7 line, oldest first, lines with no recorded time last.

    `rows` are CheckIn-shaped, `marks` StationChannelMark-shaped, `roles`
    NetRole-shaped (user_id, role, assigned_at), `traffic` TrafficLogEntry-
    shaped (id, occurred_at), `entries` ActivityEntry-shaped. `channel`
    names a frequency id, `role_callsign` gives a role's callsign, and
    `traffic_text` the traffic hop's one line."""
    rows = list(rows)
    started, closed = _aware(net.started_at), _aware(net.closed_at)
    lines: List[dict] = []

    if started:
        on = ", ".join(c for c in (channel(f.id) for f in getattr(net, "frequencies", []) or []) if c)
        lines.append(_line("net:open", started, f"Net opened on {on}" if on else "Net opened", "net"))
    if closed:
        lines.append(_line("net:close", closed, "Net closed", "net"))

    groups = group_station_rows(rows, marks)
    place_of: Dict[str, Optional[str]] = {}
    for group in groups:
        first = group["rows"][0]
        place_of[group["key"]] = place_label(first.coverage_site_id, first.operating_position, first.status, site_names)

    # A station's places in the order it was on the air from them
    by_callsign: Dict[str, List[dict]] = {}
    for group in groups:
        by_callsign.setdefault(group["row"].callsign.upper(), []).append(group)

    for callsign, station_groups in by_callsign.items():
        for i, group in enumerate(station_groups):
            members = group["rows"]
            first = members[0]
            place = place_of[group["key"]]
            at = None if first.time_not_recorded else first.checked_in_at
            on = channel(first.frequency_id)
            in_person = bool(getattr(first, "in_person", False)) or _status(first) == "in_person"
            if in_person:
                text = f"{callsign} checked in in person" + (f" at {place}" if place else "")
            elif place == "Traveling":
                text = f"{callsign} on the air while traveling"
            elif place:
                text = f"{callsign} on the air from {place}"
            else:
                text = f"{callsign} checked in"
            if on and not in_person:
                text += f" on {on}"
            previous = place_of[station_groups[i - 1]["key"]] if i > 0 else None
            if previous and previous != place:
                text += f" (moved from {previous})"
            lines.append(_line(f"station:{first.id}", at, text, "station", callsign=callsign))

            # A channel the station hadn't had at this place
            seen = {first.frequency_id}
            for row in members[1:]:
                if row.frequency_id is None or row.frequency_id in seen:
                    continue
                seen.add(row.frequency_id)
                name = channel(row.frequency_id)
                if not name:
                    continue
                where = f" at {place}" if place else ""
                lines.append(_line(
                    f"channel:{row.id}", None if row.time_not_recorded else row.checked_in_at,
                    f"{callsign}{where} now also on {name}", "station", callsign=callsign,
                ))

            # Checked out of here on its own, not by moving or the net closing
            outs = [_aware(r.checked_out_at) for r in members]
            if any(_status(r) != "checked_out" or o is None for r, o in zip(members, outs)):
                continue
            out = max(outs)
            # On the air from somewhere new means it left here, whatever this
            # place's rows say: a check-out stamped after that (net 137's
            # W1MTW, before update_check_in stopped restamping) is not a
            # second departure.
            following = station_groups[i + 1]["rows"][0] if i + 1 < len(station_groups) else None
            if following is not None and _aware(following.checked_in_at) <= out + SAME_MOMENT:
                continue
            if closed and abs(closed - out) <= SAME_MOMENT:
                continue
            lines.append(_line(
                f"out:{members[-1].id}", out,
                f"{callsign} checked out" + (f" of {place}" if place and place != "Traveling" else ""),
                "station", callsign=callsign,
            ))

    for mark in marks:
        callsign = mark.station_key.split("|", 1)[0]
        place = place_of.get(mark.station_key)
        name = channel(mark.frequency_id) or "a channel"
        where = f" at {place}" if place else ""
        lines.append(_line(f"mark:{mark.id}:off", mark.offline_at, f"{callsign}{where}: {name} offline", "channel"))
        if mark.restored_at is not None:
            lines.append(_line(f"mark:{mark.id}:on", mark.restored_at, f"{callsign}{where}: {name} back online", "channel"))

    # Only someone who took part: a rotation pick who never turned up ran
    # nothing (services/ncs_attribution.py).
    took_part = {r.user_id for r in rows if r.user_id is not None} | {
        r.checked_in_by_id for r in rows if r.checked_in_by_id is not None
    }
    for role in roles:
        name = (role.role or "").upper()
        if name not in ROLE_TAKEN or role.user_id not in took_part:
            continue
        callsign = role_callsign(role)
        if not callsign:
            continue
        at = _aware(role.assigned_at)
        # Assigned ahead of time and ran it from the start
        if started and (at is None or at < started):
            at = started
        lines.append(_line(f"role:{role.id}", at, f"{callsign} {ROLE_TAKEN[name]}", "role"))

    for hop in traffic:
        lines.append(_line(f"traffic:{hop.id}", hop.occurred_at, traffic_text(hop), "traffic"))

    for entry in entries:
        lines.append(_line(f"entry:{entry.id}", entry.occurred_at, entry.text, "entry", entry_id=entry.id))

    far = datetime.max.replace(tzinfo=timezone.utc)
    order = {"net": 0, "role": 1, "station": 2, "channel": 3, "traffic": 4, "entry": 5}
    lines.sort(key=lambda l: (l["at"] is None, l["at"] or far, l["key"] == "net:close", order[l["kind"]]))
    return lines


def build_resources(rows: Iterable, roles: Iterable = ()) -> List[dict]:
    """Block 6: one entry per callsign that took part, in the order each
    first checked in, with its name from its newest check-in and its ICS
    position from the roles its account actively held."""
    rows = sorted(rows, key=lambda r: (_aware(r.checked_in_at), r.id))
    held: Dict[int, List[str]] = {}
    for role in roles:
        name = (role.role or "").upper()
        if name in ROLE_POSITIONS and getattr(role, "is_active", True) and role.user_id is not None:
            held.setdefault(role.user_id, [])
            if ROLE_POSITIONS[name] not in held[role.user_id]:
                held[role.user_id].append(ROLE_POSITIONS[name])
    out: Dict[str, dict] = {}
    for row in rows:
        callsign = row.callsign.upper()
        entry = out.setdefault(callsign, {"key": callsign, "callsign": callsign, "name": "", "positions": []})
        if (row.name or "").strip():
            entry["name"] = row.name.strip()
        for position in held.get(row.user_id, []) if row.user_id is not None else []:
            if position not in entry["positions"]:
                entry["positions"].append(position)
    return [
        {"key": e["key"], "callsign": e["callsign"], "name": e["name"], "position": ", ".join(e["positions"])}
        for e in out.values()
    ]


def apply_line_edits(lines: List[dict], edits: Dict[str, dict]) -> List[dict]:
    """Each line with default_text, text (reworded or not) and hidden."""
    out = []
    for line in lines:
        edit = edits.get(line["key"]) or {}
        text = (edit.get("text") or "").strip() if line["kind"] != "entry" else ""
        out.append({**line, "default_text": line["text"], "text": text or line["text"],
                    "hidden": bool(edit.get("hidden"))})
    return out


def apply_resource_edits(resources: List[dict], edits: Dict[str, dict]) -> List[dict]:
    out = []
    for resource in resources:
        edit = edits.get(resource["key"]) or {}
        out.append({
            **resource,
            "default_name": resource["name"],
            "default_position": resource["position"],
            "name": edit.get("name") if edit.get("name") is not None else resource["name"],
            "position": edit.get("position") if edit.get("position") is not None else resource["position"],
            "agency": edit.get("agency") or "",
            "hidden": bool(edit.get("hidden")),
        })
    return out
