// THE DAY IN FULL — Saturday, 21 November 2026.
// A from-scratch broadsheet front page drawn in code: 40 real stories
// from 21 November 2026 in three layers (4 illustrated leads, 10 picture
// stories, 26 briefs), a world map with numbered pins fanned out on
// leader lines, a numbers strip, a region bar, a UTC timeline and a
// DATE CHECK footer. Node 22 standard library only; text is set in
// Liberation Serif from glyphs baked by genfont.py into fonts.bin.
// Usage: node main.ts   (writes out/entry.png; also honours
// MAKEFUN_OUTPUT_DIR). Output is deterministic: two runs write
// byte-identical entry.png files.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1024;
const H = 1024;
const NODE_DIR = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- PNG ----
const CRC_T = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_T[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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
function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
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
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- canvas ----
type RGB = [number, number, number];
const PAPER: RGB = [248, 242, 228];
const INK: RGB = [24, 24, 24];
const RED: RGB = [178, 28, 34];
const DARKRED: RGB = [122, 16, 22];
const GREY: RGB = [112, 106, 94];
const SOFT: RGB = [62, 58, 50];
const CARD: RGB = [255, 253, 247];
const SEA: RGB = [196, 219, 231];
const SEADARK: RGB = [168, 201, 218];
const LAND: RGB = [233, 221, 192];
const LANDLINE: RGB = [186, 170, 134];
const WHITE: RGB = [255, 255, 255];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

class Sheet {
  buf = new Uint8Array(W * H * 3);
  constructor() {
    this.rect(0, 0, W, H, PAPER);
  }
  put(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  blend(x: number, y: number, c: RGB, a: number): void {
    if (a <= 0) return;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (a >= 1) return this.put(x, y, c);
    const i = (y * W + x) * 3;
    this.buf[i] = Math.round(this.buf[i] * (1 - a) + c[0] * a);
    this.buf[i + 1] = Math.round(this.buf[i + 1] * (1 - a) + c[1] * a);
    this.buf[i + 2] = Math.round(this.buf[i + 2] * (1 - a) + c[2] * a);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
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
  vgrad(x: number, y: number, w: number, h: number, top: RGB, bot: RGB): void {
    for (let yy = 0; yy < h; yy++) {
      this.rect(x, y + yy, w, 1, mix(top, bot, h <= 1 ? 0 : yy / (h - 1)));
    }
  }
  hline(x0: number, x1: number, y: number, c: RGB): void {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) this.put(x, Math.round(y), c);
  }
  vline(x: number, y0: number, y1: number, c: RGB): void {
    if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) this.put(Math.round(x), y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return this.put(Math.round(x0), Math.round(y0), c);
    for (let s = 0; s <= steps; s++) {
      this.put(Math.round(x0 + (dx * s) / steps), Math.round(y0 + (dy * s) / steps), c);
    }
  }
  thickLine(x0: number, y0: number, x1: number, y1: number, c: RGB, t: number): void {
    const r = Math.floor(t / 2);
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++) this.line(x0 + a, y0 + b, x1 + a, y1 + b, c);
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.put(x, y, c);
      }
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB): void {
    for (let a = 0; a < 360; a += 2) {
      const t = (a * Math.PI) / 180;
      this.put(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), c);
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y, c);
      }
    }
  }
  // Scanline-filled polygon; pts are [x, y] pairs.
  poly(pts: Array<[number, number]>, c: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        this.hline(xs[k], xs[k + 1], y, c);
      }
    }
  }
  polyLine(pts: Array<[number, number]>, c: RGB): void {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      this.line(a[0], a[1], b[0], b[1], c);
    }
  }
  frame(x: number, y: number, w: number, h: number, c: RGB): void {
    this.hline(x, x + w - 1, y, c);
    this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c);
    this.vline(x + w - 1, y, y + h - 1, c);
  }
}

// -------------------------------------------------------------- fonts ----
type Glyph = { ox: number; oy: number; w: number; h: number; adv: number; px: Uint8Array };
const GLYPHS = new Map<string, Glyph>();
function loadFonts(): void {
  const raw = readFileSync(join(NODE_DIR, 'fonts.bin'));
  if (raw.subarray(0, 4).toString('ascii') !== 'VL51') throw new Error('bad fonts.bin');
  const count = raw.readUInt32LE(4);
  let o = 8;
  for (let g = 0; g < count; g++) {
    const cp = raw.readUInt16LE(o);
    const weight = raw[o + 2];
    const size = raw[o + 3];
    const ox = raw.readInt8(o + 4);
    const oy = raw.readInt8(o + 5);
    const w = raw[o + 6];
    const h = raw[o + 7];
    const adv = raw.readUInt16LE(o + 8) / 64;
    o += 10;
    const nbytes = Math.ceil(w / 2) * h;
    const px = new Uint8Array(nbytes);
    raw.copy(px, 0, o, o + nbytes);
    o += nbytes;
    GLYPHS.set(`${weight}:${size}:${cp}`, { ox, oy, w, h, adv, px });
  }
}
function glyphFor(weight: string, size: number, ch: string): Glyph | undefined {
  const w = weight === 'B' ? 1 : 0;
  return GLYPHS.get(`${w}:${size}:${ch.codePointAt(0)}`);
}
let overflowCount = 0;
const text = {
  width(weight: string, size: number, s: string): number {
    let t = 0;
    for (const ch of s) {
      const g = glyphFor(weight, size, ch);
      t += g ? g.adv : size * 0.5;
    }
    return t;
  },
  draw(sh: Sheet, s: string, x: number, baselineY: number, size: number, weight: string, c: RGB): number {
    let cx = x;
    for (const ch of s) {
      const g = glyphFor(weight, size, ch);
      if (!g) {
        cx += size * 0.5;
        continue;
      }
      if (g.w > 0 && g.h > 0) {
        for (let yy = 0; yy < g.h; yy++) {
          for (let xx = 0; xx < g.w; xx++) {
            const byte = g.px[yy * Math.ceil(g.w / 2) + Math.floor(xx / 2)];
            const v = xx % 2 === 0 ? byte >> 4 : byte & 0x0f;
            if (v > 0) sh.blend(Math.round(cx) + g.ox + xx, Math.round(baselineY) + g.oy + yy, c, v / 15);
          }
        }
      }
      cx += g.adv;
    }
    return cx;
  },
  drawRight(sh: Sheet, s: string, rightX: number, baselineY: number, size: number, weight: string, c: RGB): void {
    this.draw(sh, s, rightX - this.width(weight, size, s), baselineY, size, weight, c);
  },
  drawCentred(sh: Sheet, s: string, cx: number, baselineY: number, size: number, weight: string, c: RGB): void {
    this.draw(sh, s, cx - this.width(weight, size, s) / 2, baselineY, size, weight, c);
  },
};
// Greedy word wrap; counts lines that had to be dropped as overflow.
function wrapText(s: string, size: number, weight: string, maxW: number, maxLines: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    const trial = cur === '' ? wd : cur + ' ' + wd;
    if (text.width(weight, size, trial) <= maxW || cur === '') {
      cur = trial;
    } else {
      lines.push(cur);
      cur = wd;
    }
  }
  if (cur !== '') lines.push(cur);
  if (lines.length > maxLines) {
    overflowCount += lines.length - maxLines;
    return lines.slice(0, maxLines);
  }
  return lines;
}
function fitSize(s: string, weight: string, maxW: number, sizes: number[]): number {
  for (const sz of sizes) if (text.width(weight, sz, s) <= maxW) return sz;
  return sizes[sizes.length - 1];
}

// -------------------------------------------------------------- data ----
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
  EU: [31, 78, 121],
  NA: [178, 28, 34],
  LA: [46, 125, 50],
  ME: [194, 94, 0],
  AF: [106, 63, 160],
  AP: [15, 118, 110],
  OC: [85, 85, 85],
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
  art: string;
  chips?: string[];
  dx: number;
  dy: number;
};
// All 40 stories were reported on Saturday 21 November 2026.
// Sources named per story; full source list in the footer.
const STORIES: Story[] = [
  { n: 1, region: 'ME', kicker: 'MIDDLE EAST — THE LEAD', head: 'Iran strikes US bases in Bahrain', deck: 'Guards say they hit two US positions; Bahrain reports fire at an industrial site.', src: 'AL JAZEERA', lat: 26.0, lon: 50.6, art: 'bahrain', chips: ['2 US BASES HIT', 'NO INJURIES'], dx: 26, dy: 6 },
  { n: 2, region: 'LA', kicker: 'JUSTICE — THE LEAD', head: "Mexico captures 'Chapo Isidro'", deck: "FBI most-wanted boss seized in a Sinaloa raid; 11 dead as gunfights follow.", src: 'BBC', lat: 25.4, lon: -108.5, art: 'sinaloa', chips: ['11 DEAD', 'FBI TOP 10'], dx: -30, dy: -4 },
  { n: 3, region: 'EU', kicker: 'WAR IN EUROPE — THE LEAD', head: 'Russian missile hits Kryvyi Rih', deck: "A boy, 7, and a paramedic are killed and about 60 hurt in Zelensky's home city.", src: 'AL JAZEERA', lat: 47.9, lon: 33.4, art: 'kryvyi', chips: ['2 KILLED, 60 HURT', 'BOY, 7, AMONG DEAD'], dx: 19, dy: 28 },
  { n: 4, region: 'NA', kicker: 'ECONOMY — THE LEAD', head: "AI sell-off erases Nasdaq's 2026 gains", deck: 'S&P 500 slips into correction and chip shares lead the rout after a bruising week.', src: 'THE GUARDIAN', lat: 40.7, lon: -74.0, art: 'nasdaq', chips: ['NASDAQ GAINS GONE', 'S&P IN CORRECTION'], dx: -30, dy: 2 },
  { n: 5, region: 'EU', kicker: 'CLIMATE', head: 'COP31 talks run past deadline', deck: 'Fossil-fuel row blocks deal in Antalya', src: 'BBC', lat: 36.9, lon: 30.7, art: 'cop', dx: 46, dy: 16 },
  { n: 6, region: 'AP', kicker: 'POLITICS', head: 'Trump, Xi and Putin meet in Shenzhen', deck: 'Three-way summit at APEC; nuclear-risk talks agreed', src: 'BBC', lat: 22.5, lon: 114.1, art: 'summit', dx: 14, dy: 10 },
  { n: 7, region: 'NA', kicker: 'SCIENCE', head: 'AI-assisted Riemann proof claimed', deck: 'Mathematician says Claude helped solve 1859 puzzle', src: 'THE GUARDIAN', lat: 37.8, lon: -122.4, art: 'riemann', dx: -34, dy: -8 },
  { n: 8, region: 'EU', kicker: 'JUSTICE', head: 'UN court: Myanmar guilty of genocide', deck: 'States react to landmark Rohingya verdict', src: 'PBS', lat: 52.1, lon: 4.3, art: 'scales', dx: -48, dy: -20 },
  { n: 9, region: 'EU', kicker: 'CONFLICT', head: 'Drone strike sets Russian ship ablaze', deck: 'Sparta II burns in the Gulf of Finland', src: 'BBC', lat: 60.2, lon: 27.0, art: 'ship', dx: -1, dy: -12 },
  { n: 10, region: 'AP', kicker: 'SPACE', head: 'BepiColombo reaches Mercury orbit', deck: 'Eight years, 10bn km flown to the innermost planet', src: 'UPI', lat: 30.4, lon: 131.0, art: 'mercury', dx: 14, dy: 0 },
  { n: 11, region: 'NA', kicker: 'CULTURE', head: 'GTA VI earns $3.8bn on day one', deck: 'Biggest entertainment launch ever', src: 'BBC', lat: 40.7, lon: -74.0, art: 'gta', dx: 26, dy: -18 },
  { n: 12, region: 'EU', kicker: 'SPORT', head: 'Alcaraz reaches ATP Finals decider', deck: 'Beats Shelton 3-6, 6-3, 7-6; faces Zverev', src: 'THE GUARDIAN', lat: 45.1, lon: 7.7, art: 'tennis', dx: -2, dy: 25 },
  { n: 13, region: 'LA', kicker: 'HEALTH', head: 'Dengue cut 69% by altered mosquitoes', deck: 'Wolbachia trial shields children in Brazil', src: 'STRAITS TIMES', lat: -15.8, lon: -47.9, art: 'mosquito', dx: -30, dy: -8 },
  { n: 14, region: 'NA', kicker: 'TECH', head: 'FBI crime database reportedly hacked', deck: 'Breach of police records probed; 2nd in two months', src: 'BBC', lat: 38.9, lon: -77.0, art: 'fbi', dx: -38, dy: 14 },
  { n: 15, region: 'EU', kicker: 'POLITICS', head: 'Estonia to close Russia border', deck: 'Three crossings shut from Dec. 1 (Straits Times)', src: 'STRAITS TIMES', lat: 59.4, lon: 24.7, art: '', dx: -19, dy: -13 },
  { n: 16, region: 'EU', kicker: 'JUSTICE', head: 'Denmark expels Russian diplomat', deck: 'Alleged plot to kill Kyivstoner (BBC)', src: 'BBC', lat: 55.7, lon: 12.6, art: '', dx: -19, dy: -17 },
  { n: 17, region: 'EU', kicker: 'SOCIETY', head: 'Cost-of-living protests sweep Europe', deck: 'France, Portugal, Berlin march (Al Jazeera)', src: 'AL JAZEERA', lat: 48.9, lon: 2.3, art: '', dx: -36, dy: 29 },
  { n: 18, region: 'EU', kicker: 'JUSTICE', head: 'French police sentenced over Zecler beating', deck: 'Five years each; racism a factor (BBC)', src: 'BBC', lat: 48.9, lon: 2.3, art: '', dx: -14, dy: 29 },
  { n: 19, region: 'EU', kicker: 'POLITICS', head: 'UK and EU sign three post-Brexit deals', deck: 'Food, emissions, youth travel (Guardian)', src: 'THE GUARDIAN', lat: 50.8, lon: 4.4, art: '', dx: -26, dy: -22 },
  { n: 20, region: 'EU', kicker: 'ECONOMY', head: 'EU and Indonesia sign trade deal', deck: '98.5% of tariffs on EU goods go (DW)', src: 'DW', lat: 50.8, lon: 4.4, art: '', dx: 26, dy: 31 },
  { n: 21, region: 'NA', kicker: 'TECH', head: "Trump threatens tax on data-centre firms", deck: 'AI centres abroad face levy (BBC)', src: 'BBC', lat: 38.9, lon: -77.0, art: '', dx: -40, dy: -14 },
  { n: 22, region: 'NA', kicker: 'HEALTH', head: 'US child dies of measles in Virginia', deck: 'First measles death of 2026 (Guardian)', src: 'THE GUARDIAN', lat: 37.5, lon: -79.0, art: '', dx: 16, dy: 10 },
  { n: 23, region: 'NA', kicker: 'JUSTICE', head: 'Palisades fire arson conviction', deck: '12 killed, 6,800 buildings lost (BBC)', src: 'BBC', lat: 34.1, lon: -118.5, art: '', dx: -28, dy: 14 },
  { n: 24, region: 'NA', kicker: 'POLITICS', head: 'Mamdani plans to close Rikers by 2032', deck: 'NY mayor sets date for jail closure (BBC)', src: 'BBC', lat: 40.7, lon: -74.0, art: '', dx: 28, dy: 4 },
  { n: 25, region: 'NA', kicker: 'SPORT', head: 'Harden scores 51 and passes Kobe', deck: '26th 50-point game in Cavs win (Guardian)', src: 'THE GUARDIAN', lat: 41.5, lon: -81.7, art: '', dx: 2, dy: -30 },
  { n: 26, region: 'LA', kicker: 'POLITICS', head: 'Bolsonaro in intensive care', deck: 'Bowel obstruction; surgery weighed (Al Jazeera)', src: 'AL JAZEERA', lat: -15.8, lon: -47.9, art: '', dx: -28, dy: 12 },
  { n: 27, region: 'LA', kicker: 'DISASTER', head: '6.7 quake shakes central Peru', deck: 'Andean tremor felt widely (UPI)', src: 'UPI', lat: -12.0, lon: -75.0, art: '', dx: -26, dy: -4 },
  { n: 28, region: 'LA', kicker: 'CONFLICT', head: 'Troops battle gangs in Haiti', deck: 'Salvadoran troops in Port-au-Prince (Guardian)', src: 'THE GUARDIAN', lat: 18.5, lon: -72.3, art: '', dx: 30, dy: 2 },
  { n: 29, region: 'LA', kicker: 'ECONOMY', head: 'Argentina bonds slide into distress', deck: 'Costs jump; LNG project approved (BA Times)', src: 'BUENOS AIRES TIMES', lat: -34.6, lon: -58.4, art: '', dx: 14, dy: 8 },
  { n: 30, region: 'ME', kicker: 'CONFLICT', head: 'Israeli strike kills three in Gaza', deck: 'Food vehicle hit in Gaza City (Al Jazeera)', src: 'AL JAZEERA', lat: 31.5, lon: 34.5, art: '', dx: -30, dy: 10 },
  { n: 31, region: 'ME', kicker: 'CONFLICT', head: 'Houthis and Saudis trade strikes', deck: '71 strikes in 24 hours (Middle East Eye)', src: 'MIDDLE EAST EYE', lat: 15.3, lon: 42.6, art: '', dx: 14, dy: 12 },
  { n: 32, region: 'ME', kicker: 'DISASTER', head: 'Fire at Basra power station kills four', deck: 'Blast injures 35 in Iraq (Reuters)', src: 'REUTERS', lat: 30.5, lon: 47.8, art: '', dx: 34, dy: -10 },
  { n: 33, region: 'ME', kicker: 'POLITICS', head: 'Iraq deal on Jurf al-Sakhar base', deck: "Joint post with Kata'ib Hezbollah (Al Jazeera)", src: 'AL JAZEERA', lat: 32.9, lon: 44.4, art: '', dx: -34, dy: -4 },
  { n: 34, region: 'AF', kicker: 'DISASTER', head: 'Boat of mourners capsizes in Nigeria', deck: 'At least 24 dead in Bayelsa (Sky News)', src: 'SKY NEWS', lat: 4.9, lon: 6.3, art: '', dx: -14, dy: 14 },
  { n: 35, region: 'AF', kicker: 'CRISIS', head: '700,000 displaced in southern Ethiopia', deck: 'Troops mobilise on Eritrea border (France 24)', src: 'FRANCE 24', lat: 6.0, lon: 38.0, art: '', dx: 0, dy: -16 },
  { n: 36, region: 'AF', kicker: 'JUSTICE', head: 'Tanzania convicts opposition leader', deck: 'Lissu guilty of sedition; he calls it political (BBC)', src: 'BBC', lat: -6.8, lon: 39.3, art: '', dx: 14, dy: 10 },
  { n: 37, region: 'AF', kicker: 'SOCIETY', head: 'Mlambo-Ngcuka dies aged 71', deck: 'Ex-deputy president mourned (Africanews)', src: 'AFRICA NEWS', lat: -33.9, lon: 18.4, art: '', dx: -30, dy: 4 },
  { n: 38, region: 'AP', kicker: 'POLITICS', head: 'Nepal PM Shah to visit India', deck: 'First foreign trip; trade on agenda (BBC)', src: 'BBC', lat: 27.7, lon: 85.3, art: '', dx: -24, dy: 10 },
  { n: 39, region: 'AP', kicker: 'POLITICS', head: "Japan 'sidelined' at China summit", deck: 'Scaled-down welcome for Takaichi (Japan Times)', src: 'JAPAN TIMES', lat: 35.7, lon: 139.7, art: '', dx: 16, dy: -12 },
  { n: 40, region: 'OC', kicker: 'JUSTICE', head: "Melbourne teen 'ran arsons on Signal'", deck: '17-year-old in arson, kidnap plot (Guardian)', src: 'THE GUARDIAN', lat: -37.8, lon: 145.0, art: '', dx: 12, dy: -10 },
];
const LEADS = STORIES.slice(0, 4);
const PICTURES = STORIES.slice(4, 14);
const BRIEFS = STORIES.slice(14);

// ------------------------------------------------------- art scenes ----
// Every illustration is drawn in code, in normalised coordinates so the
// same scene works at lead size and picture size. Deterministic: the only
// "randomness" is a fixed hash of integers.
function rnd(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
type Box = { x: number; y: number; w: number; h: number };
function px(b: Box, fx: number): number {
  return b.x + (b.w * fx) / 100;
}
function py(b: Box, fy: number): number {
  return b.y + (b.h * fy) / 100;
}
function stars(sh: Sheet, b: Box, n: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const sx = px(b, 4 + rnd(seed + i * 2) * 92);
    const sy = py(b, 4 + rnd(seed + i * 2 + 1) * 46);
    sh.disc(sx, sy, rnd(seed + i * 3) > 0.7 ? 1.6 : 1, WHITE);
  }
}
function skyline(sh: Sheet, b: Box, baseY: number, c: RGB, seed: number, lit: RGB): void {
  let x = b.x + 2;
  let i = 0;
  while (x < b.x + b.w - 6) {
    const bw = 8 + rnd(seed + i) * 14;
    const bh = (10 + rnd(seed + i + 50) * 42) * (b.h / 100);
    sh.rect(x, py(b, baseY) - bh, bw, bh, c);
    for (let wy = 0; wy < 3; wy++) {
      for (let wx = 0; wx < 3; wx++) {
        const winY = py(b, baseY) - bh + 3 + wy * 7;
        if (rnd(seed + i * 7 + wy * 3 + wx) > 0.55 && winY < py(b, baseY) - 2) {
          sh.rect(x + 2 + wx * (bw / 3.4), winY, 1.8, 2.4, lit);
        }
      }
    }
    x += bw + 2;
    i++;
  }
}
function flames(sh: Sheet, b: Box, cx: number, baseY: number, s: number): void {
  const cols: RGB[] = [[255, 190, 60], [245, 120, 30], [230, 60, 30]];
  for (let k = 0; k < 3; k++) {
    const fx = px(b, cx) + (k - 1) * s * 0.55;
    const fh = s * (1.6 - k * 0.35);
    sh.ellipse(fx, py(b, baseY) - fh / 2, s * 0.42, fh / 2, cols[k]);
  }
}
function waves(sh: Sheet, b: Box, y0: number, y1: number, c: RGB): void {
  for (let y = y0; y < y1; y += 5) {
    for (let x = b.x; x < b.x + b.w; x += 14) {
      sh.hline(x + ((y * 7) % 14), x + 6 + ((y * 7) % 14), py(b, y), c);
    }
  }
}
function drawArt(sh: Sheet, kind: string, b: Box): void {
  sh.frame(b.x, b.y, b.w, b.h, INK);
  switch (kind) {
    case 'bahrain': {
      sh.vgrad(b.x, b.y, b.w, b.h, [16, 24, 52], [52, 40, 74]);
      stars(sh, b, 22, 11);
      sh.disc(px(b, 82), py(b, 16), 9, [240, 214, 140]);
      sh.disc(px(b, 82), py(b, 16), 6, [250, 232, 170]);
      // missile trails arcing down from the sky
      for (let k = 0; k < 2; k++) {
        const x0 = px(b, 18 + k * 34);
        const y0 = py(b, 8);
        const x1 = px(b, 30 + k * 30);
        const y1 = py(b, 62);
        sh.thickLine(x0, y0, x1, y1, [255, 200, 90], 2);
        sh.disc(x1, y1, 3, [255, 220, 120]);
      }
      // sea + warship
      sh.rect(b.x, py(b, 66), b.w, b.h * 0.34, [24, 52, 84]);
      waves(sh, b, 70, 96, [90, 140, 180]);
      sh.poly([[px(b, 8), py(b, 66)], [px(b, 46), py(b, 66)], [px(b, 42), py(b, 78)], [px(b, 12), py(b, 78)]], [30, 34, 40]);
      sh.rect(px(b, 22), py(b, 56), 3, 10, [30, 34, 40]);
      sh.rect(px(b, 28), py(b, 52), 8, 4, [30, 34, 40]);
      sh.disc(px(b, 32), py(b, 50), 2, [255, 90, 70]);
      // shore skyline with fires
      skyline(sh, b, 66, [18, 18, 26], 41, [255, 200, 90]);
      flames(sh, b, 70, 66, 5);
      flames(sh, b, 88, 66, 4);
      break;
    }
    case 'sinaloa': {
      sh.vgrad(b.x, b.y, b.w, b.h, [214, 116, 44], [96, 44, 66]);
      sh.disc(px(b, 78), py(b, 20), 11, [255, 214, 120]);
      // mountains
      sh.poly([[b.x, py(b, 62)], [px(b, 22), py(b, 30)], [px(b, 44), py(b, 62)]], [74, 40, 62]);
      sh.poly([[px(b, 34), py(b, 62)], [px(b, 58), py(b, 26)], [px(b, 84), py(b, 62)]], [58, 30, 52]);
      sh.poly([[px(b, 52), py(b, 34)], [px(b, 58), py(b, 26)], [px(b, 64), py(b, 34)]], [240, 230, 220]);
      // desert road
      sh.poly([[px(b, 40), py(b, 100)], [px(b, 48), py(b, 62)], [px(b, 56), py(b, 62)], [px(b, 68), py(b, 100)]], [52, 40, 34]);
      sh.line(px(b, 52), py(b, 100), px(b, 52), py(b, 62), [240, 210, 130]);
      // helicopter
      sh.ellipse(px(b, 26), py(b, 22), 12, 4, [28, 28, 30]);
      sh.rect(px(b, 36), py(b, 20), 12, 3, [28, 28, 30]);
      sh.hline(px(b, 12), px(b, 40), py(b, 16), [28, 28, 30]);
      sh.disc(px(b, 26), py(b, 28), 2, [255, 220, 120]);
      // burning roadblock car
      sh.rect(px(b, 58), py(b, 78), 22, 7, [20, 20, 22]);
      sh.rect(px(b, 62), py(b, 72), 12, 6, [30, 34, 40]);
      flames(sh, b, 66, 78, 6);
      sh.disc(px(b, 84), py(b, 74), 3, [255, 60, 50]);
      sh.disc(px(b, 90), py(b, 76), 3, [70, 120, 255]);
      break;
    }
    case 'kryvyi': {
      sh.vgrad(b.x, b.y, b.w, b.h, [58, 54, 88], [150, 96, 70]);
      stars(sh, b, 10, 23);
      // missile streak with smoke
      sh.thickLine(px(b, 88), py(b, 6), px(b, 62), py(b, 46), [255, 226, 140], 2);
      for (let k = 0; k < 6; k++) sh.disc(px(b, 88 - k * 4.4), py(b, 6 + k * 6.6), 3.4 - k * 0.4, [210, 200, 190]);
      sh.disc(px(b, 62), py(b, 46), 3.4, [255, 240, 160]);
      // explosion cloud over the blocks
      sh.disc(px(b, 60), py(b, 52), 12, [120, 108, 100]);
      sh.disc(px(b, 66), py(b, 48), 9, [200, 120, 50]);
      sh.disc(px(b, 56), py(b, 48), 7, [240, 180, 80]);
      flames(sh, b, 62, 66, 6);
      // apartment blocks, one broken
      sh.rect(px(b, 6), py(b, 66), 20, b.h * 0.34, [34, 34, 44]);
      sh.rect(px(b, 30), py(b, 66), 18, b.h * 0.3, [44, 40, 52]);
      sh.poly([[px(b, 72), py(b, 66)], [px(b, 74), py(b, 46)], [px(b, 82), py(b, 52)], [px(b, 90), py(b, 66)]], [30, 30, 38]);
      for (let i = 0; i < 10; i++) {
        const wx = px(b, 8 + rnd(70 + i) * 80);
        const wy = py(b, 68 + rnd(80 + i) * 24);
        sh.rect(wx, wy, 2.4, 3, [255, 205, 110]);
      }
      // rescue lights
      sh.disc(px(b, 18), py(b, 94), 2.6, [255, 70, 60]);
      sh.disc(px(b, 88), py(b, 94), 2.6, [80, 140, 255]);
      break;
    }
    case 'nasdaq': {
      sh.vgrad(b.x, b.y, b.w, b.h, [14, 22, 44], [30, 44, 76]);
      // skyscrapers
      skyline(sh, b, 100, [10, 16, 32], 97, [120, 170, 220]);
      // candlesticks falling
      for (let k = 0; k < 7; k++) {
        const cx = px(b, 12 + k * 12);
        const top = py(b, 18 + k * 8);
        const bot = top + b.h * 0.16 + rnd(120 + k) * b.h * 0.08;
        const red = k % 3 !== 2;
        sh.vline(cx, top - 4, bot + 4, red ? [220, 60, 60] : [80, 200, 110]);
        sh.rect(cx - 4, top, 8, bot - top, red ? [200, 40, 44] : [60, 180, 100]);
      }
      // plunging line with arrow
      const pts: Array<[number, number]> = [];
      for (let k = 0; k <= 8; k++) pts.push([px(b, 10 + k * 10), py(b, 14 + k * 7 + rnd(200 + k) * 4)]);
      for (let k = 0; k + 1 < pts.length; k++) sh.thickLine(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], [255, 80, 70], 2);
      const last = pts[pts.length - 1];
      sh.poly([[last[0], last[1] + 8], [last[0] - 7, last[1] - 2], [last[0] + 2, last[1] - 6]], [255, 80, 70]);
      break;
    }
    case 'cop': {
      sh.vgrad(b.x, b.y, b.w, b.h, [30, 110, 120], [150, 210, 190]);
      sh.disc(px(b, 80), py(b, 18), 10, [255, 220, 120]);
      for (let a = 0; a < 12; a++) {
        const t = (a * Math.PI) / 6;
        sh.line(px(b, 80) + Math.cos(t) * 13, py(b, 18) + Math.sin(t) * 13, px(b, 80) + Math.cos(t) * 17, py(b, 18) + Math.sin(t) * 17, [255, 220, 120]);
      }
      // globe
      sh.disc(px(b, 30), py(b, 44), 18, [40, 110, 180]);
      sh.ellipse(px(b, 24), py(b, 40), 7, 4, [90, 190, 110]);
      sh.ellipse(px(b, 36), py(b, 50), 5, 3, [90, 190, 110]);
      sh.ring(px(b, 30), py(b, 44), 18, [255, 255, 255]);
      // hills + trees + flags
      sh.poly([[b.x, py(b, 100)], [px(b, 30), py(b, 72)], [px(b, 70), py(b, 100)]], [40, 120, 70]);
      sh.poly([[px(b, 55), py(b, 100)], [px(b, 82), py(b, 68)], [b.x + b.w, py(b, 100)]], [30, 100, 60]);
      for (let k = 0; k < 4; k++) {
        const fx = px(b, 12 + k * 20);
        sh.vline(fx, py(b, 76), py(b, 92), [240, 240, 240]);
        sh.rect(fx, py(b, 76), 10, 6, [[220, 60, 60], [60, 120, 220], [240, 200, 60], [90, 190, 110]][k]);
      }
      break;
    }
    case 'summit': {
      sh.vgrad(b.x, b.y, b.w, b.h, [40, 60, 110], [120, 150, 200]);
      skyline(sh, b, 78, [30, 40, 70], 131, [255, 210, 120]);
      // three flags
      const flagCols: RGB[][] = [
        [[200, 40, 44], [255, 255, 255], [200, 40, 44]],
        [[220, 30, 30], [220, 30, 30], [220, 30, 30]],
        [[255, 255, 255], [40, 90, 200], [200, 40, 44]],
      ];
      for (let k = 0; k < 3; k++) {
        const fx = px(b, 16 + k * 32);
        sh.vline(fx, py(b, 18), py(b, 66), [230, 230, 230]);
        for (let s = 0; s < 3; s++) sh.rect(fx, py(b, 18 + s * 7), 20, 7, flagCols[k][s]);
        if (k === 1) for (let s = 0; s < 3; s++) sh.disc(fx + 4 + s * 5, py(b, 22 + (s % 2) * 5), 1.2, [255, 220, 80]);
      }
      // table
      sh.rect(px(b, 22), py(b, 72), 56, 5, [120, 80, 50]);
      sh.rect(px(b, 26), py(b, 77), 4, b.h * 0.16, [90, 60, 40]);
      sh.rect(px(b, 70), py(b, 77), 4, b.h * 0.16, [90, 60, 40]);
      break;
    }
    case 'riemann': {
      sh.vgrad(b.x, b.y, b.w, b.h, [16, 50, 40], [10, 30, 26]);
      // zeta zeros: dots along the critical line
      sh.vline(px(b, 50), py(b, 8), py(b, 92), [120, 200, 170]);
      for (let k = 0; k < 14; k++) {
        const yy = py(b, 10 + k * 6);
        const xx = px(b, 50) + (rnd(300 + k) - 0.5) * 6;
        sh.disc(xx, yy, 2.4, [255, 240, 180]);
      }
      // rising curve of primes
      for (let k = 0; k < 9; k++) {
        sh.disc(px(b, 8 + k * 9), py(b, 84 - k * k * 0.75), 2.6, [140, 220, 255]);
      }
      const rts = b.h > 70 ? 16 : 10;
      text.draw(sh, 'ZETA ZEROS', px(b, 60), py(b, 26), rts, 'B', [255, 255, 255]);
      text.draw(sh, 'Re(s) = 1/2', px(b, 60), py(b, 46), Math.max(9, rts - 2), 'R', [200, 230, 210]);
      text.draw(sh, '1859-2026', px(b, 60), py(b, 64), Math.max(9, rts - 2), 'R', [255, 220, 130]);
      break;
    }
    case 'scales': {
      sh.vgrad(b.x, b.y, b.w, b.h, [24, 34, 66], [52, 66, 110]);
      // columns
      for (const cx of [12, 88]) {
        sh.rect(px(b, cx), py(b, 20), 5, b.h * 0.66, [200, 180, 140]);
        sh.rect(px(b, cx - 2), py(b, 16), 9, 5, [220, 200, 160]);
      }
      // scales
      sh.vline(px(b, 50), py(b, 18), py(b, 56), [230, 200, 110]);
      sh.disc(px(b, 50), py(b, 16), 3, [230, 200, 110]);
      sh.hline(px(b, 28), px(b, 72), py(b, 24), [230, 200, 110]);
      sh.line(px(b, 28), py(b, 24), px(b, 22), py(b, 48), [230, 200, 110]);
      sh.line(px(b, 28), py(b, 24), px(b, 34), py(b, 48), [230, 200, 110]);
      sh.line(px(b, 72), py(b, 24), px(b, 66), py(b, 48), [230, 200, 110]);
      sh.line(px(b, 72), py(b, 24), px(b, 78), py(b, 48), [230, 200, 110]);
      sh.ellipse(px(b, 28), py(b, 50), 10, 3, [230, 200, 110]);
      sh.ellipse(px(b, 72), py(b, 50), 10, 3, [230, 200, 110]);
      sh.rect(px(b, 44), py(b, 56), 12, 5, [230, 200, 110]);
      sh.rect(px(b, 38), py(b, 61), 24, 4, [200, 170, 90]);
      // gavel
      sh.line(px(b, 78), py(b, 78), px(b, 90), py(b, 66), [180, 140, 90]);
      sh.rect(px(b, 82), py(b, 62), 12, 6, [150, 110, 70]);
      break;
    }
    case 'ship': {
      sh.vgrad(b.x, b.y, b.w, b.h, [120, 160, 190], [60, 100, 140]);
      sh.disc(px(b, 82), py(b, 16), 8, [255, 230, 150]);
      sh.rect(b.x, py(b, 62), b.w, b.h * 0.38, [30, 70, 110]);
      waves(sh, b, 66, 96, [140, 190, 220]);
      // cargo ship
      sh.poly([[px(b, 14), py(b, 62)], [px(b, 86), py(b, 62)], [px(b, 80), py(b, 78)], [px(b, 20), py(b, 78)]], [40, 40, 46]);
      for (let k = 0; k < 4; k++) sh.rect(px(b, 20 + k * 15), py(b, 50), 12, 12, [[200, 60, 50], [60, 120, 200], [240, 180, 60], [80, 170, 90]][k]);
      sh.rect(px(b, 78), py(b, 44), 6, 18, [220, 220, 220]);
      flames(sh, b, 44, 50, 6);
      flames(sh, b, 58, 50, 5);
      sh.disc(px(b, 50), py(b, 34), 8, [110, 110, 110]);
      sh.disc(px(b, 56), py(b, 28), 6, [140, 140, 140]);
      // drone
      sh.disc(px(b, 24), py(b, 22), 2.4, [20, 20, 24]);
      sh.hline(px(b, 16), px(b, 32), py(b, 20), [20, 20, 24]);
      sh.line(px(b, 24), py(b, 22), px(b, 30), py(b, 34), [20, 20, 24]);
      break;
    }
    case 'mercury': {
      sh.rect(b.x, b.y, b.w, b.h, [8, 10, 18]);
      stars(sh, b, 26, 55);
      // cratered planet
      sh.disc(px(b, 32), py(b, 52), 24, [168, 158, 142]);
      sh.disc(px(b, 28), py(b, 48), 22, [188, 178, 162]);
      for (let k = 0; k < 9; k++) {
        sh.ring(px(b, 14 + rnd(400 + k) * 36), py(b, 28 + rnd(410 + k) * 48), 2 + rnd(420 + k) * 3.4, [140, 130, 116]);
      }
      sh.ellipse(px(b, 26), py(b, 40), 12, 5, [150, 140, 126]);
      // spacecraft with panels
      sh.rect(px(b, 66), py(b, 40), 12, 8, [220, 220, 225]);
      sh.rect(px(b, 60), py(b, 42), 6, 4, [60, 110, 200]);
      sh.rect(px(b, 78), py(b, 42), 6, 4, [60, 110, 200]);
      sh.disc(px(b, 72), py(b, 36), 3, [255, 220, 120]);
      // sun glare corner
      sh.disc(px(b, 96), py(b, 4), 10, [255, 240, 180]);
      break;
    }
    case 'gta': {
      sh.vgrad(b.x, b.y, b.w, b.h, [90, 40, 110], [255, 140, 60]);
      sh.disc(px(b, 50), py(b, 42), 14, [255, 210, 110]);
      skyline(sh, b, 100, [30, 16, 44], 151, [255, 190, 120]);
      // palms
      for (const cx of [12, 86]) {
        sh.line(px(b, cx), py(b, 100), px(b, cx + 3), py(b, 66), [24, 14, 34]);
        for (let k = 0; k < 4; k++) {
          const a = -0.4 - k * 0.5;
          sh.line(px(b, cx + 3), py(b, 66), px(b, cx + 3) + Math.cos(a) * 12, py(b, 66) + Math.sin(a) * 7, [24, 14, 34]);
        }
      }
      // car
      sh.rect(px(b, 38), py(b, 86), 26, 6, [20, 20, 26]);
      sh.rect(px(b, 44), py(b, 80), 14, 6, [30, 30, 40]);
      sh.disc(px(b, 44), py(b, 92), 3, [10, 10, 12]);
      sh.disc(px(b, 58), py(b, 92), 3, [10, 10, 12]);
      sh.disc(px(b, 40), py(b, 88), 2, [255, 240, 160]);
      text.draw(sh, '$3.8BN', px(b, 30), py(b, 20), b.h > 70 ? 20 : 12, 'B', [255, 255, 255]);
      break;
    }
    case 'tennis': {
      sh.vgrad(b.x, b.y, b.w, b.h, [30, 90, 60], [16, 60, 40]);
      // court
      sh.poly([[px(b, 8), py(b, 96)], [px(b, 30), py(b, 40)], [px(b, 70), py(b, 40)], [px(b, 94), py(b, 96)]], [60, 140, 90]);
      sh.line(px(b, 30), py(b, 40), px(b, 8), py(b, 96), [255, 255, 255]);
      sh.line(px(b, 70), py(b, 40), px(b, 94), py(b, 96), [255, 255, 255]);
      sh.hline(px(b, 22), px(b, 78), py(b, 66), [255, 255, 255]);
      // net
      sh.rect(px(b, 18), py(b, 62), 64, 3, [240, 240, 240]);
      sh.vline(px(b, 50), py(b, 62), py(b, 70), [240, 240, 240]);
      // ball with trail
      for (let k = 0; k < 4; k++) sh.disc(px(b, 74 - k * 5), py(b, 26 + k * 3), 3.4 - k * 0.6, [220, 240, 80]);
      sh.disc(px(b, 76), py(b, 24), 4.4, [240, 255, 110]);
      // racket
      sh.ellipse(px(b, 22), py(b, 26), 9, 12, [200, 200, 210]);
      sh.ellipse(px(b, 22), py(b, 26), 6, 9, [30, 90, 60]);
      sh.line(px(b, 22), py(b, 38), px(b, 28), py(b, 52), [200, 170, 120]);
      break;
    }
    case 'mosquito': {
      sh.vgrad(b.x, b.y, b.w, b.h, [20, 110, 110], [120, 200, 190]);
      // droplets
      for (let k = 0; k < 6; k++) sh.disc(px(b, 12 + rnd(500 + k) * 76), py(b, 12 + rnd(510 + k) * 76), 2 + rnd(520 + k) * 2, [200, 240, 245]);
      // mosquito
      sh.ellipse(px(b, 46), py(b, 52), 16, 6, [30, 30, 34]);
      sh.disc(px(b, 60), py(b, 50), 5, [30, 30, 34]);
      sh.line(px(b, 64), py(b, 50), px(b, 74), py(b, 46), [30, 30, 34]);
      for (let k = 0; k < 3; k++) {
        sh.line(px(b, 42 + k * 6), py(b, 56), px(b, 36 + k * 8), py(b, 78), [30, 30, 34]);
        sh.line(px(b, 42 + k * 6), py(b, 48), px(b, 36 + k * 8), py(b, 26), [30, 30, 34]);
      }
      sh.ellipse(px(b, 44), py(b, 40), 14, 6, [220, 240, 245]);
      sh.ellipse(px(b, 50), py(b, 62), 12, 5, [220, 240, 245]);
      // shield check
      sh.poly([[px(b, 78), py(b, 66)], [px(b, 90), py(b, 66)], [px(b, 90), py(b, 80)], [px(b, 84), py(b, 88)], [px(b, 78), py(b, 80)]], [40, 160, 80]);
      sh.line(px(b, 81), py(b, 78), px(b, 84), py(b, 82), [255, 255, 255]);
      sh.line(px(b, 84), py(b, 82), px(b, 89), py(b, 72), [255, 255, 255]);
      text.draw(sh, '-69%', px(b, 74), py(b, 30), b.h > 70 ? 17 : 11, 'B', [255, 255, 255]);
      break;
    }
    case 'fbi': {
      sh.vgrad(b.x, b.y, b.w, b.h, [18, 22, 40], [34, 44, 74]);
      // server racks
      for (let k = 0; k < 4; k++) {
        const rx = px(b, 8 + k * 22);
        sh.rect(rx, py(b, 22), 18, b.h * 0.62, [16, 18, 28]);
        for (let r = 0; r < 5; r++) {
          sh.rect(rx + 3, py(b, 28 + r * 11), 12, 3, [50, 60, 80]);
          sh.disc(rx + 15, py(b, 29.5 + r * 11), 1.4, r % 2 ? [255, 70, 60] : [90, 220, 120]);
        }
      }
      // padlock
      sh.rect(px(b, 40), py(b, 58), 20, 16, [230, 200, 110]);
      sh.ring(px(b, 50), py(b, 50), 7, [230, 200, 110]);
      sh.disc(px(b, 50), py(b, 64), 2.4, [30, 30, 40]);
      // warning triangle
      sh.poly([[px(b, 82), py(b, 30)], [px(b, 92), py(b, 48)], [px(b, 72), py(b, 48)]], [240, 200, 60]);
      text.draw(sh, '!', px(b, 80), py(b, 46), b.h > 70 ? 15 : 11, 'B', [30, 30, 40]);
      break;
    }
    default: {
      sh.vgrad(b.x, b.y, b.w, b.h, [90, 110, 140], [60, 80, 110]);
      break;
    }
  }
}

// -------------------------------------------------------------- layout ----
// Vertical budget (1024 tall, 12px side margins):
//   masthead 0-86 · numbers 90-118 · leads 122-322 · pictures 326-530
//   briefs 534-774 · map+timeline 778-950 · date check 954-980 · colophon 982-1006
const MX = 12;
const CW = W - MX * 2;

function trunc(s: string, size: number, weight: string, maxW: number): string {
  if (text.width(weight, size, s) <= maxW) return s;
  let t = s;
  while (t.length > 4 && text.width(weight, size, t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
}
function chip(sh: Sheet, x: number, y: number, label: string): number {
  const w = text.width('B', 9, label) + 10;
  sh.frame(x, y, w, 13, RED);
  text.draw(sh, label, x + 5, y + 10, 9, 'B', RED);
  return w;
}
function drawMasthead(sh: Sheet): void {
  sh.rect(0, 0, W, 4, RED);
  text.drawCentred(sh, 'THE WORLD IN ONE DAY', W / 2, 15, 11, 'B', RED);
  text.drawCentred(sh, 'THE WORLD LEDGER', W / 2, 60, 46, 'B', INK);
  sh.hline(MX, W - MX, 68, INK);
  text.draw(sh, 'No. 21', MX, 80, 11, 'B', INK);
  text.drawCentred(sh, 'SATURDAY, 21 NOVEMBER 2026', W / 2, 80, 11, 'B', INK);
  text.drawRight(sh, '40 STORIES · 7 REGIONS', W - MX, 80, 11, 'B', INK);
  sh.hline(MX, W - MX, 84, INK);
}
function drawNumbers(sh: Sheet): void {
  const y = 90;
  const cells: Array<[string, string]> = [
    ['2', 'US BASES HIT IN BAHRAIN'],
    ['11', 'DEAD AFTER SINALOA RAID'],
    ['~60', 'HURT IN KRYVYI RIH'],
    ['$3.8BN', 'GTA VI, DAY ONE'],
    ['6.7', 'PERU QUAKE MAGNITUDE'],
    ['700,000', 'DISPLACED IN ETHIOPIA'],
  ];
  const cw = CW / cells.length;
  sh.rect(MX, y, CW, 28, CARD);
  sh.frame(MX, y, CW, 28, INK);
  cells.forEach(([v, l], i) => {
    const cx = MX + cw * i + cw / 2;
    text.drawCentred(sh, v, cx, y + 13, 16, 'B', RED);
    text.drawCentred(sh, l, cx, y + 25, 8, 'B', GREY);
    if (i > 0) sh.vline(MX + cw * i, y + 4, y + 24, [210, 200, 180]);
  });
}
function drawLead(sh: Sheet, s: Story, x: number, y: number, w: number, h: number): void {
  sh.rect(x, y, w, h, CARD);
  sh.frame(x, y, w, h, INK);
  const aw = 132;
  drawArt(sh, s.art, { x: x + 1, y: y + 1, w: aw - 2, h: h - 2 });
  const tx = x + aw + 8;
  const tw = w - aw - 16;
  text.draw(sh, `${s.n} · ${s.kicker}`, tx, y + 12, 10, 'B', RED);
  const headLines = wrapText(s.head, 17, 'B', tw, 2);
  headLines.forEach((ln, i) => text.draw(sh, ln, tx, y + 30 + i * 19, 17, 'B', INK));
  const deckLines = wrapText(s.deck, 10, 'R', tw, 2);
  deckLines.forEach((ln, i) => text.draw(sh, ln, tx, y + 64 + i * 11, 10, 'R', SOFT));
  let cx = tx;
  if (s.chips) for (const c of s.chips) cx += chip(sh, cx, y + h - 15, c) + 5;
  text.drawRight(sh, s.src, x + w - 8, y + h - 5, 9, 'R', GREY);
}
function drawPicture(sh: Sheet, s: Story, x: number, y: number, w: number, h: number): void {
  sh.rect(x, y, w, h, CARD);
  sh.frame(x, y, w, h, INK);
  const ah = 46;
  drawArt(sh, s.art, { x: x + 1, y: y + 1, w: w - 2, h: ah - 1 });
  // number badge on the art
  sh.disc(x + 12, y + 12, 9, RED);
  text.drawCentred(sh, String(s.n), x + 12, y + 15.5, 10, 'B', WHITE);
  const tx = x + 6;
  const tw = w - 12;
  text.draw(sh, s.kicker, tx, y + ah + 12, 9, 'B', REGION_COLOR[s.region]);
  text.drawRight(sh, s.src, x + w - 6, y + ah + 12, 8, 'R', GREY);
  const headLines = wrapText(s.head, 12, 'B', tw, 2);
  headLines.forEach((ln, i) => text.draw(sh, ln, tx, y + ah + 25 + i * 13, 12, 'B', INK));
}
function drawBriefs(sh: Sheet): void {
  text.draw(sh, 'THE DAY, REGION BY REGION — 26 BRIEFS', MX, 546, 11, 'B', INK);
  text.drawRight(sh, 'EU 11 · NA 9 · LA 6 · ME 5 · AF 4 · AP 4 · OC 1', W - MX, 546, 10, 'B', RED);
  // Each column: one or two region blocks. AP and OC share one block.
  const groups: Array<Array<{ label: string; color: RGB; list: Story[] }>> = [
    [{ label: 'EUROPE', color: REGION_COLOR.EU, list: BRIEFS.filter((s) => s.region === 'EU') }],
    [{ label: 'NORTH AMERICA', color: REGION_COLOR.NA, list: BRIEFS.filter((s) => s.region === 'NA') }],
    [
      { label: 'LATIN AMERICA', color: REGION_COLOR.LA, list: BRIEFS.filter((s) => s.region === 'LA') },
      { label: 'MIDDLE EAST', color: REGION_COLOR.ME, list: BRIEFS.filter((s) => s.region === 'ME') },
    ],
    [
      { label: 'AFRICA', color: REGION_COLOR.AF, list: BRIEFS.filter((s) => s.region === 'AF') },
      { label: 'ASIA-PACIFIC & OCEANIA', color: REGION_COLOR.AP, list: BRIEFS.filter((s) => s.region === 'AP' || s.region === 'OC') },
    ],
  ];
  const colW = (CW - 3 * 8) / 4;
  groups.forEach((blocks, ci) => {
    const x = MX + ci * (colW + 8);
    let y = 552;
    for (const b of blocks) {
      sh.rect(x, y, colW, 14, b.color);
      text.draw(sh, `${b.label} — ${b.list.length} ${b.list.length === 1 ? 'STORY' : 'STORIES'}`, x + 5, y + 11, 10, 'B', WHITE);
      y += 17;
      for (const s of b.list) {
        const head = trunc(`${s.n}. ${s.head}`, 10, 'B', colW - 2);
        text.draw(sh, head, x + 1, y + 9, 10, 'B', INK);
        const deck = trunc(s.deck, 9, 'R', colW - 2);
        text.draw(sh, deck, x + 1, y + 20, 9, 'R', SOFT);
        y += 23;
      }
      y += 3;
    }
  });
}
// -------------------------------------------------------------- map ------
const CONTINENTS: Array<Array<[number, number]>> = [
  // North America
  [[-168, 66], [-155, 71], [-140, 70], [-128, 71], [-115, 69], [-100, 69], [-90, 68], [-85, 66], [-80, 62], [-70, 62], [-65, 60], [-60, 55], [-55, 52], [-60, 47], [-65, 44], [-70, 42], [-75, 35], [-80, 32], [-81, 26], [-84, 30], [-89, 29], [-91, 19], [-97, 16], [-94, 17], [-87, 13], [-83, 9], [-79, 9], [-77, 7], [-82, 9], [-86, 12], [-90, 14], [-92, 15], [-97, 16], [-101, 18], [-105, 20], [-110, 23], [-114, 28], [-117, 32], [-122, 37], [-124, 42], [-124, 48], [-128, 51], [-132, 56], [-140, 60], [-150, 59], [-158, 58], [-162, 55], [-166, 60], [-168, 66]],
  // South America
  [[-79, 9], [-77, 4], [-80, -3], [-81, -6], [-77, -12], [-72, -18], [-70, -23], [-70, -30], [-72, -37], [-73, -44], [-71, -50], [-68, -52], [-66, -55], [-68, -50], [-65, -45], [-62, -41], [-58, -38], [-52, -33], [-48, -28], [-41, -23], [-39, -17], [-35, -9], [-35, -6], [-40, -3], [-44, -2], [-50, 0], [-52, 4], [-55, 6], [-60, 8], [-65, 10], [-70, 12], [-75, 10], [-79, 9]],
  // Africa
  [[-6, 35], [-10, 31], [-15, 27], [-17, 21], [-17, 15], [-16, 12], [-13, 8], [-8, 5], [-4, 5], [0, 6], [6, 4], [9, 4], [9, -1], [12, -5], [13, -10], [12, -17], [13, -22], [16, -28], [19, -34], [25, -34], [28, -33], [32, -29], [35, -24], [36, -20], [40, -16], [40, -11], [42, -4], [46, 0], [51, 2], [51, 10], [48, 11], [44, 11], [43, 12], [40, 15], [38, 18], [37, 22], [35, 28], [33, 31], [30, 32], [26, 32], [22, 33], [19, 33], [15, 32], [11, 34], [10, 37], [5, 37], [-1, 35], [-6, 35]],
  // Eurasia (coarse)
  [[-10, 36], [-9, 43], [-2, 48], [-4, 48], [0, 50], [2, 51], [4, 53], [8, 57], [10, 59], [6, 60], [10, 62], [14, 65], [18, 69], [25, 71], [30, 70], [35, 68], [42, 68], [50, 69], [58, 69], [66, 71], [72, 72], [80, 73], [88, 74], [95, 76], [103, 77], [110, 74], [118, 73], [126, 72], [134, 72], [142, 72], [150, 70], [158, 68], [162, 62], [158, 56], [156, 51], [150, 59], [142, 59], [140, 54], [138, 48], [135, 43], [130, 42], [127, 40], [124, 38], [122, 37], [120, 32], [117, 28], [113, 23], [110, 20], [108, 18], [105, 10], [103, 8], [100, 7], [98, 10], [97, 15], [94, 17], [91, 22], [89, 22], [86, 20], [83, 18], [80, 14], [77, 8], [76, 10], [74, 15], [72, 20], [69, 22], [66, 25], [62, 25], [58, 26], [56, 27], [53, 27], [51, 28], [49, 30], [48, 29], [46, 29], [44, 29], [42, 28], [40, 26], [39, 21], [39, 16], [41, 15], [43, 12], [45, 13], [43, 15], [41, 17], [39, 21], [36, 26], [35, 30], [36, 36], [33, 36], [30, 36], [27, 37], [24, 36], [23, 37], [21, 39], [19, 40], [16, 40], [12, 44], [8, 44], [4, 43], [0, 40], [-2, 37], [-6, 36], [-10, 36]],
  // Australia
  [[114, -22], [114, -30], [115, -35], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [145, -38], [147, -39], [150, -37], [153, -32], [153, -27], [151, -24], [148, -20], [146, -19], [142, -15], [142, -11], [137, -12], [132, -12], [130, -13], [126, -14], [122, -17], [118, -20], [114, -22]],
  // Greenland
  [[-45, 60], [-42, 63], [-38, 66], [-32, 68], [-26, 70], [-22, 70], [-20, 74], [-24, 76], [-32, 78], [-45, 80], [-55, 78], [-58, 72], [-55, 68], [-52, 64], [-48, 61], [-45, 60]],
  // United Kingdom
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-3, 50], [-5, 50]],
  // Japan
  [[130, 31], [132, 33], [134, 34], [136, 35], [139, 35], [140, 37], [141, 39], [141, 42], [140, 44], [142, 45], [144, 44], [142, 42], [140, 39], [139, 36], [136, 34], [133, 34], [130, 31]],
  // Madagascar
  [[44, -16], [47, -15], [50, -16], [49, -20], [47, -24], [45, -25], [44, -22], [43, -19], [44, -16]],
  // New Zealand
  [[167, -45], [170, -43], [173, -41], [175, -38], [177, -38], [175, -40], [172, -43], [168, -46], [167, -45]],
];
const MAP = { x: 12, y: 790, w: 656, h: 144, latTop: 78, latBot: -58 };
function project(lat: number, lon: number): [number, number] {
  const x = MAP.x + ((lon + 180) / 360) * MAP.w;
  const y = MAP.y + ((MAP.latTop - lat) / (MAP.latTop - MAP.latBot)) * MAP.h;
  return [x, y];
}
function drawMap(sh: Sheet): void {
  const x = MAP.x;
  const y = 778;
  const h = 172;
  sh.rect(x, y, MAP.w, h, CARD);
  sh.frame(x, y, MAP.w, h, INK);
  text.draw(sh, 'WHERE IT HAPPENED — PINS MATCH STORY NUMBERS', x + 6, y + 11, 9, 'B', RED);
  text.drawRight(sh, 'POSITIONS APPROXIMATE', x + MAP.w - 6, y + 11, 9, 'R', GREY);
  // sea + graticule
  sh.rect(x + 1, y + 14, MAP.w - 2, MAP.h, SEA);
  for (let lon = -150; lon <= 150; lon += 30) {
    const gx = MAP.x + ((lon + 180) / 360) * MAP.w;
    sh.vline(gx, MAP.y, MAP.y + MAP.h, [255, 255, 255]);
  }
  for (let lat = 60; lat >= -40; lat -= 20) {
    const gy = MAP.y + ((MAP.latTop - lat) / (MAP.latTop - MAP.latBot)) * MAP.h;
    sh.hline(MAP.x, MAP.x + MAP.w, gy, [255, 255, 255]);
  }
  for (const poly of CONTINENTS) {
    const pts = poly.map(([lo, la]) => project(la, lo));
    sh.poly(pts, LAND);
    sh.polyLine(pts, LANDLINE);
  }
  // small islands: Indonesia, Philippines, Sri Lanka, Cuba, Iceland
  const islands: Array<[number, number, number, number]> = [
    [95, 5, 6, 2], [102, 0, 8, 2], [110, -7, 9, 2], [118, -9, 6, 2], [125, -9, 5, 2],
    [132, -3, 5, 2], [138, -6, 6, 2], [122, 12, 4, 2], [121, 16, 3, 2], [80, 8, 3, 2],
    [-77, 21, 5, 2], [-18, 65, 5, 3], [103, 1, 2, 2], [55, -4, 2, 2],
  ];
  for (const [lo, la, rx, ry] of islands) {
    const [ix, iy] = project(la, lo);
    sh.ellipse(ix, iy, rx, ry, LAND);
  }
  // leader lines, then badges, then dots
  for (const s of STORIES) {
    const [px0, py0] = project(s.lat, s.lon);
    sh.line(px0, py0, px0 + s.dx, py0 + s.dy, [120, 30, 34]);
  }
  for (const s of STORIES) {
    const [px0, py0] = project(s.lat, s.lon);
    const bx = px0 + s.dx;
    const by = py0 + s.dy;
    sh.disc(bx, by, 7.5, RED);
    sh.ring(bx, by, 7.5, DARKRED);
    text.drawCentred(sh, String(s.n), bx, by + 3, 8, 'B', WHITE);
  }
  for (const s of STORIES) {
    const [px0, py0] = project(s.lat, s.lon);
    sh.disc(px0, py0, 2.6, DARKRED);
    sh.ring(px0, py0, 2.6, WHITE);
  }
  // region bar under the map
  const barY = y + 158;
  const counts: Array<[Region, number]> = (Object.keys(REGION_NAME) as Region[]).map((r) => [
    r,
    STORIES.filter((s) => s.region === r).length,
  ]);
  let bx = x + 6;
  const total = STORIES.length;
  const barW = MAP.w - 12;
  for (const [r, n] of counts) {
    const segW = (barW * n) / total;
    sh.rect(bx, barY, Math.max(segW - 1, 8), 11, REGION_COLOR[r]);
    text.drawCentred(sh, segW >= 26 ? `${r} ${n}` : r, bx + segW / 2, barY + 9, 8, 'B', WHITE);
    bx += segW;
  }
}
function drawTimeline(sh: Sheet): void {
  const x = 676;
  const y = 778;
  const w = W - MX - x;
  const h = 172;
  sh.rect(x, y, w, h, CARD);
  sh.frame(x, y, w, h, INK);
  sh.rect(x, y, w, 18, INK);
  text.draw(sh, 'HOW THE DAY UNFOLDED', x + 8, y + 14, 11, 'B', WHITE);
  const rows: Array<[string, string]> = [
    ['07:00 UTC', 'Russian missile hits Kryvyi Rih; two killed, about 60 hurt'],
    ['12:30 UTC', "Mexican forces capture 'Chapo Isidro' in Sinaloa; 11 dead"],
    ['17:45 UTC', 'Alcaraz beats Shelton to reach the ATP Finals decider'],
    ['20:00 UTC', "Nasdaq erases its 2026 gains as the AI sell-off deepens"],
    ['22:00 UTC', 'Iran says it struck two US bases in Bahrain; COP31 still no deal'],
  ];
  let ry = y + 18;
  for (const [t, body] of rows) {
    text.draw(sh, t, x + 8, ry + 13, 10, 'B', RED);
    const lines = wrapText(body, 10, 'R', w - 78, 2);
    lines.forEach((ln, i) => text.draw(sh, ln, x + 74, ry + 13 + i * 12, 10, 'R', SOFT));
    sh.hline(x + 8, x + w - 8, ry + 29, [225, 216, 198]);
    ry += 30;
  }
}
function drawFooter(sh: Sheet): void {
  text.drawCentred(sh, 'DATE CHECK: SATURDAY, 21 NOVEMBER 2026 — EVERY STORY ABOVE WAS REPORTED ON THIS DAY', W / 2, 968, 12, 'B', RED);
  text.drawCentred(sh, 'Left out: the 20 Nov missile landings in Poland; first-day coverage of the 19 Nov ICJ verdict.  Not yet: the COP31 final deal; the ATP Finals champion — decided Sunday.', W / 2, 982, 9, 'R', SOFT);
  sh.hline(MX, W - MX, 990, INK);
  text.drawCentred(sh, 'SOURCES: BBC NEWS · REUTERS · AP · AL JAZEERA · THE GUARDIAN · FRANCE 24 · NPR · CBC · UPI · PBS · DW · SKY NEWS', W / 2, 1002, 9, 'R', GREY);
  text.drawCentred(sh, 'Drawn from reports published Saturday 21 November 2026 · THE DAY IN FULL · All 40 stories numbered; pins on the map match story numbers', W / 2, 1014, 9, 'R', GREY);
}
// -------------------------------------------------------------- main -----
function main(): void {
  loadFonts();
  const sh = new Sheet();
  drawMasthead(sh);
  drawNumbers(sh);
  const leadW = (CW - 8) / 2;
  const leadH = 96;
  LEADS.forEach((s, i) => {
    drawLead(sh, s, MX + (i % 2) * (leadW + 8), 122 + Math.floor(i / 2) * (leadH + 8), leadW, leadH);
  });
  text.draw(sh, 'PICTURE STORIES — 10', MX, 338, 11, 'B', INK);
  const picW = (CW - 4 * 8) / 5;
  const picH = 92;
  PICTURES.forEach((s, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    drawPicture(sh, s, MX + col * (picW + 8), 342 + row * (picH + 6), picW, picH);
  });
  drawBriefs(sh);
  drawMap(sh);
  drawTimeline(sh);
  drawFooter(sh);
  const png = encodePNG(sh.buf, W, H);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || join(NODE_DIR, 'out');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'entry.png');
  writeFileSync(outPath, png);
  const sha = createHash('sha256').update(png).digest('hex');
  console.log(`wrote ${outPath} ${png.length} bytes sha256=${sha}`);
  console.log(`stories=${STORIES.length} leads=${LEADS.length} pictures=${PICTURES.length} briefs=${BRIEFS.length} overflowLines=${overflowCount}`);
}
main();
