// THE WORLD LEDGER — news-image-20261121 v3
// A program that draws one 1024x1024 newspaper front page summing up the
// world news of Saturday 21 November 2026. Node 22, standard library only.
// Deterministic: no clock, no randomness with an unseeded source, no network.
// Glyphs come from fonts.bin beside this file (DejaVu bitmaps rendered at
// build time); every pixel is drawn by this program.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------- canvas
type RGB = [number, number, number];
const buf = new Uint8Array(W * H * 3);

function setPx(x: number, y: number, c: RGB): void {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function blendPx(x: number, y: number, c: RGB, a: number): void {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  buf[i] = Math.round(buf[i] * (1 - a) + c[0] * a);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + c[1] * a);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + c[2] * a);
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
      i += 3;
    }
  }
}
function hline(x0: number, x1: number, y: number, c: RGB): void {
  fillRect(x0, y, x1 - x0, 1, c);
}
function vline(x: number, y0: number, y1: number, c: RGB): void {
  fillRect(x, y0, 1, y1 - y0, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= n; i++) {
    setPx(Math.round(x0 + (dx * i) / n), Math.round(y0 + (dy * i) / n), c);
  }
}
function lineW(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  // A thick line: parallel 1px lines offset perpendicular to its direction.
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const half = (w - 1) / 2;
  for (let k = -Math.floor(half); k <= Math.floor(half); k++) {
    line(Math.round(x0 + nx * k), Math.round(y0 + ny * k), Math.round(x1 + nx * k), Math.round(y1 + ny * k), c);
  }
}
function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = -r; yy <= r; yy++) {
    const half = Math.floor(Math.sqrt(r * r - yy * yy));
    for (let xx = -half; xx <= half; xx++) setPx(cx + xx, cy + yy, c);
  }
}
function ring(cx: number, cy: number, r: number, c: RGB): void {
  const steps = Math.max(24, Math.floor(2 * Math.PI * r));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    setPx(Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a)), c);
  }
}
// Scanline fill of a simple polygon (points in order).
function poly(points: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) setPx(x, y, c);
    }
  }
}
function star(cx: number, cy: number, rOuter: number, rInner: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
  }
  poly(pts, c);
}

// ---------------------------------------------------------------- PNG out
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- fonts
interface Glyph {
  dx: number;
  dy: number;
  w: number;
  h: number;
  adv: number;
  data: Uint8Array;
}
interface Font {
  size: number;
  bold: boolean;
  ascent: number;
  descent: number;
  glyphs: Map<number, Glyph>;
  lineH: number;
}
const LEVEL_A = [0, 0.38, 0.68, 1];

function loadFonts(): Font[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, 'fonts.bin'));
  if (raw.toString('ascii', 0, 4) !== 'FNT1') throw new Error('bad fonts.bin magic');
  let p = 4;
  const count = raw[p++];
  const fonts: Font[] = [];
  for (let f = 0; f < count; f++) {
    const size = raw[p++];
    const bold = raw[p++] === 1;
    const ascent = raw.readUInt16BE(p); p += 2;
    const descent = raw.readUInt16BE(p); p += 2;
    const gcount = raw.readUInt16BE(p); p += 2;
    const glyphs = new Map<number, Glyph>();
    for (let g = 0; g < gcount; g++) {
      const code = raw.readUInt16BE(p); p += 2;
      const dx = raw.readInt8(p); p += 1;
      const dy = raw.readInt8(p); p += 1;
      const w = raw[p++];
      const h = raw[p++];
      const adv = raw[p++];
      const nBytes = Math.ceil((w * h) / 4);
      const data = new Uint8Array(raw.subarray(p, p + nBytes));
      p += nBytes;
      glyphs.set(code, { dx, dy, w, h, adv, data });
    }
    fonts.push({ size, bold, ascent, descent, glyphs, lineH: ascent + descent });
  }
  return fonts;
}
const FONTS = loadFonts();
// Index order matches gen_fonts.py: mast, hero, feat, item, body, kick, small.
const F_MAST = FONTS[0];
const F_HERO = FONTS[1];
const F_FEAT = FONTS[2];
const F_ITEM = FONTS[3];
const F_BODY = FONTS[4];
const F_KICK = FONTS[5];
const F_SMALL = FONTS[6];

function glyphOf(font: Font, ch: string): Glyph | undefined {
  return font.glyphs.get(ch.codePointAt(0) as number);
}
function textWidth(s: string, font: Font): number {
  let w = 0;
  for (const ch of s) {
    const g = glyphOf(font, ch);
    if (g) w += g.adv;
  }
  return w;
}
function drawText(s: string, x: number, yTop: number, font: Font, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = glyphOf(font, ch);
    if (!g) continue;
    if (g.w > 0 && g.h > 0) {
      let bit = 0;
      for (let yy = 0; yy < g.h; yy++) {
        for (let xx = 0; xx < g.w; xx++) {
          const byte = g.data[(bit / 4) | 0];
          const lvl = (byte >> (6 - 2 * (bit % 4))) & 3;
          if (lvl > 0) blendPx(cx + g.dx + xx, yTop + g.dy + yy, c, LEVEL_A[lvl]);
          bit++;
        }
      }
    }
    cx += g.adv;
  }
}
// Greedy word wrap. Returns lines; sets overflow=true when more lines than maxLines.
function wrapText(s: string, font: Font, maxW: number, maxLines: number): { lines: string[]; overflow: boolean } {
  const words = s.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur === '' ? word : cur + ' ' + word;
    if (textWidth(trial, font) <= maxW || cur === '') {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== '') lines.push(cur);
  const overflow = lines.length > maxLines;
  return { lines: lines.slice(0, maxLines), overflow };
}
function drawTextLines(lines: string[], x: number, yTop: number, font: Font, c: RGB, lineH?: number): void {
  const lh = lineH ?? font.lineH + 1;
  lines.forEach((ln, i) => drawText(ln, x, yTop + i * lh, font, c));
}

// ---------------------------------------------------------------- palette
const PAPER: RGB = [247, 242, 230];
const INK: RGB = [24, 24, 22];
const INK_SOFT: RGB = [74, 72, 66];
const GREY: RGB = [139, 134, 124];
const RULE: RGB = [24, 24, 22];
const HAIR: RGB = [206, 198, 182];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [185, 28, 28];
const CARD: RGB = [255, 253, 247];
const OCEAN: RGB = [213, 228, 236];
const LAND: RGB = [233, 221, 190];

type Kind =
  | 'conflict' | 'economy' | 'justice' | 'politics' | 'health' | 'disaster'
  | 'science' | 'sport' | 'culture' | 'climate' | 'tech' | 'energy';
const KIND_COLOR: Record<Kind, RGB> = {
  conflict: [185, 28, 28],
  economy: [14, 116, 144],
  justice: [109, 40, 217],
  politics: [29, 78, 216],
  health: [190, 24, 93],
  disaster: [194, 65, 12],
  science: [77, 124, 15],
  sport: [21, 128, 61],
  culture: [161, 98, 7],
  climate: [5, 150, 105],
  tech: [51, 65, 85],
  energy: [180, 83, 9],
};

// ---------------------------------------------------------------- icons
// Small 16x16 pictograms drawn with primitives, one per story kind.
function drawIcon(kind: Kind, cx: number, cy: number): void {
  const c = KIND_COLOR[kind];
  const s = 8; // half-size
  switch (kind) {
    case 'conflict': { // burst
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 2 * Math.PI;
        line(cx, cy, Math.round(cx + s * Math.cos(a)), Math.round(cy + s * Math.sin(a)), c);
      }
      circle(cx, cy, 3, c);
      break;
    }
    case 'economy': { // falling chart
      line(cx - 7, cy + 2, cx - 2, cy - 1, c);
      line(cx - 2, cy - 1, cx + 2, cy + 3, c);
      line(cx + 2, cy + 3, cx + 7, cy - 4, c);
      poly([[cx + 7, cy - 4], [cx + 3, cy - 4], [cx + 7, cy + 0]], c);
      line(cx - 7, cy + 7, cx + 7, cy + 7, c);
      break;
    }
    case 'justice': { // scales
      vline(cx, cy - 7, cy + 6, c);
      line(cx - 6, cy - 5, cx + 6, cy - 5, c);
      line(cx - 6, cy - 5, cx - 6, cy - 1, c);
      line(cx + 6, cy - 5, cx + 6, cy - 1, c);
      poly([[cx - 9, cy - 1], [cx - 3, cy - 1], [cx - 6, cy + 3]], c);
      poly([[cx + 3, cy - 1], [cx + 9, cy - 1], [cx + 6, cy + 3]], c);
      line(cx - 5, cy + 6, cx + 5, cy + 6, c);
      break;
    }
    case 'politics': { // ballot box + tick
      fillRect(cx - 6, cy - 2, 12, 9, c);
      line(cx - 3, cy + 2, cx - 1, cy + 5, WHITE);
      line(cx - 1, cy + 5, cx + 5, cy - 3, WHITE);
      fillRect(cx - 7, cy - 7, 14, 2, c);
      break;
    }
    case 'health': { // cross
      fillRect(cx - 2, cy - 7, 4, 14, c);
      fillRect(cx - 7, cy - 2, 14, 4, c);
      break;
    }
    case 'disaster': { // flame
      poly([[cx, cy - 8], [cx + 6, cy + 1], [cx + 3, cy + 7], [cx - 3, cy + 7], [cx - 6, cy + 1]], c);
      poly([[cx, cy - 1], [cx + 3, cy + 3], [cx, cy + 6], [cx - 3, cy + 3]], [255, 214, 90]);
      break;
    }
    case 'science': { // rocket
      poly([[cx, cy - 8], [cx + 4, cy - 1], [cx + 3, cy + 5], [cx - 3, cy + 5], [cx - 4, cy - 1]], c);
      circle(cx, cy - 2, 1, WHITE);
      poly([[cx - 2, cy + 5], [cx + 2, cy + 5], [cx, cy + 9]], [245, 158, 11]);
      break;
    }
    case 'sport': { // ball
      circle(cx, cy, 7, c);
      line(cx - 7, cy, cx + 7, cy, WHITE);
      line(cx, cy - 7, cx, cy + 7, WHITE);
      break;
    }
    case 'culture': { // star
      star(cx, cy, 8, 3, c);
      break;
    }
    case 'climate': { // sun + leaf
      circle(cx, cy, 4, c);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 2 * Math.PI;
        line(Math.round(cx + 6 * Math.cos(a)), Math.round(cy + 6 * Math.sin(a)),
          Math.round(cx + 8 * Math.cos(a)), Math.round(cy + 8 * Math.sin(a)), c);
      }
      break;
    }
    case 'tech': { // chip
      fillRect(cx - 5, cy - 5, 10, 10, c);
      fillRect(cx - 2, cy - 2, 4, 4, WHITE);
      line(cx - 8, cy - 3, cx - 5, cy - 3, c);
      line(cx - 8, cy + 3, cx - 5, cy + 3, c);
      line(cx + 5, cy - 3, cx + 8, cy - 3, c);
      line(cx + 5, cy + 3, cx + 8, cy + 3, c);
      line(cx - 3, cy - 8, cx - 3, cy - 5, c);
      line(cx + 3, cy - 8, cx + 3, cy - 5, c);
      line(cx - 3, cy + 5, cx - 3, cy + 8, c);
      line(cx + 3, cy + 5, cx + 3, cy + 8, c);
      break;
    }
    case 'energy': { // bolt
      poly([[cx + 2, cy - 8], [cx - 4, cy + 1], [cx - 1, cy + 1], [cx - 2, cy + 8], [cx + 4, cy - 1], [cx + 1, cy - 1]], c);
      break;
    }
  }
}

// Deterministic pseudo-random (fixed seed) for illustration texture.
let rngState = 987654321;
function rnd(): number {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// ---------------------------------------------------------------- hero art
// Kyiv at night: dark sky, lit skyline, missile arcs and explosions.
function drawHeroArt(x: number, y: number, w: number, h: number): void {
  const skyTop: RGB = [13, 22, 48];
  const skyBot: RGB = [38, 58, 102];
  for (let yy = 0; yy < h; yy++) fillRect(x, y + yy, w, 1, mix(skyTop, skyBot, yy / h));
  // Stars.
  rngState = 424242;
  for (let i = 0; i < 46; i++) {
    setPx(x + Math.floor(rnd() * w), y + Math.floor(rnd() * (h * 0.45)), [214, 222, 240]);
  }
  // Missile arcs.
  lineW(x + 18, y + h - 30, x + 120, y + 52, 2, [255, 214, 140]);
  lineW(x + 300, y + h - 18, x + 210, y + 40, 2, [255, 214, 140]);
  circle(x + 120, y + 52, 3, [255, 240, 200]);
  circle(x + 210, y + 40, 3, [255, 240, 200]);
  // Explosions.
  const bursts: Array<[number, number, number]> = [
    [0.24, 0.42, 26], [0.58, 0.30, 32], [0.82, 0.52, 22],
  ];
  for (const [fx, fy, r] of bursts) {
    const cx = x + Math.round(fx * w);
    const cy = y + Math.round(fy * h);
    circle(cx, cy, r, [239, 68, 68]);
    circle(cx, cy, Math.round(r * 0.62), [245, 158, 11]);
    circle(cx, cy, Math.round(r * 0.32), [253, 224, 71]);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 2 * Math.PI + 0.3;
      line(cx, cy, Math.round(cx + (r + 9) * Math.cos(a)), Math.round(cy + (r + 9) * Math.sin(a)), [245, 158, 11]);
    }
  }
  // Skyline silhouette.
  rngState = 777;
  let bx = x;
  const base = y + h;
  while (bx < x + w) {
    const bw = Math.min(16 + Math.floor(rnd() * 26), x + w - bx);
    if (bw <= 0) break;
    const bh = 26 + Math.floor(rnd() * 58);
    fillRect(bx, base - bh, bw, bh, [8, 12, 26]);
    // Lit windows.
    for (let wy = base - bh + 6; wy < base - 6; wy += 9) {
      for (let wx = bx + 4; wx < bx + bw - 4; wx += 8) {
        if (rnd() < 0.28) fillRect(wx, wy, 3, 4, [255, 196, 90]);
      }
    }
    bx += bw + 2;
  }
  // Smoke.
  for (let i = 0; i < 3; i++) {
    const cx = x + [70, 180, 258][i];
    const cy = y + [58, 44, 66][i];
    circle(cx, cy, 12, [90, 96, 112]);
    circle(cx + 8, cy - 8, 9, [90, 96, 112]);
  }
  // Caption chip.
  fillRect(x + 10, y + h - 28, 132, 18, RED);
  drawText('KYIV — OVERNIGHT', x + 17, y + h - 25, F_KICK, WHITE);
}

// ---------------------------------------------------------------- feature art
function drawMarketsArt(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [15, 42, 67]);
  for (let gy = y + 18; gy < y + h - 8; gy += 18) hline(x + 8, x + w - 8, gy, [38, 68, 102]);
  const pts: Array<[number, number]> = [
    [x + 10, y + 26], [x + 26, y + 34], [x + 42, y + 30], [x + 58, y + 52], [x + 74, y + 66], [x + 88, y + 88],
  ];
  for (let i = 0; i + 1 < pts.length; i++) lineW(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3, [248, 113, 113]);
  poly([[x + 88, y + 88], [x + 78, y + 86], [x + 88, y + 78]], [248, 113, 113]);
  drawText('−3.7%', x + 10, y + h - 24, F_FEAT, [248, 113, 113]);
}
function drawMexicoArt(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [20, 83, 45]);
  const cx = x + w / 2;
  const cy = y + h / 2 - 6;
  poly([[cx - 26, cy - 22], [cx + 26, cy - 22], [cx + 26, cy + 2], [cx, cy + 26], [cx - 26, cy + 2]], [250, 204, 21]);
  poly([[cx - 20, cy - 17], [cx + 20, cy - 17], [cx + 20, cy + 1], [cx, cy + 20], [cx - 20, cy + 1]], [20, 83, 45]);
  star(cx, cy - 3, 13, 5, [250, 204, 21]);
  drawText('SINALOA', x + 24, y + h - 20, F_KICK, WHITE);
}
function drawPolandArt(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [30, 58, 95]);
  // Polish flag: white over red.
  fillRect(x + 14, y + 22, 68, 18, WHITE);
  fillRect(x + 14, y + 40, 68, 18, [220, 38, 38]);
  // Map pin.
  const cx = x + 48;
  const cy = y + 82;
  circle(cx, cy - 6, 10, [239, 68, 68]);
  poly([[cx - 8, cy + 1], [cx + 8, cy + 1], [cx, cy + 14]], [239, 68, 68]);
  circle(cx, cy - 6, 4, WHITE);
  drawText('POLAND', x + 26, y + h - 16, F_KICK, WHITE);
}

// ---------------------------------------------------------------- numbers
function drawNumbers(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, CARD);
  // Header.
  fillRect(x, y, w, 26, [24, 24, 22]);
  drawText('THE DAY IN NUMBERS', x + 10, y + 6, F_KICK, WHITE);
  const rows: Array<[string, number, string]> = [
    ['S&P 500', -3.7, '−3.7%'],
    ['NIKKEI', -5.1, '−5.1%'],
    ['HANG SENG', -3.8, '−3.8%'],
    ['GOLD', -4.6, '−4.6%'],
  ];
  let ry = y + 40;
  for (const [label, val, shown] of rows) {
    drawText(label, x + 10, ry, F_SMALL, INK_SOFT);
    const barX = x + 92;
    const barW = Math.round((Math.abs(val) / 6) * 96);
    fillRect(barX, ry + 1, barW, 9, RED);
    drawText(shown, barX + barW + 6, ry, F_SMALL, RED);
    ry += 26;
  }
  hline(x + 10, x + w - 10, ry + 4, HAIR);
  drawText('BRENT ~$90 / bbl', x + 10, ry + 14, F_SMALL, INK);
  drawText('BITCOIN ~$60,100', x + 10, ry + 32, F_SMALL, INK);
  drawText('NASDAQ ERASES 2026 GAINS', x + 10, ry + 50, F_KICK, INK);
  drawText('ANTHROPIC SLIDES ON DAY TWO', x + 10, ry + 68, F_KICK, INK);
  void h;
}


// ---------------------------------------------------------------- stories
// 32 stories, 7 regions, all reported on Saturday 21 November 2026.
// Headlines are kept short (2 lines at 13px bold in a 201px column);
// one-line summaries are terse (1 line at 11px in the same column).
interface Story {
  kind: Kind;
  head: string;
  body: string;
}
interface Region {
  name: string;
  color: RGB;
  stories: Story[];
}
const REGIONS: Region[] = [
  {
    name: 'EUROPE', color: [29, 78, 216],
    stories: [
      { kind: 'politics', head: 'UK and EU sign three post-Brexit deals', body: 'Food, emissions, youth travel.' },
      { kind: 'politics', head: 'Denmark expels Russian diplomat', body: "Over 'plot to kill Kyivstoner'." },
      { kind: 'politics', head: 'Cost-of-living protests spread', body: 'Paris, Berlin, Italy march.' },
      { kind: 'climate', head: 'COP31 talks run past deadline', body: 'Fossil-fuel row blocks a deal.' },
    ],
  },
  {
    name: 'NORTH AMERICA', color: [185, 28, 28],
    stories: [
      { kind: 'tech', head: 'FBI crime database reportedly hacked', body: 'USDA payment system also hit.' },
      { kind: 'health', head: 'US loses measles elimination status', body: 'Status held for 26 years is lost.' },
      { kind: 'disaster', head: 'Palisades fire arsonist convicted', body: '12 killed; 6,800 buildings lost.' },
      { kind: 'culture', head: 'GTA VI earns $3.8bn on day one', body: 'Biggest launch in entertainment.' },
    ],
  },
  {
    name: 'LATIN AMERICA', color: [21, 128, 61],
    stories: [
      { kind: 'politics', head: 'Bolsonaro hospitalised in Brasília', body: 'Bowel blockage; surgery weighed.' },
      { kind: 'health', head: 'Dengue cut 69% by altered mosquitoes', body: 'Trial cuts dengue cases by 69%.' },
      { kind: 'disaster', head: 'Magnitude 6.7 quake shakes Peru', body: 'Near Junín; felt in Lima.' },
      { kind: 'conflict', head: 'Salvadoran troops battle gangs in Haiti', body: '2,500 troops deployed in Haiti.' },
    ],
  },
  {
    name: 'MIDDLE EAST', color: [180, 83, 9],
    stories: [
      { kind: 'conflict', head: 'Hormuz tanker attacks continue', body: 'Six strikes in a week near Oman.' },
      { kind: 'conflict', head: 'Israeli strike kills three in Gaza aid van', body: 'Aid vehicle for WCK hit in Gaza.' },
      { kind: 'conflict', head: 'Houthis and Saudi coalition trade strikes', body: '71 strikes in 24 hours reported.' },
      { kind: 'disaster', head: 'Fire at Basra power station kills four', body: '30 hurt at Hartha plant in Iraq.' },
    ],
  },
  {
    name: 'AFRICA', color: [109, 40, 217],
    stories: [
      { kind: 'disaster', head: 'Nigeria boat capsizes; 30 dead', body: 'About 300 missing in Bayelsa.' },
      { kind: 'conflict', head: '700,000 displaced in south Ethiopia', body: 'Ethnic fighting destroys homes.' },
      { kind: 'conflict', head: 'Fighting widens in eastern Congo', body: 'December truce under threat.' },
      { kind: 'justice', head: 'Tanzania convicts opposition leader', body: 'Tundu Lissu guilty of sedition.' },
    ],
  },
  {
    name: 'ASIA–PACIFIC', color: [14, 116, 144],
    stories: [
      { kind: 'justice', head: 'UN court: Myanmar guilty of genocide', body: "Court's first genocide verdict." },
      { kind: 'politics', head: 'Trump, Xi and Putin meet in Shenzhen', body: 'Declaration, but no breakthrough.' },
      { kind: 'politics', head: 'Japan sidelined as China ties hit low', body: 'Takaichi given a cool welcome.' },
      { kind: 'tech', head: 'Nvidia halts H200 chip exports to China', body: 'Curbs on advanced AI chips.' },
    ],
  },
  {
    name: 'OCEANIA', color: [190, 24, 93],
    stories: [
      { kind: 'justice', head: 'Melbourne teen ‘ran arsons on Signal’', body: 'Police link teen to arson ring.' },
      { kind: 'sport', head: 'North Melbourne into 4th straight AFLW final', body: 'Beat Sydney in preliminary final.' },
      { kind: 'science', head: 'Fossil study may rewrite human family tree', body: 'Monash rethinks ancient ancestors.' },
      { kind: 'energy', head: 'US sells deep-sea mining leases', body: 'First leases off American Samoa.' },
    ],
  },
];

let overflowCount = 0;
function noteOverflow(msg: string): void {
  overflowCount++;
  console.error('OVERFLOW: ' + msg);
}

// ---------------------------------------------------------------- layout
function drawMasthead(): void {
  const title = 'THE WORLD LEDGER';
  drawText(title, (W - textWidth(title, F_MAST)) / 2, 8, F_MAST, INK);
  fillRect(16, 66, 992, 2, RULE);
  drawText('No. 21', 16, 74, F_KICK, INK);
  const date = 'SATURDAY, 21 NOVEMBER 2026';
  drawText(date, (W - textWidth(date, F_KICK)) / 2, 74, F_KICK, INK);
  const right = '32 STORIES • 7 REGIONS';
  drawText(right, 1008 - textWidth(right, F_KICK), 74, F_KICK, INK);
  fillRect(16, 92, 992, 1, RULE);
  fillRect(16, 95, 992, 1, RULE);
}

function drawHero(): void {
  const y = 104;
  const h = 158;
  drawHeroArt(16, y, 316, h);
  const tx = 344;
  drawText('1 · WAR IN EUROPE — THE LEAD', tx, y + 8, F_KICK, RED);
  const head = wrapText('Russia fires 400 drones and 110 missiles at Ukraine', F_HERO, 664, 2);
  if (head.overflow) noteOverflow('hero headline');
  drawTextLines(head.lines, tx, y + 28, F_HERO, INK, 33);
  const deck = wrapText(
    'Kyiv is hit overnight; a missile kills two and wounds 60 in Kryvyi Rih. Power cut in ten regions.',
    F_BODY, 664, 2,
  );
  if (deck.overflow) noteOverflow('hero deck');
  drawTextLines(deck.lines, tx, y + 28 + head.lines.length * 33 + 8, F_BODY, INK_SOFT, 16);
  // Stat chips.
  const chips = ['400+ DRONES', '110 MISSILES', '8 KILLED IN KYIV', '2 KILLED, 60 HURT IN KRYVYI RIH'];
  let cx = tx;
  const cy = y + h - 30;
  for (const chip of chips) {
    const cw = textWidth(chip, F_KICK) + 16;
    fillRect(cx, cy, cw, 20, CARD);
    // Outline in red.
    hline(cx, cx + cw, cy, RED);
    hline(cx, cx + cw, cy + 19, RED);
    vline(cx, cy, cy + 20, RED);
    vline(cx + cw - 1, cy, cy + 20, RED);
    drawText(chip, cx + 8, cy + 4, F_KICK, RED);
    cx += cw + 8;
  }
}

interface Feature {
  num: number;
  kind: Kind;
  head: string;
  body: string;
  art: (x: number, y: number, w: number, h: number) => void;
}
function drawFeatures(): void {
  const y = 270;
  const h = 108;
  const feats: Feature[] = [
    { num: 2, kind: 'economy', head: 'AI sell-off rattles world markets', body: 'S&P 500 falls 3.7% into correction; Nikkei drops 5.1%.', art: drawMarketsArt },
    { num: 3, kind: 'justice', head: 'Mexico captures top cartel boss', body: '‘El Chapo Isidro’, FBI most-wanted, seized in Sinaloa.', art: drawMexicoArt },
    { num: 4, kind: 'conflict', head: 'Russian missiles land in Poland', body: 'NATO calls it a grave violation of allied airspace.', art: drawPolandArt },
  ];
  const xs = [16, 352, 688];
  feats.forEach((f, i) => {
    const x = xs[i];
    fillRect(x, y, 320, h, CARD);
    f.art(x, y, 96, h);
    const tx = x + 106;
    const tw = 320 - 106 - 8;
    const head = wrapText(f.head, F_FEAT, tw, 3);
    if (head.overflow) noteOverflow('feature headline: ' + f.head);
    drawTextLines(head.lines, tx, y + 10, F_FEAT, INK, 22);
    const body = wrapText(f.body, F_BODY, tw, 2);
    if (body.overflow) noteOverflow('feature body: ' + f.body);
    drawTextLines(body.lines, tx, y + 10 + head.lines.length * 22 + 4, F_BODY, INK_SOFT, 15);
    // Kind tag, numbered (stories 2–4).
    drawText(f.num + ' · ' + f.kind.toUpperCase(), tx, y + h - 18, F_KICK, KIND_COLOR[f.kind]);
  });
}

function drawRegion(x: number, y: number, w: number, h: number, region: Region, startNum: number): void {
  fillRect(x, y, w, h, CARD);
  fillRect(x, y, w, 22, region.color);
  drawText(region.name, x + 10, y + 4, F_ITEM, WHITE);
  const n = region.stories.length + ' STORIES';
  drawText(n, x + w - 10 - textWidth(n, F_SMALL), y + 5, F_SMALL, WHITE);
  const top = y + 22 + 4;
  const slotH = (h - 22 - 4 - 2) / region.stories.length;
  region.stories.forEach((s, i) => {
    const sy = top + i * slotH;
    drawIcon(s.kind, x + 16, Math.round(sy + 10));
    const tx = x + 30;
    const tw = w - 30 - 8;
    const head = wrapText((startNum + i) + '. ' + s.head, F_ITEM, tw, 2);
    if (head.overflow) noteOverflow('item headline: ' + s.head);
    drawTextLines(head.lines, tx, sy + 2, F_ITEM, INK, 16);
    const body = wrapText(s.body, F_SMALL, tw, 1);
    if (body.overflow) noteOverflow('item body: ' + s.body);
    drawTextLines(body.lines, tx, sy + 2 + head.lines.length * 16 + 2, F_SMALL, INK_SOFT, 13);
    if (i + 1 < region.stories.length) hline(x + 10, x + w - 10, Math.round(sy + slotH - 2), HAIR);
  });
}

function drawGrid(): void {
  const rowH = 236;
  const colW = 239;
  const xs = [16, 267, 518, 769];
  // Row 1: Europe (5–8), North America (9–12), Latin America (13–16), Middle East (17–20).
  drawRegion(xs[0], 386, colW, rowH, REGIONS[0], 5);
  drawRegion(xs[1], 386, colW, rowH, REGIONS[1], 9);
  drawRegion(xs[2], 386, colW, rowH, REGIONS[2], 13);
  drawRegion(xs[3], 386, colW, rowH, REGIONS[3], 17);
  // Row 2: Africa (21–24), Asia-Pacific (25–28), Oceania (29–32), numbers.
  drawRegion(xs[0], 630, colW, rowH, REGIONS[4], 21);
  drawRegion(xs[1], 630, colW, rowH, REGIONS[5], 25);
  drawRegion(xs[2], 630, colW, rowH, REGIONS[6], 29);
  drawNumbers(xs[3], 630, colW, rowH);
}

// ---------------------------------------------------------------- map + region bar
// World map (equirectangular, lon -168..192, lat 78..-58) with one numbered
// pin per story, plus a region-count bar. Pin positions are nudged a few px
// from the true location so neighbouring pins never overlap; every pin sits
// in the right country/region. Pin numbers match the story numbers.
const MAP_X0 = 24;
const MAP_X1 = 612;
const MAP_Y0 = 892;
const MAP_Y1 = 978;
function mpt(lon: number, lat: number): [number, number] {
  const x = MAP_X0 + ((lon + 168) / 360) * (MAP_X1 - MAP_X0);
  const y = MAP_Y0 + ((78 - lat) / 136) * (MAP_Y1 - MAP_Y0);
  return [Math.round(x), Math.round(y)];
}
// Simplified continent outlines as [lon, lat] points.
const CONTINENTS: Array<Array<[number, number]>> = [
  [ // North America
    [-168, 66], [-155, 71], [-140, 70], [-128, 71], [-115, 69], [-102, 69], [-92, 70], [-85, 70],
    [-82, 73], [-76, 72], [-70, 63], [-64, 60], [-58, 55], [-55, 52], [-59, 47], [-65, 44],
    [-70, 42], [-75, 38], [-76, 35], [-80, 32], [-81, 26], [-85, 30], [-89, 29], [-91, 21],
    [-95, 19], [-97, 16], [-93, 14], [-88, 13], [-84, 10], [-80, 8], [-83, 9], [-87, 13],
    [-91, 14], [-95, 16], [-99, 18], [-104, 21], [-108, 24], [-112, 28], [-116, 32], [-121, 35],
    [-124, 40], [-124, 47], [-128, 50], [-132, 56], [-140, 60], [-150, 59], [-158, 58], [-165, 60],
  ],
  [ // South America
    [-80, 9], [-77, 5], [-79, 0], [-81, -5], [-78, -10], [-74, -16], [-70, -20], [-70, -25],
    [-71, -32], [-72, -38], [-73, -45], [-71, -52], [-66, -55], [-68, -50], [-66, -44], [-63, -40],
    [-58, -35], [-53, -33], [-49, -29], [-43, -23], [-39, -18], [-36, -10], [-35, -6], [-38, -4],
    [-43, -2], [-48, 0], [-52, 4], [-56, 7], [-60, 9], [-64, 11], [-69, 12], [-73, 11], [-77, 8],
  ],
  [ // Africa
    [-17, 15], [-16, 21], [-11, 27], [-6, 33], [-1, 35], [5, 37], [10, 37], [16, 32],
    [20, 32], [26, 31], [30, 31], [33, 28], [36, 24], [38, 20], [40, 15], [43, 11],
    [48, 11], [51, 11], [48, 6], [44, 2], [41, -2], [40, -7], [39, -13], [36, -18],
    [33, -25], [29, -32], [24, -34], [19, -35], [16, -30], [14, -25], [12, -18], [13, -12],
    [11, -5], [9, 0], [9, 4], [4, 6], [-3, 5], [-8, 5], [-13, 8], [-17, 12],
  ],
  [ // Eurasia
    [-10, 36], [-9, 42], [-3, 44], [-1, 46], [-4, 48], [0, 50], [2, 51], [6, 53],
    [8, 56], [8, 58], [6, 60], [5, 62], [10, 64], [15, 67], [20, 70], [26, 71],
    [32, 70], [40, 68], [48, 69], [56, 70], [64, 71], [72, 73], [80, 73], [88, 75],
    [96, 76], [104, 77], [112, 74], [120, 73], [128, 72], [136, 72], [144, 71], [152, 70],
    [158, 69], [162, 66], [170, 66], [178, 65], [178, 62], [172, 60], [164, 60], [158, 56],
    [154, 59], [148, 59], [142, 55], [140, 50], [136, 44], [132, 43], [128, 39], [124, 40],
    [121, 37], [120, 32], [122, 28], [116, 23], [111, 21], [108, 18], [106, 10], [104, 8],
    [101, 7], [99, 10], [97, 15], [94, 17], [92, 21], [89, 22], [86, 20], [83, 18],
    [80, 15], [78, 8], [76, 10], [73, 16], [71, 21], [68, 23], [66, 25], [62, 25],
    [58, 26], [54, 27], [52, 28], [50, 29], [49, 30], [51, 26], [54, 26], [57, 27],
    [59, 23], [57, 20], [55, 17], [52, 15], [48, 14], [44, 13], [42, 15], [40, 18],
    [38, 21], [36, 25], [35, 28], [34, 28], [35, 31], [33, 31], [30, 36], [27, 37],
    [23, 36], [22, 37], [19, 40], [16, 38], [14, 42], [12, 44], [8, 44], [3, 43],
    [0, 40], [-2, 37], [-6, 36], [-9, 37],
  ],
  [ // Australia
    [114, -22], [114, -30], [115, -34], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35],
    [138, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [150, -23], [146, -19],
    [142, -15], [142, -11], [137, -12], [135, -12], [132, -11], [129, -14], [126, -14], [122, -17], [118, -20],
  ],
  [ // New Zealand
    [167, -45], [170, -42], [173, -40], [175, -38], [177, -38], [174, -41], [171, -43], [168, -46],
  ],
  [ // United Kingdom
    [-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-2, 50],
  ],
  [ // Japan
    [130, 31], [132, 33], [135, 34], [137, 35], [139, 37], [140, 39], [141, 41], [143, 42],
    [145, 44], [143, 45], [141, 44], [140, 40], [139, 37], [137, 34], [134, 34], [131, 32],
  ],
  [ // Madagascar
    [44, -16], [47, -15], [50, -16], [49, -20], [47, -24], [44, -25], [43, -21],
  ],
  [ // Indonesia (rough)
    [95, 5], [98, 3], [101, 0], [104, -3], [107, -6], [110, -7], [114, -8], [118, -9],
    [120, -10], [122, -8], [125, -9], [128, -6], [130, -3], [132, -1], [135, -2], [138, -4],
    [141, -4], [141, -2], [138, 0], [135, 1], [132, 2], [130, 1], [128, 1], [126, 2],
    [124, 1], [121, 1], [118, 2], [116, 1], [114, 1], [111, 2], [108, 2], [105, 1], [102, 1], [99, 4],
  ],
];
// [story number, pin x, pin y, region index] — region index follows REGIONS order.
const PINS: Array<[number, number, number, number]> = [
  [1, 349, 906, 0], [2, 186, 910, 1], [3, 124, 926, 2], [4, 330, 909, 0],
  [5, 288, 902, 0], [6, 314, 902, 0], [7, 302, 912, 0], [8, 360, 918, 0],
  [9, 166, 918, 1], [10, 150, 910, 1], [11, 106, 920, 1], [12, 180, 930, 1],
  [13, 216, 950, 2], [14, 230, 958, 2], [15, 178, 948, 2], [16, 196, 936, 2],
  [17, 390, 924, 3], [18, 346, 924, 3], [19, 366, 934, 3], [20, 375, 922, 3],
  [21, 310, 938, 4], [22, 352, 940, 4], [23, 336, 946, 4], [24, 362, 952, 4],
  [25, 455, 928, 5], [26, 486, 926, 5], [27, 526, 916, 5], [28, 494, 912, 5],
  [29, 534, 966, 6], [30, 548, 958, 6], [31, 518, 956, 6], [32, 32, 950, 6],
];
// Lead stories 1–4 belong to regions: 1 Kyiv Europe, 2 markets N America,
// 3 Sinaloa Latin America, 4 Poland Europe.
const LEAD_REGION = [0, 1, 2, 0];

function drawMapBand(): void {
  const y = 874;
  const h = 104;
  // --- map panel (left) ---
  fillRect(16, y, 604, h, CARD);
  hline(16, 620, y, RULE);
  hline(16, 620, y + h - 1, RULE);
  vline(16, y, y + h, RULE);
  vline(619, y, y + h, RULE);
  drawText('WHERE IT HAPPENED — PINS MATCH STORY NUMBERS • POSITIONS APPROXIMATE', 24, y + 5, F_KICK, RED);
  fillRect(MAP_X0, MAP_Y0, MAP_X1 - MAP_X0, MAP_Y1 - MAP_Y0, OCEAN);
  for (const cont of CONTINENTS) {
    poly(cont.map(([lo, la]) => mpt(lo, la)), LAND);
  }
  for (const [num, px, py, ri] of PINS) {
    circle(px, py, 7, REGIONS[ri].color);
    ring(px, py, 7, WHITE);
    const s = String(num);
    drawText(s, px - textWidth(s, F_SMALL) / 2, py - 7, F_SMALL, WHITE);
  }
  // --- region-count bar panel (right) ---
  const bx = 632;
  const bw = 376;
  fillRect(bx, y, bw, h, CARD);
  hline(bx, bx + bw, y, RULE);
  hline(bx, bx + bw, y + h - 1, RULE);
  vline(bx, y, y + h, RULE);
  vline(bx + bw - 1, y, y + h, RULE);
  const counts = REGIONS.map((r) => r.stories.length);
  for (const ri of LEAD_REGION) counts[ri]++;
  const total = counts.reduce((a, b) => a + b, 0);
  drawText('STORIES BY REGION — ' + total + ' TOTAL', bx + 12, y + 5, F_KICK, INK);
  const order = counts.map((c, i) => i).sort((a, b) => counts[b] - counts[a] || a - b);
  const barX = bx + 118;
  const maxBar = 180;
  const maxCount = Math.max(...counts);
  order.forEach((ri, k) => {
    const ry = y + 20 + k * 12;
    fillRect(bx + 12, ry + 1, 9, 9, REGIONS[ri].color);
    drawText(REGIONS[ri].name, bx + 26, ry, F_SMALL, INK);
    const barW = Math.round((counts[ri] / maxCount) * maxBar);
    fillRect(barX, ry + 1, barW, 8, REGIONS[ri].color);
    drawText(String(counts[ri]), barX + barW + 6, ry, F_SMALL, INK);
  });
}

function drawFooter(): void {
  const check = 'DATE CHECK: SATURDAY, 21 NOVEMBER 2026 — EVERY STORY ABOVE WAS REPORTED ON THIS DAY';
  drawText(check, (W - textWidth(check, F_KICK)) / 2, 990, F_KICK, RED);
  const s = 'SOURCES: BBC NEWS • AP • REUTERS • AFP • AL JAZEERA • THE GUARDIAN • FRANCE 24';
  drawText(s, (W - textWidth(s, F_SMALL)) / 2, 1005, F_SMALL, GREY);
}

// ---------------------------------------------------------------- main
function main(): void {
  fillRect(0, 0, W, H, PAPER);
  drawMasthead();
  drawHero();
  drawFeatures();
  drawGrid();
  drawMapBand();
  drawFooter();
  const png = encodePng();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'entry.png'), png);
  const stories = 4 + REGIONS.reduce((n, r) => n + r.stories.length, 0);
  console.error(`stories=${stories} regions=${REGIONS.length} bytes=${png.length} overflows=${overflowCount}`);
}

main();
