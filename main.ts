// THE WORLD LEDGER — Saturday, 21 November 2026.
// A from-scratch newspaper front page drawn in code: 36 real stories
// from 21 November 2026 in three layers (4 illustrated leads, 8 picture
// stories, 24 briefs), a world map with numbered pins, a numbers strip,
// a region bar and a DATE CHECK footer. Node 22 standard library only.
// Usage: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Output is deterministic: two runs write byte-identical entry.png files.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- PNG ----
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- canvas ----
type RGB = [number, number, number];
const PAPER: RGB = [247, 241, 227];
const INK: RGB = [26, 26, 26];
const RED: RGB = [176, 30, 36];
const GREY: RGB = [110, 104, 92];
const WHITE: RGB = [255, 255, 255];
const CARD: RGB = [255, 253, 247];
const SEA: RGB = [198, 220, 230];
const LAND: RGB = [232, 220, 191];
const LINE: RGB = [26, 26, 26];

class Canvas {
  buf = new Uint8Array(W * H * 3);
  constructor() {
    this.fillRect(0, 0, W, H, PAPER);
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  blend(x: number, y: number, c: RGB, a: number): void {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 3;
    if (a >= 1) {
      this.buf[i] = c[0];
      this.buf[i + 1] = c[1];
      this.buf[i + 2] = c[2];
      return;
    }
    this.buf[i] = Math.round(c[0] * a + this.buf[i] * (1 - a));
    this.buf[i + 1] = Math.round(c[1] * a + this.buf[i + 1] * (1 - a));
    this.buf[i + 2] = Math.round(c[2] * a + this.buf[i + 2] * (1 - a));
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * W + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        this.buf[i] = c[0];
        this.buf[i + 1] = c[1];
        this.buf[i + 2] = c[2];
        i += 3;
      }
    }
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }
  hline(x: number, y: number, w: number, c: RGB, t = 1): void {
    this.fillRect(x, y, w, t, c);
  }
  vline(x: number, y: number, h: number, c: RGB, t = 1): void {
    this.fillRect(x, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const r = Math.floor(t / 2);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + (dx * s) / steps);
      const y = Math.round(y0 + (dy * s) / steps);
      this.fillRect(x - r, y - r, t, t, c);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const hw = Math.floor(Math.sqrt(r * r - y * y));
      this.fillRect(cx - hw, cy + y, hw * 2 + 1, 1, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB, t = 1): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      for (let k = 0; k < t; k++) {
        this.set(Math.round(cx + (r + k - Math.floor(t / 2)) * Math.cos(rad)), Math.round(cy + (r + k - Math.floor(t / 2)) * Math.sin(rad)), c);
      }
    }
  }
  // Even-odd scanline fill of a polygon given as [x, y] pairs.
  poly(pts: [number, number][], c: RGB): void {
    if (pts.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        this.fillRect(Math.ceil(xs[k]), y, Math.floor(xs[k + 1]) - Math.ceil(xs[k]), 1, c);
      }
    }
  }
}

// -------------------------------------------------------------- fonts ----
type Glyph = [number, number, number, number, number, number, number]; // adv,dx,dy,w,h,off,len
type FontIndex = Record<string, Record<string, Record<string, Glyph>>>;

class Fonts {
  index: FontIndex;
  blob: Buffer;
  constructor(path: string) {
    const raw = readFileSync(path);
    if (raw.subarray(0, 4).toString('ascii') !== 'LFNT') throw new Error('bad fonts.bin');
    const jsonLen = raw.readUInt32LE(4);
    this.index = JSON.parse(raw.subarray(8, 8 + jsonLen).toString('utf-8')) as FontIndex;
    this.blob = raw.subarray(8 + jsonLen);
  }
  glyph(weight: string, size: number, ch: string): Glyph | null {
    const bySize = this.index[weight]?.[String(size)];
    if (!bySize) return null;
    return bySize[String(ch.codePointAt(0))] ?? null;
  }
  advance(weight: string, size: number, text: string): number {
    let total = 0;
    for (const ch of text) {
      const g = this.glyph(weight, size, ch);
      total += g ? g[0] : this.glyph(weight, size, ' ')?.[0] ?? size * 0.5;
    }
    return total;
  }
  // Draw text; (x, y) is the left edge and the ascender top of the line.
  draw(cv: Canvas, text: string, x: number, y: number, size: number, weight: string, color: RGB): number {
    let pen = x;
    for (const ch of text) {
      const g = this.glyph(weight, size, ch);
      if (!g) {
        pen += size * 0.5;
        continue;
      }
      const [adv, dx, dy, w, h, off, len] = g;
      if (w > 0 && h > 0) {
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) {
            const idx = row * w + col;
            const byte = this.blob[off + Math.floor(idx / 2)];
            const nib = idx % 2 === 0 ? byte >> 4 : byte & 0x0f;
            if (nib > 0) cv.blend(Math.round(pen) + dx + col, Math.round(y) + dy + row, color, nib / 15);
          }
        }
      }
      pen += adv;
    }
    return pen;
  }
  drawCentred(cv: Canvas, text: string, cx: number, y: number, size: number, weight: string, color: RGB): void {
    this.draw(cv, text, cx - this.advance(weight, size, text) / 2, y, size, weight, color);
  }
  drawRight(cv: Canvas, text: string, rx: number, y: number, size: number, weight: string, color: RGB): void {
    this.draw(cv, text, rx - this.advance(weight, size, text), y, size, weight, color);
  }
}

// Wrap text to lines that fit maxW. Returns lines; sets overflow flag
// when a single word is wider than maxW.
function wrap(fonts: Fonts, text: string, size: number, weight: string, maxW: number, maxLines: number, overflow: { n: number }): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (fonts.advance(weight, size, trial) <= maxW) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      if (fonts.advance(weight, size, w) > maxW) overflow.n++;
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    overflow.n += lines.length - maxLines;
    return lines.slice(0, maxLines);
  }
  return lines;
}

// -------------------------------------------------------- illustrations ----
// Every illustration below is drawn from primitives: no copied art, no
// photographs. Each lead gets a wide scene; each picture story a small one.

function stars(cv: Canvas, x: number, y: number, w: number, h: number, n: number, seed: number): void {
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const px = x + (s % w);
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const py = y + (s % h);
    cv.set(px, py, [255, 255, 255]);
    if (s % 3 === 0) cv.set(px + 1, py, [255, 255, 255]);
  }
}
function flames(cv: Canvas, bx: number, by: number, s: number): void {
  // A cluster of flame tongues rooted at (bx, by); s scales the cluster.
  const cols: RGB[] = [[255, 120, 20], [255, 170, 40], [255, 210, 90], [220, 60, 20]];
  for (let i = 0; i < 5; i++) {
    const fx = bx + (i - 2) * s * 0.55;
    const fh = s * (1.5 - Math.abs(i - 2) * 0.28);
    const fw = s * 0.62;
    cv.poly(
      [
        [fx - fw / 2, by],
        [fx - fw * 0.28, by - fh * 0.55],
        [fx, by - fh],
        [fx + fw * 0.28, by - fh * 0.5],
        [fx + fw / 2, by],
      ],
      cols[i % cols.length],
    );
  }
}
function smoke(cv: Canvas, x: number, y: number, r: number, c: RGB): void {
  cv.circle(x, y, r, c);
  cv.circle(x + r * 0.7, y - r * 0.4, Math.round(r * 0.7), c);
  cv.circle(x - r * 0.6, y - r * 0.5, Math.round(r * 0.6), c);
}

// 1 — Bahrain: night blast over the Gulf, a warship silhouette below.
function illBahrain(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [16, 22, 44]);
  stars(cv, x, y, w, Math.floor(h * 0.5), 26, 7);
  cv.circle(x + w * 0.72, y + h * 0.34, 26, [255, 150, 40]);
  cv.circle(x + w * 0.72, y + h * 0.34, 18, [255, 200, 90]);
  cv.circle(x + w * 0.72, y + h * 0.34, 10, [255, 240, 180]);
  flames(cv, x + w * 0.3, y + h * 0.52, 15);
  smoke(cv, x + w * 0.3, y + h * 0.3, 9, [70, 70, 82]);
  smoke(cv, x + w * 0.72, y + h * 0.16, 8, [70, 70, 82]);
  cv.fillRect(x, y + Math.floor(h * 0.62), w, h - Math.floor(h * 0.62), [24, 52, 84]);
  cv.fillRect(x + w * 0.12, y + Math.floor(h * 0.68), Math.floor(w * 0.5), 7, [10, 14, 26]);
  cv.fillRect(x + w * 0.2, y + Math.floor(h * 0.68) - 10, 5, 10, [10, 14, 26]);
  cv.fillRect(x + w * 0.32, y + Math.floor(h * 0.68) - 14, 4, 14, [10, 14, 26]);
  cv.line(x + w * 0.12, y + Math.floor(h * 0.75) + 2, x + w * 0.62, y + Math.floor(h * 0.75) + 2, [120, 170, 210], 1);
  cv.fillRect(x + w * 0.7, y + Math.floor(h * 0.7), Math.floor(w * 0.2), 5, [10, 14, 26]);
}

// 2 — Chapo Isidro: badge and handcuffs on deep green.
function illCapture(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [18, 64, 32]);
  cv.fillRect(x, y + h - 16, w, 16, [12, 44, 22]);
  // Shield badge.
  const cx = x + w * 0.3;
  const cy = y + h * 0.46;
  cv.poly(
    [
      [cx - 26, cy - 24],
      [cx + 26, cy - 24],
      [cx + 26, cy + 2],
      [cx, cy + 30],
      [cx - 26, cy + 2],
    ],
    [212, 175, 55],
  );
  cv.poly(
    [
      [cx - 20, cy - 18],
      [cx + 20, cy - 18],
      [cx + 20, cy + 1],
      [cx, cy + 23],
      [cx - 20, cy + 1],
    ],
    [18, 64, 32],
  );
  // Star inside the shield.
  const sx = cx;
  const sy = cy - 2;
  cv.poly(
    [
      [sx, sy - 11],
      [sx + 3, sy - 3],
      [sx + 11, sy - 3],
      [sx + 5, sy + 3],
      [sx + 7, sy + 11],
      [sx, sy + 6],
      [sx - 7, sy + 11],
      [sx - 5, sy + 3],
      [sx - 11, sy - 3],
      [sx - 3, sy - 3],
    ],
    [212, 175, 55],
  );
  // Handcuffs: two rings and a chain.
  const hx = x + w * 0.72;
  const hy = y + h * 0.5;
  cv.ring(hx - 16, hy - 6, 12, [200, 200, 205], 3);
  cv.ring(hx + 16, hy + 8, 12, [200, 200, 205], 3);
  cv.line(hx - 6, hy - 2, hx + 6, hy + 4, [200, 200, 205], 2);
  cv.line(hx - 6, hy + 2, hx + 6, hy + 8, [200, 200, 205], 2);
}

// 3 — Kryvyi Rih: missile trail over a dark city, blast on the skyline.
function illMissile(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [20, 24, 52]);
  stars(cv, x, y, w, Math.floor(h * 0.45), 22, 21);
  cv.line(x + w * 0.12, y + h * 0.62, x + w * 0.62, y + h * 0.14, [255, 220, 140], 2);
  cv.circle(x + w * 0.62, y + h * 0.14, 4, [255, 240, 180]);
  cv.circle(x + w * 0.3, y + h * 0.44, 3, [255, 220, 140]);
  // City skyline.
  cv.fillRect(x, y + Math.floor(h * 0.66), w, h - Math.floor(h * 0.66), [8, 10, 22]);
  const bw = [26, 18, 32, 22, 28, 20, 30];
  let bx = x + 4;
  for (let i = 0; i < bw.length; i++) {
    if (bx + bw[i] > x + w - 4) break;
    const bh = 16 + ((i * 13) % 18);
    cv.fillRect(bx, y + Math.floor(h * 0.66) - bh + 16, bw[i], bh, [8, 10, 22]);
    for (let wy = 0; wy < 3; wy++) {
      cv.set(bx + 5 + ((i * 7 + wy * 5) % (bw[i] - 8)), y + Math.floor(h * 0.66) - bh + 22 + wy * 7, [255, 210, 110]);
    }
    bx += bw[i] + 4;
  }
  flames(cv, x + w * 0.78, y + Math.floor(h * 0.66) + 2, 12);
  smoke(cv, x + w * 0.78, y + Math.floor(h * 0.66) - 14, 8, [60, 60, 72]);
}

// 4 — AI sell-off: a falling red chart over a dark trading floor.
function illMarket(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [12, 26, 46]);
  // Grid.
  for (let i = 1; i < 4; i++) cv.hline(x + 8, y + Math.floor((h * i) / 4), w - 16, [40, 60, 96], 1);
  // Falling line.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    pts.push([x + 10 + Math.floor(((w - 20) * i) / 10), y + 14 + Math.floor((h - 34) * (i / 10) * (i / 10) + (i % 3) * 2)]);
  }
  for (let i = 0; i + 1 < pts.length; i++) cv.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], [255, 70, 70], 3);
  // Down bars at the foot.
  const bars = [10, 14, 9, 18, 12, 22, 16];
  let bx = x + 14;
  for (const b of bars) {
    cv.fillRect(bx, y + h - 12 - b, 10, b, [176, 30, 36]);
    bx += 17;
  }
  cv.poly(
    [
      [x + w - 34, y + 12],
      [x + w - 10, y + 12],
      [x + w - 22, y + 30],
    ],
    [255, 70, 70],
  );
}

// 5 — COP31: globe with sun and leaf.
function illClimate(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [14, 74, 96]);
  const cx = x + w * 0.5;
  const cy = y + h * 0.52;
  const r = Math.min(w, h) * 0.32;
  cv.circle(cx, cy, r, [44, 140, 110]);
  cv.poly(
    [
      [cx - r * 0.55, cy - r * 0.2],
      [cx - r * 0.1, cy - r * 0.55],
      [cx + r * 0.3, cy - r * 0.3],
      [cx + r * 0.15, cy + r * 0.1],
      [cx - r * 0.3, cy + r * 0.45],
      [cx - r * 0.6, cy + r * 0.25],
    ],
    [120, 200, 110],
  );
  cv.ring(cx, cy, r, [255, 255, 255], 2);
  cv.line(cx - r, cy, cx + r, cy, [255, 255, 255], 1);
  cv.line(cx, cy - r, cx, cy + r, [255, 255, 255], 1);
  cv.circle(x + w * 0.8, y + h * 0.2, 8, [255, 205, 80]);
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4;
    cv.line(
      x + w * 0.8 + Math.round(11 * Math.cos(rad)),
      y + h * 0.2 + Math.round(11 * Math.sin(rad)),
      x + w * 0.8 + Math.round(15 * Math.cos(rad)),
      y + h * 0.2 + Math.round(15 * Math.sin(rad)),
      [255, 205, 80],
      1,
    );
  }
}

// 6 — Shenzhen summit: three flags over a skyline.
function illSummit(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [30, 44, 78]);
  // Skyline.
  cv.fillRect(x, y + h - 22, w, 22, [14, 20, 36]);
  let bx = x + 6;
  for (let i = 0; i < 6; i++) {
    if (bx + 12 > x + w - 2) break;
    const bh = 12 + ((i * 11) % 16);
    cv.fillRect(bx, y + h - 22 - bh + 12, 12, bh, [14, 20, 36]);
    bx += 16;
  }
  const flags: [RGB, RGB, RGB][] = [
    [[178, 34, 52], [255, 255, 255], [60, 59, 110]], // US: stripes + blue canton
    [[222, 41, 16], [255, 222, 0], [222, 41, 16]], // China: red + gold stars
    [[255, 255, 255], [0, 57, 166], [213, 0, 50]], // Russia: white-blue-red
  ];
  const fw = Math.floor(w / 3) - 6;
  for (let f = 0; f < 3; f++) {
    const fx = x + 4 + f * (fw + 3);
    const fy = y + 8;
    const fh = Math.floor(h * 0.42);
    cv.fillRect(fx, fy, fw, fh, flags[f][0]);
    if (f === 0) {
      for (let s = 0; s < 3; s++) cv.fillRect(fx, fy + s * 8 + 3, fw, 3, [255, 255, 255]);
      cv.fillRect(fx, fy, Math.floor(fw * 0.45), Math.floor(fh * 0.5), [60, 59, 110]);
    } else if (f === 1) {
      cv.poly(
        [
          [fx + 6, fy + 4],
          [fx + 8, fy + 9],
          [fx + 13, fy + 9],
          [fx + 9, fy + 12],
          [fx + 10, fy + 17],
          [fx + 6, fy + 14],
          [fx + 2, fy + 17],
          [fx + 3, fy + 12],
          [fx - 1, fy + 9],
          [fx + 4, fy + 9],
        ],
        [255, 222, 0],
      );
    } else {
      cv.fillRect(fx, fy + Math.floor(fh / 3), fw, Math.floor(fh / 3), flags[f][1]);
      cv.fillRect(fx, fy + Math.floor((2 * fh) / 3), fw, fh - Math.floor((2 * fh) / 3), flags[f][2]);
    }
    cv.fillRect(fx, fy + fh, 2, y + h - 22 - (fy + fh), [200, 200, 200]);
  }
}

// 7 — Sparta II: a cargo ship burning on the sea.
function illShip(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [120, 170, 200]);
  cv.fillRect(x, y + Math.floor(h * 0.6), w, h - Math.floor(h * 0.6), [30, 90, 140]);
  cv.line(x, y + Math.floor(h * 0.6), x + w, y + Math.floor(h * 0.6), [255, 255, 255], 1);
  // Hull.
  cv.poly(
    [
      [x + 8, y + Math.floor(h * 0.62)],
      [x + w - 8, y + Math.floor(h * 0.62)],
      [x + w - 20, y + Math.floor(h * 0.82)],
      [x + 20, y + Math.floor(h * 0.82)],
    ],
    [40, 44, 54],
  );
  cv.fillRect(x + 18, y + Math.floor(h * 0.48), 22, Math.floor(h * 0.14), [200, 200, 205]);
  cv.fillRect(x + 44, y + Math.floor(h * 0.52), 12, Math.floor(h * 0.1), [150, 150, 155]);
  flames(cv, x + w * 0.68, y + Math.floor(h * 0.62), 11);
  flames(cv, x + w * 0.5, y + Math.floor(h * 0.62), 8);
  smoke(cv, x + w * 0.68, y + Math.floor(h * 0.4), 8, [60, 60, 68]);
  smoke(cv, x + w * 0.5, y + Math.floor(h * 0.44), 6, [60, 60, 68]);
}

// 8 — ICJ: scales of justice on navy.
function illScales(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [24, 38, 66]);
  const cx = x + w * 0.5;
  cv.line(cx, y + 8, cx, y + h - 10, [212, 175, 55], 2);
  cv.line(cx - 20, y + 12, cx + 20, y + 12, [212, 175, 55], 2);
  cv.circle(cx, y + 8, 3, [212, 175, 55]);
  for (const sgn of [-1, 1]) {
    const px = cx + sgn * 20;
    cv.line(px, y + 12, px, y + 22, [212, 175, 55], 1);
    cv.line(px - 8, y + 22, px + 8, y + 22, [212, 175, 55], 1);
    cv.poly(
      [
        [px - 10, y + 22],
        [px + 10, y + 22],
        [px, y + 34],
      ],
      [212, 175, 55],
    );
  }
  cv.fillRect(cx - 14, y + h - 10, 28, 4, [212, 175, 55]);
}

// 9 — BepiColombo: a cratered planet and a probe.
function illMercury(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [10, 12, 26]);
  stars(cv, x, y, w, h, 20, 33);
  const cx = x + w * 0.32;
  const cy = y + h * 0.55;
  const r = Math.min(w, h) * 0.3;
  cv.circle(cx, cy, r, [150, 140, 130]);
  cv.circle(cx - r * 0.3, cy - r * 0.25, Math.round(r * 0.22), [120, 112, 104]);
  cv.circle(cx + r * 0.35, cy + r * 0.2, Math.round(r * 0.16), [120, 112, 104]);
  cv.circle(cx + r * 0.1, cy - r * 0.5, Math.round(r * 0.13), [120, 112, 104]);
  // Probe: bus with two solar panels, on an arc path.
  const px = x + w * 0.74;
  const py = y + h * 0.3;
  cv.fillRect(px - 16, py - 3, 12, 6, [70, 110, 180]);
  cv.fillRect(px + 2, py - 6, 8, 12, [200, 200, 205]);
  cv.fillRect(px + 12, py - 3, 12, 6, [70, 110, 180]);
  cv.line(px - 4, py + 8, px - 4, py + 16, [200, 200, 205], 1);
  cv.circle(px - 4, py + 18, 2, [200, 200, 205]);
}

// 10 — Dengue: a shield over a mosquito silhouette.
function illMosquito(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [16, 96, 74]);
  const cx = x + w * 0.5;
  const cy = y + h * 0.52;
  cv.poly(
    [
      [cx - 22, cy - 20],
      [cx + 22, cy - 20],
      [cx + 22, cy + 2],
      [cx, cy + 26],
      [cx - 22, cy + 2],
    ],
    [255, 255, 255],
  );
  cv.poly(
    [
      [cx - 18, cy - 16],
      [cx + 18, cy - 16],
      [cx + 18, cy + 1],
      [cx, cy + 21],
      [cx - 18, cy + 1],
    ],
    [16, 96, 74],
  );
  // Mosquito: body, wings, legs, proboscis.
  cv.circle(cx, cy - 2, 4, [255, 255, 255]);
  cv.fillRect(cx - 1, cy + 1, 3, 12, [255, 255, 255]);
  cv.poly(
    [
      [cx - 2, cy - 4],
      [cx - 14, cy - 14],
      [cx - 12, cy - 4],
    ],
    [200, 230, 220],
  );
  cv.poly(
    [
      [cx + 2, cy - 4],
      [cx + 14, cy - 14],
      [cx + 12, cy - 4],
    ],
    [200, 230, 220],
  );
  for (const sgn of [-1, 1]) {
    cv.line(cx + sgn * 2, cy + 4, cx + sgn * 10, cy + 10, [255, 255, 255], 1);
    cv.line(cx + sgn * 2, cy + 8, cx + sgn * 10, cy + 14, [255, 255, 255], 1);
  }
  cv.line(cx, cy + 13, cx, cy + 20, [255, 255, 255], 1);
}

// 11 — GTA VI: sunset bands, a palm and a game controller.
function illGame(cv: Canvas, x: number, y: number, w: number, h: number): void {
  const bands: RGB[] = [[255, 120, 90], [255, 160, 90], [255, 200, 110], [120, 60, 120], [70, 40, 110]];
  for (let i = 0; i < bands.length; i++) {
    cv.fillRect(x, y + Math.floor((h * i) / bands.length), w, Math.ceil(h / bands.length), bands[i]);
  }
  cv.circle(x + w * 0.68, y + h * 0.3, 11, [255, 240, 180]);
  // Palm silhouette.
  cv.line(x + w * 0.2, y + h - 6, x + w * 0.24, y + h * 0.42, [30, 16, 40], 3);
  for (let a = 0; a < 5; a++) {
    const ang = (-30 - a * 30 * Math.PI) / 180;
    cv.line(
      x + w * 0.24,
      y + h * 0.42,
      x + w * 0.24 + Math.round(18 * Math.cos(ang)),
      y + h * 0.42 + Math.round(18 * Math.sin(ang)) - 6,
      [30, 16, 40],
      2,
    );
  }
  // Controller body: a dark rounded bar, D-pad left, buttons right.
  const cx = x + w * 0.62;
  const cy = y + h * 0.72;
  cv.fillRect(cx - 16, cy - 8, 32, 16, [30, 16, 40]);
  cv.circle(cx - 16, cy, 8, [30, 16, 40]);
  cv.circle(cx + 16, cy, 8, [30, 16, 40]);
  cv.fillRect(cx - 12, cy - 2, 6, 4, [255, 255, 255]);
  cv.fillRect(cx - 10, cy - 4, 2, 8, [255, 255, 255]);
  cv.circle(cx + 7, cy - 3, 2, [255, 210, 90]);
  cv.circle(cx + 12, cy + 2, 2, [255, 120, 110]);
}

// 12 — Tennis: a green court, net and ball.
function illTennis(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [28, 110, 60]);
  cv.fillRect(x + 6, y + 8, w - 12, h - 16, [60, 150, 90]);
  cv.rect(x + 6, y + 8, w - 12, h - 16, [255, 255, 255], 1);
  cv.line(x + 6, y + Math.floor(h / 2), x + w - 6, y + Math.floor(h / 2), [255, 255, 255], 1);
  cv.fillRect(x + Math.floor(w / 2) - 1, y + 8, 2, h - 16, [40, 40, 40]);
  cv.circle(x + w * 0.72, y + h * 0.3, 7, [220, 240, 60]);
  cv.ring(x + w * 0.72, y + h * 0.3, 7, [255, 255, 255], 1);
  cv.circle(x + w * 0.3, y + h * 0.68, 5, [255, 255, 255]);
}

// ------------------------------------------------------------ story data ----
// Every story below was reported on Saturday 21 November 2026 (sources:
// BBC, Reuters, AP, Al Jazeera, The Guardian, France 24, NPR, CBC and
// others, via the day's wire round-ups). Regions: EU Europe, NA North
// America, LA Latin America, ME Middle East, AF Africa, AP Asia-Pacific,
// OC Oceania.

type Region = 'EU' | 'NA' | 'LA' | 'ME' | 'AF' | 'AP' | 'OC';
const REGION_NAME: Record<Region, string> = {
  EU: 'EUROPE',
  NA: 'NORTH AMERICA',
  LA: 'LATIN AMERICA',
  ME: 'MIDDLE EAST',
  AF: 'AFRICA',
  AP: 'ASIA-PACIFIC',
  OC: 'OCEANIA',
};
const REGION_COLOR: Record<Region, RGB> = {
  EU: [30, 80, 160],
  NA: [176, 30, 36],
  LA: [30, 120, 60],
  ME: [200, 100, 20],
  AF: [120, 60, 160],
  AP: [0, 120, 120],
  OC: [70, 70, 70],
};

type Story = {
  n: number;
  region: Region;
  kicker: string;
  head: string;
  deck: string;
  src: string;
  lat: number;
  lon: number;
  pinDx?: number;
  pinDy?: number;
  chips?: [string, string];
  ill?: (cv: Canvas, x: number, y: number, w: number, h: number) => void;
};

const LEADS: Story[] = [
  {
    n: 1, region: 'ME', kicker: 'MIDDLE EAST — THE LEAD',
    head: 'Iran strikes US bases in Bahrain',
    deck: 'Guards say they hit two US positions; Bahrain reports fire at an industrial site, no injuries.',
    src: 'AL JAZEERA', lat: 26.23, lon: 50.59, pinDx: 12, pinDy: -8,
    chips: ['2 US BASES HIT', 'NO INJURIES'], ill: illBahrain,
  },
  {
    n: 2, region: 'NA', kicker: 'JUSTICE — THE LEAD',
    head: "Mexico captures 'El Chapo Isidro'",
    deck: 'FBI most-wanted boss seized in a Sinaloa raid; 11 dead as gunfights and roadblocks follow.',
    src: 'BBC', lat: 25.57, lon: -108.47,
    chips: ['11 DEAD', 'FBI TOP 10'], ill: illCapture,
  },
  {
    n: 3, region: 'EU', kicker: 'WAR IN EUROPE — THE LEAD',
    head: 'Russian missile hits Kryvyi Rih',
    deck: 'A boy, 7, and a paramedic are killed and about 60 hurt; missiles also land in Poland.',
    src: 'AL JAZEERA', lat: 47.91, lon: 33.39,
    chips: ['2 KILLED, 60 HURT', 'MISSILES IN POLAND'], ill: illMissile,
  },
  {
    n: 4, region: 'NA', kicker: 'ECONOMY — THE LEAD',
    head: "AI sell-off erases Nasdaq's 2026 gains",
    deck: 'S&P 500 slips into correction and chip shares lead the rout after a bruising week.',
    src: 'THE GUARDIAN', lat: 40.71, lon: -74.01,
    chips: ['NASDAQ GAINS GONE', 'S&P IN CORRECTION'], ill: illMarket,
  },
];

const PICTURES: Story[] = [
  {
    n: 5, region: 'EU', kicker: 'CLIMATE',
    head: 'COP31 talks run past deadline',
    deck: 'Fossil-fuel row blocks deal',
    src: 'BBC', lat: 36.9, lon: 30.71, pinDx: -11, pinDy: 7, ill: illClimate,
  },
  {
    n: 6, region: 'AP', kicker: 'POLITICS',
    head: 'Trump, Xi and Putin meet in Shenzhen',
    deck: 'Three-way summit at APEC',
    src: 'BBC', lat: 22.55, lon: 114.06, ill: illSummit,
  },
  {
    n: 7, region: 'EU', kicker: 'CONFLICT',
    head: 'Drone strike sets Russian ship ablaze',
    deck: 'Sparta II burns in the Gulf',
    src: 'BBC', lat: 59.9, lon: 24.5, pinDx: -14, pinDy: -8, ill: illShip,
  },
  {
    n: 8, region: 'EU', kicker: 'JUSTICE',
    head: 'UN court: Myanmar guilty of genocide',
    deck: 'ICJ rules on Rohingya case',
    src: 'PBS NEWSHOUR', lat: 52.07, lon: 4.31, pinDx: -12, pinDy: -7, ill: illScales,
  },
  {
    n: 9, region: 'EU', kicker: 'SPACE',
    head: 'BepiColombo reaches Mercury orbit',
    deck: 'Eight years, 10bn km flown',
    src: 'UPI', lat: 49.87, lon: 8.65, pinDx: -10, pinDy: 9, ill: illMercury,
  },
  {
    n: 10, region: 'LA', kicker: 'HEALTH',
    head: 'Dengue cut 69% by altered mosquitoes',
    deck: 'Trial cuts dengue by 69%',
    src: 'STRAITS TIMES', lat: -15.79, lon: -47.88, ill: illMosquito,
  },
  {
    n: 11, region: 'NA', kicker: 'CULTURE',
    head: 'GTA VI earns $3.8bn on day one',
    deck: 'Biggest launch ever',
    src: 'BBC', lat: 40.71, lon: -74.01, pinDx: 12, pinDy: 7, ill: illGame,
  },
  {
    n: 12, region: 'EU', kicker: 'SPORT',
    head: 'Alcaraz reaches ATP Finals decider',
    deck: 'Beats Shelton; faces Zverev',
    src: 'BBC SPORT', lat: 45.07, lon: 7.69, pinDx: 11, pinDy: 7, ill: illTennis,
  },
];

const BRIEFS: Story[] = [
  { n: 13, region: 'EU', kicker: 'POLITICS', head: 'Estonia to close Russia border', deck: 'Three crossings close 1 Dec (Straits Times)', src: 'STRAITS TIMES', lat: 59.44, lon: 24.75, pinDx: 12, pinDy: 6 },
  { n: 14, region: 'EU', kicker: 'POLITICS', head: 'Denmark expels Russian diplomat', deck: 'Alleged plot to kill Kyivstoner (BBC)', src: 'BBC', lat: 55.68, lon: 12.57 },
  { n: 15, region: 'EU', kicker: 'POLITICS', head: 'UK and EU sign three post-Brexit deals', deck: 'Food, emissions, youth travel (Guardian)', src: 'GUARDIAN', lat: 50.85, lon: 4.35, pinDx: 11, pinDy: 6 },
  { n: 16, region: 'EU', kicker: 'SOCIETY', head: 'Cost-of-living protests sweep Europe', deck: 'France, Portugal, Berlin march (Al Jazeera)', src: 'AL JAZEERA', lat: 48.86, lon: 2.35 },
  { n: 17, region: 'EU', kicker: 'JUSTICE', head: 'Police sentenced over Zecler beating', deck: 'Five years each; racism a factor (BBC)', src: 'BBC', lat: 48.86, lon: 2.35, pinDx: 12, pinDy: -7 },
  { n: 18, region: 'NA', kicker: 'JUSTICE', head: 'FBI crime database reportedly hacked', deck: 'Breach of police records probed (BBC)', src: 'BBC', lat: 38.91, lon: -77.04, pinDx: -13, pinDy: -9 },
  { n: 19, region: 'NA', kicker: 'TECHNOLOGY', head: 'Trump threatens data-centre tax', deck: 'AI centres abroad face levy (BBC)', src: 'BBC', lat: 38.91, lon: -77.04, pinDx: 12, pinDy: -9 },
  { n: 20, region: 'NA', kicker: 'HEALTH', head: 'US child dies of measles in Virginia', deck: 'First measles death of 2026 (Guardian)', src: 'GUARDIAN', lat: 37.54, lon: -77.43, pinDx: -12, pinDy: 8 },
  { n: 21, region: 'NA', kicker: 'JUSTICE', head: 'Palisades arsonist convicted in LA', deck: '12 killed, 6,800 buildings lost (BBC)', src: 'BBC', lat: 34.05, lon: -118.24 },
  { n: 22, region: 'NA', kicker: 'POLITICS', head: 'Mamdani plans to close Rikers by 2032', deck: 'NY mayor sets jail closure date (BBC)', src: 'BBC', lat: 40.71, lon: -74.01, pinDx: -12, pinDy: 8 },
  { n: 23, region: 'LA', kicker: 'DISASTER', head: '6.7 quake shakes central Peru', deck: 'Andean tremor felt widely (UPI)', src: 'UPI', lat: -10.5, lon: -75.5 },
  { n: 24, region: 'LA', kicker: 'POLITICS', head: 'Bolsonaro in intensive care', deck: 'Bowel obstruction in Brasilia (Al Jazeera)', src: 'AL JAZEERA', lat: -15.79, lon: -47.88, pinDx: 10, pinDy: -8 },
  { n: 25, region: 'LA', kicker: 'CONFLICT', head: 'Troops battle gangs in Haiti', deck: 'Salvadoran troops in Port-au-Prince (Guardian)', src: 'GUARDIAN', lat: 18.54, lon: -72.34 },
  { n: 26, region: 'LA', kicker: 'ECONOMY', head: 'Argentina bonds slide into distress', deck: 'Costs jump; LNG project approved (BA Times)', src: 'BUENOS AIRES TIMES', lat: -34.6, lon: -58.38 },
  { n: 27, region: 'ME', kicker: 'CONFLICT', head: 'Israeli strike kills three in Gaza', deck: 'Food vehicle hit in Gaza City (Al Jazeera)', src: 'AL JAZEERA', lat: 31.5, lon: 34.47 },
  { n: 28, region: 'ME', kicker: 'CONFLICT', head: 'Houthis and Saudis trade strikes', deck: '71 strikes in 24 hours (Middle East Eye)', src: 'MIDDLE EAST EYE', lat: 14.8, lon: 42.95 },
  { n: 29, region: 'ME', kicker: 'DISASTER', head: 'Fire at Basra power station kills four', deck: 'Blast injures 35 in Iraq (Reuters)', src: 'REUTERS', lat: 30.5, lon: 47.78 },
  { n: 30, region: 'AF', kicker: 'DISASTER', head: 'Boat of mourners capsizes in Nigeria', deck: 'At least 24 dead in Bayelsa (Sky News)', src: 'SKY NEWS', lat: 4.9, lon: 6.1 },
  { n: 31, region: 'AF', kicker: 'CRISIS', head: '700,000 displaced in southern Ethiopia', deck: 'Troops mobilise on Eritrea border (France 24)', src: 'FRANCE 24', lat: 5.0, lon: 38.0 },
  { n: 32, region: 'AF', kicker: 'JUSTICE', head: 'Tanzania convicts opposition leader', deck: 'Sedition verdict; he calls it political (BBC)', src: 'BBC', lat: -6.79, lon: 39.28 },
  { n: 33, region: 'AF', kicker: 'OBITUARY', head: 'Mlambo-Ngcuka dies aged 71', deck: 'Ex-deputy president mourned (Africanews)', src: 'AFRICANEWS', lat: -33.92, lon: 18.42 },
  { n: 34, region: 'AP', kicker: 'POLITICS', head: 'Nepal PM Shah to visit India', deck: 'First foreign trip; trade on agenda (BBC)', src: 'BBC', lat: 28.61, lon: 77.21 },
  { n: 35, region: 'AP', kicker: 'POLITICS', head: "Japan 'sidelined' at China summit", deck: 'Scaled-down welcome for Takaichi (Japan Times)', src: 'JAPAN TIMES', lat: 35.68, lon: 139.69 },
  { n: 36, region: 'OC', kicker: 'JUSTICE', head: "Melbourne teen 'ran arsons on Signal'", deck: '17-year-old in arson, kidnap plot (Guardian)', src: 'GUARDIAN', lat: -37.81, lon: 144.96 },
];

const ALL: Story[] = [...LEADS, ...PICTURES, ...BRIEFS];

// ------------------------------------------------------------- world map ----
// Rough continent outlines in [lon, lat], authored for this page.
const CONTINENTS: [number, number][][] = [
  // North America
  [[-168, 66], [-150, 70], [-135, 69], [-125, 71], [-112, 68], [-100, 69], [-92, 66], [-85, 66], [-80, 62], [-76, 60], [-68, 58], [-60, 55], [-55, 52], [-60, 47], [-66, 44], [-70, 43], [-74, 40], [-76, 36], [-80, 32], [-81, 26], [-84, 30], [-89, 29], [-93, 29], [-97, 26], [-100, 22], [-105, 20], [-97, 16], [-94, 16], [-90, 14], [-86, 12], [-83, 9], [-80, 8], [-84, 10], [-88, 13], [-92, 15], [-97, 16], [-102, 18], [-106, 22], [-110, 24], [-114, 29], [-118, 33], [-122, 37], [-124, 42], [-124, 48], [-128, 51], [-132, 55], [-138, 59], [-146, 60], [-155, 58], [-162, 60], [-168, 66]],
  // South America
  [[-80, 9], [-77, 5], [-79, 1], [-81, -4], [-80, -6], [-77, -11], [-73, -16], [-70, -20], [-70, -26], [-71, -32], [-73, -38], [-73, -44], [-71, -50], [-68, -54], [-66, -55], [-65, -50], [-63, -44], [-60, -38], [-57, -34], [-52, -32], [-48, -27], [-44, -23], [-40, -20], [-38, -15], [-35, -9], [-36, -5], [-40, -3], [-44, -2], [-48, 0], [-52, 3], [-56, 6], [-60, 8], [-64, 10], [-68, 11], [-72, 12], [-76, 10], [-79, 9], [-80, 9]],
  // Africa
  [[-17, 15], [-16, 20], [-13, 27], [-9, 31], [-5, 35], [0, 36], [6, 37], [10, 37], [11, 34], [15, 32], [20, 32], [25, 32], [30, 31], [32, 31], [34, 28], [36, 26], [37, 22], [38, 20], [40, 15], [43, 12], [46, 11], [50, 12], [51, 11], [50, 7], [48, 4], [45, 1], [41, -2], [40, -6], [39, -12], [38, -17], [35, -22], [33, -26], [31, -29], [28, -32], [24, -34], [20, -35], [18, -34], [16, -30], [14, -24], [12, -18], [12, -12], [13, -7], [10, -2], [9, 2], [7, 4], [3, 6], [-2, 5], [-8, 5], [-12, 8], [-15, 11], [-17, 13], [-17, 15]],
  // Eurasia
  [[-10, 36], [-9, 39], [-9, 43], [-4, 44], [-2, 46], [-5, 48], [-2, 49], [1, 51], [4, 53], [7, 54], [8, 56], [10, 58], [8, 60], [6, 62], [10, 64], [14, 67], [19, 70], [26, 71], [31, 70], [38, 68], [46, 68], [54, 69], [62, 69], [70, 72], [78, 73], [86, 74], [94, 76], [102, 77], [110, 74], [118, 73], [126, 72], [134, 72], [142, 72], [150, 71], [158, 70], [166, 70], [174, 66], [178, 65], [172, 62], [166, 60], [162, 57], [158, 52], [156, 55], [150, 59], [144, 56], [141, 50], [139, 45], [135, 43], [131, 39], [127, 40], [124, 39], [122, 38], [120, 34], [121, 30], [118, 25], [113, 22], [109, 20], [108, 17], [106, 10], [104, 8], [101, 7], [99, 10], [98, 13], [96, 16], [93, 20], [90, 22], [87, 21], [84, 19], [81, 16], [80, 13], [77, 8], [76, 10], [74, 15], [73, 19], [71, 21], [69, 23], [66, 25], [63, 25], [59, 25], [57, 26], [55, 26], [53, 26], [51, 27], [50, 29], [49, 30], [47, 30], [44, 29], [42, 28], [40, 27], [39, 24], [39, 21], [39, 18], [40, 15], [43, 12], [46, 12], [49, 14], [52, 15], [55, 17], [58, 20], [59, 22], [58, 24], [56, 26], [54, 26], [52, 25], [51, 28], [50, 29], [48, 30], [44, 29], [40, 28], [38, 30], [36, 36], [33, 36], [30, 36], [27, 37], [24, 36], [22, 37], [20, 39], [18, 40], [16, 40], [13, 42], [11, 44], [8, 44], [6, 43], [3, 43], [0, 40], [-2, 37], [-6, 36], [-9, 36], [-10, 36]],
  // Australia
  [[114, -22], [114, -28], [115, -32], [118, -35], [122, -34], [126, -32], [130, -32], [133, -32], [136, -35], [139, -36], [141, -38], [145, -38], [148, -38], [150, -37], [152, -33], [153, -28], [152, -25], [150, -22], [148, -20], [145, -17], [142, -14], [142, -11], [139, -14], [136, -12], [133, -12], [130, -13], [127, -14], [124, -16], [121, -18], [117, -20], [114, -22]],
  // Indonesia
  [[95, 5], [98, 4], [100, 1], [102, -2], [104, -3], [106, -6], [109, -7], [112, -7], [114, -8], [117, -9], [119, -10], [122, -10], [124, -10], [126, -9], [128, -7], [130, -4], [131, -2], [132, 0], [131, 2], [129, 2], [127, 1], [125, 0], [122, 0], [120, 1], [118, 1], [116, 3], [114, 2], [112, 1], [110, -1], [108, -3], [106, -4], [103, -3], [101, -1], [99, 2], [96, 4], [95, 5]],
  // New Guinea
  [[131, -1], [134, -2], [136, -3], [138, -4], [140, -5], [142, -7], [144, -8], [146, -8], [148, -9], [150, -10], [148, -9], [146, -8], [143, -7], [141, -5], [139, -3], [136, -2], [133, -1], [131, -1]],
  // Japan
  [[130, 31], [132, 33], [134, 34], [136, 35], [138, 35], [139, 37], [140, 38], [141, 40], [142, 42], [144, 44], [143, 42], [141, 39], [140, 37], [139, 35], [137, 34], [135, 33], [133, 32], [131, 31], [130, 31]],
  // Britain
  [[-5, 50], [-4, 51], [-3, 53], [-4, 55], [-3, 57], [-2, 58], [-1, 57], [0, 55], [0, 53], [1, 51], [0, 50], [-2, 50], [-4, 50], [-5, 50]],
  // Madagascar
  [[44, -16], [46, -15], [49, -15], [50, -17], [49, -20], [47, -23], [45, -25], [44, -22], [43, -19], [44, -16]],
  // New Zealand
  [[167, -45], [169, -43], [171, -42], [173, -40], [175, -38], [176, -37], [174, -39], [172, -41], [170, -43], [168, -45], [167, -45]],
  // Greenland
  [[-45, 60], [-42, 63], [-38, 65], [-32, 68], [-26, 70], [-21, 73], [-24, 76], [-30, 77], [-38, 77], [-46, 76], [-53, 74], [-57, 71], [-55, 67], [-51, 63], [-47, 61], [-45, 60]],
];

// --------------------------------------------------------------- layout ----
const overflow = { n: 0 };

function drawChip(cv: Canvas, fonts: Fonts, x: number, y: number, text: string): number {
  const tw = fonts.advance('B', 10, text);
  const w = tw + 10;
  cv.rect(x, y, w, 14, RED, 1);
  fonts.draw(cv, text, x + 5, y + 2, 10, 'B', RED);
  return w;
}

function drawLead(cv: Canvas, fonts: Fonts, s: Story, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, CARD);
  cv.rect(x, y, w, h, [190, 182, 164], 1);
  s.ill!(cv, x + 1, y + 1, 148, h - 2);
  const tx = x + 158;
  const tw = w - 166;
  fonts.draw(cv, `${s.n} · ${s.kicker}`, tx, y + 6, 10, 'B', RED);
  const headLines = wrap(fonts, s.head, 19, 'B', tw, 2, overflow);
  let hy = y + 18;
  for (const ln of headLines) {
    fonts.draw(cv, ln, tx, hy, 19, 'B', INK);
    hy += 20;
  }
  const deckLines = wrap(fonts, s.deck, 12, 'R', tw, 2, overflow);
  let dy = hy + 2;
  for (const ln of deckLines) {
    fonts.draw(cv, ln, tx, dy, 12, 'R', [60, 56, 48]);
    dy += 13;
  }
  // Stat chips along the bottom.
  let cx = tx;
  const cy = y + h - 16;
  for (const chip of s.chips ?? []) {
    cx += drawChip(cv, fonts, cx, cy, chip) + 6;
  }
  fonts.drawRight(cv, s.src, x + w - 8, cy + 2, 9, 'R', GREY);
}

function drawPicture(cv: Canvas, fonts: Fonts, s: Story, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, CARD);
  cv.rect(x, y, w, h, [190, 182, 164], 1);
  s.ill!(cv, x + 1, y + 1, 74, h - 2);
  // Number badge on the illustration.
  cv.fillRect(x + 1, y + 1, 17, 14, RED);
  fonts.drawCentred(cv, String(s.n), x + 9.5, y + 2, 10, 'B', WHITE);
  const tx = x + 82;
  const tw = w - 90;
  fonts.draw(cv, s.kicker, tx, y + 3, 9, 'B', REGION_COLOR[s.region]);
  const headLines = wrap(fonts, s.head, 12, 'B', tw, 2, overflow);
  let hy = y + 13;
  for (const ln of headLines) {
    fonts.draw(cv, ln, tx, hy, 12, 'B', INK);
    hy += 13;
  }
  const deckLines = wrap(fonts, s.deck, 10, 'R', tw, 1, overflow);
  if (deckLines.length > 0) fonts.draw(cv, deckLines[0], tx, y + 44, 10, 'R', [60, 56, 48]);
}

function drawRegionBlock(
  cv: Canvas, fonts: Fonts, region: Region, stories: Story[],
  x: number, y: number, w: number, h: number,
): void {
  const col = REGION_COLOR[region];
  cv.fillRect(x, y, w, 18, col);
  fonts.draw(cv, `${REGION_NAME[region]} — ${stories.length} ${stories.length === 1 ? 'STORY' : 'STORIES'}`, x + 6, y + 4, 11, 'B', WHITE);
  const slotH = (h - 18) / stories.length;
  stories.forEach((s, i) => {
    const sy = y + 18 + i * slotH;
    // One-line headline (11px) and one-line deck (10px, source in parens).
    const headLines = wrap(fonts, `${s.n}. ${s.head}`, 11, 'B', w - 4, 1, overflow);
    if (headLines.length > 0) fonts.draw(cv, headLines[0], x + 2, sy + 3, 11, 'B', INK);
    const deckLines = wrap(fonts, s.deck, 10, 'R', w - 4, 1, overflow);
    if (deckLines.length > 0) fonts.draw(cv, deckLines[0], x + 2, sy + 16, 10, 'R', [60, 56, 48]);
    if (i + 1 < stories.length) cv.hline(x + 2, sy + slotH - 1, w - 4, [220, 212, 196], 1);
  });
}

function drawNumbersPanel(cv: Canvas, fonts: Fonts, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, 18, INK);
  fonts.draw(cv, 'THE DAY IN NUMBERS', x + 6, y + 4, 11, 'B', WHITE);
  const stats: [string, string][] = [
    ['2026 GAINS ERASED', 'NASDAQ'],
    ['$91 / BBL', 'BRENT'],
    ['~$62,000', 'BITCOIN'],
    ['IN CORRECTION', 'S&P 500'],
  ];
  stats.forEach(([value, label], i) => {
    const sy = y + 22 + i * 14;
    fonts.draw(cv, value, x + 4, sy, 13, 'B', RED);
    fonts.drawRight(cv, label, x + w - 4, sy + 3, 9, 'R', GREY);
  });
  const by = y + 82;
  fonts.draw(cv, 'STORIES BY REGION — 36 TOTAL', x + 4, by, 10, 'B', INK);
  const counts: [Region, number][] = [['EU', 11], ['NA', 8], ['LA', 5], ['ME', 4], ['AF', 4], ['AP', 3], ['OC', 1]];
  counts.forEach(([r, c], i) => {
    const ry = by + 13 + i * 10;
    fonts.draw(cv, REGION_NAME[r], x + 4, ry, 9, 'B', INK);
    const bw = ((w - 118) * c) / 11;
    cv.fillRect(x + 96, ry + 1, bw, 7, REGION_COLOR[r]);
    fonts.draw(cv, String(c), x + 96 + bw + 4, ry, 9, 'B', INK);
  });
}

function drawMap(cv: Canvas, fonts: Fonts, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SEA);
  cv.rect(x, y, w, h, [190, 182, 164], 1);
  fonts.draw(cv, 'WHERE IT HAPPENED — PINS MATCH STORY NUMBERS · POSITIONS APPROXIMATE', x + 6, y + 4, 10, 'B', RED);
  const mapX = x + 4;
  const mapY = y + 18;
  const mapW = w - 8;
  const mapH = h - 22;
  const proj = (lon: number, lat: number): [number, number] => [
    mapX + ((lon + 180) / 360) * mapW,
    mapY + ((78 - lat) / 136) * mapH,
  ];
  // Graticule.
  for (let lon = -150; lon <= 150; lon += 30) {
    const [gx] = proj(lon, 0);
    cv.vline(Math.round(gx), mapY, mapH, [255, 255, 255], 1);
  }
  for (let lat = 60; lat >= -60; lat -= 30) {
    const [, gy] = proj(0, lat);
    cv.hline(mapX, Math.round(gy), mapW, [255, 255, 255], 1);
  }
  for (const poly of CONTINENTS) {
    cv.poly(poly.map(([lon, lat]) => proj(lon, lat)), LAND);
  }
  // Pins: true position first, then an offset pin with a leader when given.
  for (const s of ALL) {
    const [px, py] = proj(s.lon, s.lat);
    const ox = px + (s.pinDx ?? 0);
    const oy = py + (s.pinDy ?? 0);
    if (s.pinDx !== undefined || s.pinDy !== undefined) {
      cv.line(Math.round(px), Math.round(py), Math.round(ox), Math.round(oy), RED, 1);
      cv.circle(Math.round(px), Math.round(py), 2, RED);
    }
    cv.circle(Math.round(ox), Math.round(oy), 6, RED);
    cv.ring(Math.round(ox), Math.round(oy), 6, WHITE, 1);
    fonts.drawCentred(cv, String(s.n), ox, oy - 4, 8, 'B', WHITE);
  }
}

function drawTimeline(cv: Canvas, fonts: Fonts, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, CARD);
  cv.rect(x, y, w, h, [190, 182, 164], 1);
  fonts.draw(cv, 'HOW THE DAY UNFOLDED', x + 6, y + 4, 11, 'B', INK);
  const items: [string, string][] = [
    ['OVERNIGHT', 'Russian missile hits Kryvyi Rih'],
    ['MORNING', 'Sparta II ablaze in the Gulf of Finland'],
    ['MIDDAY', "'Chapo Isidro' seized in Sinaloa"],
    ['AFTERNOON', 'Iran strikes US bases in Bahrain'],
    ['EVENING', 'COP31 talks run into overtime'],
  ];
  items.forEach(([when, what], i) => {
    const iy = y + 18 + i * 20;
    cv.circle(x + 12, iy + 4, 3, RED);
    if (i + 1 < items.length) cv.vline(x + 12, iy + 8, 12, RED, 1);
    fonts.draw(cv, when, x + 22, iy, 10, 'B', RED);
    fonts.draw(cv, what, x + 22, iy + 10, 9, 'R', INK);
  });
}

// ----------------------------------------------------------------- main ----
function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const fonts = new Fonts(join(here, 'fonts.bin'));
  const cv = new Canvas();

  // Masthead.
  fonts.drawCentred(cv, 'THE WORLD LEDGER', W / 2, 8, 46, 'B', INK);
  cv.hline(14, 62, 996, INK, 2);
  cv.hline(14, 66, 996, INK, 1);
  fonts.draw(cv, 'No. 21', 14, 71, 12, 'B', INK);
  fonts.drawCentred(cv, 'SATURDAY, 21 NOVEMBER 2026', W / 2, 70, 13, 'B', INK);
  fonts.drawRight(cv, '36 STORIES · 7 REGIONS', 1010, 71, 12, 'B', INK);
  cv.hline(14, 88, 996, INK, 2);

  // Four illustrated leads, 2 x 2.
  const leadW = 495;
  const leadH = 104;
  LEADS.forEach((s, i) => {
    drawLead(cv, fonts, s, 14 + (i % 2) * (leadW + 6), 94 + Math.floor(i / 2) * (leadH + 5), leadW, leadH);
  });

  // Eight picture stories, 4 x 2.
  const picW = 244;
  const picH = 60;
  PICTURES.forEach((s, i) => {
    drawPicture(cv, fonts, s, 14 + (i % 4) * (picW + 6), 313 + Math.floor(i / 4) * (picH + 6), picW, picH);
  });

  // Briefs, grouped by region in two rows of blocks.
  fonts.draw(cv, 'THE DAY, REGION BY REGION — 24 BRIEFS', 14, 445, 12, 'B', INK);
  cv.hline(14, 461, 996, INK, 1);
  const byRegion = (r: Region): Story[] => BRIEFS.filter((s) => s.region === r);
  const blockW = 244;
  const rowAH = 172;
  const rowBH = 172;
  drawRegionBlock(cv, fonts, 'EU', byRegion('EU'), 14, 467, blockW, rowAH);
  drawRegionBlock(cv, fonts, 'NA', byRegion('NA'), 14 + (blockW + 6), 467, blockW, rowAH);
  drawRegionBlock(cv, fonts, 'LA', byRegion('LA'), 14 + 2 * (blockW + 6), 467, blockW, rowAH);
  drawRegionBlock(cv, fonts, 'ME', byRegion('ME'), 14 + 3 * (blockW + 6), 467, blockW, rowAH);
  drawRegionBlock(cv, fonts, 'AF', byRegion('AF'), 14, 645, blockW, rowBH);
  drawRegionBlock(cv, fonts, 'AP', byRegion('AP'), 14 + (blockW + 6), 645, blockW, rowBH);
  drawRegionBlock(cv, fonts, 'OC', byRegion('OC'), 14 + 2 * (blockW + 6), 645, blockW, rowBH);
  drawNumbersPanel(cv, fonts, 14 + 3 * (blockW + 6), 645, blockW, rowBH);

  // Map + timeline.
  drawMap(cv, fonts, 14, 823, 646, 120);
  drawTimeline(cv, fonts, 666, 823, 344, 120);

  // Footer.
  fonts.drawCentred(cv, 'DATE CHECK: SATURDAY, 21 NOVEMBER 2026 — EVERY STORY ABOVE WAS REPORTED ON THIS DAY', W / 2, 951, 12, 'B', RED);
  fonts.drawCentred(cv, 'SOURCES: BBC NEWS · REUTERS · AP · AL JAZEERA · THE GUARDIAN · FRANCE 24 · NPR · CBC · UPI', W / 2, 969, 10, 'R', GREY);
  fonts.drawCentred(cv, 'Drawn from reports published Saturday 21 November 2026 · The World Ledger · All 36 stories numbered; pins on the map match story numbers', W / 2, 985, 10, 'R', GREY);
  cv.hline(14, 999, 996, INK, 1);
  fonts.drawCentred(cv, 'THE WORLD LEDGER · 21 NOVEMBER 2026', W / 2, 1005, 9, 'R', GREY);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  const png = encodePNG(cv.buf, W, H);
  writeFileSync(join(outDir, 'entry.png'), png);
  const regionCounts = (['EU', 'NA', 'LA', 'ME', 'AF', 'AP', 'OC'] as Region[]).map(
    (r) => ALL.filter((s) => s.region === r).length,
  );
  console.log(
    `stories=${ALL.length} regions=7 regionCounts=${regionCounts.join('/')} bytes=${png.length} overflows=${overflow.n}`,
  );
}

main();
