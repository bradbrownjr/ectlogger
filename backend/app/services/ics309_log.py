"""
The rows of a net's ICS-309 Communications Log, built in one place.

Used by the ICS-309 export (routers/nets_export.py::_build_ics309_data, which
also feeds the PDF) and by the ICS-309 closing email
(services/net_closure.py). Until 2026-10-22 each built its own copy of these
rows from the same data, so a row source added to one could be missed by the
other.

Rows are {time, from_station, to_station, message} dicts, sorted by time.
Sources, each with its own rule:
  - check-ins, never one checked in In person (CheckIn.in_person): the
    ICS-309 logs radio traffic, and an in-person station had no radio
  - chat messages, never system messages, and never a net-muted station's
    when the net hides them (Net.ics309_hide_muted_stations)
  - traffic hops logged on this net, metadata only (app/traffic/ics309.py)
  - accepted off-net log entries (models.OffNetLogEntry)
"""
from __future__ import annotations

from typing import Iterable, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OffNetLogEntry
from app.traffic.ics309 import (
    format_traffic_ics309_message,
    traffic_from_station,
    traffic_to_station,
)
from app.utils import check_in_time_for_net, format_time_for_net, redact_contact_info, to_display_tz


async def get_accepted_off_net_entries(db: AsyncSession, net_id: int) -> List[OffNetLogEntry]:
    """The off-net entries that belong on this net's ICS-309. A station's own
    entry is left off until net control accepts it."""
    return list((await db.execute(
        select(OffNetLogEntry)
        .where(OffNetLogEntry.net_id == net_id, OffNetLogEntry.status == "accepted")
        .order_by(OffNetLogEntry.occurred_at)
    )).scalars().all())


def off_net_ics309_message(entry: OffNetLogEntry) -> str:
    """'Off-net via DMR TG 3123: Checked in (msg ID 8F3K2LQ7XN1P)'."""
    via = f"Off-net via {entry.channel}" if entry.channel else "Off-net"
    text = f"{via}: {entry.message}"
    if entry.message_id:
        text += f" (msg ID {entry.message_id})"
    return text


def build_ics309_rows(
    *,
    check_ins: Iterable,
    chat_messages: Iterable,
    traffic_entries: Iterable = (),
    off_net_entries: Iterable = (),
    muted_user_ids: Optional[set] = None,
    tz=None,
    started_at=None,
    closed_at=None,
    redact: bool = False,
) -> List[dict]:
    """Every ICS-309 row for one net, in the viewer's timezone.

    started_at/closed_at are the net's times already in *tz* (they decide
    whether a time needs its date shown, see format_time_for_net). redact
    scrubs email addresses and phone numbers from free text, for a guest's
    copy. Callers decide which traffic hops and off-net entries a viewer may
    see and pass only those."""
    muted_user_ids = muted_user_ids or set()

    def when(value) -> str:
        return format_time_for_net(to_display_tz(value, tz), started_at, closed_at)

    def scrub(text):
        return redact_contact_info(text) if redact and text else text

    rows = []
    for check_in in sorted(check_ins, key=lambda c: c.checked_in_at):
        if getattr(check_in, 'in_person', False):
            continue
        location = scrub(check_in.location)
        weather = scrub(check_in.weather_observation)
        location_info = f" from {location}" if location else ""
        weather_info = f" | WX: {weather}" if weather else ""
        rows.append({
            'time': check_in_time_for_net(check_in, tz, started_at, closed_at),
            'from_station': check_in.callsign,
            'to_station': 'NET',
            'message': f"Check-in{location_info}{weather_info}",
        })

    for msg in chat_messages:
        if msg.user_id is not None and msg.user_id in muted_user_ids:
            continue
        callsign = msg.user.callsign if msg.user and msg.user.callsign else ('System' if msg.is_system else 'Unknown')
        if callsign == 'System':
            continue
        rows.append({
            'time': when(msg.created_at),
            'from_station': callsign,
            'to_station': 'NET',
            'message': scrub(msg.message),
        })

    for entry in traffic_entries:
        rows.append({
            'time': when(entry.occurred_at),
            'from_station': traffic_from_station(entry.form, entry),
            'to_station': traffic_to_station(entry),
            'message': format_traffic_ics309_message(entry.form, entry),
        })

    for entry in off_net_entries:
        rows.append({
            'time': when(entry.occurred_at),
            'from_station': entry.from_station,
            'to_station': entry.to_station,
            'message': scrub(off_net_ics309_message(entry)),
        })

    # A row with no time recorded (a station added to a held log) goes last.
    rows.sort(key=lambda x: (not x.get('time'), x.get('time', '')))
    return rows
