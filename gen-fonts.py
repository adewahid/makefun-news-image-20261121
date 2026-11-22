#!/usr/bin/env python3
"""Build-time font asset generator for the news21 v4 entry.

Rasterises the system Liberation Serif fonts (Regular + Bold) into a
compact bitmap atlas, fonts.bin, that main.ts reads at run time. This
script runs once on the build machine; it is NOT part of the entry
program. Output format (all little-endian):

  bytes 0..3    magic "LFNT"
  bytes 4..7    u32 length of the JSON index that follows
  bytes 8..     JSON index, then the raw 4-bit-packed glyph pixels

The JSON index maps "R"/"B" -> size -> codepoint -> [advance, dx, dy,
w, h, offset, length]. advance/dx are in pixels; dy is the glyph top
relative to the ascender line; pixels are 4-bit grey (0..15) packed
two per byte, row-major, w*h nibbles.
"""
import json
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONT_DIR = Path("/usr/share/fonts/truetype/liberation")
FONTS = {"R": FONT_DIR / "LiberationSerif-Regular.ttf",
         "B": FONT_DIR / "LiberationSerif-Bold.ttf"}
SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24, 28, 34, 46]
# Printable ASCII plus the few extra punctuation marks the layout uses.
CODEPOINTS = list(range(32, 127)) + [
    0x2014,  # em dash
    0x2013,  # en dash
    0x2019,  # right single quote
    0x2018,  # left single quote
    0x201C,  # left double quote
    0x201D,  # right double quote
    0x2022,  # bullet
    0x00D7,  # multiplication sign
    0x2248,  # almost equal
    0x00E9,  # e-acute
]


def rasterise(font, ch, px):
    """Return (advance, dx, dy, w, h, nibbles) for one glyph."""
    advance = font.getlength(ch)
    pad = px
    img = Image.new("L", (4 * px + 8, 3 * px + 8), 0)
    draw = ImageDraw.Draw(img)
    # anchor "la": left edge, ascender top at y=pad.
    draw.text((pad, pad), ch, font=font, fill=255, anchor="la")
    bbox = img.getbbox()
    if bbox is None:  # space and other blank glyphs
        return advance, 0, 0, 0, 0, b""
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    crop = img.crop((x0, y0, x1, y1))
    pxs = list(crop.getdata())
    nibbles = bytearray()
    for i in range(0, len(pxs), 2):
        hi = pxs[i] >> 4
        lo = (pxs[i + 1] >> 4) if i + 1 < len(pxs) else 0
        nibbles.append((hi << 4) | lo)
    return advance, x0 - pad, y0 - pad, w, h, bytes(nibbles)


def main():
    index = {}
    blob = bytearray()
    for weight, path in FONTS.items():
        if not path.exists():
            sys.exit(f"missing font: {path}")
        index[weight] = {}
        for px in SIZES:
            font = ImageFont.truetype(str(path), px)
            glyphs = {}
            for cp in CODEPOINTS:
                ch = chr(cp)
                adv, dx, dy, w, h, data = rasterise(font, ch, px)
                off = len(blob)
                blob.extend(data)
                glyphs[str(cp)] = [round(adv, 2), dx, dy, w, h, off, len(data)]
            index[weight][str(px)] = glyphs
    payload = json.dumps(index, separators=(",", ":")).encode("utf-8")
    out = HERE / "fonts.bin"
    with open(out, "wb") as f:
        f.write(b"LFNT")
        f.write(struct.pack("<I", len(payload)))
        f.write(payload)
        f.write(blob)
    print(f"wrote {out} {out.stat().st_size} bytes "
          f"({len(CODEPOINTS)} glyphs x {len(SIZES)} sizes x 2 weights)")


if __name__ == "__main__":
    main()
