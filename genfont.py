# genfont.py — bake Liberation Serif glyphs into fonts.bin for main.ts.
# My own format ("VL51"): magic 4s, u32 glyph count, then per glyph:
#   u16 codepoint, u8 weight (0=Regular, 1=Bold), u8 size, i8 offX, i8 offY,
#   u8 w, u8 h, u16 advance*64, then w*h bytes of 4-bit coverage packed
#   two pixels per byte (high nibble first). offY is the glyph top relative
#   to the text baseline (negative = above baseline).
import struct, sys
from PIL import ImageFont

REG = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
BOLD = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 20, 22, 26, 34, 46, 52]
CHARS = "".join(chr(c) for c in range(32, 127))
CHARS += "\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u2022\u00b7\u00e9\u00ed\u00fc\u00f1\u00e0\u00d7\u00b0\u00bd"

def bake(path, size, ch):
    f = ImageFont.truetype(path, size)
    # advance width
    adv = f.getlength(ch)
    # getmask2 gives the mask plus its top-left offset from the pen
    # origin (baseline); the mask top sits off[1] below the ascent line,
    # so ink top relative to the baseline is off[1] - ascent + bbox top.
    mask, off = f.getmask2(ch)
    bbox = mask.getbbox()
    if bbox is None:
        return (0, 0, 0, 0, adv, b"")
    x0, y0, x1, y1 = bbox
    asc, desc = f.getmetrics()
    gw, gh = x1 - x0, y1 - y0
    off_y = off[1] + y0 - asc  # top of ink relative to baseline (negative above)
    off_x = off[0] + x0  # left bearing relative to pen origin
    px = bytearray()
    for yy in range(y0, y1):
        for xx in range(x0, x1, 2):
            a = mask.getpixel((xx, yy)) >> 4
            b = 0
            if xx + 1 < x1:
                b = mask.getpixel((xx + 1, yy)) >> 4
            px.append((a << 4) | b)
    return (off_x, off_y, gw, gh, adv, bytes(px))

def main():
    out = bytearray(b"VL51")
    glyphs = []
    for weight, path in ((0, REG), (1, BOLD)):
        for size in SIZES:
            for ch in CHARS:
                cp = ord(ch)
                off_x, off_y, w, h, adv, px = bake(path, size, ch)
                if w == 0 or h == 0:
                    # space etc: still record advance, zero-size bitmap
                    glyphs.append((cp, weight, size, 0, 0, 0, 0, adv, b""))
                else:
                    glyphs.append((cp, weight, size, off_x, off_y, w, h, adv, px))
    out += struct.pack("<I", len(glyphs))
    for cp, weight, size, ox, oy, w, h, adv, px in glyphs:
        out += struct.pack("<HBBbbBBH", cp, weight, size, ox, oy, w, h, int(round(adv * 64)))
        out += px
    open("fonts.bin", "wb").write(bytes(out))
    print("glyphs:", len(glyphs), "bytes:", len(out))

if __name__ == "__main__":
    main()
