"""The check-in fields a net's log shows, for every export and email.

Each export used to type out its own list of fields. Feedback and the
admin-defined fields (FLDIGI, Digital, ...) were left off most of them, so
a net that collected them never saw them in its closing email, and the CSV
export had no column for a custom field at all (Ken N1KWG's net, 2026-10-29).
The CSV export, the closing email's table and its CSV, and the ICS-309
email's check-in CSV all read from here now. The app's report does the same
from frontend/src/utils/checkInFields.ts.

A field gets a column when the net has it turned on and at least one
check-in filled it in, so a log never carries a column that is empty all the
way down. Relayed By is the exception to "turned on", as in the app: it shows
whenever a check-in carries one.
"""
import json
from dataclasses import dataclass
from typing import Iterable, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FieldDefinition
from app.services.field_labels import DEFAULT_FIELD_LABELS
from app.utils import GUEST_REDACTED_CHECK_IN_FIELDS, redact_contact_info

@dataclass(frozen=True)
class LogField:
    name: str
    label: str
    custom: bool = False
    checkbox: bool = False


def format_frequency(freq) -> str:
    """A frequency as the logs print it: "146.520 FM" or "BM TG3123"."""
    if freq is None:
        return ""
    if freq.frequency:
        return f"{freq.frequency} {freq.mode or ''}".strip()
    if freq.network:
        return f"{freq.network} TG{freq.talkgroup or ''}"
    return ""


async def load_field_definitions(db: AsyncSession) -> List[FieldDefinition]:
    """Every field the admin hasn't archived, in the admin's order."""
    return list((await db.execute(
        select(FieldDefinition)
        .where(FieldDefinition.is_archived == False)  # noqa: E712
        .order_by(FieldDefinition.sort_order, FieldDefinition.id)
    )).scalars().all())


def _parse_config(field_config) -> dict:
    if isinstance(field_config, str):
        try:
            return json.loads(field_config) or {}
        except (json.JSONDecodeError, TypeError):
            return {}
    return field_config or {}


def _custom_values(check_in) -> dict:
    raw = getattr(check_in, "custom_fields", None)
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw) if raw else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _raw_value(check_in, field: LogField):
    if field.custom:
        return _custom_values(check_in).get(field.name)
    return getattr(check_in, field.name, None)


def field_value(check_in, field: LogField, redact: bool = False) -> str:
    """What a log prints for *field* on *check_in*. A ticked checkbox reads
    Yes and an unticked one is blank. *redact* scrubs contact details from
    free text for a guest, as the check-in list does
    (schemas.CheckInResponse.from_orm)."""
    value = _raw_value(check_in, field)
    if field.checkbox:
        return "Yes" if str(value).lower() == "true" else ""
    if value is None:
        return ""
    value = str(value)
    if redact and (field.custom or field.name in GUEST_REDACTED_CHECK_IN_FIELDS):
        value = redact_contact_info(value) or ""
    return value


def net_log_fields(
    field_config,
    definitions: Iterable[FieldDefinition],
    check_ins: Iterable,
    *,
    custom_only: bool = False,
) -> List[LogField]:
    """The fields the net turned on that at least one check-in filled in, in
    the admin's order with the admin's labels. A net with no field_config
    counts every built-in field as turned on.

    *custom_only* limits the list to admin-defined fields, for the CSV
    export, whose built-in columns are fixed for the CSV import."""
    config = _parse_config(field_config)
    check_ins = list(check_ins)
    definitions = list(definitions)
    # The admin's rows, plus any built-in field a fresh site hasn't seeded
    # yet (routers/settings.py::ensure_builtin_fields), in sort order.
    from app.routers.settings import BUILTIN_FIELDS
    entries = [
        (d.sort_order or 0, LogField(
            name=d.name,
            label=d.label or DEFAULT_FIELD_LABELS.get(d.name, d.name),
            custom=not d.is_builtin,
            checkbox=d.field_type == "checkbox",
        ))
        for d in definitions
    ]
    seeded = {d.name for d in definitions}
    entries += [
        (b["sort_order"], LogField(b["name"], b["label"]))
        for b in BUILTIN_FIELDS if b["name"] not in seeded
    ]
    candidates = [field for _, field in sorted(entries, key=lambda e: e[0])]

    def turned_on(field: LogField) -> bool:
        if field.name == "relayed_by":
            return True
        if not config:
            return not field.custom
        return bool((config.get(field.name) or {}).get("enabled"))

    shown = []
    for field in candidates:
        if custom_only and not field.custom:
            continue
        if not turned_on(field):
            continue
        if any(field_value(ci, field) for ci in check_ins):
            shown.append(field)
    return shown


def checked_in_frequency(check_in, freq_map: dict) -> str:
    """The frequency a station checked in on, from the net's own list."""
    return format_frequency(freq_map.get(check_in.frequency_id)) if check_in.frequency_id else ""


def available_frequencies(check_in, freq_map: dict) -> str:
    """The frequencies a station said it can reach, comma-separated."""
    if not check_in.available_frequencies:
        return ""
    try:
        ids = json.loads(check_in.available_frequencies) if isinstance(check_in.available_frequencies, str) else check_in.available_frequencies
    except (json.JSONDecodeError, TypeError):
        return ""
    return ", ".join(format_frequency(freq_map[fid]) for fid in ids or [] if fid in freq_map)
