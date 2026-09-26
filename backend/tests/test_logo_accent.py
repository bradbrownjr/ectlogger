"""
Report accent colors picked from a net/schedule logo (app/logo_accent.py).

Two guarantees matter to the reports: every color handed out is readable
on the white report page, and a logo whose colors don't clearly belong to
one of the standard palette families gets no accent (the app's own blue is
used instead) rather than an ugly or illegible one.
"""
import os
from pathlib import Path

from PIL import Image, ImageDraw

from app import logo_accent
from app.logo_accent import ACCENT_PALETTE, logo_accent_colors, pick_accent_colors


def _contrast_on_white(hex_color: str) -> float:
    def channel(c: int) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    lum = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    return 1.05 / (lum + 0.05)


def _seal(ring: tuple, inner: tuple | None = None, bg=(0, 0, 0, 0)) -> Image.Image:
    """A round logo: a thick colored ring, white middle, optional inner mark."""
    img = Image.new("RGBA", (200, 200), bg)
    d = ImageDraw.Draw(img)
    d.ellipse([10, 10, 190, 190], fill=ring)
    d.ellipse([45, 45, 155, 155], fill=(255, 255, 255, 255))
    if inner:
        d.rectangle([80, 70, 120, 130], fill=inner)
    return img


def test_every_palette_color_is_readable_on_white():
    for family, tones in ACCENT_PALETTE.items():
        for tone in tones:
            assert _contrast_on_white(tone) >= 4.5, f"{family} {tone}"


def test_navy_ring_with_red_mark_gives_two_accents():
    colors = pick_accent_colors(_seal((30, 60, 150, 255), (220, 30, 40, 255)))
    assert colors == [ACCENT_PALETTE["blue"][0], ACCENT_PALETTE["red"][1]]


def test_single_color_logo_gives_one_accent():
    assert pick_accent_colors(_seal((60, 170, 70, 255))) == [ACCENT_PALETTE["green"][1]]


def test_pale_color_maps_to_readable_palette_tone():
    # Light sky blue would be unreadable as text; it maps to the blue family.
    colors = pick_accent_colors(_seal((150, 200, 250, 255)))
    assert colors == [ACCENT_PALETTE["blue"][1]]


def test_greyscale_logo_has_no_accent():
    assert pick_accent_colors(_seal((90, 90, 90, 255))) == []


def test_black_and_white_logo_has_no_accent():
    assert pick_accent_colors(_seal((0, 0, 0, 255))) == []


def test_yellow_logo_has_no_accent():
    # Darkened to be readable, yellow becomes olive: fall back instead.
    assert pick_accent_colors(_seal((245, 200, 20, 255))) == []


def test_brown_logo_has_no_accent():
    assert pick_accent_colors(_seal((120, 80, 40, 255))) == []


def test_transparent_background_is_ignored():
    # Fully transparent pixels whose RGB happens to be vivid must not count.
    img = _seal((30, 60, 150, 255), bg=(255, 0, 0, 0))
    assert pick_accent_colors(img) == [ACCENT_PALETTE["blue"][0]]


def test_neighboring_hue_is_not_a_second_accent():
    # An orange-red ring straddles the red/orange boundary; it is one color.
    img = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 99, 199], fill=(225, 40, 20, 255))
    d.rectangle([100, 0, 199, 199], fill=(235, 95, 20, 255))
    assert len(pick_accent_colors(img)) == 1


def test_logo_accent_colors_reads_the_served_file(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(logo_accent, "NET_LOGO_DIR", tmp_path)
    _seal((60, 170, 70, 255)).save(tmp_path / "template-7.png")
    assert logo_accent_colors("/api/net-logos/template-7.png") == [ACCENT_PALETTE["green"][1]]

    # A replaced file (new mtime) is re-read, not served from the cache.
    _seal((30, 60, 150, 255)).save(tmp_path / "template-7.png")
    st = os.stat(tmp_path / "template-7.png")
    os.utime(tmp_path / "template-7.png", ns=(st.st_atime_ns, st.st_mtime_ns + 10_000_000))
    assert logo_accent_colors("/api/net-logos/template-7.png") == [ACCENT_PALETTE["blue"][0]]


def test_logo_accent_colors_rejects_missing_and_foreign_urls(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(logo_accent, "NET_LOGO_DIR", tmp_path)
    assert logo_accent_colors(None) == []
    assert logo_accent_colors("/api/net-logos/nope.png") == []
    assert logo_accent_colors("https://example.com/logo.png") == []
    assert logo_accent_colors("/api/net-logos/../secret.png") == []
