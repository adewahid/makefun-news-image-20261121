// news-image-20261121 v6 — "The World in One Page", Saturday 21 November 2026.
// Draws the whole front page with its own raster canvas, its own PNG encoder
// and its own font engine (fonts.bin, baked from Liberation Serif by genfont.py).
// Node 22, standard library only. Deterministic: same bytes on every run.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const NODE = process.execPath;

// ---------------------------------------------------------------- fonts ----
type Glyph = { adv: number; bx: number; by: number; w: number; h: number; cov: Uint8Array };
type SizeMap = Map<number, Glyph>; // codepoint -> glyph
type FontFace = Map<number, SizeMap>; // px size -> glyphs
const FACES = new Map<string, FontFace>();

function loadFonts(): void {
  const b = readFileSync(new URL('./fonts.bin', import.meta.url));
  let o = 0;
  const u32 = () => { const v = b.readUInt32LE(o); o += 4; return v; };
  const u16 = () => { const v = b.readUInt16LE(o); o += 2; return v; };
  const i16 = () => { const v = b.readInt16LE(o); o += 2; return v; };
  if (b.toString('latin1', 0, 4) !== 'FNT1') throw new Error('bad fonts.bin');
  o = 4;
  const nFaces = u32();
  for (let f = 0; f < nFaces; f++) {
    const nlen = b[o]; o += 1;
    const name = b.toString('latin1', o, o + nlen); o += nlen;
    const nSizes = u32();
    const face: FontFace = new Map();
    for (let s = 0; s < nSizes; s++) {
      const px = u16();
      const nGlyphs = u16();
      const sm: SizeMap = new Map();
      for (let g = 0; g < nGlyphs; g++) {
        const cp = u32();
        const adv = i16(), bx = i16(), by = i16();
        const w = u16(), h = u16();
        const cov = new Uint8Array(b.subarray(o, o + w * h));
        o += w * h;
        sm.set(cp, { adv, bx, by, w, h, cov });
      }
      face.set(px, sm);
    }
    FACES.set(name, face);
  }
}

function glyphFor(face: string, size: number, ch: string): Glyph | null {
  const f = FACES.get(face);
  if (!f) return null;
  const sm = f.get(size);
  if (!sm) return null;
  return sm.get(ch.codePointAt(0)!) ?? sm.get(63) ?? null; // '?' fallback
}

function textWidth(s: string, face: string, size: number, tracking = 0): number {
  let w = 0;
  for (const ch of s) {
    const g = glyphFor(face, size, ch);
    if (g) w += g.adv + tracking;
  }
  return w;
}

// --------------------------------------------------------------- canvas ----
const W = 1024, H = 1024;
const buf = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [246, 239, 221];
const PAPER2: RGB = [238, 229, 204];
const INK: RGB = [25, 21, 16];
const MUTED: RGB = [90, 82, 68];
const RED: RGB = [166, 30, 20];
const DARKRED: RGB = [126, 21, 12];
const CREAM: RGB = [250, 246, 233];
const RULE: RGB = [196, 183, 152];
const NAVY: RGB = [22, 40, 63];
const OCEAN: RGB = [213, 228, 224];
const LAND: RGB = [178, 190, 138];
const LANDB: RGB = [132, 148, 96];

function fillAll(c: RGB): void {
  for (let i = 0; i < W * H; i++) { buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]; }
}
function px(x: number, y: number, c: RGB): void {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function blendPx(x: number, y: number, c: RGB, a: number): void {
  if (a <= 0) return;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  if (a >= 255) { buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; return; }
  buf[i] = (buf[i] * (255 - a) + c[0] * a) / 255 | 0;
  buf[i + 1] = (buf[i + 1] * (255 - a) + c[1] * a) / 255 | 0;
  buf[i + 2] = (buf[i + 2] * (255 - a) + c[2] * a) / 255 | 0;
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) { buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; i += 3; }
  }
}
function hline(x: number, y: number, w: number, c: RGB, t = 1): void { rect(x, y, w, t, c); }
function vline(x: number, y: number, h: number, c: RGB, t = 1): void { rect(x, y, t, h, c); }
function circle(cx: number, cy: number, r: number, c: RGB): void {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  for (let yy = -r; yy <= r; yy++) {
    const dx = Math.floor(Math.sqrt(r * r - yy * yy));
    for (let xx = -dx; xx <= dx; xx++) px(cx + xx, cy + yy, c);
  }
}
function ring(cx: number, cy: number, r: number, c: RGB, t = 1): void {
  for (let k = 0; k < t; k++) {
    const rr = r - k;
    for (let a = 0; a < 360; a += 1) {
      const rad = a * Math.PI / 180;
      px(Math.round(cx + rr * Math.cos(rad)), Math.round(cy + rr * Math.sin(rad)), c);
    }
  }
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const r = Math.max(0, Math.floor(t / 2));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + dx * i / steps), y = Math.round(y0 + dy * i / steps);
    if (r === 0) px(x, y, c); else circle(x, y, r, c);
  }
}
function poly(pts: [number, number][], c: RGB): void {
  // even-odd scanline fill
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if (y0 === y1) continue;
      if ((y0 <= y + 0.5 && y + 0.5 < y1) || (y1 <= y + 0.5 && y + 0.5 < y0)) {
        xs.push(x0 + (y + 0.5 - y0) * (x1 - x0) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px(x, y, c);
    }
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  const pts: [number, number][] = [];
  for (let a = 0; a < 360; a += 6) {
    const rad = a * Math.PI / 180;
    pts.push([cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)]);
  }
  poly(pts, c);
}
function triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  poly([[x0, y0], [x1, y1], [x2, y2]], c);
}

// ----------------------------------------------------------------- text ----
function drawText(x: number, yTop: number, s: string, face: string, size: number, c: RGB, tracking = 0): number {
  // yTop = top of the cap-height box; returns width drawn
  yTop = Math.round(yTop); x = Math.round(x);
  const baseline = yTop + Math.round(size * 0.72);
  let pen = Math.round(x);
  for (const ch of s) {
    const g = glyphFor(face, size, ch);
    if (!g) { pen += Math.round(size * 0.3); continue; }
    const gx = pen + g.bx, gy = baseline - g.by;
    for (let r = 0; r < g.h; r++) {
      for (let cc = 0; cc < g.w; cc++) {
        const a = g.cov[r * g.w + cc];
        if (a) blendPx(gx + cc, gy + r, c, a);
      }
    }
    pen += g.adv + tracking;
  }
  return pen - Math.round(x);
}
function drawTextC(x: number, yTop: number, s: string, face: string, size: number, c: RGB, tracking = 0): void {
  drawText(x - textWidth(s, face, size, tracking) / 2, yTop, s, face, size, c, tracking);
}
function wrapText(s: string, face: string, size: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, face, size) <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  // hard-split any line still too wide
  const out: string[] = [];
  for (const ln of lines) {
    if (textWidth(ln, face, size) <= maxW) { out.push(ln); continue; }
    let part = '';
    for (const ch of ln) {
      if (textWidth(part + ch, face, size) > maxW && part) { out.push(part); part = ch; }
      else part += ch;
    }
    if (part) out.push(part);
  }
  return out;
}

// ------------------------------------------------------------------ png ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcIn = new Uint8Array(4 + data.length);
  crcIn.set(out.subarray(4, 8), 0);
  crcIn.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcIn));
  return out;
}
function encodePNG(): Uint8Array {
  const raw = new Uint8Array(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(idat)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// -------------------------------------------------------------- stories ----
// Researched from live reporting of 21 Nov 2026 (Reuters, AP via aggregators,
// Al Jazeera, Euronews, Straits Times, Arab News, Daily Digest, One Turn,
// Seven Lights, Deccan Chronicle, Virginia Times, Astrova News).
// layer: 0 = lead, 1 = picture story, 2 = brief. lon/lat = map pin anchor.
type Story = {
  n: number; layer: number; region: string; lon: number; lat: number;
  head: string; dek: string; src: string;
};
const STORIES: Story[] = [
  { n: 1, layer: 0, region: 'Asia', lon: 114.06, lat: 22.55, head: 'XI HOSTS TRUMP AND PUTIN AT APEC SUMMIT', dek: 'The three leaders meet in Shenzhen as the APEC gathering opens. Kyiv calls the talks "very unsuccessful" for Moscow.', src: 'REU' },
  { n: 2, layer: 0, region: 'Europe', lon: 30.52, lat: 50.45, head: 'RUSSIA STRIKES KYIV AND KRYVYI RIH', dek: 'A missile kills a paramedic and a 7-year-old boy in Zelenskyy\u2019s hometown; Poland reports a "grave violation" at its border.', src: 'VT' },
  { n: 3, layer: 0, region: 'Middle East', lon: 50.56, lat: 26.23, head: 'IRAN STRIKES BAHRAIN AS HORMUZ SHIPPING BURNS', dek: 'Bahrain blames Tehran for an industrial-site strike; two tankers are hit near the strait and oil flows fall 15%.', src: 'AN' },
  { n: 4, layer: 0, region: 'North America', lon: -74.0, lat: 40.71, head: 'WALL STREET ROUT: S&P \u22123.7%, NASDAQ \u22125.3%', dek: 'The AI sell-off caps the worst week since 2020. The S&P 500 is in correction, down 9.8% in a month.', src: 'OT' },
  { n: 5, layer: 1, region: 'Europe', lon: 30.71, lat: 36.9, head: 'COP31 SLIPS INTO OVERTIME', dek: 'Climate talks in Antalya run past deadline as nations quarrel over fossil fuels.', src: 'OT' },
  { n: 6, layer: 1, region: 'North America', lon: -108.47, lat: 25.57, head: 'MEXICO CAPTURES \u2018EL CHAPO ISIDRO\u2019', dek: 'FBI most-wanted cartel boss seized in a Sinaloa raid; 11 killed.', src: 'REU' },
  { n: 7, layer: 1, region: 'South America', lon: -75.5, lat: -10.5, head: 'M6.7 QUAKE SHAKES THE ANDES', dek: 'Earthquake strikes central Peru; damage reports still coming in.', src: 'ST' },
  { n: 8, layer: 1, region: 'Europe', lon: 12.57, lat: 55.68, head: 'DENMARK EXPELS RUSSIAN ATTACH\u00c9', dek: 'Copenhagen ties Moscow to a foiled plot to kill rapper Kyivstoner.', src: 'SL' },
  { n: 9, layer: 1, region: 'Asia', lon: 126.98, lat: 37.57, head: 'SEOUL MINISTER QUITS OVER AI CHEATING ROW', dek: 'Education chief resigns days before college exams.', src: 'REU' },
  { n: 10, layer: 1, region: 'Middle East', lon: 34.47, lat: 31.5, head: 'GAZA: FOUR KILLED DESPITE CEASEFIRE', dek: 'Civil defence says four Palestinians were killed in Israeli fire.', src: 'DD' },
  { n: 11, layer: 1, region: 'Europe', lon: -0.13, lat: 51.51, head: 'UK AND EU SEAL POST-BREXIT RESET', dek: 'Food, carbon and youth-mobility deals agreed in London and Brussels.', src: 'OT' },
  { n: 12, layer: 1, region: 'Europe', lon: 4.35, lat: 50.85, head: 'GEN Z WALKS OUT IN 25 COUNTRIES', dek: 'Youth walkouts sweep Europe; marches in Lisbon, Paris, Madrid.', src: 'DD' },
  { n: 13, layer: 1, region: 'Middle East', lon: 46.68, lat: 24.71, head: 'SAUDI DOWNS THREE MISSILES OVER RIYADH', dek: 'Houthi missiles intercepted above the capital; no casualties reported.', src: 'VT' },
  { n: 14, layer: 1, region: 'Europe', lon: 8.65, lat: 49.87, head: 'BEPICOLOMBO REACHES MERCURY', dek: 'European-Japanese probe enters orbit after an eight-year journey.', src: 'OT' },
  { n: 15, layer: 2, region: 'Asia', lon: 116.41, lat: 39.9, head: 'China condemns US move barring its telecoms from phone numbers', src: 'ST', dek: '' },
  { n: 16, layer: 2, region: 'Asia', lon: 121.47, lat: 31.23, head: 'Chinese AI stocks shed $1.7 trillion since June', src: 'ST', dek: '' },
  { n: 17, layer: 2, region: 'Middle East', lon: 51.39, lat: 35.69, head: 'Iran to ration electricity from Nov 22 as war strains grid', src: 'ST', dek: '' },
  { n: 18, layer: 2, region: 'Middle East', lon: 51.39, lat: 35.69, head: 'Iran unveils a new missile launcher', src: 'AST', dek: '' },
  { n: 19, layer: 2, region: 'Asia', lon: 126.29, lat: 39.8, head: 'IAEA: North Korea expanding enrichment at Yongbyon', src: 'OT', dek: '' },
  { n: 20, layer: 2, region: 'Europe', lon: 24.75, lat: 59.44, head: 'Estonia closes its Russian border', src: 'AST', dek: '' },
  { n: 21, layer: 2, region: 'Europe', lon: -9.14, lat: 38.72, head: 'Cost-of-living protests in Portugal, France and Spain', src: 'DD', dek: '' },
  { n: 22, layer: 2, region: 'Europe', lon: 15.98, lat: 45.81, head: 'Zagreb rally seeks justice after hospital death', src: 'DD', dek: '' },
  { n: 23, layer: 2, region: 'Asia', lon: 93.94, lat: 24.82, head: 'Toxic liquor kills 11 and sickens 180 in Manipur', src: 'DD', dek: '' },
  { n: 24, layer: 2, region: 'Asia', lon: 77.21, lat: 28.61, head: 'Nepal PM Shah lands in Delhi for talks with Modi', src: 'ST', dek: '' },
  { n: 25, layer: 2, region: 'Asia', lon: 77.21, lat: 28.61, head: 'India core sector growth hits 10.9%', src: 'DC', dek: '' },
  { n: 26, layer: 2, region: 'North America', lon: -77.04, lat: 38.9, head: 'Trump signs law ending penny production', src: 'VT', dek: '' },
  { n: 27, layer: 2, region: 'North America', lon: -77.04, lat: 38.9, head: 'Vance won\u2019t back Trump\u2019s Iran nuclear claim', src: 'ST', dek: '' },
  { n: 28, layer: 2, region: 'North America', lon: -77.04, lat: 38.9, head: 'Hegseth memo said to limit US\u2013Canada defence ties', src: 'ST', dek: '' },
  { n: 29, layer: 2, region: 'North America', lon: -74.0, lat: 40.71, head: 'Trump weighs backing Barry Bonds for Hall of Fame', src: 'REU', dek: '' },
  { n: 30, layer: 2, region: 'North America', lon: -122.42, lat: 37.77, head: 'Anthropic shares slide on day two, close $88.91', src: 'OT', dek: '' },
  { n: 31, layer: 2, region: 'North America', lon: -72.34, lat: 18.54, head: 'Two Salvadoran soldiers killed in Haiti', src: 'AST', dek: '' },
  { n: 32, layer: 2, region: 'North America', lon: -74.0, lat: 40.71, head: 'GTA VI sells $2.36B on day one \u2014 24.6m copies', src: 'VT', dek: '' },
  { n: 33, layer: 2, region: 'Europe', lon: 7.69, lat: 45.07, head: 'Alcaraz reaches the ATP Finals', src: 'AST', dek: '' },
  { n: 34, layer: 2, region: 'Europe', lon: -0.13, lat: 51.51, head: 'Princess of Wales post-cancer documentary airs', src: 'AST', dek: '' },
  { n: 35, layer: 2, region: 'North America', lon: -118.24, lat: 34.05, head: 'Palisades Fire conviction secured in Los Angeles', src: 'AST', dek: '' },
  { n: 36, layer: 2, region: 'Oceania', lon: 151.21, lat: -33.87, head: 'Fred Nile, longtime NSW politician, dies at 92', src: 'DD', dek: '' },
  { n: 37, layer: 2, region: 'Europe', lon: -1.55, lat: 53.8, head: 'Leeds thrash Chelsea 4\u20131 at Elland Road', src: 'AST', dek: '' },
  { n: 38, layer: 2, region: 'North America', lon: -115.14, lat: 36.17, head: 'Verstappen loses pole in Las Vegas Grand Prix', src: 'AST', dek: '' },
];

// ------------------------------------------------------------------ art ----
// Small code-drawn scenes. All coordinates are local to the given box.
function artSummit(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [214, 68, 48]); // dusk sky
  rect(x, y + h * 0.55, w, h * 0.45, [38, 32, 28]);
  circle(x + w * 0.78, y + h * 0.3, Math.round(h * 0.16), [250, 214, 130]); // sun
  // skyline
  const bw = w / 14;
  const hs = [0.5, 0.72, 0.42, 0.85, 0.6, 0.95, 0.55, 0.78, 0.48, 0.66, 0.9, 0.58, 0.74, 0.44];
  for (let i = 0; i < 14; i++) {
    const bh = h * 0.55 * hs[i];
    rect(x + i * bw, y + h - bh, bw - 1, bh, i % 3 === 0 ? [24, 22, 20] : [52, 44, 38]);
    if (i % 4 === 1) rect(x + i * bw + bw * 0.3, y + h - bh - 8, 2, 8, [250, 214, 130]);
  }
  // three flags on poles above the skyline
  const fx = [x + w * 0.2, x + w * 0.42, x + w * 0.64], fy = y + h * 0.18;
  const flagCols: RGB[][] = [
    [[190, 20, 20], [250, 220, 60]],
    [[190, 30, 40], [250, 250, 250], [30, 60, 140]],
    [[250, 250, 250], [30, 90, 200], [200, 30, 30]],
  ];
  for (let i = 0; i < 3; i++) {
    vline(fx[i], fy, 26, [240, 235, 220], 2);
    const fw = 26, fh = 16;
    const cols = flagCols[i];
    for (let s = 0; s < cols.length; s++) rect(fx[i] + 2, fy + s * Math.ceil(fh / cols.length), fw, Math.ceil(fh / cols.length), cols[s]);
    if (i === 0) { circle(fx[i] + 8, fy + 4, 2, [250, 220, 60]); }
  }
  // handshake arc
  line(x + w * 0.12, y + h - 8, x + w * 0.5, y + h - 26, [250, 214, 130], 2);
  line(x + w * 0.88, y + h - 8, x + w * 0.5, y + h - 26, [250, 214, 130], 2);
}
function artKyiv(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [58, 52, 74]); // dusk
  rect(x, y + h * 0.62, w, h * 0.38, [28, 26, 30]);
  // skyline with a broken tower
  const bw = w / 10;
  const hs = [0.5, 0.66, 0.4, 0.8, 0.58, 0.7, 0.45, 0.62, 0.52, 0.6];
  for (let i = 0; i < 10; i++) {
    const bh = h * 0.6 * hs[i];
    if (i === 4) {
      // shattered tower: jagged top
      poly([[x + i * bw, y + h], [x + i * bw, y + h - bh * 0.7], [x + i * bw + bw * 0.3, y + h - bh * 0.9], [x + i * bw + bw * 0.55, y + h - bh * 0.62], [x + i * bw + bw * 0.8, y + h - bh * 0.8], [x + (i + 1) * bw, y + h - bh * 0.6], [x + (i + 1) * bw, y + h]], [20, 18, 20]);
    } else {
      rect(x + i * bw, y + h - bh, bw - 1, bh, [16, 15, 18]);
    }
  }
  // smoke columns
  ellipse(x + w * 0.46, y + h * 0.2, 9, 20, [120, 116, 110]);
  ellipse(x + w * 0.5, y + h * 0.1, 7, 15, [140, 136, 130]);
  ellipse(x + w * 0.3, y + h * 0.3, 6, 12, [110, 106, 100]);
  // missile trail arc + flash
  line(x + w * 0.08, y + h * 0.12, x + w * 0.42, y + h * 0.42, [250, 240, 200], 2);
  circle(x + w * 0.44, y + h * 0.44, 6, [255, 170, 40]);
  circle(x + w * 0.44, y + h * 0.44, 3, [255, 230, 150]);
  // sparks
  circle(x + w * 0.7, y + h * 0.5, 2, [255, 180, 60]);
  circle(x + w * 0.82, y + h * 0.35, 2, [255, 180, 60]);
}
function artHormuz(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h * 0.55, [240, 180, 110]); // burning sky
  rect(x, y + h * 0.55, w, h * 0.45, [28, 70, 96]); // sea
  for (let i = 0; i < 5; i++) hline(x, y + h * (0.6 + i * 0.07), w, [60, 110, 130], 1);
  circle(x + w * 0.85, y + h * 0.2, Math.round(h * 0.12), [255, 220, 140]); // sun
  // tanker
  const tx = x + w * 0.12, ty = y + h * 0.62, tw = w * 0.62, th = h * 0.16;
  rect(tx, ty, tw, th, [18, 20, 24]);
  rect(tx + tw * 0.1, ty - h * 0.1, tw * 0.2, h * 0.1, [200, 60, 40]);
  rect(tx + tw * 0.4, ty - h * 0.07, tw * 0.3, h * 0.07, [220, 180, 60]);
  rect(tx + tw * 0.75, ty - h * 0.14, tw * 0.12, h * 0.14, [240, 240, 235]);
  // flames on the tanker
  triangle(tx + tw * 0.42, ty - 2, tx + tw * 0.5, ty - h * 0.3, tx + tw * 0.58, ty - 2, [255, 140, 20]);
  triangle(tx + tw * 0.48, ty - 2, tx + tw * 0.54, ty - h * 0.2, tx + tw * 0.6, ty - 2, [255, 210, 60]);
  ellipse(tx + tw * 0.55, ty - h * 0.32, 8, 12, [90, 88, 84]);
  // second tanker far right, small
  rect(x + w * 0.8, y + h * 0.68, w * 0.14, h * 0.08, [40, 44, 48]);
  // oil derrick silhouette left
  poly([[x + w * 0.02, y + h * 0.62], [x + w * 0.05, y + h * 0.42], [x + w * 0.08, y + h * 0.62]], [16, 18, 20]);
}
function artMarkets(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [16, 22, 30]);
  for (let i = 1; i < 5; i++) hline(x + 4, y + (h / 5) * i, w - 8, [40, 50, 62], 1);
  // descending candlesticks
  const n = 9, cw = (w - 16) / n;
  const tops = [0.25, 0.3, 0.38, 0.36, 0.48, 0.55, 0.52, 0.64, 0.72];
  const bots = [0.42, 0.48, 0.52, 0.55, 0.62, 0.7, 0.68, 0.8, 0.88];
  for (let i = 0; i < n; i++) {
    const cx0 = x + 8 + i * cw + 2;
    const t = y + h * tops[i], b = y + h * bots[i];
    vline(cx0 + cw / 2 - 1, t - 4, b - t + 8, [220, 60, 40], 1);
    rect(cx0, t, cw - 4, b - t, i % 2 ? [200, 45, 30] : [226, 70, 48]);
  }
  // trend arrow
  line(x + 8, y + h * 0.2, x + w - 10, y + h * 0.86, [255, 90, 60], 2);
  triangle(x + w - 14, y + h * 0.86, x + w - 6, y + h * 0.8, x + w - 6, y + h * 0.92, [255, 90, 60]);
}

// Picture-story icon tiles: 62 x 96 box, icon centred in upper 62x62.
function iconBg(x: number, y: number, w: number, h: number, c: RGB): void { rect(x, y, w, h, c); }
function iconCop(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [24, 96, 84]);
  circle(x + 31, y + 34, 22, [190, 220, 205]);
  ellipse(x + 31, y + 34, 22, 10, [70, 150, 120]);
  ellipse(x + 31, y + 34, 10, 22, [70, 150, 120]);
  // leaf
  poly([[x + 44, y + 58], [x + 56, y + 46], [x + 58, y + 60], [x + 46, y + 64]], [90, 200, 110]);
  // clock
  circle(x + 18, y + 62, 11, [250, 246, 233]);
  line(x + 18, y + 62, x + 18, y + 55, INK, 2);
  line(x + 18, y + 62, x + 24, y + 64, INK, 2);
}
function iconMexico(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [196, 120, 52]);
  poly([[x, y + 62], [x + 18, y + 30], [x + 34, y + 62]], [120, 70, 40]);
  poly([[x + 26, y + 62], [x + 44, y + 24], [x + 62, y + 62]], [90, 55, 35]);
  circle(x + 50, y + 18, 7, [255, 220, 120]);
  // badge star
  const cx = x + 31, cy = y + 74;
  circle(cx, cy, 12, [250, 220, 90]);
  circle(cx, cy, 7, [160, 30, 20]);
  circle(cx, cy, 3, [250, 220, 90]);
}
function iconPeru(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [120, 92, 66]);
  poly([[x, y + 62], [x + 20, y + 22], [x + 40, y + 62]], [70, 60, 52]);
  poly([[x + 24, y + 62], [x + 46, y + 18], [x + 62, y + 62]], [52, 44, 40]);
  poly([[x + 16, y + 30], [x + 20, y + 22], [x + 25, y + 31], [x + 20, y + 33]], [250, 250, 245]);
  // crack
  line(x + 30, y + 62, x + 34, y + 74, [20, 18, 16], 2);
  line(x + 34, y + 74, x + 28, y + 84, [20, 18, 16], 2);
  line(x + 28, y + 84, x + 32, y + 92, [20, 18, 16], 2);
  // shaking marks
  line(x + 8, y + 76, x + 14, y + 76, [255, 220, 90], 2);
  line(x + 48, y + 80, x + 54, y + 80, [255, 220, 90], 2);
}
function iconDenmark(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [150, 24, 28]);
  rect(x + 6, y + 12, 50, 34, [200, 30, 36]);
  vline(x + 24, y + 12, 34, [250, 250, 245], 5);
  hline(x + 6, y + 26, 50, [250, 250, 245], 5);
  // gavel
  rect(x + 14, y + 56, 34, 5, [60, 44, 30]);
  line(x + 31, y + 56, x + 31, y + 74, [60, 44, 30], 3);
  rect(x + 26, y + 72, 10, 4, [60, 44, 30]);
}
function iconSeoul(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [36, 66, 120]);
  // graduation cap
  poly([[x + 8, y + 34], [x + 31, y + 22], [x + 54, y + 34], [x + 31, y + 46]], [20, 20, 24]);
  poly([[x + 20, y + 40], [x + 42, y + 40], [x + 42, y + 52], [x + 31, y + 58], [x + 20, y + 52]], [30, 30, 36]);
  line(x + 54, y + 34, x + 54, y + 52, [250, 220, 90], 2);
  circle(x + 54, y + 55, 3, [250, 220, 90]);
  // chip
  rect(x + 18, y + 66, 26, 16, [40, 180, 140]);
  rect(x + 24, y + 71, 14, 6, [16, 22, 30]);
  for (let i = 0; i < 3; i++) { vline(x + 22 + i * 9, y + 62, 4, [200, 220, 210], 1); vline(x + 22 + i * 9, y + 82, 4, [200, 220, 210], 1); }
}
function iconGaza(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [206, 178, 128]);
  // dove
  ellipse(x + 30, y + 34, 16, 9, [250, 250, 246]);
  circle(x + 44, y + 28, 6, [250, 250, 246]);
  triangle(x + 48, y + 26, x + 56, y + 28, x + 48, y + 30, [230, 160, 40]);
  poly([[x + 20, y + 30], [x + 30, y + 14], [x + 34, y + 30]], [240, 240, 236]);
  // olive branch
  line(x + 10, y + 78, x + 52, y + 62, [70, 110, 50], 2);
  for (let i = 0; i < 4; i++) ellipse(x + 16 + i * 10, y + 74 - i * 4, 5, 3, [90, 140, 60]);
}
function iconUkEu(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [30, 60, 110]);
  // UK flag (simplified cross)
  rect(x + 6, y + 12, 24, 16, [30, 50, 130]);
  vline(x + 16, y + 12, 16, [250, 250, 245], 4);
  hline(x + 6, y + 18, 24, [250, 250, 245], 4);
  vline(x + 16, y + 12, 16, [190, 30, 40], 2);
  hline(x + 6, y + 19, 24, [190, 30, 40], 2);
  // EU flag (circle of stars)
  rect(x + 32, y + 12, 24, 16, [20, 40, 110]);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    circle(x + 44 + Math.round(6 * Math.cos(a)), y + 20 + Math.round(5 * Math.sin(a)), 1, [250, 220, 60]);
  }
  // handshake arcs
  line(x + 10, y + 62, x + 31, y + 44, [250, 240, 220], 2);
  line(x + 52, y + 62, x + 31, y + 44, [250, 240, 220], 2);
  circle(x + 31, y + 44, 4, [250, 240, 220]);
  line(x + 12, y + 74, x + 50, y + 74, [200, 210, 230], 1);
}
function iconBrussels(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [96, 60, 130]);
  // crowd heads
  const heads: [number, number][] = [[12, 56], [26, 48], [40, 56], [52, 48], [20, 66], [44, 66]];
  for (const [hx, hy] of heads) circle(x + hx, y + hy, 7, [240, 220, 190]);
  // placards
  rect(x + 8, y + 14, 18, 12, [250, 246, 233]);
  rect(x + 36, y + 10, 18, 12, [250, 210, 90]);
  line(x + 17, y + 26, x + 17, y + 46, [200, 200, 190], 2);
  line(x + 45, y + 22, x + 45, y + 44, [200, 200, 190], 2);
  hline(x + 11, y + 19, 12, RED, 2);
  hline(x + 39, y + 15, 12, NAVY, 2);
}
function iconRiyadh(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [20, 44, 74]);
  // shield arc
  for (let a = 200; a <= 340; a += 4) {
    const rad = a * Math.PI / 180;
    px(Math.round(x + 31 + 24 * Math.cos(rad)), Math.round(y + 40 + 20 * Math.sin(rad)), [120, 190, 230]);
    px(Math.round(x + 31 + 22 * Math.cos(rad)), Math.round(y + 40 + 18 * Math.sin(rad)), [120, 190, 230]);
  }
  // missiles streaking down, intercepted
  line(x + 12, y + 12, x + 22, y + 30, [255, 200, 80], 2);
  line(x + 50, y + 10, x + 40, y + 28, [255, 200, 80], 2);
  circle(x + 24, y + 32, 3, [255, 140, 40]);
  circle(x + 38, y + 30, 3, [255, 140, 40]);
  // skyline
  rect(x + 8, y + 66, 10, 18, [16, 26, 40]);
  rect(x + 22, y + 58, 12, 26, [16, 26, 40]);
  rect(x + 38, y + 64, 10, 20, [16, 26, 40]);
  rect(x + 26, y + 50, 3, 8, [16, 26, 40]);
}
function iconMercury(x: number, y: number, w: number, h: number): void {
  iconBg(x, y, w, h, [12, 14, 20]);
  for (let i = 0; i < 14; i++) {
    const sx = x + (i * 37) % 58 + 2, sy = y + (i * 23) % 88 + 4;
    px(sx, sy, [220, 220, 210]);
  }
  circle(x + 31, y + 38, 20, [150, 140, 128]);
  circle(x + 24, y + 32, 4, [110, 102, 92]);
  circle(x + 38, y + 44, 5, [110, 102, 92]);
  circle(x + 30, y + 48, 3, [120, 112, 100]);
  // probe
  rect(x + 44, y + 66, 12, 6, [200, 200, 195]);
  rect(x + 40, y + 68, 4, 2, [60, 120, 200]);
  rect(x + 56, y + 68, 4, 2, [60, 120, 200]);
  line(x + 50, y + 66, x + 44, y + 56, [180, 180, 175], 1);
}
const PIC_ICONS: ((x: number, y: number, w: number, h: number) => void)[] = [
  iconCop, iconMexico, iconPeru, iconDenmark, iconSeoul, iconGaza, iconUkEu, iconBrussels, iconRiyadh, iconMercury,
];
const LEAD_ART: ((x: number, y: number, w: number, h: number) => void)[] = [
  artSummit, artKyiv, artHormuz, artMarkets,
];

// ----------------------------------------------------------------- map -----
// Coarse continent outlines (lon, lat). Stylised, recognisable at panel size.
const CONTINENTS: [number, number][][] = [
  [[-168, 66], [-160, 58], [-152, 60], [-140, 60], [-135, 58], [-128, 50], [-124, 42], [-120, 34], [-114, 29], [-110, 24], [-105, 20], [-97, 16], [-92, 14], [-86, 12], [-83, 9], [-79, 9], [-77, 7], [-75, 10], [-72, 12], [-68, 17], [-65, 18], [-61, 15], [-60, 10], [-59, 7], [-62, 5], [-65, 10], [-70, 12], [-73, 19], [-75, 25], [-80, 26], [-81, 31], [-76, 35], [-74, 39], [-70, 42], [-68, 45], [-65, 44], [-60, 46], [-55, 47], [-60, 50], [-65, 52], [-55, 52], [-60, 55], [-65, 58], [-68, 58], [-75, 62], [-80, 66], [-85, 66], [-90, 68], [-95, 69], [-110, 68], [-125, 70], [-140, 70], [-155, 71], [-165, 68], [-168, 66]],
  [[-79, 9], [-77, 7], [-75, 4], [-77, 1], [-80, -3], [-81, -6], [-77, -12], [-72, -18], [-70, -23], [-70, -30], [-72, -37], [-73, -44], [-74, -50], [-70, -54], [-66, -55], [-68, -50], [-65, -45], [-62, -41], [-58, -35], [-52, -32], [-48, -28], [-41, -23], [-38, -15], [-35, -8], [-38, -5], [-43, -3], [-50, 0], [-53, 4], [-58, 6], [-62, 9], [-68, 11], [-72, 12], [-75, 10], [-79, 9]],
  [[-10, 36], [-9, 38], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [-2, 49], [0, 50], [2, 51], [5, 53], [8, 55], [8, 57], [10, 59], [12, 58], [18, 56], [21, 55], [21, 58], [24, 59], [23, 60], [25, 60], [28, 61], [30, 62], [30, 66], [28, 68], [32, 69], [35, 68], [40, 67], [44, 66], [40, 64], [38, 60], [36, 58], [34, 55], [32, 52], [30, 48], [28, 46], [28, 44], [24, 42], [23, 40], [22, 38], [20, 40], [19, 42], [16, 44], [14, 45], [12, 44], [10, 44], [8, 44], [6, 43], [3, 43], [3, 42], [0, 39], [-1, 37], [-5, 36], [-9, 37], [-10, 36]],
  [[-6, 35], [-10, 31], [-13, 28], [-16, 24], [-17, 21], [-17, 15], [-16, 12], [-13, 9], [-8, 5], [-4, 5], [0, 6], [6, 4], [9, 4], [9, 0], [12, -2], [13, -6], [12, -10], [13, -14], [12, -18], [14, -22], [16, -28], [18, -32], [20, -35], [25, -34], [28, -33], [32, -28], [33, -26], [35, -24], [36, -20], [39, -16], [40, -12], [40, -8], [42, -4], [44, 0], [47, 2], [51, 5], [51, 10], [48, 11], [44, 11], [42, 13], [40, 15], [38, 18], [37, 20], [35, 22], [34, 26], [32, 31], [30, 32], [25, 32], [20, 32], [15, 33], [11, 34], [10, 37], [5, 37], [0, 36], [-6, 35]],
  [[30, 36], [36, 36], [42, 41], [48, 38], [52, 30], [56, 26], [58, 25], [61, 25], [66, 25], [70, 20], [75, 15], [77, 8], [80, 7], [80, 13], [84, 19], [88, 22], [91, 22], [93, 17], [96, 16], [98, 10], [100, 7], [103, 2], [105, 9], [108, 12], [109, 18], [111, 21], [114, 22], [118, 25], [120, 28], [122, 32], [124, 39], [127, 39], [130, 35], [131, 34], [133, 38], [136, 42], [139, 45], [141, 50], [142, 54], [141, 59], [143, 59], [147, 59], [150, 60], [156, 59], [158, 52], [160, 55], [162, 58], [165, 60], [170, 60], [173, 64], [178, 65], [176, 62], [170, 60], [162, 60], [158, 56], [152, 59], [146, 59], [142, 56], [140, 52], [138, 46], [135, 43], [131, 37], [128, 38], [126, 41], [124, 40], [122, 38], [120, 34], [116, 30], [112, 24], [108, 20], [105, 10], [102, 6], [99, 9], [96, 15], [93, 18], [90, 22], [87, 21], [84, 18], [81, 14], [79, 8], [77, 8], [74, 16], [71, 21], [68, 24], [65, 25], [61, 25], [57, 26], [54, 27], [51, 29], [48, 30], [46, 32], [43, 35], [40, 37], [36, 36], [32, 36], [30, 36]],
  [[95, 5], [98, 3], [100, 0], [102, -2], [104, -4], [106, -6], [108, -7], [110, -7], [112, -7], [114, -8], [116, -9], [118, -9], [120, -10], [119, -5], [118, -2], [117, 1], [115, 2], [112, 3], [110, 1], [108, 0], [106, -1], [104, 1], [102, 2], [100, 4], [97, 5], [95, 5]],
  [[131, -1], [134, -3], [137, -3], [140, -5], [142, -8], [145, -7], [147, -6], [150, -8], [147, -9], [144, -8], [141, -7], [138, -8], [135, -5], [132, -2], [131, -1]],
  [[130, 31], [131, 33], [133, 34], [135, 34], [137, 35], [139, 37], [140, 39], [141, 41], [142, 44], [141, 45], [140, 42], [139, 38], [137, 36], [135, 34], [133, 33], [131, 31], [130, 31]],
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-3, 50], [-5, 50]],
  [[113, -22], [114, -28], [115, -33], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [142, -38], [145, -38], [147, -39], [150, -37], [153, -32], [153, -27], [151, -24], [149, -20], [146, -19], [143, -15], [142, -11], [141, -13], [139, -15], [137, -12], [136, -15], [135, -15], [133, -12], [132, -12], [130, -13], [128, -14], [126, -14], [124, -17], [122, -17], [120, -20], [117, -20], [114, -21], [113, -22]],
  [[167, -45], [170, -43], [173, -41], [175, -38], [177, -38], [178, -37], [175, -40], [173, -41], [170, -44], [167, -46], [167, -45]],
  [[44, -16], [47, -15], [50, -16], [49, -20], [47, -24], [45, -25], [44, -21], [43, -18], [44, -16]],
];

// -------------------------------------------------------------- layout -----
const M = 24;                 // page margin
const CW = W - 2 * M;         // content width = 976
let overflowLines = 0;
let pinMinDist = 999;
let pinCollisions = 0;

function para(x: number, y: number, s: string, face: string, size: number, c: RGB, maxW: number, maxLines: number, leading: number): number {
  const lines = wrapText(s, face, size, maxW);
  if (lines.length > maxLines) overflowLines += lines.length - maxLines;
  const use = lines.slice(0, maxLines);
  let yy = y;
  for (const ln of use) { drawText(x, yy, ln, face, size, c); yy += leading; }
  return yy;
}

function numBadge(x: number, y: number, n: number, size: number): void {
  // red disc with white number, `size` = diameter
  const r = size / 2;
  circle(x + r, y + r, r, RED);
  ring(x + r, y + r, r, [250, 246, 233], 1);
  const s = String(n);
  const avail = [8, 9, 10, 11, 12, 13, 14, 16, 18, 19, 20, 24, 28, 34, 44];
  const want = n < 10 ? Math.round(size * 0.62) : Math.round(size * 0.52);
  const fs = avail.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
  drawTextC(x + r, y + r - Math.round(fs * 0.36), s, 'serif-bold', fs, CREAM);
}

function drawMasthead(): void {
  hline(M, 12, CW, RED, 3);
  drawText(M, 20, 'THE WORLD IN ONE PAGE', 'serif-bold', 12, RED, 2);
  drawText(W - M - textWidth('MAKE.FUN DAILY FRONT PAGE', 'serif-bold', 12, 2), 20, 'MAKE.FUN DAILY FRONT PAGE', 'serif-bold', 12, MUTED, 2);
  drawText(M, 36, 'SATURDAY, 21 NOVEMBER 2026', 'serif-bold', 44, INK);
  drawText(M, 88, '38 stories from six regions \u2014 the Shenzhen summit, the Kyiv strikes, the Hormuz tanker attacks and a Wall Street rout.', 'serif', 13, MUTED);
  hline(M, 108, CW, INK, 2);
  hline(M, 111, CW, INK, 1);
}

function drawNumbersStrip(): void {
  const stats: [string, string][] = [
    ['38', 'STORIES'],
    ['\u22123.7%', 'S&P 500'],
    ['\u22125.3%', 'NASDAQ'],
    ['M6.7', 'PERU QUAKE'],
    ['$2.36B', 'GTA VI DAY ONE'],
    ['11', 'KILLED \u00b7 MEXICO RAID'],
  ];
  const bw = (CW - 5 * 6) / 6, y = 118, h = 34;
  for (let i = 0; i < 6; i++) {
    const x = M + i * (bw + 6);
    rect(x, y, bw, h, [255, 252, 244]);
    rect(x, y, bw, h, RULE); // border via overdraw trick below
    rect(x + 1, y + 1, bw - 2, h - 2, [255, 252, 244]);
    hline(x, y, bw, INK, 1); hline(x, y + h - 1, bw, INK, 1);
    vline(x, y, h, INK, 1); vline(x + bw - 1, y, h, INK, 1);
    drawText(x + 8, y + 4, stats[i][0], 'serif-bold', 16, RED);
    const lw = textWidth(stats[i][1], 'serif-bold', 9);
    drawText(x + bw - 8 - lw, y + 11, stats[i][1], 'serif-bold', 9, INK);
  }
}

function drawLeads(): void {
  const y0 = 160, h0 = 238;
  // Lead 1 — big, left
  const l1 = STORIES[0];
  const x1 = M, w1 = 488;
  rect(x1, y0, w1, h0, [255, 252, 244]);
  rect(x1, y0, w1, h0, RULE);
  rect(x1 + 1, y0 + 1, w1 - 2, h0 - 2, [255, 252, 244]);
  LEAD_ART[0](x1 + 8, y0 + 8, w1 - 16, 128);
  numBadge(x1 + 14, y0 + 14, 1, 22);
  drawText(x1 + 10, y0 + 144, '1 \u00b7 SHENZHEN, CHINA', 'serif-bold', 10, RED, 1);
  drawText(x1 + w1 - 10 - textWidth('REUTERS', 'serif-bold', 9), y0 + 144, 'REUTERS', 'serif-bold', 9, MUTED);
  para(x1 + 10, y0 + 160, l1.head, 'serif-bold', 19, INK, w1 - 20, 2, 22);
  para(x1 + 10, y0 + 206, l1.dek, 'serif', 12, MUTED, w1 - 20, 2, 15);
  // Leads 2-4 — stacked right
  const rx = M + w1 + 8, rw = CW - w1 - 8;
  const rh = 76, gap = 5;
  for (let k = 1; k <= 3; k++) {
    const st = STORIES[k];
    const yy = y0 + (k - 1) * (rh + gap);
    rect(rx, yy, rw, rh, [255, 252, 244]);
    rect(rx, yy, rw, rh, RULE);
    rect(rx + 1, yy + 1, rw - 2, rh - 2, [255, 252, 244]);
    LEAD_ART[k](rx + 6, yy + 6, 116, rh - 12);
    numBadge(rx + 10, yy + 10, st.n, 18);
    const tx = rx + 130;
    const tag = st.n === 2 ? '2 \u00b7 KYIV, UKRAINE' : st.n === 3 ? '3 \u00b7 BAHRAIN & THE GULF' : '4 \u00b7 NEW YORK';
    const srcName = st.src === 'REU' ? 'REUTERS' : st.src === 'VT' ? 'VIRGINIA TIMES' : st.src === 'AN' ? 'ARAB NEWS' : 'ONE TURN';
    drawText(tx, yy + 6, tag, 'serif-bold', 10, RED, 1);
    drawText(rx + rw - 8 - textWidth(srcName, 'serif-bold', 8), yy + 7, srcName, 'serif-bold', 8, MUTED);
    para(tx, yy + 20, st.head, 'serif-bold', 14, INK, rw - 138, 2, 16);
    para(tx, yy + 52, st.dek, 'serif', 10, MUTED, rw - 138, 2, 12);
  }
}

function drawPictureStories(): void {
  drawText(M, 406, 'PICTURE STORIES', 'serif-bold', 11, RED, 2);
  hline(M + 128, 411, CW - 128, RULE, 1);
  const cw = 191, ch = 96, gapX = 5, gapY = 6;
  const y0 = 420;
  for (let i = 0; i < 10; i++) {
    const st = STORIES[4 + i];
    const col = i % 5, row = Math.floor(i / 5);
    const x = M + col * (cw + gapX), y = y0 + row * (ch + gapY);
    rect(x, y, cw, ch, [255, 252, 244]);
    rect(x, y, cw, ch, RULE);
    rect(x + 1, y + 1, cw - 2, ch - 2, [255, 252, 244]);
    PIC_ICONS[i](x + 3, y + 5, 62, ch - 10);
    numBadge(x + 6, y + 8, st.n, 16);
    const tx = x + 68, tw = cw - 74;
    para(tx, y + 5, st.head, 'serif-bold', 11, INK, tw, 3, 13);
    para(tx, y + 46, st.dek, 'serif', 10, MUTED, tw, 3, 12);
    drawText(tx, y + ch - 12, st.src, 'serif-bold', 8, RED);
  }
}

function drawBriefs(): void {
  drawText(M, 628, 'IN BRIEF', 'serif-bold', 11, RED, 2);
  hline(M + 64, 633, CW - 64, RULE, 1);
  const colW = 320, gapX = 8, y0 = 642, rowH = 18.5;
  for (let i = 0; i < 24; i++) {
    const st = STORIES[14 + i];
    const col = Math.floor(i / 8), row = i % 8;
    const x = M + col * (colW + gapX), y = Math.round(y0 + row * rowH);
    const numS = st.n + '.';
    drawText(x, y, numS, 'serif-bold', 11, RED);
    let head = st.head;
    const avail = colW - textWidth(numS + ' ', 'serif-bold', 11) - textWidth(' \u2014 ' + st.src, 'serif', 9);
    let fs = 11;
    if (textWidth(head, 'serif', fs) > avail) fs = 10;
    if (textWidth(head, 'serif', fs) > avail) {
      overflowLines += 1;
      while (head.length > 4 && textWidth(head + '\u2026', 'serif', fs) > avail) head = head.slice(0, -1);
      head += '\u2026';
    }
    const hx = x + textWidth(numS + ' ', 'serif-bold', 11);
    drawText(hx, y, head, 'serif', fs, INK);
    const srcW = textWidth(' \u2014 ' + st.src, 'serif', 9);
    drawText(x + colW - srcW, y + 1, '\u2014 ' + st.src, 'serif', 9, MUTED);
  }
}

// ------------------------------------------------------------ map panel ----
function drawMap(mx: number, my: number, mw: number, mh: number): void {
  rect(mx, my, mw, mh, OCEAN);
  const projX = (lon: number) => mx + ((lon + 180) / 360) * mw;
  const projY = (lat: number) => my + ((78 - lat) / 134) * mh;
  for (const cont of CONTINENTS) {
    const pts: [number, number][] = cont.map(([lo, la]) => [projX(lo), projY(la)]);
    poly(pts, LAND);
    // outline
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      line(x0, y0, x1, y1, LANDB, 1);
    }
  }
  // graticule
  for (let lo = -150; lo <= 150; lo += 30) vline(projX(lo), my, mh, [255, 255, 255], 1);
  // pins with deterministic repulsion declutter
  type P = { n: number; ax: number; ay: number; dx: number; dy: number };
  const pins: P[] = STORIES.map((s) => {
    const ax = projX(s.lon), ay = projY(s.lat);
    return { n: s.n, ax, ay, dx: ax, dy: ay };
  });
  const MIN = 17;
  for (let it = 0; it < 600; it++) {
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i], b = pins[j];
        let ddx = b.dx - a.dx, ddy = b.dy - a.dy;
        let d = Math.hypot(ddx, ddy);
        if (d < MIN) {
          if (d < 0.01) { ddx = (j % 2 ? 1 : -1) * 0.7; ddy = ((j % 3) - 1) * 0.7; d = 1; }
          const push = (MIN - d) / 2;
          const ux = ddx / d, uy = ddy / d;
          a.dx -= ux * push; a.dy -= uy * push;
          b.dx += ux * push; b.dy += uy * push;
        }
      }
    }
    for (const p of pins) {
      p.dx += (p.ax - p.dx) * 0.06;
      p.dy += (p.ay - p.dy) * 0.06;
      p.dx = Math.max(mx + 8, Math.min(mx + mw - 8, p.dx));
      p.dy = Math.max(my + 8, Math.min(my + mh - 8, p.dy));
    }
  }
  // measure
  pinMinDist = 999; pinCollisions = 0;
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const d = Math.hypot(pins[i].dx - pins[j].dx, pins[i].dy - pins[j].dy);
      if (d < pinMinDist) pinMinDist = d;
      if (d < 13) pinCollisions++;
    }
  }
  // leader lines then pins
  for (const p of pins) {
    const d = Math.hypot(p.dx - p.ax, p.dy - p.ay);
    if (d > 5) {
      line(p.ax, p.ay, p.dx, p.dy, [90, 82, 68], 1);
      circle(p.ax, p.ay, 2, DARKRED);
    }
  }
  for (const p of pins) numBadge(p.dx - 6.5, p.dy - 6.5, p.n, 13);
}

function drawSidePanel(sx: number, sy: number, sw: number, sh: number): void {
  // Region bar
  const regions: [string, number, RGB][] = [
    ['Europe', 12, [30, 60, 110]],
    ['North America', 11, [166, 30, 20]],
    ['Asia', 8, [196, 120, 52]],
    ['Middle East', 5, [24, 96, 84]],
    ['South America', 1, [90, 140, 60]],
    ['Oceania', 1, [96, 60, 130]],
  ];
  drawText(sx, sy, 'BY REGION \u2014 38 STORIES', 'serif-bold', 10, RED, 1);
  const barY = sy + 14, barH = 10;
  let bx = sx;
  const total = 38;
  for (const [, c, col] of regions) {
    const w = Math.max(3, Math.round((c / total) * sw));
    rect(bx, barY, w, barH, col);
    bx += w;
  }
  let ly = barY + 14;
  for (let i = 0; i < regions.length; i += 3) {
    for (let k = 0; k < 3 && i + k < regions.length; k++) {
      const [name, c, col] = regions[i + k];
      const lx = sx + k * (sw / 3);
      rect(lx, ly + 2, 8, 8, col);
      drawText(lx + 12, ly, name + ' ' + c, 'serif', 10, INK);
    }
    ly += 13;
  }
  // UTC timeline
  const ty = ly + 2;
  drawText(sx, ty, 'THE DAY IN UTC', 'serif-bold', 10, RED, 1);
  const blocks: [string, string][] = [
    ['00\u201306', 'Asia: Shenzhen summit'],
    ['06\u201312', 'Europe & Gulf: Kyiv, Hormuz'],
    ['12\u201318', 'Americas: Mexico raid'],
    ['18\u201324', 'Markets: S&P \u22123.7%'],
  ];
  const bw2 = (sw - 3 * 4) / 4;
  for (let i = 0; i < 4; i++) {
    const x = sx + i * (bw2 + 4);
    const by = ty + 14;
    rect(x, by, bw2, 26, [255, 252, 244]);
    rect(x, by, bw2, 26, RULE);
    rect(x + 1, by + 1, bw2 - 2, 24, [255, 252, 244]);
    drawText(x + 4, by + 2, blocks[i][0], 'serif-bold', 9, RED);
    const lines = wrapText(blocks[i][1], 'serif', 8, bw2 - 8);
    let yy = by + 11;
    for (const ln of lines.slice(0, 2)) { drawText(x + 4, yy, ln, 'serif', 8, INK); yy += 8; }
  }
  // Sources
  const sy2 = ty + 14 + 26 + 4;
  drawText(sx, sy2, 'SOURCES', 'serif-bold', 9, RED, 1);
  para(sx, sy2 + 11, 'Reuters \u00b7 Al Jazeera \u00b7 Arab News \u00b7 Straits Times \u00b7 Daily Digest \u00b7 One Turn \u00b7 Seven Lights \u00b7 Deccan Chronicle \u00b7 Virginia Times \u00b7 Astrova News.', 'serif', 9, MUTED, sw, 2, 10);
}

function drawFooter(): void {
  const y0 = 940;
  rect(M, y0, CW, 66, [255, 252, 244]);
  hline(M, y0, CW, RED, 2);
  drawText(M + 10, y0 + 6, 'DATE CHECK \u2014 SATURDAY 21 NOVEMBER 2026', 'serif-bold', 12, RED);
  para(M + 10, y0 + 24, 'LEFT OUT \u2014 not 21 Nov news: the World Court ruling that Myanmar committed genocide against the Rohingya (20 Nov), and Friday\u2019s market moves.', 'serif', 11, INK, CW - 20, 1, 13);
  para(M + 10, y0 + 39, 'NOT YET \u2014 at midnight: COP31\u2019s final text (talks still in overtime) \u00b7 a joint statement from the Shenzhen summit \u00b7 the full toll of the Hormuz tanker strikes.', 'serif', 11, INK, CW - 20, 1, 13);
  drawText(M + 10, y0 + 54, 'Every story above happened, or was first reported, on 21 November 2026.', 'serif', 10, MUTED);
}

// ------------------------------------------------------------------ main ---
function main(): void {
  loadFonts();
  fillAll(PAPER);
  // paper edge
  rect(0, 0, W, 6, RED);
  drawMasthead();
  drawNumbersStrip();
  drawLeads();
  drawPictureStories();
  drawBriefs();
  // map + side panel
  drawText(M, 794, 'WHERE IT HAPPENED \u2014 EVERY STORY NUMBERED ON THE MAP', 'serif-bold', 11, RED, 1);
  hline(M + 392, 799, CW - 392, RULE, 1);
  drawMap(M, 808, 620, 126);
  // map border
  hline(M, 808, 620, INK, 1); hline(M, 808 + 125, 620, INK, 1);
  vline(M, 808, 126, INK, 1); vline(M + 619, 808, 126, INK, 1);
  drawSidePanel(M + 620 + 8, 808, CW - 620 - 8, 126);
  drawFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  const png = encodePNG();
  writeFileSync(join(outDir, 'entry.png'), png);
  const sha = createHash('sha256').update(png).digest('hex');
  const layers = [0, 0, 0];
  const regions: Record<string, number> = {};
  for (const s of STORIES) { layers[s.layer]++; regions[s.region] = (regions[s.region] ?? 0) + 1; }
  const stats = {
    stories: STORIES.length,
    layers: { leads: layers[0], picture: layers[1], briefs: layers[2] },
    regions,
    overflowLines,
    pinMinDist: Math.round(pinMinDist * 10) / 10,
    pinCollisions,
    bytes: png.length,
    sha256: sha,
    node: NODE,
  };
  console.log(JSON.stringify(stats, null, 2));
}

main();
