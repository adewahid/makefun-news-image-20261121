#!/usr/bin/env python3
"""Bake Liberation Serif (regular + bold) into fonts.bin for the news page.

Own minimal TrueType reader (stdlib only): parses cmap format 4, head, maxp,
hhea, hmtx, loca and glyf, flattens quadratic outlines and rasterises each
glyph at 2x supersampling into an 8-bit coverage bitmap.

Output format (little-endian):
  magic "FNT1", u32 face_count
  per face: u8 name_len, name bytes, u32 size_count
    per size: u16 px, u16 glyph_count
      per glyph: u32 codepoint, i16 advance, i16 bearing_x, i16 bearing_y,
                 u16 width, u16 height, width*height bytes of coverage (0-255)
Usage: python3 genfont.py [out.bin]
"""
import struct
import sys

REG = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
BOLD = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"

CHARS = list(range(32, 127)) + [
    0x00B7,  # middle dot
    0x00B0,  # degree
    0x00D7,  # multiplication sign
    0x2013,  # en dash
    0x2014,  # em dash
    0x2018,  # left single quote
    0x2019,  # right single quote
    0x201C,  # left double quote
    0x201D,  # right double quote
    0x2022,  # bullet
    0x2212,  # minus sign
]
SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 19, 20, 24, 28, 34, 44]
SS = 2  # supersample factor


def u16(b, o):
    return struct.unpack_from(">H", b, o)[0]


def i16(b, o):
    return struct.unpack_from(">h", b, o)[0]


def u32(b, o):
    return struct.unpack_from(">I", b, o)[0]


class TTF:
    def __init__(self, path):
        self.data = open(path, "rb").read()
        n = u16(self.data, 4)
        self.tables = {}
        for i in range(n):
            o = 12 + i * 16
            tag = self.data[o:o + 4].decode("latin-1")
            self.tables[tag] = (u32(self.data, o + 8), u32(self.data, o + 12))
        self.upem = u16(self.table("head"), 18)
        self.index_to_loc = i16(self.table("head"), 50)
        self.num_glyphs = u16(self.table("maxp"), 4)
        self.num_hmetrics = u16(self.table("hhea"), 34)
        self._cmap4 = self._load_cmap4()
        self._loca = self._load_loca()

    def table(self, tag):
        off, _ln = self.tables[tag]
        return self.data[off:]

    def _load_cmap4(self):
        cm = self.table("cmap")
        count = u16(cm, 2)
        best = None
        for i in range(count):
            plat, enc, off = u16(cm, 4 + i * 8), u16(cm, 6 + i * 8), u32(cm, 8 + i * 8)
            if u16(cm, off) == 4:
                if plat == 3 and enc == 1:
                    best = off
                    break
                if best is None:
                    best = off
        if best is None:
            raise ValueError("no cmap format 4")
        o = best
        seg = u16(cm, o + 6) // 2
        end = [u16(cm, o + 14 + 2 * i) for i in range(seg)]
        start = [u16(cm, o + 16 + 2 * seg + 2 * i) for i in range(seg)]
        delta = [i16(cm, o + 16 + 4 * seg + 2 * i) for i in range(seg)]
        ro_off = o + 16 + 6 * seg
        ro = [u16(cm, ro_off + 2 * i) for i in range(seg)]
        glyphs_base = ro_off + 2 * seg
        mapping = {}
        for s in range(seg):
            if end[s] == 0xFFFF and start[s] == 0xFFFF:
                continue
            for cp in range(start[s], end[s] + 1):
                if ro[s] == 0:
                    gid = (cp + delta[s]) % 65536
                else:
                    idx = ro_off + 2 * s + ro[s] + 2 * (cp - start[s])
                    gid = u16(cm, idx)
                    if gid:
                        gid = (gid + delta[s]) % 65536
                mapping[cp] = gid
        return mapping

    def _load_loca(self):
        lo = self.table("loca")
        out = []
        if self.index_to_loc == 0:
            for i in range(self.num_glyphs + 1):
                out.append(u16(lo, 2 * i) * 2)
        else:
            for i in range(self.num_glyphs + 1):
                out.append(u32(lo, 4 * i))
        return out

    def advance(self, gid):
        hm = self.table("hmtx")
        if gid < self.num_hmetrics:
            return u16(hm, gid * 4)
        return u16(hm, (self.num_hmetrics - 1) * 4)

    def glyph_outlines(self, gid, depth=0):
        """Return list of contours; each contour is a list of (x, y, on_curve)."""
        if gid >= self.num_glyphs or depth > 3:
            return []
        glyf = self.table("glyf")
        start, end = self._loca[gid], self._loca[gid + 1]
        if end <= start:
            return []
        o = start
        n_cont = i16(glyf, o)
        if n_cont >= 0:
            return self._simple(glyf, o, n_cont)
        # composite glyph
        contours = []
        o += 10
        while True:
            flags = u16(glyf, o)
            comp = u16(glyf, o + 2)
            o += 4
            if flags & 0x0001:
                dx, dy = i16(glyf, o), i16(glyf, o + 2)
                o += 4
            else:
                dx, dy = struct.unpack_from(">bb", glyf, o)
                o += 2
            if flags & 0x0008:  # scale
                o += 2
            elif flags & 0x0040:  # x/y scale
                o += 4
            elif flags & 0x0080:  # 2x2
                o += 8
            for c in self.glyph_outlines(comp, depth + 1):
                contours.append([(x + dx, y + dy, on) for (x, y, on) in c])
            if not (flags & 0x0020):
                break
        return contours

    def _simple(self, glyf, o, n_cont):
        end_pts = [u16(glyf, o + 10 + 2 * i) for i in range(n_cont)]
        n_pts = end_pts[-1] + 1 if end_pts else 0
        p = o + 10 + 2 * n_cont
        instr_len = u16(glyf, p)
        p += 2 + instr_len
        flags = []
        while len(flags) < n_pts:
            f = glyf[p]
            p += 1
            flags.append(f)
            if f & 0x08:
                rep = glyf[p]
                p += 1
                flags.extend([f] * rep)
        xs = []
        x = 0
        for f in flags:
            if f & 0x02:
                d = glyf[p]
                p += 1
                x += d if (f & 0x10) else -d
            elif not (f & 0x10):
                x += i16(glyf, p)
                p += 2
            xs.append(x)
        ys = []
        y = 0
        for f in flags:
            if f & 0x04:
                d = glyf[p]
                p += 1
                y += d if (f & 0x20) else -d
            elif not (f & 0x20):
                y += i16(glyf, p)
                p += 2
            ys.append(y)
        contours = []
        s0 = 0
        for e in end_pts:
            pts = [(xs[i], ys[i], bool(flags[i] & 0x01)) for i in range(s0, e + 1)]
            contours.append(pts)
            s0 = e + 1
        return contours


def flatten(contour):
    """Flatten one contour to a list of (x, y) polygon points."""
    pts = contour
    n = len(pts)
    if n == 0:
        return []
    # rotate so we start on an on-curve point
    start = 0
    for i, p in enumerate(pts):
        if p[2]:
            start = i
            break
    else:
        # all off-curve: implied on-curve midpoint between last and first
        mx = (pts[-1][0] + pts[0][0]) / 2
        my = (pts[-1][1] + pts[0][1]) / 2
        pts = pts + [(mx, my, True)]
        start = len(pts) - 1
    order = pts[start:] + pts[:start]
    out = [(order[0][0], order[0][1])]
    i = 1
    while i < len(order):
        p0 = out[-1]
        p1 = order[i]
        if p1[2]:
            out.append((p1[0], p1[1]))
            i += 1
        else:
            # quadratic to next on-curve (or implied midpoint)
            if i + 1 < len(order):
                p2 = order[i + 1]
                if p2[2]:
                    end = (p2[0], p2[1])
                    nxt = i + 2
                else:
                    end = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
                    nxt = i + 1
            else:
                end = (order[0][0], order[0][1])
                nxt = i + 1
            cx, cy = p1[0], p1[1]
            steps = 10
            for s in range(1, steps + 1):
                t = s / steps
                mt = 1 - t
                x = mt * mt * p0[0] + 2 * mt * t * cx + t * t * end[0]
                y = mt * mt * p0[1] + 2 * mt * t * cy + t * t * end[1]
                out.append((x, y))
            i = nxt
    return out


def rasterise(polys, w, h):
    """Even-odd scanline fill of polygons into an h x w coverage array (0..255)."""
    # build edges
    edges = []
    for poly in polys:
        for i in range(len(poly)):
            x0, y0 = poly[i]
            x1, y1 = poly[(i + 1) % len(poly)]
            if y0 == y1:
                continue
            edges.append((x0, y0, x1, y1))
    buf = bytearray(w * h)
    for row in range(h):
        yc = row + 0.5
        xs = []
        for (x0, y0, x1, y1) in edges:
            if (y0 <= yc < y1) or (y1 <= yc < y0):
                t = (yc - y0) / (y1 - y0)
                xs.append(x0 + t * (x1 - x0))
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            a = max(0, int(xs[k] + 0.5))
            b = min(w, int(xs[k + 1] + 0.5))
            for x in range(a, b):
                buf[row * w + x] = 255
    return buf


def bake(ttf, px):
    scale = px * SS / ttf.upem
    glyphs = []
    for cp in CHARS:
        gid = ttf._cmap4.get(cp, 0)
        contours = ttf.glyph_outlines(gid) if gid else []
        polys = [flatten(c) for c in contours]
        polys = [p for p in polys if len(p) >= 2]
        adv = ttf.advance(gid)
        advance = int(round(adv * px / ttf.upem))
        if not polys:
            glyphs.append((cp, advance, 0, 0, 0, 0, b""))
            continue
        xs = [x for p in polys for (x, _y) in p]
        ys = [y for p in polys for (_x, y) in p]
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        # supersampled bitmap, then box-downsample to px grid
        sw = max(1, int((x1 - x0) * scale) + 2)
        sh = max(1, int((y1 - y0) * scale) + 2)
        ox = -x0 * scale + 1
        oy = y1 * scale + 1  # font y is up; bitmap y is down
        sp = [[(x * scale + ox, oy - y * scale) for (x, y) in p] for p in polys]
        big = rasterise(sp, sw, sh)
        w = (sw + SS - 1) // SS
        h = (sh + SS - 1) // SS
        cov = bytearray(w * h)
        for r in range(h):
            for c in range(w):
                s = 0
                for dr in range(SS):
                    for dc in range(SS):
                        br, bc = r * SS + dr, c * SS + dc
                        if br < sh and bc < sw:
                            s += big[br * sw + bc]
                cov[r * w + c] = s * 255 // (SS * SS * 255)
        bx = int(round(x0 * px / ttf.upem))
        by = int(round(y1 * px / ttf.upem))
        glyphs.append((cp, advance, bx, by, w, h, bytes(cov)))
    return glyphs


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "fonts.bin"
    faces = [("serif", REG), ("serif-bold", BOLD)]
    blob = bytearray()
    blob += b"FNT1"
    blob += struct.pack("<I", len(faces))
    for name, path in faces:
        ttf = TTF(path)
        nb = name.encode()
        blob += struct.pack("<B", len(nb)) + nb
        blob += struct.pack("<I", len(SIZES))
        for px in SIZES:
            glyphs = bake(ttf, px)
            blob += struct.pack("<HH", px, len(glyphs))
            for (cp, adv, bx, by, w, h, cov) in glyphs:
                blob += struct.pack("<IhhhHH", cp, adv, bx, by, w, h)
                blob += cov
        print(f"face {name}: {len(CHARS)} glyphs x {len(SIZES)} sizes")
    open(out_path, "wb").write(blob)
    print(f"wrote {out_path}: {len(blob)} bytes")


if __name__ == "__main__":
    main()
