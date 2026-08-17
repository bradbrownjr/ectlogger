"""
The chain-of-custody log: the single writer of Form.held_by_user_id,
Form.held_since, and Form.last_action, plus the pure disposition-derivation
function those cached columns exist to avoid a join for. See
TRAFFIC-HANDLING-DESIGN.md D7 and section 2.5 (the inbox membership rules)
and R2/R10 (the denormalization safety properties and the sequence race).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable, Optional, Union

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Form, FormDisposition, RelayMethod, TrafficAction, TrafficLogEntry

# Stage C's reminder service (TRAFFIC-HANDLING-DESIGN.md D4) will replace this
# fixed threshold with the real precedence-scaled staleness ladder. Until that
# lands, "outstanding" on the per-net summary is a simple placeholder: a
# pending form held 24+ hours by its current holder.
_STALE_THRESHOLD = timedelta(hours=24)


def derive_disposition(form_or_entries: Union[Form, Iterable[TrafficLogEntry]]) -> FormDisposition:
    """Pure function: the disposition implied by a form's log, never stored."""
    entries = form_or_entries.log_entries if isinstance(form_or_entries, Form) else form_or_entries
    entries = sorted(entries, key=lambda e: e.sequence)

    non_serviced = [e for e in entries if e.action != TrafficAction.SERVICED]
    if not non_serviced:
        return FormDisposition.DRAFT

    last = non_serviced[-1]
    if last.action in (TrafficAction.ORIGINATED, TrafficAction.RECEIVED):
        return FormDisposition.PENDING
    if last.action == TrafficAction.RELAYED:
        return FormDisposition.RELAYED
    if last.action == TrafficAction.DELIVERED:
        return FormDisposition.DELIVERED
    if last.action == TrafficAction.CANCELLED:
        return FormDisposition.CANCELLED
    return FormDisposition.DRAFT


def _apply_cache_update(form: Form, action: TrafficAction, occurred_at: datetime,
                          reported_by_user_id: Optional[int], handed_to_user_id: Optional[int]) -> None:
    """Update the three cached columns for a single newly-appended entry.

    SERVICED is an annotation only (D7) and touches nothing. See section 2.5
    for the RECEIVED/RELAYED/DELIVERED/CANCELLED inbox-membership rules.
    """
    if action in (TrafficAction.ORIGINATED, TrafficAction.RECEIVED):
        form.held_by_user_id = reported_by_user_id
        form.held_since = occurred_at
        form.last_action = action
    elif action == TrafficAction.RELAYED:
        form.held_by_user_id = handed_to_user_id
        form.held_since = occurred_at if handed_to_user_id else None
        form.last_action = action
    elif action in (TrafficAction.DELIVERED, TrafficAction.CANCELLED):
        form.held_by_user_id = None
        form.held_since = None
        form.last_action = action
    # SERVICED: no-op.


async def _next_sequence(db: AsyncSession, form_id: int) -> int:
    result = await db.execute(
        select(func.max(TrafficLogEntry.sequence)).where(TrafficLogEntry.form_id == form_id)
    )
    return (result.scalar() or 0) + 1


async def append_entry(
    db: AsyncSession,
    form: Form,
    action: TrafficAction,
    *,
    method: Optional[RelayMethod] = None,
    method_note: Optional[str] = None,
    path_name: Optional[str] = None,
    handed_to: Optional[str] = None,
    handed_to_user_id: Optional[int] = None,
    handled_by: Optional[str] = None,
    reported_by_user_id: Optional[int] = None,
    net_id: Optional[int] = None,
    note: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> TrafficLogEntry:
    """Append one hop to *form*'s chain of custody and update the cached
    held_by_user_id/held_since/last_action columns in the same transaction.

    Retries once on a sequence collision (R10: two operators appending to the
    same form concurrently can compute the same next sequence; the
    UniqueConstraint turns that into an IntegrityError rather than a
    corrupted chain).
    """
    if occurred_at is None:
        occurred_at = datetime.utcnow()

    for attempt in range(2):
        sequence = await _next_sequence(db, form.id)
        entry = TrafficLogEntry(
            form_id=form.id,
            sequence=sequence,
            action=action,
            method=method,
            method_note=method_note,
            path_name=path_name,
            handed_to=handed_to,
            handed_to_user_id=handed_to_user_id,
            handled_by=handled_by,
            reported_by_user_id=reported_by_user_id,
            net_id=net_id,
            note=note,
            occurred_at=occurred_at,
        )
        db.add(entry)
        _apply_cache_update(form, action, occurred_at, reported_by_user_id, handed_to_user_id)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            if attempt == 1:
                raise
            continue
        else:
            await db.refresh(entry)
            return entry


async def recompute_form_cache(db: AsyncSession, form: Form) -> None:
    """Rebuild held_by_user_id/held_since/last_action from the full log.

    The cached columns have exactly one writer (append_entry above), but this
    rebuild proves the cache is always reconstructible from the log alone
    (R2) and can serve as a repair tool if the cache and the log ever drift.
    """
    result = await db.execute(
        select(TrafficLogEntry).where(TrafficLogEntry.form_id == form.id).order_by(TrafficLogEntry.sequence)
    )
    entries = result.scalars().all()

    non_serviced = [e for e in entries if e.action != TrafficAction.SERVICED]
    last = non_serviced[-1] if non_serviced else None

    if last is None:
        form.held_by_user_id = None
        form.held_since = None
        form.last_action = None
    elif last.action in (TrafficAction.ORIGINATED, TrafficAction.RECEIVED):
        form.held_by_user_id = last.reported_by_user_id
        form.held_since = last.occurred_at
        form.last_action = last.action
    elif last.action == TrafficAction.RELAYED:
        form.held_by_user_id = last.handed_to_user_id
        form.held_since = last.occurred_at if last.handed_to_user_id else None
        form.last_action = last.action
    else:  # DELIVERED, CANCELLED
        form.held_by_user_id = None
        form.held_since = None
        form.last_action = last.action

    await db.commit()


def disposition_filter_clause(disposition: FormDisposition):
    """Translate a derived FormDisposition into a filter on the cached
    Form.last_action column. Correct because last_action is always the most
    recent *non-SERVICED* action (see _apply_cache_update above), which is
    exactly what derive_disposition inspects.

    Shared by routers/traffic_forms.py::get_net_traffic_summary and
    compute_net_traffic_counts below, so the disposition->filter mapping
    lives in exactly one place.
    """
    if disposition == FormDisposition.DRAFT:
        return Form.last_action.is_(None)
    if disposition == FormDisposition.PENDING:
        return Form.last_action.in_([TrafficAction.ORIGINATED, TrafficAction.RECEIVED])
    if disposition == FormDisposition.RELAYED:
        return Form.last_action == TrafficAction.RELAYED
    if disposition == FormDisposition.DELIVERED:
        return Form.last_action == TrafficAction.DELIVERED
    if disposition == FormDisposition.CANCELLED:
        return Form.last_action == TrafficAction.CANCELLED
    return None


async def compute_net_traffic_counts(db: AsyncSession, net_id: int) -> dict:
    """Counts by derived disposition for *net_id*, plus the outstanding/stale
    placeholder count. Returns a plain dict (not a schema) so this can be
    called from both an API router (routers/traffic_forms.py::
    get_net_traffic_summary) and a background/service context (routers/
    nets_core.py::close_net's net-close summary email) without a router
    depending on another router, and without the net-close summary
    reimplementing this query -- see TRAFFIC-HANDLING-DESIGN.md section 3.5.
    """
    counts: dict[FormDisposition, int] = {}
    for disposition in FormDisposition:
        clause = disposition_filter_clause(disposition)
        count_query = select(func.count()).select_from(Form).where(Form.net_id == net_id, clause)
        counts[disposition] = (await db.execute(count_query)).scalar() or 0

    stale_cutoff = datetime.utcnow() - _STALE_THRESHOLD
    outstanding_query = select(func.count()).select_from(Form).where(
        Form.net_id == net_id,
        disposition_filter_clause(FormDisposition.PENDING),
        Form.held_since.isnot(None),
        Form.held_since <= stale_cutoff,
    )
    outstanding = (await db.execute(outstanding_query)).scalar() or 0

    return {
        "net_id": net_id,
        "draft": counts[FormDisposition.DRAFT],
        "pending": counts[FormDisposition.PENDING],
        "relayed": counts[FormDisposition.RELAYED],
        "delivered": counts[FormDisposition.DELIVERED],
        "cancelled": counts[FormDisposition.CANCELLED],
        "outstanding": outstanding,
    }
