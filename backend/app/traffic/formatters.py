"""Registry mapping FormDefinition.output_format to its (format_fn, parse_fn)
pair. Per TRAFFIC-HANDLING-DESIGN.md section 3's module layout, this is the
only place in the backend allowed to branch on form type -- routers, the
reminder service, and the ICS-309 exporter should call get_formatter()/
format_form()/parse_any() rather than inspecting Form.form_type or
FormDefinition.output_format directly.

ICS213 has its own output_format ("ics213"), distinct from "generic", so a
future truly type-agnostic admin-authored definition (D1, D6) can use
output_format="generic" without colliding with ICS213's specific field
layout and formatter.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Tuple

from app.traffic.ics213 import format_ics213, parse_ics213
from app.traffic.radiogram import format_nts_radiogram, parse_nts_radiogram
from app.traffic.rri_strip import (
    format_rri_strip,
    format_rri_strip_raw,
    parse_rri_strip,
    parse_rri_strip_raw,
)

FormatFn = Callable[[Any], str]
ParseFn = Callable[[str], Dict[str, Any]]

FORMATTERS: Dict[str, Tuple[FormatFn, ParseFn]] = {
    'nts_radiogram': (format_nts_radiogram, parse_nts_radiogram),
    'ics213': (format_ics213, parse_ics213),
    'rri_strip': (format_rri_strip, parse_rri_strip),
    'rri_strip_raw': (format_rri_strip_raw, parse_rri_strip_raw),
}

# Detection order for parse_any, per TRAFFIC-HANDLING-DESIGN.md D5: try the
# radiogram's unambiguous preamble shape first, then ICS-213 label matching,
# then RRI's own keyword-prefixed strips. rri_strip_raw is last and
# deliberate -- its parser always succeeds on non-empty input (it's the
# general "save whatever was pasted" catch-all), so nothing after it would
# ever be reached.
_DETECTION_ORDER = ('nts_radiogram', 'ics213', 'rri_strip', 'rri_strip_raw')


def get_formatter(output_format: str) -> Tuple[FormatFn, ParseFn]:
    """Look up the (format_fn, parse_fn) pair for a FormDefinition.output_format
    value. Raises KeyError for an unregistered output_format so a missing
    mapping fails loudly instead of silently guessing."""
    return FORMATTERS[output_format]


def format_form(form) -> str:
    """Format a Form ORM instance using its definition's output_format.
    Requires form.definition to be loaded (selectinload)."""
    format_fn, _ = get_formatter(form.definition.output_format)
    return format_fn(form)


def parse_any(text: str) -> Dict[str, Any]:
    """Stateless, best-guess parse across every registered form type, per
    D5's detection order. Never commits anything; a later phase's
    POST /traffic/import/preview wires this up. Propagates ValueError for
    empty/oversized input (the one hard-failure case D5 allows); every other
    input returns a dict, falling back to form_type == "unknown" with the
    raw input preserved.
    """
    last_unknown: Dict[str, Any] = {}
    for output_format in _DETECTION_ORDER:
        _, parse_fn = FORMATTERS[output_format]
        result = parse_fn(text)
        if result.get('form_type') != 'unknown':
            return result
        last_unknown = result
    return last_unknown
