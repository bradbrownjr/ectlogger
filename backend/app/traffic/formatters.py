"""Registry mapping FormDefinition.output_format to its (format_fn, parse_fn)
pair. Per TRAFFIC-HANDLING-DESIGN.md section 3's module layout, this is the
only place in the backend allowed to branch on form type -- routers, the
reminder service, and the ICS-309 exporter should call get_formatter()/
format_form()/parse_any() rather than inspecting Form.form_type or
FormDefinition.output_format directly.

Note on the current mapping: RADIOGRAM's definition sets
output_format="nts_radiogram", but ICS213's sets output_format="generic"
(see backend/app/traffic/definitions/*.json). "generic" is therefore, today,
1:1 with ICS213's specific field layout rather than a truly type-agnostic
renderer -- if a second output_format="generic" definition is ever added with
a different field set, this registry can no longer tell the two apart. That
is a pre-existing naming choice in the seed data (out of scope for this
phase to change unilaterally); flagged here for the roadmap owner to
consider giving ICS213 its own output_format value in a later phase.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Tuple

from app.traffic.ics213 import format_ics213, parse_ics213
from app.traffic.radiogram import format_nts_radiogram, parse_nts_radiogram

FormatFn = Callable[[Any], str]
ParseFn = Callable[[str], Dict[str, Any]]

FORMATTERS: Dict[str, Tuple[FormatFn, ParseFn]] = {
    'nts_radiogram': (format_nts_radiogram, parse_nts_radiogram),
    'generic': (format_ics213, parse_ics213),
}

# Detection order for parse_any, per TRAFFIC-HANDLING-DESIGN.md D5: try the
# radiogram's unambiguous preamble shape first, then ICS-213 label matching.
_DETECTION_ORDER = ('nts_radiogram', 'generic')


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
