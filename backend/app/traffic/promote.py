"""
Computes Form's promoted columns (see TRAFFIC-HANDLING-DESIGN.md D2) from a
FormDefinition's field schema and a submitted field_values dict. Used by
routers/traffic_forms.py on create and on edit (while still a draft).

This is deliberately a lightweight, name-convention-based promotion, not the
full nts_radiogram formatter (app/traffic/radiogram.py, a later phase per the
design doc's phased build plan). It only computes what the list/search
columns need: subject, addressee_display, message_number, precedence,
handling, station_of_origin, check_count, check_stated, normalized_text.
"""
from __future__ import annotations

from typing import Optional, Tuple

from app.models import FormDefinition
from app.traffic.nts_text import normalize_and_count
from app.traffic.rri_strip import format_rri_strip, format_rri_strip_raw


class _FieldValuesOnly:
    """Minimal form_type/field_values/definition shim for format_rri_strip(_raw),
    which only ever reads those three attributes -- unlike format_nts_radiogram/
    format_ics213, which read other promoted columns (message_number,
    precedence, filed_at, ...) that don't exist yet at this point in the
    create/edit flow. Scoping the below to just the rri_strip output formats
    avoids that chicken-and-egg problem rather than trying to generalize to
    every formatter. `definition` is the real FormDefinition already passed
    into compute_promoted_fields (no extra query) -- format_rri_strip's
    dynamic-type fallback reads its `.fields` for a form_type outside
    _STRIP_SPECS."""

    def __init__(self, form_type: str, field_values: dict, definition: FormDefinition):
        self.form_type = form_type
        self.field_values = field_values
        self.definition = definition


def compute_promoted_fields(definition: FormDefinition, field_values: dict) -> Tuple[dict, dict]:
    """Return (promoted_columns, updated_field_values).

    updated_field_values differs from the input when any field is marked
    nts_normalize=True: the field's value is replaced with its normalized
    text and the original operator-typed text is preserved under
    "{name}_raw", per D2's "text_raw" convention.
    """
    values = dict(field_values)

    check_count: Optional[int] = None
    check_stated: Optional[int] = None
    normalized_text: Optional[str] = None

    for field in definition.fields:
        if field.nts_normalize and values.get(field.name):
            raw = str(values[field.name])
            normalized, computed_check = normalize_and_count(raw)
            values[f"{field.name}_raw"] = raw
            values[field.name] = normalized
            normalized_text = normalized
            check_count = computed_check

    message_number = values.get("number") or values.get("message_number")
    station_of_origin = values.get("station_of_origin")
    handling = values.get("handling")

    # Radiogram precedence choices are stored as "R - Routine"; promote the
    # letter code. ICS-213's "priority" field carries a plain word instead.
    precedence_raw = values.get("precedence")
    if precedence_raw:
        precedence = precedence_raw.split(" - ")[0].strip() if " - " in precedence_raw else precedence_raw
    else:
        precedence = values.get("priority")

    addressee_bits = [b for b in (values.get("to_name"), values.get("to_callsign")) if b]
    addressee_display = (
        " ".join(addressee_bits)
        or values.get("to_city_state")
        or values.get("to_position")
        # RRI strips (WXOBS, GYX-CAR-SKYWARN) have no "to" recipient -- they're
        # a location-based report, not addressed to a person -- so fall back to
        # a location or the reporting station's callsign for a useful list label.
        or " ".join(b for b in (values.get("city"), values.get("state")) if b)
        or values.get("call_sign")
    )

    if values.get("subject"):
        subject = values["subject"]
    elif message_number:
        subject = f"NR {message_number} for {addressee_display}" if addressee_display else f"NR {message_number}"
    else:
        subject = addressee_display

    # RRI strips have no free-text body distinct from the whole record, so
    # their canonical slash-delimited (or verbatim, for the general strip)
    # string is cached here as normalized_text, matching its "authoritative
    # for export" role for every other form type. Scoped to these two
    # output_formats only -- see _FieldValuesOnly's docstring for why this
    # can't be generalized to every formatter.
    if definition.output_format == "rri_strip":
        normalized_text = format_rri_strip(_FieldValuesOnly(definition.form_type, values, definition))
    elif definition.output_format == "rri_strip_raw":
        normalized_text = format_rri_strip_raw(_FieldValuesOnly(definition.form_type, values, definition))

    promoted = {
        "subject": subject,
        "addressee_display": addressee_display,
        "message_number": message_number,
        "precedence": precedence,
        "handling": handling,
        "station_of_origin": station_of_origin,
        "check_count": check_count,
        "check_stated": check_stated,
        "normalized_text": normalized_text,
    }
    return promoted, values
