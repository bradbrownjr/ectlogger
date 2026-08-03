"""ARRL/NTS Radiogram formatter and tolerant importer.

format_nts_radiogram renders a Form instance (form_type == "RADIOGRAM") as the
exact plaintext an operator reads on the air: preamble line, address block,
exactly two BT breaks, 5-word-grouped body, signature. Ported from bpq-apps
apps/forms.py::format_nts_radiogram (preamble field order, address block
layout, BT placement, 5-word grouping) -- reusing the shared NTS helpers in
nts_text.py rather than re-deriving them, per
docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 3 (module layout) and Risk R1
(the NTS engine must not exist twice).

parse_nts_radiogram is the tolerant importer described in
TRAFFIC-HANDLING-DESIGN.md D5: it never raises except on empty or oversized
input, prefers the two BT breaks but falls back to positional heuristics when
they're missing or malformed, never trusts the stated check (always
recomputes with normalize_and_count), and is purely a parser -- it writes
nothing to the database.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from app.traffic.nts_text import (
    _format_text_5words,
    _sanitize_nts_address,
    encode_nts_email,
    format_nts_phone,
    normalize_and_count,
)

# Hard failure cap per D5 ("Hard failure only on empty input or input above a
# size cap (32 KB)"). Everything else below this size parses to something.
MAX_IMPORT_SIZE = 32 * 1024

_CALLSIGN_RE = re.compile(r'^[A-Z]{1,2}\d[A-Z]{1,4}$')
_US_ZIP_RE = re.compile(r'^\d{5}(-\d{4})?$')
_HHMM_RE = re.compile(r'^([01]\d|2[0-3])[0-5]\d$')
_PRECEDENCE_LETTERS = {'R', 'W', 'P', 'E'}

_ADDRESS_OPTIONAL_FIELDS = ('to_callsign', 'to_phone', 'to_email')


def _field_values(form) -> Dict[str, Any]:
    raw = getattr(form, 'field_values', None)
    if isinstance(raw, str):
        return json.loads(raw) if raw else {}
    return dict(raw or {})


def _clean_place(text: str) -> str:
    """City/state style field: strip commas, collapse spaces, uppercase.

    Matches bpq-apps's inline transform for place_of_origin/to_city_state
    (apps/forms.py format_nts_radiogram), which is deliberately narrower than
    _sanitize_nts_address (that one also spells hyphens out as DASH, which a
    city/state pair doesn't need).
    """
    t = re.sub(r',', ' ', (text or '').upper())
    return re.sub(r' {2,}', ' ', t).strip()


def _decode_nts_email(text: str) -> str:
    """Best-effort inverse of nts_text.encode_nts_email, for import only.

    'USER AT EXAMPLE DOT COM' -> 'user@example.com'. Advisory: ambiguous if a
    name legitimately contains the words AT/DOT, but NTS addresses don't.
    """
    t = (text or '').strip()
    t = re.sub(r'\s+AT\s+', '@', t, flags=re.I)
    t = re.sub(r'\s+DOT\s+', '.', t, flags=re.I)
    return t.lower().strip()


# ========== format_nts_radiogram ==========

def format_nts_radiogram(form) -> str:
    """Render a RADIOGRAM Form as RRI/NTS plaintext.

    Reads the already-computed promoted columns (message_number, precedence,
    handling, station_of_origin, check_count, normalized_text) off the Form
    row rather than re-deriving them -- app/traffic/promote.py is the single
    place that computes them. Falls back to raw field_values only for a form
    that was never promoted (e.g. hand-built in a test).
    """
    values = _field_values(form)

    number = form.message_number or values.get('number') or ''

    precedence = form.precedence
    if not precedence:
        raw_prec = values.get('precedence', '') or ''
        precedence = raw_prec.split(' - ')[0].strip() if ' - ' in raw_prec else raw_prec
    precedence = (precedence or '').strip().upper()

    handling = (form.handling or values.get('handling') or '').strip().upper()
    origin = (form.station_of_origin or values.get('station_of_origin') or '').strip().upper()

    body = form.normalized_text or normalize_and_count(values.get('text', ''))[0]
    check = form.check_count
    if check is None:
        check = normalize_and_count(values.get('text', ''))[1]

    place = _clean_place(values.get('place_of_origin', ''))

    filed_time = (values.get('filed_time') or '').strip()
    if not filed_time and form.filed_at:
        filed_time = form.filed_at.strftime('%H%M')
    filed_date = form.filed_at.strftime('%b %d').upper() if form.filed_at else ''

    preamble_parts = ['NR', str(number), precedence]
    if handling:
        preamble_parts.append(handling)
    preamble_parts.extend([origin, str(check), place, filed_time, filed_date])
    preamble = ' '.join(p for p in preamble_parts if p)

    lines = [preamble]

    # ---- Address block (no BT before it -- exactly two BTs total) ----
    to_name = _sanitize_nts_address(values.get('to_name', ''))
    to_callsign = (values.get('to_callsign') or '').upper().strip()
    if to_callsign and to_name.upper().endswith(to_callsign):
        name_line = to_name
    else:
        name_line = '{} {}'.format(to_name, to_callsign).strip() if to_callsign else to_name
    lines.append(name_line)

    to_address = _sanitize_nts_address(values.get('to_address', ''))
    if to_address:
        lines.append(to_address)

    to_cs = _clean_place(values.get('to_city_state', ''))
    to_zip = (values.get('to_zip') or '').strip()
    lines.append('{} {}'.format(to_cs, to_zip).strip())

    to_phone = (values.get('to_phone') or '').strip()
    if to_phone:
        lines.append('TEL {}'.format(format_nts_phone(to_phone)))

    to_email = (values.get('to_email') or '').strip()
    if to_email:
        lines.append('EMAIL {}'.format(encode_nts_email(to_email)))

    lines.append('BT')

    # Text in groups of 5 words per line for easy check verification.
    lines.append(_format_text_5words(body))
    lines.append('BT')

    lines.append((values.get('signature') or '').upper().strip())

    return '\n'.join(lines)


# ========== parse_nts_radiogram ==========

def _detect_radiogram_shape(lines: List[str]) -> Optional[int]:
    """Return the index of the first non-blank line if it looks like a
    radiogram preamble (starts with the standalone token NR), else None.
    Per D5: "a first line matching the preamble pattern... means radiogram."
    """
    for i, line in enumerate(lines):
        if line.strip():
            return i if re.match(r'^\s*NR\b', line, re.I) else None
    return None


def _parse_preamble(line: str) -> Tuple[Dict[str, Any], List[str]]:
    tokens = line.split()
    warnings: List[str] = []
    result: Dict[str, Any] = {
        'number': None, 'precedence': None, 'handling': None,
        'station_of_origin': None, 'check_stated': None,
        'place_of_origin': None, 'filed_time': None, 'filed_date': None,
    }
    idx = 1  # tokens[0] is "NR"
    if idx < len(tokens):
        result['number'] = tokens[idx]
        idx += 1
    if idx < len(tokens):
        result['precedence'] = tokens[idx].upper()
        idx += 1
    if idx < len(tokens) and tokens[idx].upper().startswith('HX'):
        result['handling'] = tokens[idx].upper()
        idx += 1
    if idx < len(tokens):
        result['station_of_origin'] = tokens[idx].upper()
        idx += 1
    if idx < len(tokens):
        check_tok = tokens[idx]
        if check_tok.isdigit():
            result['check_stated'] = int(check_tok)
        else:
            warnings.append('preamble check field is not numeric: {!r}'.format(check_tok))
        idx += 1
    tail = tokens[idx:]
    if len(tail) >= 3:
        result['filed_time'] = tail[-3]
        result['filed_date'] = ' '.join(tail[-2:])
        result['place_of_origin'] = ' '.join(tail[:-3])
    elif tail:
        result['place_of_origin'] = ' '.join(tail)
        warnings.append('preamble is missing time/date fields; place of origin may be misread')
    return result, warnings


def _split_body_address_signature(lines: List[str], preamble_idx: int) -> Tuple[List[str], List[str], List[str], List[str], str]:
    """Split everything after the preamble into (address_lines, body_lines,
    signature_lines, warnings, source). Prefers the two BT breaks; falls back
    to positional heuristics when they're missing or malformed, per D5.
    """
    bt_indices = [i for i, l in enumerate(lines) if l.strip().upper() == 'BT']
    warnings: List[str] = []

    if len(bt_indices) >= 2:
        first_bt, second_bt = bt_indices[0], bt_indices[1]
        address_lines = [l for l in lines[preamble_idx + 1:first_bt] if l.strip()]
        body_lines = lines[first_bt + 1:second_bt]
        signature_lines = [l for l in lines[second_bt + 1:] if l.strip()]
        return address_lines, body_lines, signature_lines, warnings, 'bt_block'

    warnings.append('BT breaks missing or malformed; used positional heuristics')
    rest = [l for l in lines[preamble_idx + 1:] if l.strip()]
    if len(rest) < 2:
        return rest, [], [], warnings, 'heuristic'

    # Address block runs until the last line carrying TEL/EMAIL or a ZIP code
    # (per D5); the last non-empty line is the signature; the remainder
    # (excluding the last line, which is the signature) is the body.
    address_end = 0
    for i, line in enumerate(rest[:-1]):
        upper = line.strip().upper()
        if upper.startswith('TEL') or upper.startswith('EMAIL') or re.search(r'\b\d{5}(-\d{4})?\b', upper):
            address_end = i
    address_lines = rest[:address_end + 1]
    body_lines = rest[address_end + 1:-1]
    signature_lines = [rest[-1]]
    return address_lines, body_lines, signature_lines, warnings, 'heuristic'


def _parse_address_block(address_lines: List[str]) -> Tuple[Dict[str, Optional[str]], List[str], List[str]]:
    warnings: List[str] = []
    extra_lines: List[str] = []
    result: Dict[str, Optional[str]] = {
        'to_name': None, 'to_callsign': None, 'to_address': None,
        'to_city_state': None, 'to_zip': None, 'to_phone': None, 'to_email': None,
    }
    content: List[str] = []
    for raw in address_lines:
        line = raw.strip()
        if not line:
            continue
        upper = line.upper()
        if upper.startswith('TEL'):
            result['to_phone'] = line[3:].strip()
            continue
        if upper.startswith('EMAIL'):
            result['to_email'] = _decode_nts_email(line[5:].strip())
            continue
        content.append(line)

    if content:
        first_tokens = content[0].split()
        if len(first_tokens) > 1 and _CALLSIGN_RE.match(first_tokens[-1].upper()):
            result['to_callsign'] = first_tokens[-1].upper()
            result['to_name'] = ' '.join(first_tokens[:-1])
        else:
            result['to_name'] = content[0]
        content = content[1:]

    remainder_tokens: List[str] = []
    if len(content) >= 2:
        result['to_address'] = content[0]
        remainder_tokens = content[1].split()
        extra_lines = content[2:]
    elif len(content) == 1:
        remainder_tokens = content[0].split()

    if remainder_tokens:
        if _US_ZIP_RE.match(remainder_tokens[-1]):
            result['to_zip'] = remainder_tokens[-1]
            result['to_city_state'] = ' '.join(remainder_tokens[:-1])
        else:
            result['to_city_state'] = ' '.join(remainder_tokens)
            warnings.append('no ZIP code found in address block')

    return result, warnings, extra_lines


def parse_nts_radiogram(text: str) -> Dict[str, Any]:
    """Tolerant, stateless radiogram parser. Writes nothing to the database.

    Returns a dict shaped {form_type, fields, check_stated, check_count,
    warnings, unparsed_lines[, raw_text]}. Each entry in `fields` carries
    value/source/confidence (see TRAFFIC-HANDLING-DESIGN.md D5). Raises only
    on empty input or input over the 32 KB cap; everything else parses to
    something, even if that something is form_type == "unknown".
    """
    if not text or not text.strip():
        raise ValueError('input is empty')
    if len(text.encode('utf-8')) > MAX_IMPORT_SIZE:
        raise ValueError('input exceeds the 32 KB import size cap')

    lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    preamble_idx = _detect_radiogram_shape(lines)
    if preamble_idx is None:
        return {
            'form_type': 'unknown',
            'fields': {},
            'warnings': ['first non-blank line does not match a radiogram preamble (NR ...)'],
            'unparsed_lines': [l for l in lines if l.strip()],
            'raw_text': text,
        }

    fields: Dict[str, Dict[str, Any]] = {}
    warnings: List[str] = []

    def _set(name: str, value: Any, source: str, confidence: str) -> None:
        fields[name] = {'value': value, 'source': source, 'confidence': confidence}

    preamble, preamble_warnings = _parse_preamble(lines[preamble_idx])
    warnings.extend(preamble_warnings)
    preamble_confidence = 'low' if preamble_warnings else 'high'

    _set('number', preamble['number'], 'bt_block', preamble_confidence if preamble['number'] else 'low')

    prec = preamble['precedence']
    prec_confidence = 'high' if prec in _PRECEDENCE_LETTERS else 'low'
    if prec and prec not in _PRECEDENCE_LETTERS:
        warnings.append('precedence {!r} is not one of R/W/P/E'.format(prec))
    _set('precedence', prec, 'bt_block', prec_confidence)

    if preamble['handling']:
        _set('handling', preamble['handling'], 'bt_block', 'high')

    origin = preamble['station_of_origin']
    origin_confidence = 'high' if origin and _CALLSIGN_RE.match(origin) else 'low'
    if origin and origin_confidence == 'low':
        warnings.append('station_of_origin {!r} does not look like a callsign'.format(origin))
    _set('station_of_origin', origin, 'bt_block', origin_confidence)

    _set('place_of_origin', preamble['place_of_origin'], 'bt_block', preamble_confidence)

    filed_time = preamble['filed_time']
    time_confidence = 'high' if filed_time and _HHMM_RE.match(filed_time) else 'low'
    if filed_time and time_confidence == 'low':
        warnings.append('filed_time {!r} does not look like HHMM'.format(filed_time))
    _set('filed_time', filed_time, 'bt_block', time_confidence)

    check_stated = preamble['check_stated']

    address_lines, body_lines, signature_lines, split_warnings, source = _split_body_address_signature(lines, preamble_idx)
    warnings.extend(split_warnings)

    address, address_warnings, extra_lines = _parse_address_block(address_lines)
    warnings.extend(address_warnings)
    unparsed_lines = list(extra_lines)

    for name in ('to_name', 'to_callsign', 'to_address', 'to_city_state', 'to_zip', 'to_phone', 'to_email'):
        value = address.get(name)
        if value:
            confidence = 'high'
            if name == 'to_zip' and not _US_ZIP_RE.match(value):
                warnings.append('to_zip {!r} does not look like a US ZIP'.format(value))
                confidence = 'low'
            elif name == 'to_callsign' and not _CALLSIGN_RE.match(value):
                warnings.append('to_callsign {!r} does not look like a callsign'.format(value))
                confidence = 'low'
            field_source = source
        elif name in _ADDRESS_OPTIONAL_FIELDS:
            confidence = 'high'  # legitimately absent, not a parse failure
            field_source = 'unparsed'
        else:
            confidence = 'low'
            field_source = 'unparsed'
            warnings.append('{} not found in address block'.format(name))
        _set(name, value, field_source, confidence)

    signature_value = signature_lines[0].strip() if signature_lines else None
    if not signature_value:
        warnings.append('signature not found')
    _set('signature', signature_value, source if signature_value else 'unparsed', 'high' if signature_value else 'low')

    body_raw = ' '.join(l.strip() for l in body_lines if l.strip())
    if body_raw:
        normalized_body, check_count = normalize_and_count(body_raw)
    else:
        normalized_body, check_count = '', 0
        warnings.append('message body not found')

    check_mismatch = check_stated is not None and check_stated != check_count
    if check_mismatch:
        warnings.append(
            'stated check {} does not match computed check {}; verify with the sending station'.format(
                check_stated, check_count
            )
        )
    text_source = source if body_raw else 'unparsed'
    _set('text', normalized_body, text_source, 'low' if (check_mismatch or not body_raw) else 'high')
    _set('check', check_count, text_source, 'low' if check_mismatch else 'high')

    return {
        'form_type': 'RADIOGRAM',
        'fields': fields,
        'check_stated': check_stated,
        'check_count': check_count,
        'warnings': warnings,
        'unparsed_lines': unparsed_lines,
    }
