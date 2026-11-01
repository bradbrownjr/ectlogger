"""
Regression test for the net/schedule logo upload format bug (2026-09-15):
uploading a PNG with a transparent background came back as a JPEG with a
solid black background, because save_resized_logo (then inlined separately
in nets_core.py and templates_core.py) unconditionally converted every
upload to JPEG -- which has no alpha channel -- before saving. PNG, JPEG,
and WebP are all natively viewable in a standard browser, so there's no
reason to normalize between them; the fix keeps the uploaded format
(flattening to RGB only for a JPEG source, which has no alpha to lose).
"""
from pathlib import Path

from PIL import Image

from app.utils import save_resized_logo


def _transparent_png() -> Image.Image:
    img = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    for x in range(100, 200):
        for y in range(100, 200):
            img.putpixel((x, y), (255, 0, 0, 255))
    return img


def test_transparent_png_stays_png_with_alpha(tmp_path: Path):
    dest = save_resized_logo(_transparent_png(), tmp_path, 256)

    assert dest.suffix == ".png"
    saved = Image.open(dest)
    assert saved.mode == "RGBA"
    # A corner outside the opaque red square should still be fully transparent,
    # not composited onto black.
    assert saved.getpixel((0, 0))[3] == 0


def test_jpeg_source_still_flattened_to_rgb(tmp_path: Path):
    img = Image.new("RGB", (300, 300), (10, 20, 30))
    img.format = "JPEG"
    dest = save_resized_logo(img, tmp_path, 256)

    assert dest.suffix == ".jpg"
    saved = Image.open(dest)
    assert saved.mode == "RGB"


def test_webp_source_preserved(tmp_path: Path):
    img = _transparent_png()
    img.format = "WEBP"
    dest = save_resized_logo(img, tmp_path, 256)

    assert dest.suffix == ".webp"
    saved = Image.open(dest)
    assert saved.getpixel((0, 0))[3] == 0


def test_file_is_named_after_its_contents(tmp_path: Path):
    first = save_resized_logo(_transparent_png(), tmp_path, 256)
    again = save_resized_logo(_transparent_png(), tmp_path, 256)
    other = save_resized_logo(Image.new("RGB", (300, 300), (1, 2, 3)), tmp_path, 256)

    assert first.name.startswith("logo-")
    assert first == again
    assert other != first
