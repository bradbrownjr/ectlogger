"""Radio Relay International (RRI) "RI strip" formatter and tolerant importer.

RRI strips are a family of fixed-field, slash-delimited short-form messages,
documented at ne-interop-emcomm.org/standard-strips.html, distinct from the
free-text ARRL Radiogram/ICS-213 shape radiogram.py/ics213.py handle. Two
concrete, fully-fielded strip types are supported here (WXOBS, GYX-CAR-SKYWARN
-- backend/app/traffic/definitions/wxobs.json and gyx_car_skywarn.json), plus a
general catch-all (RRI_STRIP_OTHER -- rri_strip_general.json) that preserves
any pasted strip text verbatim, since RRI's strip family keeps growing (SITREP,
OPRED, agency-specific variants) and net staff shouldn't be blocked on an
ECTLogger code change to log a strip type without a dedicated field schema yet.

Important: RRI's own docs note that a strip's numeric fields need a minus->M
substitution if the strip content is ever embedded in a Radiogram/ICS-213 body
for relay over voice/CW NTS. WX/RRI traffic is normally pasted straight into a
spreadsheet, not relayed via NTS, so that substitution is intentionally NOT
applied by format_rri_strip/format_rri_strip_raw (the canonical text, cached
into Form.normalized_text) -- see make_nts_safe, called only by the opt-in
bulk net export in routers/nets_export.py.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Tuple

# Hard failure cap per D5 ("Hard failure only on empty input or input above a
# size cap (32 KB)"), matching radiogram.py/ics213.py.
MAX_IMPORT_SIZE = 32 * 1024


def _field_values(form) -> Dict[str, Any]:
    raw = getattr(form, 'field_values', None)
    if isinstance(raw, str):
        return json.loads(raw) if raw else {}
    return dict(raw or {})


# ========== Structured strips (WXOBS, GYX-CAR-SKYWARN) ==========
# Each spec is (keyword, sections); a section is a list of field names. A
# blank token between two slashes ("/ /") marks a section boundary -- RRI
# uses it purely for CW/voice readability, so it carries no data of its own
# and both format/parse treat it as a separator, never a field.

_WXOBS_SECTIONS: List[List[str]] = [
    ['call_sign', 'skywarn_id', 'city', 'state', 'mgrs', 'nws_cwa'],
    ['observation_time'],
    ['wind_dir', 'wind_speed', 'wind_gusts'],
    ['clouds'],
    ['temp'],
    ['barometer', 'barometer_trend'],
    ['precip_type', 'precip_current', 'precip_storm_total', 'precip_liquid_equiv'],
    ['comments'],
]

# GYX-CAR SKYWARN's published field sequence has no "/ /" section breaks --
# one flat section.
_GYX_CAR_SKYWARN_SECTIONS: List[List[str]] = [
    ['date', 'time', 'call_sign', 'spotter_id', 'source', 'location', 'state_cwa',
     'current_weather', 'snow_sleet', 'ice_accretion', 'rainfall', 'hail_size',
     'wind_dir_speed', 'storm_damage', 'mode', 'net'],
]

_STRIP_SPECS: Dict[str, Tuple[str, List[List[str]]]] = {
    'WXOBS': ('WXOBS', _WXOBS_SECTIONS),
    'GYX-CAR-SKYWARN': ('GYX-CAR WEATHER', _GYX_CAR_SKYWARN_SECTIONS),
}

_KEYWORD_TO_FORM_TYPE = {keyword: form_type for form_type, (keyword, _sections) in _STRIP_SPECS.items()}


# ========== format_rri_strip / parse_rri_strip ==========

def format_rri_strip(form) -> str:
    """Render a structured RRI strip as RRI's canonical slash-delimited
    string, exactly as documented -- this is what pastes directly into a
    Winlink template or the SKYWARN Google Sheet, so it is never altered
    from RRI's literal format here (no NTS-safe substitution; see
    make_nts_safe, which is opt-in and applied only by the bulk export)."""
    values = _field_values(form)
    keyword, sections = _STRIP_SPECS[form.form_type]

    section_strs = [
        '/'.join((str(values.get(name)).upper() if values.get(name) else '') for name in section)
        for section in sections
    ]
    return keyword + '/' + '/ /'.join(section_strs) + '//'


def parse_rri_strip(text: str) -> Dict[str, Any]:
    """Tolerant, stateless RRI strip parser. Writes nothing to the database.

    Detects WXOBS vs GYX-CAR-SKYWARN by the leading keyword and positionally
    maps the remaining slash-delimited tokens back onto that type's field
    names. Falls through to form_type == 'unknown' (rather than raising) when
    the leading keyword doesn't match either known strip -- callers (parse_any)
    then try the next parser in _DETECTION_ORDER, ending at parse_rri_strip_raw's
    catch-all.
    """
    if not text or not text.strip():
        raise ValueError('input is empty')
    if len(text.encode('utf-8')) > MAX_IMPORT_SIZE:
        raise ValueError('input exceeds the 32 KB import size cap')

    # RRI strips are meant to be a single line; tolerate stray line breaks an
    # operator's paste might introduce.
    flat = re.sub(r'\s*[\r\n]+\s*', '', text.strip())
    tokens = flat.rstrip('/').split('/')

    first = tokens[0].strip().upper() if tokens else ''
    form_type = _KEYWORD_TO_FORM_TYPE.get(first)
    if form_type is None:
        return {
            'form_type': 'unknown',
            'fields': {},
            'warnings': ['first field does not match a known RRI strip keyword (WXOBS, GYX-CAR WEATHER)'],
            'unparsed_lines': [text.strip()],
            'raw_text': text,
        }

    _keyword, sections = _STRIP_SPECS[form_type]
    fields: Dict[str, Dict[str, Any]] = {}
    warnings: List[str] = []

    def _set(name: str, value: Any, confidence: str) -> None:
        fields[name] = {'value': value or None, 'source': 'bt_block', 'confidence': confidence}

    remaining = tokens[1:]
    idx = 0
    for section_index, section in enumerate(sections):
        if section_index > 0 and idx < len(remaining) and remaining[idx].strip() == '':
            idx += 1  # consume the "/ /" boundary token before this section
        for name in section:
            value = remaining[idx].strip() if idx < len(remaining) else None
            _set(name, value, 'high' if value else 'low')
            if not value:
                warnings.append('{} not found'.format(name))
            idx += 1

    unparsed_lines = [t for t in remaining[idx:] if t.strip()]
    if unparsed_lines:
        warnings.append('extra fields beyond the expected strip layout were left unparsed')

    return {
        'form_type': form_type,
        'fields': fields,
        'warnings': warnings,
        'unparsed_lines': unparsed_lines,
    }


# ========== format_rri_strip_raw / parse_rri_strip_raw ==========
# RRI_STRIP_OTHER: a net manager pastes the raw text of any strip ECTLogger
# has no dedicated field schema for, and it's saved verbatim.

_RAW_FORM_TYPE = 'RRI_STRIP_OTHER'


def format_rri_strip_raw(form) -> str:
    """Render the general RRI strip verbatim -- whatever the net manager
    pasted, unmodified. No NTS-safe substitution here either; see
    make_nts_safe."""
    values = _field_values(form)
    return values.get('strip_text', '') or ''


def parse_rri_strip_raw(text: str) -> Dict[str, Any]:
    """Catch-all importer: preserves any non-empty text verbatim as a general
    RRI strip instead of dead-ending at form_type == 'unknown'. Must be the
    last entry in formatters.py's _DETECTION_ORDER -- this always succeeds
    for non-empty input, so nothing after it would ever be reached."""
    if not text or not text.strip():
        raise ValueError('input is empty')
    if len(text.encode('utf-8')) > MAX_IMPORT_SIZE:
        raise ValueError('input exceeds the 32 KB import size cap')

    return {
        'form_type': _RAW_FORM_TYPE,
        'fields': {
            'strip_text': {'value': text.strip(), 'source': 'unparsed', 'confidence': 'high'},
            'call_sign': {'value': None, 'source': 'unparsed', 'confidence': 'low'},
            'subject': {'value': None, 'source': 'unparsed', 'confidence': 'low'},
        },
        'warnings': ['saved as a general RRI strip -- fill in the call sign and a short label before saving'],
        'unparsed_lines': [],
    }


# ========== make_nts_safe ==========

def make_nts_safe(text: str) -> str:
    """RRI's documented substitution for embedding strip content inside a
    Radiogram/ICS-213 body over voice/CW: minus sign -> M. Decimal points are
    already handled correctly by normalize_nts_text's own digit-decimal rule
    once this text is used as a radiogram body, so this only needs to close
    the one gap RRI calls out -- without it, normalize_nts_text's "hyphen
    between words -> X" rule would swallow a leading minus (e.g. a negative
    temperature) and silently lose the sign.

    Deliberately a pure text transform, not form-aware, so it applies
    identically to structured and general strips alike. Never called by
    format_rri_strip/format_rri_strip_raw or promote.py -- WX/RRI traffic is
    normally pasted straight into a spreadsheet, not relayed via NTS, so this
    stays opt-in (see the bulk net export's radiogram_safe format).
    """
    return re.sub(r'-(\d)', r'M\1', text)
