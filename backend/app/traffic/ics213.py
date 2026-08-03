"""ICS-213 General Message Form formatter and tolerant importer.

bpq-apps has no distinct ICS-213 formatter (apps/forms.py only has a generic
"standard form format" label:value fallback -- see format_as_bpq_message's
final branch). format_ics213 here is a purpose-built layout for the field set
backend/app/traffic/definitions/ics213.json actually defines (incident_name,
to_name, to_position, from_name, from_position, subject, message, priority,
reply_requested), consistent with the standard ICS-213 paper form's
To/From/Date-Time/Subject/Message/Reply sections. No BT breaks: those are an
NTS radiogram prosign, not part of the ICS-213 convention.

parse_ics213 is the D5-style tolerant importer for this shape: it detects the
form by label matching ("To:", "From:", "Subject:", ...), is never required
to see every label, and never raises except on empty or oversized input.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

# Hard failure cap per D5 ("Hard failure only on empty input or input above a
# size cap (32 KB)"). Everything else below this size parses to something.
MAX_IMPORT_SIZE = 32 * 1024

_ICS213_LABELS: Tuple[Tuple[str, "re.Pattern[str]"], ...] = (
    ('incident_name', re.compile(r'^incident/event:\s*(.*)$', re.I)),
    ('to_line', re.compile(r'^to:\s*(.*)$', re.I)),
    ('from_line', re.compile(r'^from:\s*(.*)$', re.I)),
    ('date_time', re.compile(r'^date/time:\s*(.*)$', re.I)),
    ('priority', re.compile(r'^priority:\s*(.*)$', re.I)),
    ('subject', re.compile(r'^subject:\s*(.*)$', re.I)),
    ('message_label', re.compile(r'^message:\s*(.*)$', re.I)),
    ('reply_requested', re.compile(r'^reply requested:\s*(.*)$', re.I)),
)

_YES_WORDS = {'yes', 'y', 'true', '1'}
_NO_WORDS = {'no', 'n', 'false', '0'}


def _field_values(form) -> Dict[str, Any]:
    raw = getattr(form, 'field_values', None)
    if isinstance(raw, str):
        return json.loads(raw) if raw else {}
    return dict(raw or {})


def _name_and_position(line: str) -> Tuple[Optional[str], Optional[str]]:
    """Split "NAME (POSITION)" into (name, position); position is None when
    there's no trailing parenthetical."""
    line = (line or '').strip()
    if not line:
        return None, None
    m = re.match(r'^(.*?)\s*\(([^)]*)\)\s*$', line)
    if m:
        return (m.group(1).strip() or None), (m.group(2).strip() or None)
    return line, None


# ========== format_ics213 ==========

def format_ics213(form) -> str:
    """Render an ICS213 Form as a plain labeled-field message, following the
    standard ICS-213 general message layout: To/From/Date-Time/Subject/
    Message/Reply."""
    values = _field_values(form)

    incident_name = (values.get('incident_name') or '').strip()
    to_name = (values.get('to_name') or '').strip()
    to_position = (values.get('to_position') or '').strip()
    from_name = (values.get('from_name') or '').strip()
    from_position = (values.get('from_position') or '').strip()
    subject = (values.get('subject') or '').strip()
    message = (values.get('message') or '').strip()
    priority = (values.get('priority') or '').strip()
    reply_requested = (values.get('reply_requested') or '').strip()

    date_time = form.filed_at.strftime('%Y-%m-%d %H%MZ') if getattr(form, 'filed_at', None) else ''

    to_display = '{} ({})'.format(to_name, to_position) if to_position else to_name
    from_display = '{} ({})'.format(from_name, from_position) if from_position else from_name
    reply_display = 'Yes' if reply_requested.lower() in _YES_WORDS else 'No'

    lines = [
        'ICS-213 GENERAL MESSAGE FORM',
        '',
        'Incident/Event: {}'.format(incident_name),
        'To: {}'.format(to_display),
        'From: {}'.format(from_display),
        'Date/Time: {}'.format(date_time),
        'Priority: {}'.format(priority),
        'Subject: {}'.format(subject),
        '',
        'Message:',
    ]
    for line in message.split('\n'):
        lines.append('  {}'.format(line))
    lines.append('')
    lines.append('Reply Requested: {}'.format(reply_display))

    return '\n'.join(lines)


# ========== parse_ics213 ==========

def _looks_like_ics213(lines: List[str]) -> bool:
    hits = 0
    for line in lines:
        s = line.strip()
        if not s:
            continue
        for _, pattern in _ICS213_LABELS:
            if pattern.match(s):
                hits += 1
                break
    return hits >= 2


def parse_ics213(text: str) -> Dict[str, Any]:
    """Tolerant, stateless ICS-213 parser. Writes nothing to the database.

    Returns a dict shaped {form_type, fields, warnings, unparsed_lines[,
    raw_text]}, each `fields` entry carrying value/source/confidence per
    TRAFFIC-HANDLING-DESIGN.md D5. Raises only on empty input or input over
    the 32 KB cap.
    """
    if not text or not text.strip():
        raise ValueError('input is empty')
    if len(text.encode('utf-8')) > MAX_IMPORT_SIZE:
        raise ValueError('input exceeds the 32 KB import size cap')

    lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    if not _looks_like_ics213(lines):
        return {
            'form_type': 'unknown',
            'fields': {},
            'warnings': ['no recognizable ICS-213 labels (To:/From:/Subject:/Message: ...) found'],
            'unparsed_lines': [l for l in lines if l.strip()],
            'raw_text': text,
        }

    fields: Dict[str, Dict[str, Any]] = {}
    warnings: List[str] = []
    unparsed_lines: List[str] = []
    raw_values: Dict[str, str] = {}
    message_lines: List[str] = []
    in_message = False

    def _set(name: str, value: Any, source: str, confidence: str) -> None:
        fields[name] = {'value': value, 'source': source, 'confidence': confidence}

    for line in lines:
        s = line.strip()
        if not s:
            if in_message:
                message_lines.append('')
            continue
        matched = False
        for name, pattern in _ICS213_LABELS:
            m = pattern.match(s)
            if m:
                matched = True
                if name == 'message_label':
                    in_message = True
                    if m.group(1).strip():
                        message_lines.append(m.group(1).strip())
                else:
                    in_message = False
                    raw_values[name] = m.group(1).strip()
                break
        if not matched:
            if in_message:
                message_lines.append(s)
            else:
                unparsed_lines.append(line)

    while message_lines and message_lines[-1] == '':
        message_lines.pop()
    message = '\n'.join(message_lines)

    _set('incident_name', raw_values.get('incident_name') or None, 'label_match',
         'high' if raw_values.get('incident_name') else 'low')

    to_name, to_position = _name_and_position(raw_values.get('to_line'))
    _set('to_name', to_name, 'label_match', 'high' if to_name else 'low')
    _set('to_position', to_position, 'label_match', 'high')  # optional field

    from_name, from_position = _name_and_position(raw_values.get('from_line'))
    _set('from_name', from_name, 'label_match', 'high' if from_name else 'low')
    _set('from_position', from_position, 'label_match', 'high')  # optional field

    _set('subject', raw_values.get('subject') or None, 'label_match', 'high' if raw_values.get('subject') else 'low')
    _set('priority', raw_values.get('priority') or None, 'label_match', 'high' if raw_values.get('priority') else 'low')
    _set('message', message or None, 'label_match', 'high' if message else 'low')

    reply_raw = (raw_values.get('reply_requested') or '').strip().lower()
    if reply_raw in _YES_WORDS:
        reply_value: Optional[str] = 'Yes'
    elif reply_raw in _NO_WORDS:
        reply_value = 'No'
    else:
        reply_value = None
        if raw_values.get('reply_requested') is not None:
            warnings.append('reply_requested value {!r} is not recognized as yes/no'.format(
                raw_values.get('reply_requested')))
    _set('reply_requested', reply_value, 'label_match', 'high' if reply_value else 'low')

    if not raw_values.get('date_time'):
        warnings.append('date/time not found')

    for name in ('incident_name', 'to_name', 'subject', 'message'):
        if not fields[name]['value']:
            warnings.append('{} not found'.format(name))

    return {
        'form_type': 'ICS213',
        'fields': fields,
        'warnings': warnings,
        'unparsed_lines': unparsed_lines,
    }
