"""Report accent colors derived from a net/schedule logo.

Net reports and schedule reports tint their masthead, figures and headings
to match the club's logo. The color is never the raw pixel color: an
uploaded logo can be any color, and a pale yellow or a muddy brown taken
literally would be unreadable or ugly on a white page. Instead each logo is
mapped onto ``ACCENT_PALETTE``, a short list of standard colors that were
all checked to be readable on white (``tests/test_logo_accent.py`` enforces
WCAG AA 4.5:1). A logo whose colors don't clearly belong to one of those
families (greyscale, black-and-white, brown, olive, yellow) gets no accent,
and the frontend falls back to the app's own primary color.

Computed on demand from the file ``logo_url`` points at and cached per
(path, mtime), rather than stored in a column: a net copies its schedule's
``logo_url`` string when it is created, so a stored color would need to be
copied at every one of those sites too, and would silently go stale if a
logo file were ever replaced by hand. Deriving it from the file means every
logo ever uploaded is covered with no backfill, and a replaced file is
picked up automatically.
"""

import colorsys
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from PIL import Image

from .utils import NET_LOGO_DIR

# The one place logo_url values are served from (main.py mounts NET_LOGO_DIR
# here). Anything else -- an external URL, a stale path -- has no accent.
_LOGO_URL_PREFIX = "/api/net-logos/"

# ========== PALETTE ==========
# family -> (dark tone, light tone). Every value must stay >= 4.5:1 against
# white; the test suite checks each one.
ACCENT_PALETTE = {
    "red": ("#8e1b2c", "#c62828"),      # maroon / red
    "orange": ("#a3400f", "#b7410e"),   # burnt orange only; bright orange is too light
    "green": ("#1b5e20", "#2e7d32"),    # forest / green
    "teal": ("#00695c", "#00796b"),
    "blue": ("#1f3d8f", "#1565c0"),     # navy / blue
    "purple": ("#4a148c", "#6a1b9a"),
    "pink": ("#880e4f", "#ad1457"),
}

# Hue (degrees) -> family. Yellow/gold (roughly 42-70) is deliberately absent:
# darkened enough to read on white it turns olive, which is exactly the
# "gross" color this module exists to avoid.
_HUE_FAMILIES = [
    (0, 15, "red"),
    (15, 42, "orange"),
    (70, 160, "green"),
    (160, 195, "teal"),
    (195, 255, "blue"),
    (255, 295, "purple"),
    (295, 340, "pink"),
    (340, 360, "red"),
]

# Neighboring families on the hue wheel. A second accent from a neighbor is
# usually the same element straddling a boundary (an orange-red ring counted
# as both red and orange), so it is skipped in favor of a real second color.
_ADJACENT = {
    frozenset(p) for p in [
        ("red", "orange"), ("green", "teal"), ("teal", "blue"),
        ("blue", "purple"), ("purple", "pink"), ("pink", "red"),
    ]
}

_MIN_SATURATION = 0.35      # below this a pixel is grey-ish, not a color
_MIN_VALUE = 0.18           # below this it reads as black
_MAX_WHITE_VALUE = 0.93     # with low saturation above this it's white
_MIN_CHROMATIC_SHARE = 0.04  # of opaque pixels, for the logo to count as colored
_SECONDARY_SHARE = 0.12     # second family must carry this much of the first's weight
_DARK_TONE_BELOW = 0.62     # mean HSV value under this picks the family's dark tone
# Orange hue at low value/saturation is brown; skip it rather than mapping
# a brown logo onto burnt orange.
_BROWN_MAX_VALUE = 0.62
_BROWN_MAX_SATURATION = 0.75


def _family_for(h: float, s: float, v: float) -> Optional[str]:
    """Map one pixel's HSV (0-1 each) to a palette family, or None."""
    if s < _MIN_SATURATION or v < _MIN_VALUE:
        return None
    deg = h * 360
    for lo, hi, family in _HUE_FAMILIES:
        if lo <= deg < hi:
            if family == "orange" and (v < _BROWN_MAX_VALUE or s < _BROWN_MAX_SATURATION):
                return None
            return family
    return None


def pick_accent_colors(image: Image.Image) -> List[str]:
    """Return 0, 1 or 2 palette hex colors for a logo image.

    [] means "no usable color" (greyscale, mostly brown/yellow, or nearly
    all white/black). The first entry is the main accent; the second, when
    present, is a clearly different color family also in the logo.
    """
    img = image.convert("RGBA")
    img.thumbnail((64, 64))
    weights: dict[str, float] = {}
    values: dict[str, list[float]] = {}
    opaque = 0
    # tobytes() rather than getdata(), which Pillow deprecates in 14.
    data = img.tobytes()
    for i in range(0, len(data), 4):
        r, g, b, a = data[i:i + 4]
        if a < 128:
            continue
        opaque += 1
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if v > _MAX_WHITE_VALUE and s < _MIN_SATURATION:
            continue
        family = _family_for(h, s, v)
        if family is None:
            continue
        # Weight by saturation so vivid pixels outvote anti-aliased edges.
        weights[family] = weights.get(family, 0.0) + s
        values.setdefault(family, []).append(v)

    if not opaque or not weights:
        return []
    chromatic = sum(len(v) for v in values.values())
    if chromatic / opaque < _MIN_CHROMATIC_SHARE:
        return []

    ranked = sorted(weights, key=weights.get, reverse=True)

    def tone(family: str) -> str:
        vals = values[family]
        dark, light = ACCENT_PALETTE[family]
        return dark if sum(vals) / len(vals) < _DARK_TONE_BELOW else light

    primary = ranked[0]
    colors = [tone(primary)]
    for family in ranked[1:]:
        if weights[family] < weights[primary] * _SECONDARY_SHARE:
            break
        if frozenset((primary, family)) not in _ADJACENT:
            colors.append(tone(family))
            break
    return colors


@lru_cache(maxsize=512)
def _accent_for_file(path: str, mtime_ns: int) -> tuple:
    # mtime_ns is part of the cache key only, so a replaced file is re-read.
    try:
        with Image.open(path) as im:
            return tuple(pick_accent_colors(im))
    except Exception:
        return ()


def logo_accent_colors(logo_url: Optional[str]) -> List[str]:
    """Accent colors for a stored logo_url, or [] when there is none."""
    if not logo_url or not logo_url.startswith(_LOGO_URL_PREFIX):
        return []
    name = logo_url[len(_LOGO_URL_PREFIX):]
    path = NET_LOGO_DIR / name
    # Guard against a crafted "../" in a stored URL escaping the logo dir.
    if Path(name).name != name:
        return []
    try:
        mtime_ns = path.stat().st_mtime_ns
    except OSError:
        return []
    return list(_accent_for_file(str(path), mtime_ns))
