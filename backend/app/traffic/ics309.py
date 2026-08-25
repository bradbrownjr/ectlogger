"""
Traffic-row integration for the ICS-309 Communications Log.

Builds metadata-only rows from traffic_log_entries for a net's ICS-309
export (routers/nets_export.py::export_net_ics309) and the ICS-309 close
email (app/email/net_logs.py::send_ics309_log). Both consumers append these
rows to the same TIME/FROM/TO/SUBJECT-MESSAGE shape already used for
check-ins and chat messages.

Hard privacy rule (TRAFFIC-HANDLING-DESIGN.md D3's "ICS-309 consequence"):
the message body (Form.field_values / Form.normalized_text) must NEVER
appear here, in any form. Only promoted, non-content columns are read:
message_number, precedence, handling, form_type, addressee_display,
station_of_origin, plus the log entry's own action/path_name/handed_to.
"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Form, TrafficAction, TrafficLogEntry
from app.traffic.log import not_demo_clause
from app.utils import display_callsign

_ACTION_VERBS = {
    TrafficAction.ORIGINATED: "originated",
    TrafficAction.RECEIVED: "received",
    TrafficAction.RELAYED: "relayed",
    TrafficAction.DELIVERED: "delivered",
    TrafficAction.SERVICED: "serviced",
    TrafficAction.CANCELLED: "cancelled",
}


async def get_net_traffic_log_entries(db: AsyncSession, net_id: int) -> List[TrafficLogEntry]:
    """Every traffic_log_entries row whose *own* net_id matches -- the hop
    happened during this net's session, regardless of which net the Form
    itself was filed on (see TRAFFIC-HANDLING-DESIGN.md R4: a message
    received on net A and relayed on net B is a fact about both nets).
    Eager-loads the parent Form (promoted columns only are ever read from
    it) and the reporting user, for the FROM column.

    Excludes DEMO-labeled forms -- throwaway test data with no place in a
    communications log. DRILL forms are deliberately included; a drill is
    meant to fully simulate real traffic, ICS-309 row and all."""
    result = await db.execute(
        select(TrafficLogEntry)
        .join(Form, TrafficLogEntry.form_id == Form.id)
        .options(
            selectinload(TrafficLogEntry.form),
            selectinload(TrafficLogEntry.reported_by),
        )
        .where(TrafficLogEntry.net_id == net_id, not_demo_clause())
        .order_by(TrafficLogEntry.occurred_at)
    )
    return list(result.scalars().all())


def traffic_from_station(form: Form, entry: TrafficLogEntry) -> str:
    """The station that took this action. For the first hop (sequence 1,
    ORIGINATED/RECEIVED) that's the form's station_of_origin -- the message
    may have been logged by an NCS or logger on behalf of that station. For
    every later hop it's whoever reported the entry (they are the one who
    relayed/delivered/serviced/cancelled it)."""
    if entry.sequence == 1 and form.station_of_origin:
        return form.station_of_origin
    reported_by_callsign = display_callsign(entry.reported_by) if entry.reported_by else None
    return reported_by_callsign or form.station_of_origin or "Unknown"


def traffic_to_station(entry: TrafficLogEntry) -> str:
    """Free-text handed_to when known, otherwise NET -- matching the
    fallback already used for check-ins and chat rows in this same log."""
    return entry.handed_to or "NET"


def format_traffic_ics309_message(form: Form, entry: TrafficLogEntry) -> str:
    """One-line ICS-309 SUBJECT/MESSAGE summary built entirely from promoted
    Form columns and the log entry's action/path -- e.g. "Radiogram NR 21 R
    for PORTLAND ME -- relayed to Pine Tree Net". NEVER reads
    Form.field_values or Form.normalized_text (the message body); see this
    module's docstring and TRAFFIC-HANDLING-DESIGN.md D3.
    """
    title = (form.form_type or "Traffic").replace("_", " ").title()
    parts = [title]
    if form.message_number:
        parts.append(f"NR {form.message_number}")
    if form.precedence:
        parts.append(form.precedence)
    summary = " ".join(parts)
    if form.addressee_display:
        summary += f" for {form.addressee_display}"

    verb = _ACTION_VERBS.get(entry.action, entry.action.value if hasattr(entry.action, "value") else str(entry.action))
    suffix = f" — {verb}"
    if entry.path_name:
        suffix += f" via {entry.path_name}"
    elif entry.handed_to:
        suffix += f" to {entry.handed_to}"
    return summary + suffix
