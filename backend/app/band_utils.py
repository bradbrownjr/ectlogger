"""Derive an amateur radio band label (e.g. "2m", "40m") from a free-text
frequency string (e.g. "146.520 MHz"), for display alongside "can hear"
coverage reports (see routers/can_hear.py). HF propagation on 40m behaves
very differently from VHF on 2m, so knowing the band - not just the exact
frequency - is what makes a coverage report useful at a glance.
"""
import re
from typing import Optional

# (low MHz, high MHz, band label) - US amateur band edges, widest common
# allocation per band. Frequencies outside every range (e.g. commercial FRS,
# out-of-band test frequencies) intentionally return None rather than a
# nearest-guess label.
_BAND_RANGES = [
    (1.8, 2.0, "160m"),
    (3.5, 4.0, "80m"),
    (5.0, 5.5, "60m"),
    (7.0, 7.3, "40m"),
    (10.1, 10.15, "30m"),
    (14.0, 14.35, "20m"),
    (18.068, 18.168, "17m"),
    (21.0, 21.45, "15m"),
    (24.89, 24.99, "12m"),
    (28.0, 29.7, "10m"),
    (50.0, 54.0, "6m"),
    (144.0, 148.0, "2m"),
    (219.0, 225.0, "1.25m"),
    (420.0, 450.0, "70cm"),
    (902.0, 928.0, "33cm"),
    (1240.0, 1300.0, "23cm"),
]

_FREQUENCY_PATTERN = re.compile(r"(\d+(?:\.\d+)?)")


def band_from_frequency_string(frequency: Optional[str]) -> Optional[str]:
    """Map a Frequency.frequency value to its amateur band label.

    Returns None for digital-mode entries with no analog frequency (the
    field is nullable), unparseable text, or a value outside every mapped
    band range.
    """
    if not frequency:
        return None
    match = _FREQUENCY_PATTERN.search(frequency)
    if not match:
        return None
    try:
        mhz = float(match.group(1))
    except ValueError:
        return None
    for low, high, label in _BAND_RANGES:
        if low <= mhz <= high:
            return label
    return None
