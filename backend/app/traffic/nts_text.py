"""ARRL NTS radiogram text normalization and word-count helpers.

Ported from bpq-apps apps/forms.py (normalize_nts_text, count_nts_check, and
the smaller encode/format/sanitize helpers), which was reviewed and approved
by ARRL Digital Section Manager Jim KY2D. See
docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 5 for the now-resolved
QUERY-vs-INT question (confirmed: QUERY) and section 5.1 for a bug in the
reference's fallback path (counting raw text instead of normalized text)
that this port deliberately does not reproduce — always call
normalize_and_count, which normalizes first.
"""

import re
from typing import Tuple

# The complete NTS punctuation / prosign substitution table, in application order.
# Order matters: digit-separator handling must run before generic punctuation,
# and word-hyphen handling must run before the catch-all hyphen-to-space rule.
# Ported verbatim from bpq-apps apps/forms.py::normalize_nts_text.
NTS_SUBSTITUTIONS: Tuple[Tuple[str, str, str], ...] = (
    (r'(\d)[.:/](\d)', r'\1R\2', "decimal / fraction / time colon between digits -> R"),
    (r"'", '', "apostrophe dropped"),
    (r'&', ' AND ', "ampersand -> AND"),
    (r'@', ' AT ', "at-sign -> AT"),
    # Confirmed QUERY (not bpq-apps's INT) per docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 5.
    (r'\?', ' QUERY ', "question mark -> QUERY"),
    (r'[()]', ' ', "parentheses dropped"),
    (r'(\w)\s*-\s*(\w)', r'\1 X \2', "hyphen between words -> X"),
    (r'-', ' ', "remaining hyphens -> space"),
    (r'[.,!;:]', ' X ', "period, comma, exclamation, semicolon, colon -> X"),
)


def normalize_nts_text(text: str) -> str:
    """Apply ARRL NTS prosign encoding to message text.

    Matches Winlink fixpunct() behavior:
      , ! ;     -> X    |  ? -> QUERY  |  & -> AND  |  ' -> dropped
      d.d d/d d:d -> R  |  hyphen between words -> X
    Trailing punctuation and prosigns are stripped.
    """
    t = text.upper().strip()
    # Strip trailing punctuation before any conversion
    t = re.sub(r'[.,!?;:\s]+$', '', t).strip()
    for pattern, replacement, _description in NTS_SUBSTITUTIONS:
        t = re.sub(pattern, replacement, t)
    # Collapse multiple spaces
    t = re.sub(r' {2,}', ' ', t).strip()
    # Strip trailing prosign words (no standalone meaning at end)
    words = t.split()
    while words and words[-1] in ('X', 'QUERY'):
        words.pop()
    return ' '.join(words)


def count_nts_check(text: str) -> int:
    """Compute NTS check (word count) per ARRL/Winlink rules.

    Strips punctuation without prosign substitution — matches Winlink
    Strippunct+wordcount behavior. Pure-digit strings >5 chars count
    as ceil(len/5) words each per ARRL NTS standard.
    """
    t = text.upper().strip()
    # Treat decimal between digits as one number token (146.52 -> 1 word)
    t = re.sub(r'(\d)\.(\d)', r'\1\2', t)
    # Strip all remaining punctuation
    t = re.sub(r'[^\w\s]', ' ', t)
    t = re.sub(r' {2,}', ' ', t).strip()
    count = 0
    for w in t.split():
        if re.match(r'^\d+$', w):
            count += (len(w) + 4) // 5
        else:
            count += 1
    return count


def normalize_and_count(text: str) -> Tuple[str, int]:
    """Normalize NTS text and compute its check, in the correct order.

    Normalize first, then count the normalized text — this is what
    bpq-apps's fill_form does, and what its comment says is correct
    ("so X prowords are included"). bpq-apps's format_nts_radiogram has a
    fallback path that counts the raw text instead; that is a bug in the
    reference (see docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 5.1)
    and must not be reproduced. Callers should use this function rather
    than calling normalize_nts_text and count_nts_check separately, so
    that bug can't be reintroduced by accident.
    """
    normalized = normalize_nts_text(text)
    check = count_nts_check(normalized)
    return normalized, check


def encode_nts_email(addr: str) -> str:
    """Encode email address for NTS radiogram output.

    user@example.com -> USER AT EXAMPLE DOT COM
    """
    if not addr:
        return ''
    addr = addr.strip().upper()
    addr = addr.replace('@', ' AT ')
    addr = addr.replace('.', ' DOT ')
    return re.sub(r' {2,}', ' ', addr).strip()


def format_nts_phone(ph: str) -> str:
    """Normalize phone to NXX NXX XXXX for radiogram output (no dashes per NTS rules)."""
    if not ph:
        return ph
    digits = re.sub(r'[^\d]', '', ph)
    if len(digits) == 11 and digits[0] == '1':
        digits = digits[1:]
    if len(digits) == 10:
        return '{} {} {}'.format(digits[:3], digits[3:6], digits[6:])
    if len(digits) == 7:
        return '{} {}'.format(digits[:3], digits[3:])
    return ph


def _sanitize_nts_address(text: str) -> str:
    """Spell out punctuation in address fields per NTS rules.

    # -> NR, hyphen -> DASH, colons/commas -> space.
    """
    t = text.upper().strip()
    # Number sign -> NR
    t = re.sub(r'#\s*', 'NR ', t)
    # Hyphen between word characters -> DASH
    t = re.sub(r'(\w)\s*-\s*(\w)', r'\1 DASH \2', t)
    # Remaining hyphens -> space
    t = re.sub(r'-', ' ', t)
    # Colons -> space
    t = re.sub(r':', ' ', t)
    # Commas -> space
    t = re.sub(r',', ' ', t)
    # Collapse spaces
    t = re.sub(r' {2,}', ' ', t).strip()
    return t


def _format_text_5words(text: str) -> str:
    """Format normalized NTS text in groups of 5 words per line."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), 5):
        chunks.append(' '.join(words[i:i + 5]))
    return '\n'.join(chunks)
