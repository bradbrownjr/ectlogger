"""
Loader for the ARL numbered-message catalog (definitions/arl_messages.json),
feeding the radiogram assist ARL picker's `GET /traffic/arl-messages`
endpoint. See docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 3.1 (endpoint
spec) and section 4.3 (ArlMessagePicker.tsx).

Static reference data (ARRL's numbered message list), so it is loaded once
and cached in-process for the life of the worker -- the same load-once
pattern app/traffic/definitions.py uses for its manifest, just without the
DB upsert since this data isn't stored in a table.
"""
import json
from pathlib import Path
from typing import List, Optional

DEFINITIONS_DIR = Path(__file__).parent / "definitions"

_arl_messages_cache: Optional[List[dict]] = None


def get_arl_messages() -> List[dict]:
    """Return the ARL numbered-message catalog, loading and caching it on first call.

    Each entry: {"num": int, "word": str, "group": "emergency" | "routine",
    "text": str, "blanks": [str, ...]}.
    """
    global _arl_messages_cache
    if _arl_messages_cache is None:
        with open(DEFINITIONS_DIR / "arl_messages.json") as f:
            _arl_messages_cache = json.load(f)
    return _arl_messages_cache
