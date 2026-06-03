"""
CSV check-in import service.

Parses and validates every row in an uploaded CSV file against a net's
configuration and time window.  Returns plain row-payload dicts so the
caller (the router) can create CheckIn objects — no SQLAlchemy or
FastAPI dependencies live here.
"""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError  # noqa: F401 – re-exported for router

from app.models import StationStatus


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SAMPLE_ROW_MARKER = "ECTLOGGER_SAMPLE_ROW"

STATUS_MAP: dict[str, StationStatus] = {
    "checkedin": StationStatus.CHECKED_IN,
    "checked_in": StationStatus.CHECKED_IN,
    "hastraffic": StationStatus.HAS_TRAFFIC,
    "has_traffic": StationStatus.HAS_TRAFFIC,
    "listening": StationStatus.LISTENING,
    "relay": StationStatus.RELAY,
    "away": StationStatus.AWAY,
    "announcements": StationStatus.ANNOUNCEMENTS,
    "mobile": StationStatus.MOBILE,
    "checkedout": StationStatus.CHECKED_OUT,
    "checked_out": StationStatus.CHECKED_OUT,
}

_EXPLICIT_TZ_RE = re.compile(r"(Z|UTC|GMT|[+-]\d{2}:?\d{2})$", re.IGNORECASE)

_FULL_FORMATS = [
    "%m/%d/%Y %I:%M %p",
    "%m/%d/%Y %H:%M",
    "%d/%m/%Y %I:%M %p",
    "%d/%m/%Y %H:%M",
    "%m/%d/%Y %I:%M:%S %p",
    "%m/%d/%Y %H:%M:%S",
    "%d/%m/%Y %I:%M:%S %p",
    "%d/%m/%Y %H:%M:%S",
    "%Y-%m-%d %I:%M %p",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d %I:%M:%S %p",
    "%Y-%m-%d %H:%M:%S",
]

_FULL_TZ_FORMATS = [
    "%m/%d/%Y %I:%M %p %z",
    "%m/%d/%Y %H:%M %z",
    "%d/%m/%Y %I:%M %p %z",
    "%d/%m/%Y %H:%M %z",
    "%Y-%m-%d %I:%M %p %z",
    "%Y-%m-%d %H:%M %z",
    "%m/%d/%Y %I:%M:%S %p %z",
    "%m/%d/%Y %H:%M:%S %z",
    "%d/%m/%Y %I:%M:%S %p %z",
    "%d/%m/%Y %H:%M:%S %z",
    "%Y-%m-%d %I:%M:%S %p %z",
    "%Y-%m-%d %H:%M:%S %z",
]

_TIME_FORMATS = ["%I:%M %p", "%H:%M", "%I:%M:%S %p", "%H:%M:%S"]


# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------

@dataclass
class CsvImportConfig:
    """Immutable settings built by the router before calling process_csv_rows."""
    net_id: int
    net_window_start: Optional[datetime]
    net_window_end: Optional[datetime]
    import_zone: ZoneInfo
    assume_utc: bool
    frequency_token_map: dict[str, int]   # lowercase token -> frequency_id
    checked_in_by_id: int


@dataclass
class CsvImportResult:
    """Output from process_csv_rows."""
    row_payloads: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    skipped: int = 0


# ---------------------------------------------------------------------------
# Public utilities used by the router
# ---------------------------------------------------------------------------

def decode_csv_bytes(raw_bytes: bytes) -> str:
    """Decode raw file bytes, preferring UTF-8-with-BOM then latin-1."""
    try:
        return raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw_bytes.decode("latin-1")


def build_frequency_token_map(frequencies: list) -> dict[str, int]:
    """
    Build a ``{lowercase_token: frequency_id}`` dict for fuzzy matching.

    *frequencies* should be the list of Frequency ORM objects already
    loaded via selectinload on the Net.
    """
    token_map: dict[str, int] = {}
    for freq in frequencies:
        tokens: set[str] = set()
        if freq.frequency:
            tokens.add(freq.frequency.strip().lower())
            if freq.mode:
                tokens.add(f"{freq.frequency.strip()} {freq.mode.strip()}".lower())
            else:
                tokens.add(freq.frequency.strip().lower())
        if freq.network:
            tokens.add(freq.network.strip().lower())
            if freq.talkgroup:
                tokens.add(f"{freq.network.strip()} tg{freq.talkgroup.strip()}".lower())
                tokens.add(f"{freq.network.strip()} {freq.talkgroup.strip()}".lower())
        for token in tokens:
            if token and token not in token_map:
                token_map[token] = freq.id
    return token_map


def process_csv_rows(reader: csv.DictReader, config: CsvImportConfig) -> CsvImportResult:
    """
    Validate and parse every data row in *reader*.

    Returns a :class:`CsvImportResult` whose ``row_payloads`` are plain
    ``dict`` objects suitable for ``CheckIn(**payload)``.  The caller is
    responsible for looking up ``user_id`` and persisting the objects.
    """
    result = CsvImportResult()
    header_lookup = {_normalize_key(name): name for name in (reader.fieldnames or [])}

    for row_number, row in enumerate(reader, start=2):
        if _should_ignore_sample_row(row, header_lookup):
            result.skipped += 1
            continue

        # -- callsign -------------------------------------------------------
        callsign_raw = _get_value(row, header_lookup, "Callsign", "Call Sign", "Call")
        callsign = callsign_raw.upper().strip()
        if not callsign:
            result.skipped += 1
            result.errors.append(f"Row {row_number}: missing callsign")
            continue
        if not all(ch.isalnum() or ch == "/" for ch in callsign):
            result.skipped += 1
            result.errors.append(f"Row {row_number}: invalid callsign '{callsign}'")
            continue

        # -- status ---------------------------------------------------------
        status_raw = _get_value(row, header_lookup, "Status", "Station Status")
        parsed_status = StationStatus.CHECKED_IN
        if status_raw:
            status_key = _normalize_status(status_raw)
            parsed_status = STATUS_MAP.get(status_key)
            if not parsed_status:
                result.skipped += 1
                result.errors.append(f"Row {row_number}: unrecognized status '{status_raw}'")
                continue

        # -- available frequencies ------------------------------------------
        available_freq_ids = _parse_available_frequency_ids(
            _get_value(
                row, header_lookup,
                "Available Frequencies", "Available Frequency", "Frequencies",
            ),
            config.frequency_token_map,
        )

        # -- timestamp ------------------------------------------------------
        raw_time = _get_value(
            row, header_lookup,
            "Check-in Time", "Check In Time", "Time", "Timestamp", "Checked In At",
        )
        checked_in_at, parse_error = parse_checkin_timestamp(raw_time, config)
        if parse_error:
            result.skipped += 1
            result.errors.append(f"Row {row_number}: {parse_error}")
            continue
        if checked_in_at:
            ts_error = validate_timestamp_window(checked_in_at, raw_time, config)
            if ts_error:
                result.skipped += 1
                result.errors.append(f"Row {row_number}: {ts_error}")
                continue

        # -- build payload --------------------------------------------------
        payload: dict = {
            "net_id": config.net_id,
            "callsign": callsign,
            "name": _get_value(row, header_lookup, "Name", "Operator", "Operator Name"),
            "location": _get_value(row, header_lookup, "Location", "QTH", "Grid", "Grid Square"),
            "skywarn_number": _get_value(row, header_lookup, "Spotter #", "Skywarn #", "Skywarn Number"),
            "weather_observation": _get_value(row, header_lookup, "Weather Observation", "Weather"),
            "power_source": _get_value(row, header_lookup, "Power Src", "Power Source"),
            "power": _get_value(row, header_lookup, "Power"),
            "feedback": _get_value(row, header_lookup, "Feedback"),
            "notes": _get_value(row, header_lookup, "Notes"),
            "relayed_by": (
                _get_value(row, header_lookup, "Relayed By", "Relayed", "Relay By").upper() or None
            ),
            "topic_response": _get_value(row, header_lookup, "Topic Response"),
            "poll_response": _get_value(row, header_lookup, "Poll Response"),
            "custom_fields": "{}",
            "status": parsed_status,
            "frequency_id": available_freq_ids[0] if available_freq_ids else None,
            "available_frequencies": json.dumps(available_freq_ids),
            "is_recheck": False,
            "parent_check_in_id": None,
            "checked_in_by_id": config.checked_in_by_id,
        }

        if checked_in_at:
            # Microsecond offset preserves CSV row order for equal timestamps.
            payload["checked_in_at"] = checked_in_at + timedelta(
                microseconds=len(result.row_payloads)
            )

        result.row_payloads.append(payload)

    return result


def parse_checkin_timestamp(
    raw_value: str,
    config: CsvImportConfig,
) -> tuple[Optional[datetime], Optional[str]]:
    """
    Parse a raw check-in time string to a naive UTC datetime.

    Returns ``(datetime, None)`` on success or ``(None, error_message)``
    on failure.  Explicit timezone markers in the string always take
    precedence over the dialog-level ``assume_utc`` / ``import_zone``
    settings.
    """
    if not raw_value:
        return None, None

    value = raw_value.strip()
    if not value:
        return None, None

    explicit_tz = _has_explicit_timezone(value)
    normalized = _normalize_tz_text(value)

    # ISO-style first (also handles datetime.fromisoformat-parseable strings)
    try:
        parsed_iso = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        if parsed_iso.tzinfo is not None:
            return parsed_iso.astimezone(timezone.utc).replace(tzinfo=None), None
        return _local_naive_to_utc(parsed_iso, config), None
    except ValueError:
        pass

    utc_candidates: list[datetime] = []

    if explicit_tz:
        offset_friendly = re.sub(r"([+-]\d{2}):(\d{2})$", r"\1\2", normalized)
        for fmt in _FULL_TZ_FORMATS:
            try:
                parsed = datetime.strptime(offset_friendly, fmt)
                utc_candidates.append(parsed.astimezone(timezone.utc).replace(tzinfo=None))
            except ValueError:
                continue
    else:
        for fmt in _FULL_FORMATS:
            try:
                parsed = datetime.strptime(normalized, fmt)
                utc_candidates.append(_local_naive_to_utc(parsed, config))
            except ValueError:
                continue

    # Time-only strings — generate candidates over every day in the net window
    parsed_time = None
    for fmt in _TIME_FORMATS:
        try:
            parsed_time = datetime.strptime(normalized, fmt).time()
            break
        except ValueError:
            continue

    if parsed_time and config.net_window_start and config.net_window_end:
        day_cursor = config.net_window_start.date()
        while day_cursor <= config.net_window_end.date():
            naive_candidate = datetime.combine(day_cursor, parsed_time)
            utc_candidates.append(_local_naive_to_utc(naive_candidate, config))
            day_cursor += timedelta(days=1)

    if not utc_candidates:
        return None, (
            f"could not parse check-in time '{raw_value}'. Supported examples: "
            "6/3/2026 2:24 PM, 3/6/2026 14:24, 2026-06-03 14:24, 2:24 PM, 2:24, 14:24."
        )

    deduped = sorted(set(utc_candidates))
    if config.net_window_start and config.net_window_end:
        in_window = [dt for dt in deduped if config.net_window_start <= dt <= config.net_window_end]
        if len(in_window) == 1:
            return in_window[0], None
        if len(in_window) > 1:
            return None, (
                f"time '{raw_value}' is ambiguous (US vs British date ordering). "
                "Use ISO format YYYY-MM-DD HH:MM with timezone (or check UTC)."
            )

    # Parsed but nothing falls in the window — return first value for precise error reporting
    return deduped[0], None


def validate_timestamp_window(
    timestamp: datetime,
    raw_value: str,
    config: CsvImportConfig,
) -> Optional[str]:
    """Return a plain-language error string if *timestamp* is outside the net window."""
    if not config.net_window_start:
        return None
    if timestamp < config.net_window_start:
        return (
            f"time '{raw_value}' resolves to {timestamp.strftime('%Y-%m-%d %H:%M:%S')} UTC, "
            f"which is before the allowed window start "
            f"{config.net_window_start.strftime('%Y-%m-%d %H:%M:%S')} UTC"
        )
    if config.net_window_end and timestamp > config.net_window_end:
        return (
            f"time '{raw_value}' resolves to {timestamp.strftime('%Y-%m-%d %H:%M:%S')} UTC, "
            f"which is after the allowed window end "
            f"{config.net_window_end.strftime('%Y-%m-%d %H:%M:%S')} UTC"
        )
    return None


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _normalize_key(value: str) -> str:
    return "".join(ch for ch in (value or "").strip().lower() if ch.isalnum())


def _normalize_status(value: str) -> str:
    cleaned = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned


def _get_value(row: dict, header_lookup: dict[str, str], *aliases: str) -> str:
    for alias in aliases:
        key = header_lookup.get(_normalize_key(alias))
        if key is None:
            continue
        value = row.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _parse_available_frequency_ids(
    raw_value: str,
    token_map: dict[str, int],
) -> list[int]:
    if not raw_value:
        return []
    candidate_tokens = [p.strip().lower() for p in raw_value.split(",") if p.strip()]
    parsed_ids: list[int] = []
    for token in candidate_tokens:
        freq_id = token_map.get(token)
        if freq_id and freq_id not in parsed_ids:
            parsed_ids.append(freq_id)
    if not parsed_ids:
        exact = token_map.get(raw_value.strip().lower())
        if exact:
            parsed_ids.append(exact)
    return parsed_ids


def _has_explicit_timezone(value: str) -> bool:
    return bool(_EXPLICIT_TZ_RE.search(value.strip()))


def _normalize_tz_text(value: str) -> str:
    cleaned = value.strip()
    cleaned = re.sub(r"\s+(UTC|GMT)$", " +0000", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+Z$", " +0000", cleaned, flags=re.IGNORECASE)
    return cleaned


def _local_naive_to_utc(naive: datetime, config: CsvImportConfig) -> datetime:
    if config.assume_utc:
        return naive
    return naive.replace(tzinfo=config.import_zone).astimezone(timezone.utc).replace(tzinfo=None)


def _should_ignore_sample_row(row: dict, header_lookup: dict[str, str]) -> bool:
    values = [str(v).strip() for v in row.values() if v is not None and str(v).strip()]
    if not values:
        return True
    if SAMPLE_ROW_MARKER in " ".join(values).upper():
        return True
    callsign = _get_value(row, header_lookup, "Callsign", "Call Sign", "Call").upper().strip()
    return callsign.startswith("SAMPLE") or callsign.startswith("ZZ0SAMPLE")
