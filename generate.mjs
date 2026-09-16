#!/usr/bin/env node
//
// Generates the themed Valkey blog header images.
//
// Every header shares the same atmosphere as the valkey.io hero background
// (deep navy fading into #301868 purple, a focal glow, vignette, film grain)
// and layers a theme-specific motif on top of it. Each theme draws on the full
// 1920x1080 grid and is then framed by a per-theme `zoom`/`center`, so the motif
// fills the frame instead of floating in it.
//
// Output:
//   svg/<theme>.svg      vector source, committed so it can be tweaked by hand
//   images/<theme>.webp  the published raster
//
// Usage: node generate.mjs [theme ...] [--text "..."] [--out name]
//
// Requires a Chrome-based browser (renders the SVG) and Python with Pillow
// (downsamples and encodes the WebP): `pip3 install Pillow`. All randomness is
// seeded, so re-running produces byte-identical output on a given machine.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG_DIR = join(HERE, 'svg');
const OUT_DIR = join(HERE, 'images');
const OG_DIR = join(HERE, 'images', 'og');
// The chrome-free copy: same art, no corner lockup and no title blocks, for anyone who
// wants to set their own type over it. The gallery has a toggle that swaps to these.
const PLAIN_DIR = join(HERE, 'images', 'plain');
// Render cache. An SVG fully determines its raster, so its hash is the cache key: a run
// that regenerates identical markup can skip Chrome and Pillow entirely. Not committed,
// because it describes this machine's outputs and nothing else.
const CACHE_FILE = join(HERE, '.render-cache.json');
const LOGO = join(HERE, 'assets', 'Valkey-logo.svg');
// The official horizontal lockup, mark plus wordmark, copied from
// valkey-io.github.io/static/img/valkey-horizontal.svg. Used for the corner stamp
// so the wordmark is the real one and not a font approximation.
const LOCKUP_FILE = join(HERE, 'assets', 'valkey-horizontal.svg');

const W = 1920;
const H = 1080;

// Composition band, a framing guide rather than a hard limit. These are consumed
// as CSS `object-fit: cover` banners, so some of the edge always gets cropped.
// The tighter constraint is horizontal: see the note on `frame` below.
const BAND_TOP = 250;
const BAND_BOTTOM = 830;

// Brand palette, from sass/_colors.scss.
const C = {
  ink: '#060A24',
  mid: '#171043',
  deep: '#301868', // the hero-section overlay purple
  cyan: '#00A3E0', // Open Sky
  cyanLt: '#46BDE9',
  ice: '#CCF1FF',
  mint: '#2CD5C4', // Seafoam Mint
  coral: '#F65275', // Malibu Sunrise
  violet: '#963CBD',
  gold: '#FFB81C', // Golden Poppy
};

// ---------------------------------------------------------------- primitives

// mulberry32: seeded so regenerating never churns the committed images.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The one typeface for the whole set. Every theme that draws text uses this and
// nothing else, so labels look like they came from the same system; weights are
// 700 for a title and 600 for a label. Text depends on the font resolving at
// render time, which makes those themes reproducible per-machine, not everywhere.
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function weighted(r, pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let t = r() * total;
  for (const [value, w] of pairs) {
    t -= w;
    if (t <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

function arcPath(cx, cy, rad, a0, a1) {
  const at = (a) => [n(cx + rad * Math.cos(a)), n(cy + rad * Math.sin(a))];
  const [x0, y0] = at(a0);
  const [x1, y1] = at(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${rad} ${rad} 0 ${large} 1 ${x1} ${y1}`;
}

// The Valkey hexagon mark, read out of assets/Valkey-logo.svg so the artwork
// tracks the logo if it is ever updated.
const MARK = (() => {
  const svg = readFileSync(LOGO, 'utf8');
  const d = /\sd="([^"]+)"/.exec(svg);
  const box = /viewBox="([-\d.\s]+)"/.exec(svg);
  if (!d || !box) throw new Error(`Could not find a path and viewBox in ${LOGO}`);
  const [, , vw, vh] = box[1].trim().split(/\s+/).map(Number);
  return { d: d[1], vw, vh };
})();

// The official lockup, read the same way the mark is. `cls-2` is the hexagon and
// carries fill-rule evenodd; `cls-1` is the wordmark. Both are recoloured to one
// fill here, because these banners sit on dark ground and the brand's two-tone
// version is drawn for light.
const LOCKUP = (() => {
  const svg = readFileSync(LOCKUP_FILE, 'utf8');
  const box = /viewBox="([-\d.\s]+)"/.exec(svg);
  if (!box) throw new Error(`No viewBox in ${LOCKUP_FILE}`);
  const [, , vw, vh] = box[1].trim().split(/\s+/).map(Number);
  const paths = [...svg.matchAll(/<path[^>]*class="(cls-[12])"[^>]*\sd="([^"]+)"/g)].map((m) => ({
    d: m[2],
    evenodd: m[1] === 'cls-2',
  }));
  if (paths.length < 2) throw new Error(`Expected the lockup's paths in ${LOCKUP_FILE}`);
  return { paths, vw, vh };
})();

// The lockup, top-left cornered at (x, y) and scaled to the given height.
function lockup(x, y, height, fill = '#FFFFFF') {
  const s = height / LOCKUP.vh;
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${s.toFixed(5)})">` +
    LOCKUP.paths
      .map((p) => `<path d="${p.d}" fill="${fill}"${p.evenodd ? ' fill-rule="evenodd"' : ''}/>`)
      .join('') +
    `</g>`
  );
}

// The mark, centred on (cx, cy) at the given height. `fill-rule` is what hollows
// out the hexagon, so it has to be carried over from the source logo.
function mark(cx, cy, height, fill = '#FFFFFF') {
  const s = height / MARK.vh;
  return (
    `<g transform="translate(${n(cx - (MARK.vw * s) / 2)} ${n(cy - height / 2)}) scale(${s.toFixed(4)})">` +
    `<path d="${MARK.d}" fill="${fill}" fill-rule="evenodd"/></g>`
  );
}

// A glowing dot: soft halo plus a solid core. Drop `halo` for tightly packed
// runs of dots, where the default bloom overlaps into a haze.
function dot(x, y, rad, color, key, opacity = 1, halo = 4.5) {
  return (
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad * halo)}" fill="url(#h-${key})" opacity="${n(opacity * 0.7)}"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${color}" opacity="${n(opacity)}"/>`
  );
}

// --------------------------------------------------------------- atmosphere

function defs() {
  const halos = Object.entries({
    cyan: C.cyanLt,
    ice: C.ice,
    mint: C.mint,
    coral: C.coral,
    violet: C.violet,
    gold: C.gold,
  })
    .map(
      ([key, color]) =>
        `<radialGradient id="h-${key}">` +
        `<stop offset="0" stop-color="${color}" stop-opacity="0.75"/>` +
        `<stop offset="0.4" stop-color="${color}" stop-opacity="0.22"/>` +
        `<stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
        `</radialGradient>`
    )
    .join('\n    ');

  const blurs = [3, 8, 18, 40]
    .map(
      (s) =>
        `<filter id="blur${s}" x="-70%" y="-70%" width="240%" height="240%">` +
        `<feGaussianBlur stdDeviation="${s}"/></filter>`
    )
    .join('\n    ');

  return `  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.32" y2="1">
      <stop offset="0" stop-color="${C.ink}"/>
      <stop offset="0.48" stop-color="${C.mid}"/>
      <stop offset="1" stop-color="${C.deep}"/>
    </linearGradient>
    <radialGradient id="vignette" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${H / 2}" r="1180">
      <stop offset="0.5" stop-color="#03040F" stop-opacity="0"/>
      <stop offset="1" stop-color="#03040F" stop-opacity="0.8"/>
    </radialGradient>
    <radialGradient id="scrim">
      <stop offset="0" stop-color="${C.ink}" stop-opacity="0.72"/>
      <stop offset="0.6" stop-color="${C.ink}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${C.ink}" stop-opacity="0"/>
    </radialGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    ${halos}
    ${blurs}
  </defs>`;
}

// Themes are drawn on the full 1920x1080 grid, then framed. `zoom` crops in on a
// sub-rectangle of that grid so the motif fills more of the frame; `center` moves
// the crop off-centre when a composition isn't symmetric. Output stays 1920x1080.
//
// Mind the horizontal safe area when raising a zoom. On desktop the post page
// renders 810x400 and crops height; below 1024px it renders 200px tall in a much
// narrower column, so the crop flips to horizontal and keeps only the middle ~70%
// of the width. Anything that must stay whole (the mark, a label) belongs between
// 15% and 85% of the framed width. Streaks, chevrons and graph edges can bleed.
function frameBox(theme) {
  const zoom = theme.zoom ?? 1;
  const vw = W / zoom;
  const vh = H / zoom;
  const [cx, cy] = theme.center ?? [W / 2, H / 2];
  return { vx: clamp(cx - vw / 2, 0, W - vw), vy: clamp(cy - vh / 2, 0, H - vh), vw, vh };
}

function frame(theme) {
  const { vx, vy, vw, vh } = frameBox(theme);
  return `${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}`;
}

// The brand stamp: one mark in the upper left of every banner, at the same
// rendered size and the same inset whatever the theme's zoom is. It is placed in
// framed coordinates rather than on the 1920 grid, so a theme cropping in tightly
// does not push it off the edge or blow it up.
//
// Corner placement means the narrow 247x200 crop, which keeps only the middle 70%
// of the width, cuts it. That is what a corner costs; nothing else can sit there.
// Caption stickers: the post title set on solid light blocks in the bottom left, each
// with a drop shadow so it reads as sitting above the artwork rather than punched into
// it. The shadows are the only thing in the set that is pure decoration; the blocks
// worked without them, but flat on a dark field they read as holes.
// One block per line, because a block guarantees contrast where a scrim only hopes
// for it. Position is fixed: bottom left, every time, so a composition can be
// drawn to leave that corner alone.
const CAPTION_SLOT = { left: 0.05, bottom: 0.075, size: 62, gap: 8, padX: 22, padY: 13 };

// Rough advance widths, enough to size a block around a line of Helvetica. Getting
// this wrong by a few percent shows up as uneven padding, not as broken layout.
const GLYPH_W = { i: 0.27, j: 0.27, l: 0.27, t: 0.35, f: 0.32, r: 0.38, ' ': 0.29, m: 0.88, w: 0.76, M: 0.9, W: 0.96, I: 0.29 };
function textWidth(str, size) {
  let em = 0;
  for (const c of str) em += GLYPH_W[c] ?? (c === c.toUpperCase() && c !== c.toLowerCase() ? 0.7 : 0.58);
  return em * size;
}

// Wrap a title into at most two sticker lines. 32 characters is the smallest limit
// that fits the longest title in the set into two, and it puts the widest block at
// 1038 of the 1920; short theme titles still land on one line. Overflowing throws
// rather than silently dropping the tail.
function captionLines(text, max = 32) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > max && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2) {
    throw new Error(`Caption needs ${lines.length} lines, the slot holds 2: ${JSON.stringify(text)}`);
  }
  return lines;
}

function captionBlocks(theme, text) {
  const { vx, vy, vw, vh } = frameBox(theme);
  const px = vh / H;
  const size = CAPTION_SLOT.size * px;
  const padX = CAPTION_SLOT.padX * px;
  const padY = CAPTION_SLOT.padY * px;
  const gap = CAPTION_SLOT.gap * px;
  const lines = captionLines(text);
  const blockH = size + padY * 2;
  const x = vx + CAPTION_SLOT.left * vw;
  const bottom = vy + vh - CAPTION_SLOT.bottom * vh;
  const top = bottom - lines.length * blockH - (lines.length - 1) * gap;
  const rx = 4 * px;
  const box = (i) => ({
    y: top + i * (blockH + gap),
    w: textWidth(lines[i], size) + padX * 2,
  });

  // Three shadows per block: a tight one that reads as contact, a mid one for the
  // falloff, and a broad low pool that reads as height. Three because the ground is
  // already dark, so a single shadow that would be obvious on white barely registers
  // here. They are cast onto the artwork rather than onto each other, so every shadow
  // is drawn before every block; the stack is coplanar.
  const shadows = lines
    .map((_, i) => {
      const { y, w } = box(i);
      const r = (dy, blur, op) =>
        `<rect x="${n(x)}" y="${n(y + dy * px)}" width="${n(w)}" height="${n(blockH)}" ` +
        `rx="${n(rx)}" fill="${C.ink}" opacity="${op}" filter="url(#blur${blur})"/>`;
      return r(26, 40, '0.55') + r(10, 18, '0.5') + r(4, 8, '0.55');
    })
    .join('');

  const blocks = lines
    .map((line, i) => {
      const { y, w } = box(i);
      return (
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(blockH)}" rx="${n(rx)}" fill="${C.ice}"/>` +
        `<text x="${n(x + padX)}" y="${n(y + padY + size * 0.79)}" fill="${C.ink}" font-family="${FONT}" ` +
        `font-size="${n(size)}" font-weight="600">${esc(line)}</text>`
      );
    })
    .join('');

  return shadows + blocks;
}

function stamp(theme) {
  const { vx, vy, vw, vh } = frameBox(theme);
  const px = vh / H; // one output pixel, in framed units
  return `  <g opacity="0.95">${lockup(vx + 0.042 * vw, vy + 0.055 * vh, 88 * px)}</g>`;
}

// One background for the whole set: the sky gradient, a vignette and film grain.
// There used to be three settings here (a focal glow, `flat` without it, and
// `solid` with no gradient at all) and the result was that no two banners sat on
// the same ground. The gradient is the ground now, everywhere, and the only thing
// a theme varies is what it draws on top. The stamp and the caption sit above the
// vignette, because they are chrome rather than art and the vignette was visibly
// darkening the outer end of every caption block.
function wrap(theme, art, { chrome = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${frame(theme)}">
  <title>${theme.title}</title>
  <desc>${theme.desc}</desc>
${defs()}
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
${art}
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.055" style="mix-blend-mode:overlay"/>
${chrome ? `${stamp(theme)}${theme.caption ? `\n  <g>${captionBlocks(theme, theme.caption)}</g>` : ''}` : ''}
</svg>
`;
}

// Faint far-field specks. Only the space themes get them now: on everything else a
// purple gradient with scattered stars was the most generic thing in the set.
//
// The PRNG draws happen either way. Returning the stars or dropping them is decided
// after the fact, so suppressing them cannot shift anything else a theme draws.
let SPACE = false;
function starfield(r, count = 90) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = 0.8 + r() * 1.9;
    const op = 0.08 + r() * 0.3;
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${C.ice}" opacity="${n(op)}"/>`);
  }
  return SPACE ? `  <g>${out.join('')}</g>` : '';
}

// ------------------------------------------------------------------- themes

// Community: a constellation graph. Peers of every size, wired to their
// neighbours, with a handful of bright hubs.
function community(r) {
  const pts = [];
  let guard = 0;
  while (pts.length < 52 && guard++ < 20000) {
    const x = 70 + r() * (W - 140);
    const y = BAND_TOP + r() * (BAND_BOTTOM - BAND_TOP);
    if (pts.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 108 ** 2)) pts.push({ x, y, deg: 0 });
  }

  const edges = new Map();
  pts.forEach((p, i) => {
    const near = pts
      .map((q, j) => ({ j, d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 }))
      .filter((c) => c.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + (r() < 0.35 ? 1 : 0));
    for (const c of near) {
      const key = i < c.j ? `${i}-${c.j}` : `${c.j}-${i}`;
      if (!edges.has(key)) edges.set(key, [pts[i], pts[c.j]]);
      pts[i].deg++;
      pts[c.j].deg++;
    }
  });

  const lines = [...edges.values()]
    .map(([a, b]) => `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`)
    .join('');

  const hubs = [...pts].sort((a, b) => b.deg - a.deg).slice(0, 12);

  // The best-connected peers are drawn as the Valkey mark instead of a dot, at
  // descending sizes so the set doesn't read as a repeated stamp. Only hubs well
  // inside the frame qualify: the narrow-viewport crop is horizontal, and a
  // half-sliced logo reads as a mistake rather than as bleed.
  const MARK_SIZES = [86, 76, 68, 60, 54];
  const marked = new Map(
    hubs.filter((p) => p.x > 470 && p.x < 1450).slice(0, MARK_SIZES.length).map((p, i) => [p, MARK_SIZES[i]])
  );

  const dots = pts
    .filter((p) => !marked.has(p))
    .map((p) => {
      const hub = hubs.includes(p);
      const key = hub
        ? weighted(r, [['mint', 3], ['coral', 2], ['ice', 3]])
        : weighted(r, [['cyan', 6], ['mint', 2], ['violet', 1]]);
      const color = { cyan: C.cyanLt, mint: C.mint, coral: C.coral, violet: C.violet, ice: C.ice }[key];
      const rad = hub ? 9 + r() * 5 : 3 + r() * 3.5;
      return dot(p.x, p.y, rad, color, key, hub ? 1 : 0.55 + r() * 0.35);
    })
    .join('');

  const logos = [...marked]
    .map(
      ([p, size]) =>
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(size * 1.25)}" fill="url(#h-ice)" opacity="0.7"/>` +
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(size * 0.62)}" fill="url(#scrim)"/>` +
        `<g filter="url(#blur8)" opacity="0.45">${mark(p.x, p.y, size)}</g>` +
        `<g>${mark(p.x, p.y, size)}</g>`
    )
    .join('');

  return [
    starfield(r, 70),
    `  <g stroke="${C.cyan}" stroke-width="6" opacity="0.12" filter="url(#blur8)">${lines}</g>`,
    `  <g stroke="${C.cyanLt}" stroke-width="1.3" opacity="0.38">${lines}</g>`,
    `  <g>${dots}</g>`,
    `  <g>${logos}</g>`,
  ].join('\n');
}


// Memory efficiency: one keyspace, drawn twice over. Sparse and pitted on the
// left, compacted into a dense block on the right.
function memoryEfficiency(r) {
  const rows = 13;
  const cols = 30;
  const cellW = 15;
  const rowStep = 43;
  const y0 = 540 - ((rows - 1) * rowStep) / 2;

  const xs = [];
  let x = 300;
  for (let i = 0; i < cols; i++) {
    xs.push(x);
    x += 56 - 33 * (i / (cols - 1));
  }
  const right = xs[cols - 1] + cellW;

  const cells = [];
  xs.forEach((cx, i) => {
    const t = i / (cols - 1);
    for (let j = 0; j < rows; j++) {
      if (r() < 0.34 * (1 - t) ** 1.3) continue; // fragmentation holes
      const color = weighted(r, [
        [C.cyanLt, 60],
        [C.mint, 22 + t * 24],
        [C.ice, 10],
        [C.coral, 8 * (1 - t)],
      ]);
      const op = clamp(0.26 + t * 0.62 + (r() - 0.5) * 0.16, 0.15, 0.95);
      cells.push(
        `<rect x="${n(cx)}" y="${n(y0 + j * rowStep - 11)}" width="${cellW}" height="22" rx="3" fill="${color}" opacity="${n(op)}"/>`
      );
    }
  });

  // Motion: the compaction sweep, left to right.
  const sweep = [];
  for (let i = 0; i < 34; i++) {
    const y = BAND_TOP - 40 + r() * (BAND_BOTTOM - BAND_TOP + 80);
    const x1 = 120 + r() * 400;
    const x2 = x1 + 200 + r() * 700;
    sweep.push(
      `<line x1="${n(x1)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y)}" stroke="${C.cyanLt}" stroke-width="${n(0.8 + r() * 1.4)}" opacity="${n(0.05 + r() * 0.12)}" stroke-linecap="round"/>`
    );
  }

  return [
    starfield(r, 50),
    `  <g>${sweep.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.3">${cells.join('')}</g>`,
    `  <g>${cells.join('')}</g>`,
    `  <ellipse cx="${n(right + 6)}" cy="540" rx="90" ry="330" fill="url(#h-mint)" opacity="0.55"/>`,
    `  <line x1="${n(right + 8)}" y1="${n(y0 - 30)}" x2="${n(right + 8)}" y2="${n(y0 + (rows - 1) * rowStep + 30)}" stroke="${C.ice}" stroke-width="3" opacity="0.75"/>`,
  ].join('\n');
}

// Clustering and scale: the slot ring, a meshed core, and rings of headroom
// with new shards latching on.
function clustering(r) {
  const cx = 960;
  const cy = 540;
  const R = 292;
  const slots = 16;
  const step = (Math.PI * 2) / slots;

  const arcs = [];
  for (let i = 0; i < slots; i++) {
    const a0 = i * step + 0.045;
    const a1 = (i + 1) * step - 0.045;
    const color = weighted(r, [
      [C.cyan, 44],
      [C.cyanLt, 26],
      [C.mint, 18],
      [C.coral, 6],
      [C.violet, 6],
    ]);
    arcs.push(
      `<path d="${arcPath(cx, cy, R, a0, a1)}" fill="none" stroke="${color}" stroke-width="24" stroke-linecap="butt" opacity="${n(0.5 + r() * 0.45)}"/>`
    );
  }

  const ticks = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const inner = R + 26;
    const outer = inner + (i % 6 === 0 ? 18 : 8);
    ticks.push(
      `<line x1="${n(cx + inner * Math.cos(a))}" y1="${n(cy + inner * Math.sin(a))}" x2="${n(cx + outer * Math.cos(a))}" y2="${n(cy + outer * Math.sin(a))}" stroke="${C.cyanLt}" stroke-width="1.6" opacity="${i % 6 === 0 ? 0.4 : 0.18}"/>`
    );
  }

  // Meshed core: six shards, all-to-all.
  const core = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    core.push({ x: cx + 132 * Math.cos(a), y: cy + 132 * Math.sin(a) });
  }
  const mesh = [];
  for (let i = 0; i < core.length; i++) {
    for (let j = i + 1; j < core.length; j++) {
      mesh.push(
        `<line x1="${n(core[i].x)}" y1="${n(core[i].y)}" x2="${n(core[j].x)}" y2="${n(core[j].y)}" stroke="${C.cyanLt}" stroke-width="1.4" opacity="0.3"/>`
      );
    }
  }

  // Shards joining from the outer ring.
  const joining = [];
  for (const a of [-1.05, 0.55, 2.5]) {
    const jx = cx + 396 * Math.cos(a);
    const jy = cy + 396 * Math.sin(a);
    joining.push(
      `<line x1="${n(cx + (R + 22) * Math.cos(a))}" y1="${n(cy + (R + 22) * Math.sin(a))}" x2="${n(jx)}" y2="${n(jy)}" stroke="${C.mint}" stroke-width="1.8" stroke-dasharray="9 11" opacity="0.55"/>`,
      dot(jx, jy, 11, C.mint, 'mint')
    );
  }

  return [
    starfield(r, 60),
    `  <circle cx="${cx}" cy="${cy}" r="396" fill="none" stroke="${C.cyanLt}" stroke-width="1.6" stroke-dasharray="4 16" opacity="0.22"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="500" fill="none" stroke="${C.violet}" stroke-width="1.6" stroke-dasharray="4 22" opacity="0.16"/>`,
    `  <g>${ticks.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.4">${arcs.join('')}</g>`,
    `  <g>${arcs.join('')}</g>`,
    `  <g>${mesh.join('')}</g>`,
    `  <g>${core.map((p) => dot(p.x, p.y, 10, C.cyanLt, 'cyan')).join('')}</g>`,
    `  <g>${joining.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="120" fill="url(#h-violet)" opacity="0.5"/>`,
    // A scrim keeps the mesh diagonals from reading through the mark.
    `  <circle cx="${cx}" cy="${cy}" r="138" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.45">${mark(cx, cy, 198)}</g>`,
    `  <g>${mark(cx, cy, 198)}</g>`,
  ].join('\n');
}

// Releases and announcements: the Valkey chevron driving forward into a burst.
function release(r) {
  const cy = 540;
  const apex = 1530;

  // Nested chevrons, the same mark as the site's chevron artwork, aimed at the
  // burst rather than overlapping it.
  const chevrons = [
    { x: 620, w: 74, op: 0.1 },
    { x: 900, w: 74, op: 0.19 },
    { x: 1180, w: 74, op: 0.32 },
  ]
    .map(
      ({ x, w, op }) =>
        `<path d="M ${x - 250} 290 L ${x} ${cy} L ${x - 250} 790" fill="none" stroke="${C.cyanLt}" ` +
        `stroke-width="${w}" stroke-linejoin="miter" opacity="${op}"/>`
    )
    .join('');

  // Rays firing out of the apex.
  const rays = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + 0.06;
    const r0 = 152 + r() * 44; // clear of the mark, or they hide behind it
    const len = 34 + Math.pow(r(), 2) * 250;
    rays.push(
      `<line x1="${n(apex + Math.cos(a) * r0)}" y1="${n(cy + Math.sin(a) * r0)}" ` +
        `x2="${n(apex + Math.cos(a) * (r0 + len))}" y2="${n(cy + Math.sin(a) * (r0 + len))}" ` +
        `stroke="${weighted(r, [[C.gold, 6], [C.ice, 4], [C.mint, 2]])}" stroke-width="${n(1 + r() * 2)}" ` +
        `stroke-linecap="round" opacity="${n(0.12 + r() * 0.4)}"/>`
    );
  }

  const rings = [100, 160, 235, 320, 415]
    .map(
      (rad, i) =>
        `<circle cx="${apex}" cy="${cy}" r="${rad}" fill="none" stroke="${i < 2 ? C.gold : C.cyanLt}" ` +
        `stroke-width="${n(2.4 - i * 0.35)}" opacity="${n(0.4 - i * 0.06)}"/>`
    )
    .join('');

  const sparks = [];
  for (let i = 0; i < 44; i++) {
    const a = r() * Math.PI * 2;
    const d = 80 + Math.pow(r(), 0.7) * 420;
    sparks.push(
      `<circle cx="${n(apex + Math.cos(a) * d)}" cy="${n(cy + Math.sin(a) * d)}" r="${n(1.2 + r() * 3)}" ` +
        `fill="${weighted(r, [[C.gold, 5], [C.ice, 4], [C.mint, 2]])}" opacity="${n(0.25 + r() * 0.6)}"/>`
    );
  }

  return [
    starfield(r, 60),
    `  <g>${chevrons}</g>`,
    `  <g>${rays.join('')}</g>`,
    `  <g>${rings}</g>`,
    `  <g>${sparks.join('')}</g>`,
    `  <circle cx="${apex}" cy="${cy}" r="290" fill="url(#h-gold)" opacity="0.9"/>`,
    `  <circle cx="${apex}" cy="${cy}" r="164" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.6">${mark(apex, cy, 288)}</g>`,
    `  <g>${mark(apex, cy, 288)}</g>`,
  ].join('\n');
}

// Release, with a caption. Same nova, but centred and symmetric so the text has
// somewhere to sit: pass any short string (a version, "GA", an event name).
//
//   node generate.mjs release-version --text "9.0" --out release-9-0
//
function releaseVersion(r, { text }) {
  const cx = 960;
  const cy = 402;
  const label = esc(text);

  const rays = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + 0.06;
    const r0 = 162 + r() * 44; // clear of the mark, or they hide behind it
    const len = 34 + Math.pow(r(), 2) * 250;
    rays.push(
      `<line x1="${n(cx + Math.cos(a) * r0)}" y1="${n(cy + Math.sin(a) * r0)}" ` +
        `x2="${n(cx + Math.cos(a) * (r0 + len))}" y2="${n(cy + Math.sin(a) * (r0 + len))}" ` +
        `stroke="${weighted(r, [[C.gold, 6], [C.ice, 4], [C.mint, 2]])}" stroke-width="${n(1 + r() * 2)}" ` +
        `stroke-linecap="round" opacity="${n(0.12 + r() * 0.4)}"/>`
    );
  }

  const rings = [130, 200, 285, 385]
    .map(
      (rad, i) =>
        `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${i < 2 ? C.gold : C.cyanLt}" ` +
        `stroke-width="${n(2.4 - i * 0.35)}" opacity="${n(0.38 - i * 0.07)}"/>`
    )
    .join('');

  const sparks = [];
  for (let i = 0; i < 50; i++) {
    const a = r() * Math.PI * 2;
    const d = 100 + Math.pow(r(), 0.7) * 440;
    sparks.push(
      `<circle cx="${n(cx + Math.cos(a) * d)}" cy="${n(cy + Math.sin(a) * d)}" r="${n(1.2 + r() * 3)}" ` +
        `fill="${weighted(r, [[C.gold, 5], [C.ice, 4], [C.mint, 2]])}" opacity="${n(0.25 + r() * 0.6)}"/>`
    );
  }

  // A blurred dark copy under the caption, so it stays readable wherever the
  // rings and sparks happen to fall behind it.
  const caption = (fill, extra = '') =>
    `<text x="${cx}" y="712" fill="${fill}" text-anchor="middle" font-family="${FONT}" ` +
    `font-size="118" font-weight="700" letter-spacing="2"${extra}>${label}</text>`;

  return [
    starfield(r, 60),
    `  <g>${rays.join('')}</g>`,
    `  <g>${rings}</g>`,
    `  <g>${sparks.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="300" fill="url(#h-gold)" opacity="0.9"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="172" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.6">${mark(cx, cy, 300)}</g>`,
    `  <g>${mark(cx, cy, 300)}</g>`,
    `  <g filter="url(#blur8)">${caption(C.ink, ' opacity="0.85"')}</g>`,
    `  ${caption('#FFFFFF')}`,
  ].join('\n');
}

// A heraldic shield centred on (cx, cy): flat top, straight sides, curved point.
// Shared by the shield themes so they are one silhouette under four treatments.
function shieldPath(cx, cy, w, h, shoulder = 0.56) {
  const hw = w / 2;
  const top = cy - h / 2;
  const sy = top + h * shoulder;
  const bottom = top + h;
  return (
    `M ${n(cx - hw)} ${n(top)} L ${n(cx + hw)} ${n(top)} L ${n(cx + hw)} ${n(sy)} ` +
    `C ${n(cx + hw)} ${n(sy + h * 0.24)} ${n(cx + hw * 0.47)} ${n(bottom - h * 0.075)} ${n(cx)} ${n(bottom)} ` +
    `C ${n(cx - hw * 0.47)} ${n(bottom - h * 0.075)} ${n(cx - hw)} ${n(sy + h * 0.24)} ${n(cx - hw)} ${n(sy)} Z`
  );
}

// Security, woven: the same shield as `security` with the speckle taken out, so
// the only thing inside it is the lattice it is made of.
//
// The proportions are not parameters. Five variations on them were built and all five
// lost to this one; see Rejected in the README before trying a sixth.
function securityShieldClean() {
  const cx = 960;
  const cy = 545;
  const path = shieldPath(cx, cy, 570, 580);

  const lattice = [];
  for (let k = -30; k <= 30; k++) {
    const off = cx + k * 46;
    lattice.push(
      `<line x1="${n(off - 300)}" y1="245" x2="${n(off + 300)}" y2="845" stroke="${C.cyanLt}" stroke-width="2"/>`,
      `<line x1="${n(off + 300)}" y1="245" x2="${n(off - 300)}" y2="845" stroke="${C.cyanLt}" stroke-width="2"/>`
    );
  }
  const weave = lattice.join('');

  return [
    `  <clipPath id="shieldClean"><path d="${path}"/></clipPath>`,
    `  <linearGradient id="shieldCleanFill" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${C.cyan}" stop-opacity="0.3"/>` +
      `<stop offset="1" stop-color="${C.violet}" stop-opacity="0.12"/></linearGradient>`,
    `  <g clip-path="url(#shieldClean)">` +
      `<path d="${path}" fill="url(#shieldCleanFill)"/>` +
      `<g opacity="0.5">${weave}</g></g>`,
    // Radiance, the way the retired `security` theme did it: a wide blurred pass on
    // the outline, a mint halo behind the mark, and a blurred copy of the mark under
    // the sharp one. Three passes, all behind or under the thing they light.
    `  <path d="${path}" fill="none" stroke="${C.cyanLt}" stroke-width="34" opacity="0.3" filter="url(#blur40)"/>`,
    `  <path d="${path}" fill="none" stroke="${C.cyanLt}" stroke-width="16" opacity="0.45" filter="url(#blur18)"/>`,
    `  <path d="${path}" fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.95"/>`,
    `  <circle cx="${cx}" cy="${n(cy - 10)}" r="250" fill="url(#h-mint)" opacity="0.45"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(cx, cy - 10, 300)}</g>`,
    `  <g>${mark(cx, cy - 10, 300)}</g>`,
  ].join('\n');
}

// ------------------------------------------------- security reporting in 2026
//
// Three readings of one post: reports arrive faster than they can be judged
// (`security-queue-depth`), most findings do not survive an adversarial second
// look (`security-triage-funnel`), and a fix that removed one instance left the
// same defect standing in a second implementation (`security-same-bug-twice`).

// Benchmarks: throughput bars climbing, latency percentiles holding flat above
// them. The two motifs are stacked rather than overlaid so neither muddies the
// other: bars own everything below y=560, the series sit above it.
function observability(r) {
  const left = 260;
  const right = 1330; // labels sit outside this, still inside the mobile crop

  const grid = [];
  for (let i = 0; i <= 7; i++) {
    const y = 300 + i * 76;
    grid.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.cyanLt}" stroke-width="1.1" opacity="${i === 7 ? 0.3 : 0.1}"/>`);
  }
  for (let i = 0; i <= 12; i++) {
    const x = left + (i * (right - left)) / 12;
    grid.push(`<line x1="${n(x)}" y1="300" x2="${n(x)}" y2="836" stroke="${C.cyanLt}" stroke-width="1.1" opacity="0.07"/>`);
  }

  // Throughput bars. Built from positive increments then scaled to hit the top,
  // so the run is uneven but never dips: every bar is at least as tall as the
  // one before it.
  const bins = 40;
  const bw = (right - left) / bins;
  const BAR_MIN = 26;
  const BAR_MAX = 268; // tops out at y=568, clear of the flat series above
  const steps = Array.from({ length: bins - 1 }, () => 0.25 + r() * 1.5);
  const perStep = (BAR_MAX - BAR_MIN) / steps.reduce((a, b) => a + b, 0);
  const heights = [BAR_MIN];
  for (const step of steps) heights.push(heights[heights.length - 1] + step * perStep);

  const hist = heights.flatMap((h, i) => {
    const x = left + i * bw + 3;
    const w = bw - 6;
    const lift = (h - BAR_MIN) / (BAR_MAX - BAR_MIN); // brighter as it grows
    return [
      `<rect x="${n(x)}" y="${n(836 - h)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${C.cyan}" opacity="${n(0.22 + lift * 0.44)}"/>`,
      `<line x1="${n(x)}" y1="${n(836 - h)}" x2="${n(x + w)}" y2="${n(836 - h)}" stroke="${C.cyanLt}" stroke-width="2" opacity="${n(0.32 + lift * 0.5)}"/>`,
    ];
  });

  // Latency percentiles: flat, bouncing around their own level. P99 rides above
  // P50 throughout, so the pair never crosses.
  const series = [
    { label: 'P99', color: C.mint, key: 'mint', level: 372, amp: 46 },
    { label: 'P50', color: C.coral, key: 'coral', level: 486, amp: 34 },
  ].map(({ label, color, key, level, amp }) => {
    const pts = [];
    let v = level;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      // Pulled back toward the level every step, so it wanders without drifting.
      v += (level - v) * 0.45 + (r() - 0.5) * amp;
      pts.push({ x: left + t * (right - left), y: clamp(v, 320, 540) });
    }
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${n(p.x)} ${n(p.y)}`).join(' ');
    const end = pts[pts.length - 1];
    return (
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="9" opacity="0.3" filter="url(#blur8)"/>` +
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.6" opacity="0.9"/>` +
      pts.filter((_, i) => i % 3 === 0).map((p) => dot(p.x, p.y, 5, color, key, 0.9)).join('') +
      `<text x="${n(right + 30)}" y="${n(end.y + 15)}" fill="${color}" opacity="0.95" ` +
      `font-family="${FONT}" font-size="44" font-weight="700" letter-spacing="1">${label}</text>`
    );
  });

  return [
    starfield(r, 55),
    `  <g>${grid.join('')}</g>`,
    `  <g>${hist.join('')}</g>`,
    `  <g>${series.join('')}</g>`,
  ].join('\n');
}

// Data structures: hash buckets chaining out, with a skiplist underneath.
function dataStructures(r) {
  const bucketX = 330;
  const buckets = 12;
  const bucketStep = 48;
  const y0 = 540 - ((buckets - 1) * bucketStep) / 2;

  // A hash fan on the far left feeding the bucket array.
  const fan = [];
  for (let i = 0; i < buckets; i++) {
    const y = y0 + i * bucketStep;
    fan.push(
      `<line x1="252" y1="540" x2="${bucketX - 34}" y2="${n(y)}" stroke="${C.violet}" stroke-width="1.3" opacity="0.22"/>`
    );
  }

  // Bucket array with separate chaining.
  const chains = [];
  for (let i = 0; i < buckets; i++) {
    const y = y0 + i * bucketStep;
    chains.push(
      `<rect x="${bucketX - 32}" y="${n(y - 15)}" width="64" height="30" rx="5" fill="${C.cyan}" fill-opacity="0.12" stroke="${C.cyanLt}" stroke-width="1.8" opacity="0.6"/>`
    );
    const links = 1 + Math.floor(r() * 5);
    let x = bucketX + 32;
    for (let j = 0; j < links; j++) {
      const nx = x + 62 + r() * 26;
      chains.push(
        `<line x1="${n(x)}" y1="${n(y)}" x2="${n(nx - 24)}" y2="${n(y)}" stroke="${C.cyanLt}" stroke-width="1.6" opacity="0.45"/>`,
        `<rect x="${n(nx - 24)}" y="${n(y - 12)}" width="48" height="24" rx="4" fill="${weighted(r, [[C.cyan, 6], [C.mint, 3], [C.violet, 2]])}" opacity="${n(0.45 + r() * 0.4)}"/>`
      );
      x = nx + 24;
    }
  }

  // Skip list: five express lanes over a shared base row.
  const sx = 1030;
  const sw = 700;
  const cells = 17;
  const skip = [];
  for (let lvl = 0; lvl < 5; lvl++) {
    const y = 540 + ((4 - lvl) - 2) * 62;
    const stride = 1 << lvl;
    const lane = [];
    for (let i = 0; i < cells; i += stride) lane.push(sx + (i * sw) / (cells - 1));
    skip.push(
      `<path d="${lane.map((x, i) => `${i ? 'L' : 'M'} ${n(x)} ${n(y)}`).join(' ')}" fill="none" stroke="${C.mint}" stroke-width="${n(1.4 + lvl * 0.5)}" opacity="${n(0.26 + lvl * 0.13)}"/>`,
      lane.map((x) => dot(x, y, 4 + lvl, C.mint, 'mint', 0.5 + lvl * 0.11, 3.2)).join('')
    );
  }

  // Vertical drop lines tie the express lanes back to the base row.
  const drops = [];
  for (let i = 0; i < cells; i += 2) {
    const x = sx + (i * sw) / (cells - 1);
    drops.push(`<line x1="${n(x)}" y1="${n(540 - 124)}" x2="${n(x)}" y2="${n(540 + 124)}" stroke="${C.mint}" stroke-width="1.1" opacity="0.14"/>`);
  }

  return [
    starfield(r, 55),
    // Ambient glow goes behind the motif. Drawn on top it veils the whole thing
    // and the chains read as smudged.
    `  <circle cx="${bucketX}" cy="540" r="420" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <circle cx="${n(sx + sw / 2)}" cy="540" r="470" fill="url(#h-mint)" opacity="0.15"/>`,
    `  <g>${fan.join('')}</g>`,
    `  <g>${chains.join('')}</g>`,
    `  <g>${drops.join('')}</g>`,
    `  <g>${skip.join('')}</g>`,
    dot(252, 540, 9, C.violet, 'violet'),
  ].join('\n');
}

// How-to: a track of steps with the current one lit.
function howTo(r) {
  const y = 540;
  const left = 300;
  const right = 1620;
  const count = 5;
  const active = 3;

  const out = [
    `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.cyanLt}" stroke-width="2" stroke-dasharray="10 14" opacity="0.3"/>`,
  ];
  for (let i = 0; i < count; i++) {
    const x = left + (i * (right - left)) / (count - 1);
    const done = i < active;
    const isActive = i === active;
    if (done && i > 0) {
      out.push(
        `<line x1="${n(x - (right - left) / (count - 1))}" y1="${y}" x2="${n(x)}" y2="${y}" stroke="${C.mint}" stroke-width="3" opacity="0.6"/>`
      );
    }
    const color = done ? C.mint : isActive ? C.ice : C.cyanLt;
    const key = done ? 'mint' : isActive ? 'ice' : 'cyan';
    out.push(
      `<circle cx="${n(x)}" cy="${y}" r="${isActive ? 52 : 40}" fill="url(#h-${key})" opacity="${isActive ? 0.9 : 0.4}"/>`,
      `<circle cx="${n(x)}" cy="${y}" r="${isActive ? 44 : 34}" fill="${C.ink}" fill-opacity="0.45" stroke="${color}" stroke-width="${isActive ? 3.4 : 2.2}" opacity="${done || isActive ? 0.95 : 0.5}"/>`
    );
    if (done) {
      out.push(
        `<path d="M ${n(x - 13)} ${y} L ${n(x - 3)} ${y + 11} L ${n(x + 14)} ${y - 11}" fill="none" stroke="${C.mint}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
      );
    } else if (isActive) {
      out.push(
        `<path d="M ${n(x - 10)} ${y - 15} L ${n(x + 9)} ${y} L ${n(x - 10)} ${y + 15}" fill="none" stroke="${C.ice}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    } else {
      out.push(`<circle cx="${n(x)}" cy="${y}" r="6" fill="${C.cyanLt}" opacity="0.5"/>`);
    }
  }

  // Instruction text, suggested rather than written.
  const bars = [];
  for (const [ymin, ymax] of [[280, 420], [660, 800]]) {
    let cy = ymin;
    while (cy < ymax) {
      let x = 260 + r() * 200;
      while (x < 1660) {
        const w = 40 + r() * 190;
        if (x + w > 1660) break;
        bars.push(
          `<rect x="${n(x)}" y="${n(cy)}" width="${n(w)}" height="8" rx="4" fill="${weighted(r, [[C.ice, 7], [C.cyanLt, 3], [C.mint, 1]])}" opacity="${n(0.08 + r() * 0.16)}"/>`
        );
        x += w + 18 + r() * 60;
      }
      cy += 30;
    }
  }

  return [starfield(r, 50), `  <g>${bars.join('')}</g>`, `  <g>${out.join('')}</g>`].join('\n');
}

// ---------------------------------------------------- atomic slot migration
//
// The emphasis is on *atomic*: one contiguous range of slots moves as a single
// indivisible unit, with a clean before and after rather than a trickle. That is
// what separates this from `clustering`, which is about the slot ring existing at
// all rather than about anything moving.

const SLOTS = 16;
const SLOT_STEP = (Math.PI * 2) / SLOTS;

// One shard's slot ring. `vacated` slots are drawn as dashed holes, `arrived`
// slots bright mint; everything else is a normal owned slot.
function slotRing(r, cx, cy, rad, { vacated = [], arrived = [], width = 22 } = {}) {
  const out = [];
  for (let i = 0; i < SLOTS; i++) {
    const a0 = i * SLOT_STEP + 0.05;
    const a1 = (i + 1) * SLOT_STEP - 0.05;
    const d = arcPath(cx, cy, rad, a0, a1);
    if (vacated.includes(i)) {
      out.push(
        `<path d="${d}" fill="none" stroke="${C.cyanLt}" stroke-width="${width}" opacity="0.32" stroke-dasharray="6 8"/>`
      );
    } else if (arrived.includes(i)) {
      out.push(
        `<path d="${d}" fill="none" stroke="${C.mint}" stroke-width="${width + 4}" opacity="0.35" filter="url(#blur8)"/>`,
        `<path d="${d}" fill="none" stroke="${C.mint}" stroke-width="${width}" opacity="0.95"/>`
      );
    } else {
      out.push(
        `<path d="${d}" fill="none" stroke="${weighted(r, [[C.cyan, 6], [C.cyanLt, 3], [C.violet, 1]])}" ` +
          `stroke-width="${width}" opacity="${n(0.45 + r() * 0.35)}"/>`
      );
    }
  }
  return out.join('');
}

// Two shards side by side, with a chevron arrow driving a stream of slots from
// the old owner to the new one. The stream is built from the same segments the
// rings are, so what is moving is visibly the same thing the rings are made of.
// A magnifier picks out a few of them mid-flight.
function slotMigrationRings(r) {
  const cy = 528;
  const src = 520;
  const dst = 1400;
  const R = 180;
  const SEG = 21; // matches the ring segment stroke width
  const FROM = [15, 0, 1, 2]; // faces right, toward the target
  const TO = [7, 8, 9, 10]; // faces left, toward the source

  const x0 = src + R + 16;
  const xEnd = 1168;
  const tip = dst - R - 30;

  // Three staggered lanes of slot segments in flight.
  const blocks = [];
  for (const ly of [cy - 34, cy, cy + 34]) {
    let x = x0 + r() * 46;
    while (x < xEnd) {
      const len = 42 + r() * 36;
      if (x + len > xEnd) break;
      blocks.push({
        x,
        y: ly,
        len,
        color: weighted(r, [[C.mint, 6], [C.ice, 3], [C.cyanLt, 2]]),
        op: 0.5 + ((x - x0) / (xEnd - x0)) * 0.45,
      });
      x += len + 9 + r() * 15;
    }
  }
  const drawBlocks = (boost = 0) =>
    blocks
      .map(
        (b) =>
          `<rect x="${n(b.x)}" y="${n(b.y - SEG / 2)}" width="${n(b.len)}" height="${SEG}" rx="${SEG / 2}" ` +
          `fill="${b.color}" opacity="${n(Math.min(1, b.op + boost))}"/>`
      )
      .join('');

  // Magnifier over the stream. Inside the lens the same segments are redrawn
  // larger, over a scrim so they replace rather than double up on the originals.
  const lx = 940;
  const ly = cy;
  const lr = 118;
  const hand = 0.75; // radians, down and to the right, clear of the arrow
  const h0 = [lx + Math.cos(hand) * (lr + 4), ly + Math.sin(hand) * (lr + 4)];
  const h1 = [lx + Math.cos(hand) * (lr + 96), ly + Math.sin(hand) * (lr + 96)];

  // Chevron arrowhead, the same mark the site uses for forward motion.
  const chev = (x, w, sw, op) =>
    `<path d="M ${n(x - w)} ${n(cy - w * 1.18)} L ${n(x)} ${n(cy)} L ${n(x - w)} ${n(cy + w * 1.18)}" ` +
    `fill="none" stroke="${C.mint}" stroke-width="${sw}" stroke-linejoin="miter" opacity="${op}"/>`;

  return [
    starfield(r, 55),
    `  <circle cx="${src}" cy="${cy}" r="320" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <circle cx="${dst}" cy="${cy}" r="320" fill="url(#h-mint)" opacity="0.22"/>`,
    `  <clipPath id="lens"><circle cx="${lx}" cy="${ly}" r="${lr}"/></clipPath>`,
    `  <g opacity="0.35" filter="url(#blur18)">${drawBlocks()}</g>`,
    `  <g>${drawBlocks()}</g>`,
    `  ${chev(tip - 62, 34, 12, 0.32)}`,
    `  <g filter="url(#blur18)" opacity="0.6">${chev(tip, 52, 20, 1)}</g>`,
    `  ${chev(tip, 52, 17, 0.98)}`,
    `  <g clip-path="url(#lens)">` +
      `<circle cx="${lx}" cy="${ly}" r="${lr}" fill="${C.ink}" opacity="0.55"/>` +
      `<g transform="translate(${lx} ${ly}) scale(1.75) translate(${-lx} ${-ly})">${drawBlocks(0.25)}</g>` +
      `</g>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="${C.ice}" opacity="0.05"/>`,
    `  <line x1="${n(h0[0])}" y1="${n(h0[1])}" x2="${n(h1[0])}" y2="${n(h1[1])}" stroke="${C.ice}" stroke-width="22" stroke-linecap="round" opacity="0.3" filter="url(#blur8)"/>`,
    `  <line x1="${n(h0[0])}" y1="${n(h0[1])}" x2="${n(h1[0])}" y2="${n(h1[1])}" stroke="${C.ice}" stroke-width="17" stroke-linecap="round" opacity="0.92"/>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${C.ice}" stroke-width="16" opacity="0.3" filter="url(#blur8)"/>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${C.ice}" stroke-width="10.5" opacity="0.95"/>`,
    `  <path d="${arcPath(lx, ly, lr - 22, -2.5, -1.7)}" fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.4" stroke-linecap="round"/>`,
    `  <g>${slotRing(r, src, cy, R, { vacated: FROM, width: SEG })}</g>`,
    `  <g>${slotRing(r, dst, cy, R, { arrived: TO, width: SEG })}</g>`,
    `  <g>${mark(src, cy, 112)}</g>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(dst, cy, 112)}</g>`,
    `  <g>${mark(dst, cy, 112)}</g>`,
  ].join('\n');
}

// Atomic slot migration, with the lens given the frame. Same composition as
// `atomic-slot-migration`, which is left alone: two shards, a stream of slot
// segments between them, a magnifier on the stream. What changes is the
// hierarchy, not the drawing.
//
// Idea: one contiguous range of slots leaves one shard and lands on another, and
// you can watch it move.
// Focal: the magnifier. It is the largest object, the brightest, and the only
// thing carrying a halo. The rings, the stream and the chevron sit under it as
// context.

// Keyspace scan: a cursor holding one bounded window of a large keyspace, with
// the keys behind it already visited and the rest still ahead. The hop track
// Slot migration under a lens: the same two-instance migration as
// `atomic-slot-migration`, recomposed so the lens is unambiguously the subject.
// The instances and the stream are context, drawn quiet; the only place anything
// is bright or varied is inside the glass, where the migrating objects differ in
// length and colour. Solid background, because a starfield and a spotlight are
// two more textures competing with the thing you are meant to look at.



// Large key: an even field of ordinary keys, and one key of exactly the same
// shape standing where a whole block of them used to be. The grid it displaces is
// removed cell by cell so the field stays aligned around it, rather than leaving
// ragged holes where a wide tile happened to overlap.
function largeKey(r) {
  const pitchX = 140;
  const pitchY = 40;
  const tileH = 22;
  const tileMaxW = 110; // never wider than the pitch, or tiles cross columns
  const x0 = 205;
  const y0 = 240;
  const cols = 12;
  const rows = 16;
  // The block of ordinary keys the big one stands in place of.
  const BLOCK = { c0: 3, c1: 7, r0: 5, r1: 10 };
  const big = {
    x: x0 + BLOCK.c0 * pitchX,
    y: y0 + BLOCK.r0 * pitchY,
    w: (BLOCK.c1 - BLOCK.c0) * pitchX + tileMaxW,
    h: (BLOCK.r1 - BLOCK.r0) * pitchY + tileH,
  };

  const tiles = [];
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < rows; i++) {
      if (c >= BLOCK.c0 && c <= BLOCK.c1 && i >= BLOCK.r0 && i <= BLOCK.r1) continue;
      const x = x0 + c * pitchX;
      const y = y0 + i * pitchY;
      const w = 70 + r() * (tileMaxW - 70);
      tiles.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${tileH}" rx="11" fill="${C.ice}" opacity="${n(0.1 + r() * 0.09)}"/>`
      );
    }
  }

  return [
    starfield(r, 50),
    `  <ellipse cx="${n(big.x + big.w / 2)}" cy="${n(big.y + big.h / 2)}" rx="500" ry="420" fill="url(#h-coral)" opacity="0.18"/>`,
    `  <g>${tiles.join('')}</g>`,
    `  <rect x="${n(big.x)}" y="${n(big.y)}" width="${n(big.w)}" height="${n(big.h)}" rx="${n(big.h / 2)}" fill="${C.coral}" opacity="0.32"/>`,
    `  <rect x="${n(big.x)}" y="${n(big.y)}" width="${n(big.w)}" height="${n(big.h)}" rx="${n(big.h / 2)}" fill="none" stroke="${C.coral}" stroke-width="18" opacity="0.3" filter="url(#blur18)"/>`,
    `  <rect x="${n(big.x)}" y="${n(big.y)}" width="${n(big.w)}" height="${n(big.h)}" rx="${n(big.h / 2)}" fill="none" stroke="${C.coral}" stroke-width="4" opacity="0.95"/>`,
  ].join('\n');
}

// ------------------------------------------------------------- bloom filters
//
// Two halves of one feature, drawn as two themes rather than one crowded image.
// `bloom-bit-array` is the write side: several hash functions turn one item into
// a handful of set bits. `bloom-verdict` is the read side, and the honest half:
// a clear bit proves absence, every bit set is only a probability.

// Bloom filter, write side. One item at the top, k hash nodes fanning out of it,
// k cells lit in the array below. The array already carries bits from earlier
// items, so this item's five read as its own signature over a populated field.
function bloomBitArray(r) {
  const CELLS = 42;
  const STEP = 32;
  const CW = 20;
  const K = 5;
  const x0 = 290;
  const top = 545;
  const CH = 190;
  const hy = 432; // the row of hash nodes
  const mx = 960;
  const my = 250;
  const bx = (i) => x0 + i * STEP;
  const bc = (i) => bx(i) + CW / 2;

  // Positions spread across the middle of the array, jittered so the run does
  // not look like a ruler, and kept inside the narrow crop's safe width.
  const picks = [];
  for (let k = 0; k < K; k++) picks.push(7 + Math.round(k * 5.8) + Math.floor(r() * 5) - 2);

  const prior = [];
  for (let i = 0; i < CELLS; i++) if (!picks.includes(i) && r() < 0.38) prior.push(i);

  const slots = [];
  for (let i = 0; i < CELLS; i++) {
    slots.push(
      `<rect x="${n(bx(i))}" y="${top}" width="${CW}" height="${CH}" rx="4" fill="${C.cyan}" fill-opacity="0.05" stroke="${C.cyanLt}" stroke-width="1.4" opacity="0.28"/>`
    );
  }
  const already = prior.map(
    (i) =>
      `<rect x="${n(bx(i))}" y="${top}" width="${CW}" height="${CH}" rx="4" fill="${C.cyanLt}" opacity="${n(0.3 + r() * 0.2)}"/>`
  );

  // The fan: mark -> hash node -> the one cell that node sets. Routed as a bus
  // with right angles only. Swept diagonals here read as decoration and fight the
  // vertical drops underneath them.
  const busY = 366;
  const spokes = [];
  const nodes = [];
  const drops = [];
  picks.forEach((i, k) => {
    // Each hash node sits directly above the cell it sets, so its drop can be a
    // plain vertical.
    const hx = bc(i);
    spokes.push(
      `<line x1="${n(hx)}" y1="${busY}" x2="${n(hx)}" y2="${hy - 20}" stroke="${C.violet}" stroke-width="1.8" opacity="0.45"/>`
    );
    nodes.push(
      `<circle cx="${n(hx)}" cy="${hy}" r="30" fill="url(#h-violet)" opacity="0.55"/>`,
      `<circle cx="${n(hx)}" cy="${hy}" r="17" fill="${C.ink}" fill-opacity="0.55" stroke="${C.ice}" stroke-width="2.2" opacity="0.9"/>`,
      `<circle cx="${n(hx)}" cy="${hy}" r="5" fill="${C.ice}" opacity="0.85"/>`
    );
    drops.push(
      // Straight verticals: a hash node sits directly over the cell it sets, so
      // the drop reads as an index rather than as routing.
      `<line x1="${n(bc(i))}" y1="${hy + 18}" x2="${n(bc(i))}" y2="${top - 8}" stroke="${C.mint}" stroke-width="2.4" opacity="0.6"/>`
    );
  });

  // The trunk down from the mark and the bus the hash nodes hang off.
  const bus = [
    `<line x1="${mx}" y1="${my + 72}" x2="${mx}" y2="${busY}" stroke="${C.violet}" stroke-width="1.8" opacity="0.45"/>`,
    `<line x1="${n(bc(picks[0]))}" y1="${busY}" x2="${n(bc(picks[picks.length - 1]))}" y2="${busY}" stroke="${C.violet}" stroke-width="1.8" opacity="0.45"/>`,
  ];

  const lit = picks.flatMap((i) => [
    `<ellipse cx="${n(bc(i))}" cy="${top + CH / 2}" rx="48" ry="${n(CH * 0.8)}" fill="url(#h-mint)" opacity="0.8"/>`,
    `<rect x="${n(bx(i))}" y="${top}" width="${CW}" height="${CH}" rx="4" fill="${C.mint}" opacity="0.95"/>`,
  ]);

  // A baseline under the array, so the strip reads as an indexed row of bits.
  const axisY = top + CH + 22;
  const ticks = [];
  for (let i = 0; i <= CELLS; i += 6) {
    ticks.push(
      `<line x1="${n(bx(i))}" y1="${axisY}" x2="${n(bx(i))}" y2="${axisY + 16}" stroke="${C.ice}" stroke-width="2.4" opacity="0.5"/>`
    );
  }

  return [
    starfield(r, 50),
    // No background wash and no halo on the mark: the only lit things are the hash
    // nodes and the cells they set, which is what the image is about.
    `  <g>${slots.join('')}</g>`,
    `  <g>${already.join('')}</g>`,
    `  <g>${bus.join('')}</g>`,
    `  <g>${spokes.join('')}</g>`,
    `  <g>${drops.join('')}</g>`,
    `  <g>${lit.join('')}</g>`,
    `  <g>${nodes.join('')}</g>`,
    `  <line x1="${n(x0 - 14)}" y1="${axisY}" x2="${n(bx(CELLS - 1) + CW + 14)}" y2="${axisY}" stroke="${C.ice}" stroke-width="3" opacity="0.72"/>`,
    `  <g>${ticks.join('')}</g>`,
    `  <g>${mark(mx, my, 150)}</g>`,
  ].join('\n');
}

// ----------------------------------------------------------- valkey-search
//
// Two readings of one claim: a query lands in an indexed field, and only a
// small part of that field has to be looked at. What separates them is where the
// narrowing happens — around the query (`searchNearest`), or inside one indexed
// field (`searchFieldIndex`).

// Vector similarity: the query sits at the centre of an indexed field and only
// the handful of vectors inside its search radius light up. Everything past the
// radius stays dark, because nothing out there was scanned.
function searchNearest(r) {
  const cx = 960;
  const cy = 540;
  const RING = 336; // the search radius: the furthest kept neighbour sits on it

  // The indexed field. Nothing is allowed inside the radius: whatever falls in
  // the ring is a match, so a stray dim dot in there would contradict the one
  // thing this image says.
  const pts = [];
  let guard = 0;
  while (pts.length < 116 && guard++ < 40000) {
    const x = 150 + r() * 1620;
    const y = 188 + r() * 706;
    if (Math.hypot(x - cx, y - cy) < RING + 34) continue;
    if (pts.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 54 ** 2)) pts.push({ x, y });
  }

  // Short links between close pairs, kept faint: the field is an index, not a
  // spray of dots. Bright enough to read as structure and no brighter, or it
  // turns into the `community` constellation.
  const links = [];
  pts.forEach((p, i) => {
    pts
      .map((q, j) => ({ q, j, d: Math.hypot(p.x - q.x, p.y - q.y) }))
      .filter((c) => c.j > i && c.d < 172)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .forEach((c) => links.push(`<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(c.q.x)}" y2="${n(c.q.y)}"/>`));
  });

  const field = pts
    .map((p) => {
      const key = weighted(r, [['cyan', 7], ['violet', 2], ['ice', 1]]);
      const color = { cyan: C.cyanLt, violet: C.violet, ice: C.ice }[key];
      return dot(p.x, p.y, 3.4 + r() * 2.8, color, key, 0.34 + r() * 0.3, 3);
    })
    .join('');

  // The kept neighbours are placed rather than sampled, spread evenly around the
  // query so the neighbourhood reads as one at banner size. The first is pinned
  // to the radius, which is what makes the ring mean anything.
  const K = 6;
  const hits = [];
  for (let i = 0; i < K; i++) {
    const a = -Math.PI / 2 + (i / K) * Math.PI * 2 + (r() - 0.5) * 0.74;
    const d = i === 0 ? RING - 12 : 200 + r() * (RING - 214);
    hits.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
  }

  const spokes = hits
    .map((h) => `<line x1="${cx}" y1="${cy}" x2="${n(h.x)}" y2="${n(h.y)}"/>`)
    .join('');
  const lit = hits
    .map(
      (h) =>
        dot(h.x, h.y, 13, C.mint, 'mint', 1, 4) +
        `<circle cx="${n(h.x)}" cy="${n(h.y)}" r="29" fill="none" stroke="${C.ice}" stroke-width="2.2" opacity="0.55"/>`
    )
    .join('');

  return [
    starfield(r, 55),
    `  <circle cx="${cx}" cy="${cy}" r="470" fill="url(#h-cyan)" opacity="0.16"/>`,
    `  <g stroke="${C.cyanLt}" stroke-width="1.2" opacity="0.16">${links.join('')}</g>`,
    `  <g>${field}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${RING}" fill="none" stroke="${C.ice}" stroke-width="14" opacity="0.16" filter="url(#blur18)"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${RING}" fill="none" stroke="${C.ice}" stroke-width="2.4" stroke-dasharray="10 14" opacity="0.5"/>`,
    `  <g stroke="${C.mint}" stroke-width="9" opacity="0.3" filter="url(#blur8)">${spokes}</g>`,
    `  <g stroke="${C.mint}" stroke-width="2.6" opacity="0.8">${spokes}</g>`,
    `  <g>${lit}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="128" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(cx, cy, 176)}</g>`,
    `  <g>${mark(cx, cy, 176)}</g>`,
  ].join('\n');
}

// Secondary indexing: hash and JSON records give up one field each, that field
// is what the sorted index is built from, and a query brackets a short run of it
// instead of walking the records.
function searchFieldIndex(r) {
  const laneY = 650;
  const cardTop = 170;
  const cardW = 196;
  const cardH = 178;
  const step = 262;
  const cardX = [0, 1, 2, 3].map((i) => 469 + i * step);

  // Records. One field per record is the indexed one, drawn mint; the rest are
  // along for the ride. It is the bottom field so its drop line leaves the card
  // without crossing the others, which otherwise reads as a smudge.
  const KEYED = 3;
  const cards = [];
  const keyed = [];
  cardX.forEach((x, ci) => {
    cards.push(
      `<rect x="${x}" y="${cardTop}" width="${cardW}" height="${cardH}" rx="12" ` +
        `fill="${C.cyan}" fill-opacity="0.1" stroke="${C.cyanLt}" stroke-width="2.2" opacity="0.75"/>`
    );
    for (let f = 0; f < 4; f++) {
      const y = cardTop + 30 + f * 38;
      const w = f === KEYED ? cardW - 48 : 62 + r() * (cardW - 130);
      if (f === KEYED) {
        keyed.push({ x: x + cardW / 2, y: y + 7, ci });
        cards.push(
          `<rect x="${x + 24}" y="${n(y)}" width="${n(w)}" height="15" rx="7" fill="${C.mint}" opacity="0.9"/>`,
          `<rect x="${x + 24}" y="${n(y)}" width="${n(w)}" height="15" rx="7" fill="${C.mint}" opacity="0.4" filter="url(#blur8)"/>`
        );
      } else {
        cards.push(
          `<rect x="${x + 24}" y="${n(y)}" width="${n(w)}" height="11" rx="5" fill="${C.ice}" opacity="${n(0.24 + r() * 0.14)}"/>`
        );
      }
    }
  });

  // The sorted index. Entry heights rise and fall so it reads as ordered values
  // rather than as a barcode.
  const n0 = 250;
  const n1 = 1680;
  const count = 52;
  const HIT = [24, 25, 26]; // the matched run, centred in the frame
  const entries = [];
  const at = (i) => n0 + (i * (n1 - n0)) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = at(i);
    if (HIT.includes(i)) continue;
    const h = 16 + Math.abs(Math.sin(i * 0.41)) * 44 + r() * 12;
    entries.push(
      `<rect x="${n(x - 5)}" y="${n(laneY - h)}" width="10" height="${n(h)}" rx="4" ` +
        `fill="${weighted(r, [[C.cyanLt, 7], [C.violet, 2], [C.ice, 1]])}" opacity="${n(0.3 + r() * 0.3)}"/>`
    );
  }
  const hits = HIT.map((i) => {
    const x = at(i);
    const h = 78;
    return (
      `<rect x="${n(x - 7)}" y="${n(laneY - h)}" width="14" height="${h}" rx="6" fill="${C.mint}" opacity="0.4" filter="url(#blur8)"/>` +
      `<rect x="${n(x - 7)}" y="${n(laneY - h)}" width="14" height="${h}" rx="6" fill="${C.mint}" opacity="0.95"/>`
    );
  }).join('');

  // Drop lines: each record's indexed field value takes its place in the order.
  // One of them lands inside the matched run, which is the whole point.
  const lands = [39, 25, 12, 45];
  const drops = keyed
    .map(
      (k, i) =>
        `<path d="M ${n(k.x)} ${n(k.y)} L ${n(k.x)} ${n(k.y + 58)} L ${n(at(lands[i]))} ${n(laneY - 96)} L ${n(at(lands[i]))} ${n(laneY - 74)}" ` +
        `fill="none" stroke="${C.mint}" stroke-width="1.6" stroke-dasharray="7 9" opacity="${lands[i] === HIT[1] ? 0.62 : 0.3}"/>`
    )
    .join('');

  // The query: a caliper under the lane holding exactly the matched run.
  const bl = at(HIT[0]) - 26;
  const br = at(HIT[HIT.length - 1]) + 26;
  const by = laneY + 42;
  const caliper =
    `<path d="M ${n(bl)} ${n(by - 26)} L ${n(bl)} ${n(by)} L ${n(br)} ${n(by)} L ${n(br)} ${n(by - 26)}" ` +
    `fill="none" stroke="${C.ice}" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>` +
    `<line x1="${n((bl + br) / 2)}" y1="${n(by)}" x2="${n((bl + br) / 2)}" y2="${n(by + 44)}" stroke="${C.ice}" stroke-width="3.4" opacity="0.9"/>`;

  const mx = (bl + br) / 2;
  const my = 832;

  return [
    starfield(r, 55),
    `  <circle cx="960" cy="${cardTop + cardH / 2}" r="520" fill="url(#h-cyan)" opacity="0.12"/>`,
    `  <circle cx="${n(mx)}" cy="${n(laneY + 40)}" r="330" fill="url(#h-mint)" opacity="0.24"/>`,
    `  <g>${cards.join('')}</g>`,
    `  <g>${drops}</g>`,
    `  <line x1="${n0 - 40}" y1="${laneY}" x2="${n1 + 40}" y2="${laneY}" stroke="${C.ice}" stroke-width="10" opacity="0.2" filter="url(#blur8)"/>`,
    `  <line x1="${n0 - 40}" y1="${laneY}" x2="${n1 + 40}" y2="${laneY}" stroke="${C.ice}" stroke-width="2.6" opacity="0.7"/>`,
    `  <g>${entries.join('')}</g>`,
    `  <g>${hits}</g>`,
    `  ${caliper}`,
    `  <circle cx="${n(mx)}" cy="${my}" r="118" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(mx, my, 162)}</g>`,
    `  <g>${mark(mx, my, 162)}</g>`,
  ].join('\n');
}

// --------------------------------------------------------- client libraries
//
// Three takes on one idea: many languages, one protocol, one server. What has to
// read geometrically is that the callers are visibly *different from each other*
// — not the uniform traffic `performance` draws — and that whatever they send
// arrives in the same shape at a single server.

// Ports: six unlike callers reaching in from outside, each ending in the same
// port at the same radius. Outside that circle every spoke is drawn differently;
// inside it every spoke is identical, and it is the same server at the middle.
function clientPorts(r) {
  const cx = 960;
  const cy = 540;
  const PORT = 212;
  const NODE = 450;

  const callers = [
    { deg: 0, color: C.gold, key: 'gold', kind: 'blocks', glyph: 'ring' },
    { deg: 60, color: C.coral, key: 'coral', kind: 'beads', glyph: 'square' },
    { deg: 120, color: C.violet, key: 'violet', kind: 'sawtooth', glyph: 'triangle' },
    { deg: 180, color: C.cyanLt, key: 'cyan', kind: 'ladder', glyph: 'diamond' },
    { deg: 240, color: C.mint, key: 'mint', kind: 'ticks', glyph: 'rings' },
    { deg: 300, color: C.cyan, key: 'cyan', kind: 'chevrons', glyph: 'plus' },
  ];

  const outer = [];
  const nodes = [];
  const ports = [];
  const inner = [];

  for (const c of callers) {
    // The callers sit on an ellipse rather than a circle, so the star fills a
    // 16:9 frame. The ports stay on one true circle: that boundary is the part
    // that has to be identical.
    const a = (c.deg * Math.PI) / 180;
    const dx = NODE * 1.26 * Math.cos(a);
    const dy = NODE * Math.sin(a);
    const dist = Math.hypot(dx, dy);
    const ux = dx / dist;
    const uy = dy / dist;
    const px = -uy; // unit normal, across the spoke
    const py = ux;
    const at = (t, off = 0) => [cx + ux * t + px * off, cy + uy * t + py * off];
    const deg = n((Math.atan2(dy, dx) * 180) / Math.PI);
    const from = PORT + 38;
    const to = dist - 46;

    // Faint spine, so the grammars read as one channel each.
    outer.push(
      `<line x1="${n(at(from - 14)[0])}" y1="${n(at(from - 14)[1])}" x2="${n(at(to + 18)[0])}" y2="${n(at(to + 18)[1])}" ` +
        `stroke="${c.color}" stroke-width="2" opacity="0.14"/>`
    );

    if (c.kind === 'blocks') {
      for (let t = from; t < to; ) {
        const len = 34 + r() * 30;
        if (t + len > to) break;
        const [x, y] = at(t + len / 2);
        outer.push(
          `<rect x="${n(x - len / 2)}" y="${n(y - 13)}" width="${n(len)}" height="26" rx="7" fill="${c.color}" ` +
            `opacity="${n(0.45 + r() * 0.42)}" transform="rotate(${deg} ${n(x)} ${n(y)})"/>`
        );
        t += len + 18 + r() * 12;
      }
    } else if (c.kind === 'beads') {
      for (let t = from; t < to; t += 42 + r() * 10) {
        const [x, y] = at(t);
        outer.push(dot(x, y, 7 + r() * 3.5, c.color, c.key, 0.55 + r() * 0.4, 3));
      }
    } else if (c.kind === 'sawtooth') {
      const zig = [];
      let flip = 1;
      for (let t = from; t <= to; t += 30) {
        zig.push(at(t, 15 * flip));
        flip = -flip;
      }
      outer.push(
        `<path d="${zig.map((q, i) => `${i ? 'L' : 'M'} ${n(q[0])} ${n(q[1])}`).join(' ')}" fill="none" ` +
          `stroke="${c.color}" stroke-width="4" stroke-linejoin="round" opacity="0.8"/>`
      );
    } else if (c.kind === 'ladder') {
      for (const o of [-12, 12]) {
        const [x1, y1] = at(from, o);
        const [x2, y2] = at(to, o);
        outer.push(
          `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c.color}" stroke-width="3.4" opacity="0.7"/>`
        );
      }
      for (let t = from + 8; t < to; t += 38) {
        const [x1, y1] = at(t, -12);
        const [x2, y2] = at(t, 12);
        outer.push(
          `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c.color}" stroke-width="3" ` +
            `opacity="${n(0.4 + r() * 0.35)}"/>`
        );
      }
    } else if (c.kind === 'ticks') {
      const [x1, y1] = at(from);
      const [x2, y2] = at(to);
      outer.push(
        `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c.color}" stroke-width="4.5" opacity="0.65"/>`
      );
      for (let t = from + 6; t < to; t += 26) {
        const [ax, ay] = at(t);
        const [bx, by] = at(t, 16);
        outer.push(
          `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="${c.color}" stroke-width="3" ` +
            `stroke-linecap="round" opacity="${n(0.35 + r() * 0.4)}"/>`
        );
      }
    } else {
      for (let t = from + 10; t < to; t += 40) {
        const [tipx, tipy] = at(t);
        const [lx, ly] = at(t - 20, -18);
        const [rx2, ry2] = at(t - 20, 18);
        outer.push(
          `<path d="M ${n(lx)} ${n(ly)} L ${n(tipx)} ${n(tipy)} L ${n(rx2)} ${n(ry2)}" fill="none" ` +
            `stroke="${c.color}" stroke-width="4" stroke-linejoin="miter" opacity="${n(0.4 + r() * 0.45)}"/>`
        );
      }
    }

    // The caller itself, a different shape for every one of them.
    const [gx, gy] = at(dist);
    nodes.push(`<circle cx="${n(gx)}" cy="${n(gy)}" r="50" fill="url(#h-${c.key})" opacity="0.5"/>`);
    if (c.glyph === 'ring') {
      nodes.push(
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="29" fill="${C.ink}" fill-opacity="0.4" stroke="${c.color}" stroke-width="5"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="8" fill="${c.color}"/>`
      );
    } else if (c.glyph === 'square') {
      nodes.push(
        `<rect x="${n(gx - 26)}" y="${n(gy - 26)}" width="52" height="52" rx="9" fill="${C.ink}" fill-opacity="0.4" ` +
          `stroke="${c.color}" stroke-width="5"/>`,
        `<rect x="${n(gx - 8)}" y="${n(gy - 8)}" width="16" height="16" rx="3" fill="${c.color}"/>`
      );
    } else if (c.glyph === 'triangle') {
      nodes.push(
        `<path d="M ${n(gx)} ${n(gy - 32)} L ${n(gx + 30)} ${n(gy + 21)} L ${n(gx - 30)} ${n(gy + 21)} Z" fill="${C.ink}" ` +
          `fill-opacity="0.4" stroke="${c.color}" stroke-width="5" stroke-linejoin="round"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy + 5)}" r="7" fill="${c.color}"/>`
      );
    } else if (c.glyph === 'diamond') {
      nodes.push(
        `<rect x="${n(gx - 22)}" y="${n(gy - 22)}" width="44" height="44" rx="7" fill="${C.ink}" fill-opacity="0.4" ` +
          `stroke="${c.color}" stroke-width="5" transform="rotate(45 ${n(gx)} ${n(gy)})"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="7" fill="${c.color}"/>`
      );
    } else if (c.glyph === 'rings') {
      nodes.push(
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="30" fill="none" stroke="${c.color}" stroke-width="3" ` +
          `stroke-dasharray="7 8" opacity="0.8"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="17" fill="${C.ink}" fill-opacity="0.4" stroke="${c.color}" stroke-width="5"/>`
      );
    } else {
      nodes.push(
        `<path d="M ${n(gx - 28)} ${n(gy)} L ${n(gx + 28)} ${n(gy)} M ${n(gx)} ${n(gy - 28)} L ${n(gx)} ${n(gy + 28)}" ` +
          `stroke="${c.color}" stroke-width="7" stroke-linecap="round" opacity="0.9"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="9" fill="${C.ink}" fill-opacity="0.6" stroke="${c.color}" stroke-width="4"/>`
      );
    }

    // The port. Identical for every caller, at the same radius, so the ring it
    // implies is the protocol rather than anything the server exposes per client.
    const [ox, oy] = at(PORT);
    ports.push(
      `<circle cx="${n(ox)}" cy="${n(oy)}" r="52" fill="url(#h-ice)" opacity="0.45"/>`,
      `<rect x="${n(ox - 15)}" y="${n(oy - 36)}" width="30" height="72" rx="12" fill="${C.ink}" fill-opacity="0.4" ` +
        `stroke="${C.ice}" stroke-width="5" opacity="0.8" transform="rotate(${deg} ${n(ox)} ${n(oy)})"/>`,
      `<rect x="${n(ox - 5)}" y="${n(oy - 22)}" width="10" height="44" rx="5" fill="${C.ice}" opacity="0.95" ` +
        `transform="rotate(${deg} ${n(ox)} ${n(oy)})"/>`
    );

    // Inside the port circle: the same three segments, every spoke.
    for (let t = 118; t + 28 <= PORT - 26; t += 40) {
      const [sx, sy] = at(t + 14);
      inner.push(
        `<rect x="${n(sx - 14)}" y="${n(sy - 9)}" width="28" height="18" rx="9" fill="${C.ice}" opacity="0.9" ` +
          `transform="rotate(${deg} ${n(sx)} ${n(sy)})"/>`
      );
    }
  }

  return [
    starfield(r, 55),
    `  <circle cx="${cx}" cy="${cy}" r="330" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <g>${outer.join('')}</g>`,
    `  <g filter="url(#blur8)" opacity="0.45">${inner.join('')}</g>`,
    `  <g>${inner.join('')}</g>`,
    `  <g>${ports.join('')}</g>`,
    `  <g>${nodes.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="140" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(cx, cy, 196)}</g>`,
    `  <g>${mark(cx, cy, 196)}</g>`,
  ].join('\n');
}


// Workload fan-out: one incoming workload arrives as a single bundled stream,
// and the store decomposes it into the primitives it already has, each landing
// in a differently shaped structure.
function workloadFanout(r) {
  const hx = 640;
  const hy = 540;
  const glyphX = 1206;

  // Inbound: one workload arriving as many requests, funnelling into the split.
  // Straight dashed lanes rather than long curves, so it reads as traffic.
  const lanes = [
    { y: 240, color: C.cyanLt, key: 'cyan' },
    { y: 390, color: C.mint, key: 'mint' },
    { y: 540, color: C.ice, key: 'ice' },
    { y: 690, color: C.violet, key: 'violet' },
    { y: 840, color: C.gold, key: 'gold' },
  ];

  // Cubic lanes out of the hub, with packets in flight along each one.
  const bez = (t, p0, p1, p2, p3) => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  };
  const wires = [];
  const packets = [];
  for (const lane of lanes) {
    const x0 = hx + 116;
    const c1 = x0 + 250;
    const c2 = glyphX - 300;
    const d =
      `M ${x0} ${hy} C ${n(c1)} ${hy} ${n(c2)} ${lane.y} ${glyphX - 24} ${lane.y}`;
    wires.push(
      `<path d="${d}" fill="none" stroke="${lane.color}" stroke-width="9" opacity="0.3" filter="url(#blur8)"/>`,
      `<path d="${d}" fill="none" stroke="${lane.color}" stroke-width="3.6" opacity="0.72"/>`
    );
    for (const t of [0.32, 0.58, 0.82]) {
      const px = bez(t, x0, c1, c2, glyphX - 24);
      const py = bez(t, hy, hy, lane.y, lane.y);
      packets.push(dot(px, py, 6.5, lane.color, lane.key, 0.9, 3.2));
    }
  }

  // Five distinct shapes for five distinct primitives.
  const glyphs = [];

  // 1. A ring of slot segments.
  const rc = [glyphX + 80, lanes[0].y];
  const rr = 58;
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2 + 0.07;
    const a1 = ((i + 1) / 10) * Math.PI * 2 - 0.07;
    glyphs.push(
      `<path d="${arcPath(rc[0], rc[1], rr, a0, a1)}" fill="none" stroke="${weighted(r, [[C.cyan, 5], [C.cyanLt, 4], [C.ice, 2]])}" ` +
        `stroke-width="15" opacity="${n(0.55 + r() * 0.4)}"/>`
    );
  }

  // 2. A chain of linked entries.
  for (let i = 0; i < 4; i++) {
    const x = glyphX + i * 62;
    if (i) glyphs.push(`<line x1="${n(x - 14)}" y1="${lanes[1].y}" x2="${n(x)}" y2="${lanes[1].y}" stroke="${C.mint}" stroke-width="2.4" opacity="0.6"/>`);
    glyphs.push(
      `<rect x="${n(x)}" y="${n(lanes[1].y - 21)}" width="48" height="42" rx="7" fill="${C.mint}" ` +
        `opacity="${n(0.42 + r() * 0.42)}"/>`
    );
  }

  // 3. A ranked stack, longest score at the top.
  for (let i = 0; i < 5; i++) {
    glyphs.push(
      `<rect x="${glyphX}" y="${n(lanes[2].y - 58 + i * 29)}" width="${n(228 - i * 34)}" height="19" rx="9.5" fill="${C.ice}" ` +
        `opacity="${n(0.8 - i * 0.11)}"/>`
    );
  }

  // 4. A bit-addressed grid, some bits set.
  for (let c = 0; c < 8; c++) {
    for (let j = 0; j < 4; j++) {
      const x = glyphX + c * 28;
      const y = lanes[3].y - 53 + j * 28;
      const set = r() < 0.5;
      glyphs.push(
        set
          ? `<rect x="${n(x)}" y="${n(y)}" width="22" height="22" rx="4" fill="${C.violet}" opacity="${n(0.6 + r() * 0.35)}"/>`
          : `<rect x="${n(x + 0.9)}" y="${n(y + 0.9)}" width="20.2" height="20.2" rx="4" fill="none" stroke="${C.violet}" stroke-width="1.8" opacity="0.34"/>`
      );
    }
  }

  // 5. An embedding, a run of magnitudes.
  for (let i = 0; i < 11; i++) {
    const h = 22 + r() * 88;
    glyphs.push(
      `<rect x="${n(glyphX + i * 22)}" y="${n(lanes[4].y - h / 2)}" width="14" height="${n(h)}" rx="7" fill="${C.gold}" ` +
        `opacity="${n(0.45 + r() * 0.45)}"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <circle cx="${hx}" cy="${hy}" r="360" fill="url(#h-violet)" opacity="0.3"/>`,
    `  <ellipse cx="${glyphX + 120}" cy="${hy}" rx="300" ry="430" fill="url(#h-cyan)" opacity="0.12"/>`,
    `  <g>${wires.join('')}</g>`,
    `  <g>${packets.join('')}</g>`,
    `  <g>${glyphs.join('')}</g>`,
    `  <circle cx="${hx}" cy="${hy}" r="158" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(hx, hy, 196)}</g>`,
    `  <g>${mark(hx, hy, 196)}</g>`,
  ].join('\n');
}

// -------------------------------------------------------- connection storms
//
// `connStormSpike` is the shape of the storm in time: quiet, a wall of
// simultaneous connection attempts, quiet again, with the part of the wall the
// server cannot accept in one pass stacked above its capacity. It does not draw
// a gate, which is `security-acl`'s job.

// The surge itself, as a timeline of attempts. Every cell is one connection, so
// the spike reads as clients piling up rather than as an abstract bar, and the
// coral above the dashed ceiling is the overshoot.
function connStormSpike(r) {
  const base = 862; // the server, accepting along its baseline
  const left = 150;
  const right = 1770;
  const cols = 88;
  const step = (right - left) / cols;
  const cw = step - 5.5;
  const ch = 15;
  const gap = 3;
  const peakCol = 44; // the wall sits on the centre line
  const ceiling = base - 310; // what can be accepted in one pass

  const cells = [];
  const over = [];
  for (let i = 0; i < cols; i++) {
    const x = left + i * step;
    const d = (i - peakCol) / 4.1;
    const env = Math.exp(-d * d); // sharp: a wall, not a hill
    const quiet = 1 + Math.floor(r() * 2.4);
    const count = Math.max(quiet, Math.round(env * 34 + (r() - 0.5) * env * 6));
    for (let j = 0; j < count; j++) {
      const y = base - (j + 1) * (ch + gap);
      const shed = y < ceiling;
      const lift = Math.min(1, j / 16);
      (shed ? over : cells).push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(cw)}" height="${ch}" rx="3" fill="${
          shed ? C.coral : weighted(r, [[C.cyan, 6], [C.cyanLt, 4], [C.ice, 1]])
        }" opacity="${n(shed ? 0.7 + r() * 0.26 : 0.32 + lift * 0.5 + r() * 0.12)}"/>`
      );
    }
  }

  // A little of the overshoot shaken loose off the top of the wall.
  const spray = [];
  for (let i = 0; i < 9; i++) {
    const x = left + peakCol * step + (r() - 0.5) * 170;
    const y = 214 + r() * 50;
    spray.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(9 + r() * 13)}" height="9" rx="4.5" fill="${C.coral}" opacity="${n(0.16 + r() * 0.34)}"/>`
    );
  }

  const ceilLine =
    `<line x1="${left - 60}" y1="${ceiling}" x2="${right + 60}" y2="${ceiling}" stroke="${C.ice}" ` +
    `stroke-width="2.6" stroke-dasharray="22 16" opacity="0.55"/>`;

  return [
    starfield(r, 55),
    `  <ellipse cx="${n(left + peakCol * step)}" cy="${n(ceiling - 30)}" rx="330" ry="380" fill="url(#h-coral)" opacity="0.2"/>`,
    `  <ellipse cx="960" cy="${n(base - 40)}" rx="820" ry="150" fill="url(#h-cyan)" opacity="0.22"/>`,
    `  <g>${spray.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.35">${cells.join('')}${over.join('')}</g>`,
    `  <g>${cells.join('')}</g>`,
    `  <g>${over.join('')}</g>`,
    `  <g filter="url(#blur8)" opacity="0.4">${ceilLine}</g>`,
    `  ${ceilLine}`,
    `  <line x1="${left - 60}" y1="${base}" x2="${right + 60}" y2="${base}" stroke="${C.ice}" stroke-width="3.4" opacity="0.85"/>`,
  ].join('\n');
}

// ------------------------------------------------------------- operations
//
// Both ops themes carry the same one idea: at scale you are looking at a fleet,
// not a server. `ops-fleet-triage` says the fleet is uniform and only a handful
// of it needs you; `ops-rolling-wave` says a change crosses that fleet one group
// at a time. Neither reuses the slot ring (`clustering`) or a chart
// (`benchmarks`).

// ------------------------------------------------------------- valkey-bundle
//
// One package that carries several capabilities you would otherwise install
// one at a time. Two readings of that: containment (`bundleCrate`) and delivery
// (`bundleOneInstall`). In both, every module has to be a *different* shape --
// repeated identical blocks say "many of the same" instead of "several
// different capabilities in one package".

// A base course of identical primitives, with progressively fewer and larger
// composites resting on them, ending in one thing.

// One declared spec on the left, the running set it produces on the right.
// Nothing to the right of the fan is authored: every pod is a copy of the panel.
function k8sSpecFanout(r) {
  const sx = 496;
  const sw = 296;
  const sTop = 250;
  const sH = 580;
  const cols = [1012, 1188, 1364];
  const rows = [300, 540, 780];
  const tile = 140;
  const railX0 = 924;
  const railX1 = 1452;

  // The declared values, suggested as indented rows rather than written out. One
  // row is picked out in gold: the replica count, which the right-hand side is a
  // picture of.
  const spec = [];
  let ly = sTop + 96;
  let i = 0;
  while (ly < sTop + sH - 34) {
    const indent = weighted(r, [[0, 3], [1, 5], [2, 3]]) * 24;
    const w = 52 + r() * (sw - 116 - indent);
    const key = i === 3;
    spec.push(
      `<rect x="${n(sx + 30 + indent)}" y="${n(ly)}" width="${n(w)}" height="9" rx="4.5" ` +
        `fill="${key ? C.gold : weighted(r, [[C.ice, 7], [C.cyanLt, 4]])}" ` +
        `opacity="${key ? 0.92 : n(0.24 + r() * 0.32)}"/>`
    );
    ly += 33;
    i++;
  }

  const panel =
    `<rect x="${sx}" y="${sTop}" width="${sw}" height="${sH}" rx="22" fill="${C.ink}" fill-opacity="0.5" ` +
      `stroke="${C.ice}" stroke-width="3" opacity="0.9"/>` +
    `<line x1="${sx + 24}" y1="${sTop + 70}" x2="${sx + sw - 24}" y2="${sTop + 70}" stroke="${C.ice}" ` +
      `stroke-width="1.8" opacity="0.45"/>` +
    `<g opacity="0.92">${mark(sx + 56, sTop + 38, 38)}</g>`;

  // One curve per row of instances, all of them leaving the same spec.
  const fanPaths = rows
    .map((y) => {
      const x0 = sx + sw + 10;
      return `<path d="M ${n(x0)} 540 C ${n(x0 + 130)} 540 ${railX0 - 130} ${n(y)} ${railX0} ${n(y)}"/>`;
    })
    .join('');

  const rails = rows
    .map(
      (y) =>
        `<line x1="${railX0}" y1="${n(y)}" x2="${railX1}" y2="${n(y)}" stroke="${C.cyanLt}" ` +
        `stroke-width="2" opacity="0.32"/>`
    )
    .join('');

  const packets = rows
    .map((y) =>
      [0.1, 0.4, 0.7]
        .map((t) => dot(railX0 + t * (railX1 - railX0), y, 4.5, C.mint, 'mint', 0.75, 3))
        .join('')
    )
    .join('');

  const glows = [];
  const pods = [];
  for (const y of rows) {
    for (const x of cols) {
      glows.push(`<circle cx="${x}" cy="${y}" r="104" fill="url(#h-cyan)" opacity="0.2"/>`);
      pods.push(
        `<rect x="${n(x - tile / 2)}" y="${n(y - tile / 2)}" width="${tile}" height="${tile}" rx="26" ` +
          `fill="${C.cyan}" fill-opacity="0.18" stroke="${C.cyanLt}" stroke-width="2.4" opacity="0.9"/>`,
        `<circle cx="${n(x)}" cy="${n(y)}" r="54" fill="url(#scrim)"/>`,
        mark(x, y, 72),
        dot(x + tile / 2 - 24, y - tile / 2 + 24, 5, C.mint, 'mint', 0.9, 3)
      );
    }
  }

  return [
    starfield(r, 55),
    `  <circle cx="${n(sx + sw / 2)}" cy="540" r="340" fill="url(#h-violet)" opacity="0.32"/>`,
    `  <circle cx="1188" cy="540" r="470" fill="url(#h-cyan)" opacity="0.14"/>`,
    `  <g stroke="${C.cyanLt}" stroke-width="13" fill="none" opacity="0.16" filter="url(#blur8)">${fanPaths}</g>`,
    `  <g stroke="${C.cyanLt}" stroke-width="2.4" fill="none" opacity="0.55">${fanPaths}</g>`,
    `  <g>${rails}</g>`,
    `  <g>${packets}</g>`,
    `  <g>${glows.join('')}</g>`,
    `  <g>${pods.join('')}</g>`,
    `  <g>${panel}</g>`,
    `  <g>${spec.join('')}</g>`,
  ].join('\n');
}

// The declared replica count and the instances converging on it: six slots
// bracketed in gold because that is what was asked for, four of them filled, one
// instance still on its way up and one slot still empty.
function k8sDesiredCount(r) {
  const xs = [560, 720, 880, 1040, 1200, 1360];
  const slotY = 312;
  const padY = 828;
  const box = 122;
  const top = 226;
  const FILLED = 4;
  const RISING = 4;

  const bx0 = xs[0] - box / 2 - 16;
  const bx1 = xs[xs.length - 1] + box / 2 + 16;

  // The declared count: a span with one gold pip per instance asked for.
  const bracket =
    `<path d="M ${n(bx0)} ${n(top + 28)} L ${n(bx0)} ${n(top)} L ${n(bx1)} ${n(top)} L ${n(bx1)} ${n(top + 28)}" ` +
      `fill="none" stroke="${C.gold}" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>` +
    xs.map((x) => `<circle cx="${n(x)}" cy="${n(top)}" r="7" fill="${C.gold}" opacity="0.95"/>`).join('');

  const trackTop = slotY + box / 2 + 18;
  const slots = [];
  const tracks = [];
  const pads = [];

  xs.forEach((x, i) => {
    const filled = i < FILLED;
    const rising = i === RISING;

    pads.push(
      `<rect x="${n(x - 44)}" y="${n(padY)}" width="88" height="12" rx="6" ` +
        `fill="${filled || rising ? C.mint : C.cyanLt}" opacity="${filled || rising ? 0.8 : 0.3}"/>`
    );

    if (filled) {
      tracks.push(
        `<line x1="${n(x)}" y1="${n(padY - 6)}" x2="${n(x)}" y2="${n(trackTop)}" stroke="${C.mint}" ` +
          `stroke-width="3.2" opacity="0.75"/>`,
        [0.3, 0.56, 0.82]
          .map((t) => dot(x, padY - 6 - t * (padY - 6 - trackTop), 4.5, C.mint, 'mint', 0.7, 3))
          .join('')
      );
    } else if (rising) {
      const py = 600;
      tracks.push(
        `<line x1="${n(x)}" y1="${n(padY - 6)}" x2="${n(x)}" y2="${n(py + 54)}" stroke="${C.mint}" ` +
          `stroke-width="3.2" opacity="0.75"/>`,
        `<line x1="${n(x)}" y1="${n(py - 54)}" x2="${n(x)}" y2="${n(trackTop)}" stroke="${C.mint}" ` +
          `stroke-width="2.4" stroke-dasharray="8 12" opacity="0.45"/>`,
        `<circle cx="${n(x)}" cy="${n(py)}" r="82" fill="url(#h-mint)" opacity="0.45"/>`,
        `<rect x="${n(x - 46)}" y="${n(py - 46)}" width="92" height="92" rx="20" fill="${C.mint}" ` +
          `fill-opacity="0.16" stroke="${C.mint}" stroke-width="2.4" opacity="0.85"/>`,
        `<g opacity="0.8">${mark(x, py, 52)}</g>`
      );
    } else {
      tracks.push(
        `<line x1="${n(x)}" y1="${n(padY - 6)}" x2="${n(x)}" y2="${n(trackTop)}" stroke="${C.cyanLt}" ` +
          `stroke-width="2.2" stroke-dasharray="8 14" opacity="0.3"/>`
      );
    }

    if (filled) {
      slots.push(
        `<circle cx="${n(x)}" cy="${n(slotY)}" r="92" fill="url(#h-cyan)" opacity="0.24"/>`,
        `<rect x="${n(x - box / 2)}" y="${n(slotY - box / 2)}" width="${box}" height="${box}" rx="24" ` +
          `fill="${C.cyan}" fill-opacity="0.2" stroke="${C.cyanLt}" stroke-width="2.6" opacity="0.92"/>`,
        `<circle cx="${n(x)}" cy="${n(slotY)}" r="50" fill="url(#scrim)"/>`,
        mark(x, slotY, 66),
        dot(x + box / 2 - 22, slotY - box / 2 + 22, 5, C.mint, 'mint', 0.9, 3)
      );
    } else {
      // Declared but not yet running: the slot is drawn, the instance is a ghost.
      slots.push(
        `<rect x="${n(x - box / 2)}" y="${n(slotY - box / 2)}" width="${box}" height="${box}" rx="24" ` +
          `fill="none" stroke="${C.ice}" stroke-width="2.2" stroke-dasharray="10 12" opacity="0.5"/>`,
        `<g opacity="0.22">${mark(x, slotY, 66, C.cyanLt)}</g>`
      );
    }
  });

  return [
    starfield(r, 55),
    `  <circle cx="960" cy="${slotY}" r="560" fill="url(#h-cyan)" opacity="0.13"/>`,
    `  <line x1="${n(bx0)}" y1="${n(padY + 6)}" x2="${n(bx1)}" y2="${n(padY + 6)}" stroke="${C.ice}" ` +
      `stroke-width="2" opacity="0.35"/>`,
    `  <g>${tracks.join('')}</g>`,
    `  <g>${pads.join('')}</g>`,
    `  <g>${slots.join('')}</g>`,
    `  <g>${bracket}</g>`,
  ].join('\n');
}

// ------------------------------------------------- a very small resource envelope
//
// `limits-tight-envelope` is the space itself: a whole server inside a boundary
// several steps smaller than the room it usually gets, packed to all four walls.
// `limits-gauge-pinned` is the reading off the same situation: filled to the last
// few percent of the scale, with a sliver left before the stop.


// Utilisation run right up to the stop: the scale is filled into its redline and
// the pointer sits a sliver short of full.
function limitsGaugePinned(r) {
  const cx = 960;
  const cy = 540;
  const R = 330;
  const WIDTH = 32;
  const A0 = Math.PI * 0.75;
  const SPAN = Math.PI * 1.5; // 270 degrees, gap at the bottom
  const VALUE = 0.945;
  const REDLINE = 0.86;
  const at = (t) => A0 + t * SPAN;
  const pol = (rad, t) => [cx + rad * Math.cos(at(t)), cy + rad * Math.sin(at(t))];

  const ticks = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const major = i % 10 === 0;
    const [ax, ay] = pol(R - WIDTH / 2 - 8, t);
    const [bx, by] = pol(R - WIDTH / 2 - (major ? 46 : 24), t);
    ticks.push(
      `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" ` +
        `stroke="${t >= REDLINE ? C.coral : C.ice}" stroke-width="${major ? 3.4 : 1.8}" ` +
        `opacity="${major ? 0.6 : 0.28}"/>`
    );
  }

  const band = (t0, t1, color, w, rad, op) =>
    `<path d="${arcPath(cx, cy, rad, at(t0), at(t1))}" fill="none" stroke="${color}" stroke-width="${w}" opacity="${op}"/>`;

  const filled = [
    band(0, 0.52, C.cyan, WIDTH, R, 0.85),
    band(0.5, 0.8, C.mint, WIDTH, R, 0.9),
    band(0.78, VALUE, C.gold, WIDTH, R, 0.95),
  ].join('');

  const [stop0x, stop0y] = pol(R - WIDTH / 2 - 30, 1);
  const [stop1x, stop1y] = pol(R + WIDTH / 2 + 52, 1);
  const [pt0x, pt0y] = pol(R - WIDTH / 2 - 68, VALUE);
  const [pt1x, pt1y] = pol(R + WIDTH / 2 + 26, VALUE);

  // Sparks in the redline, so the top of the scale reads as running hot.
  const sparks = [];
  for (let i = 0; i < 26; i++) {
    const t = REDLINE + r() * (1 - REDLINE);
    const [x, y] = pol(R + WIDTH / 2 + 14 + r() * 46, t);
    sparks.push(
      `<circle cx="${n(x)}" cy="${n(y)}" r="${n(1.2 + r() * 2.6)}" ` +
        `fill="${weighted(r, [[C.coral, 5], [C.gold, 4], [C.ice, 2]])}" opacity="${n(0.3 + r() * 0.55)}"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <circle cx="${cx}" cy="${cy}" r="370" fill="url(#h-violet)" opacity="0.26"/>`,
    `  ${band(0, 1, C.ice, WIDTH, R, 0.12)}`,
    `  <g>${ticks.join('')}</g>`,
    `  <g opacity="0.5" filter="url(#blur18)">${filled}</g>`,
    `  <g>${filled}</g>`,
    `  ${band(REDLINE, 1, C.coral, 10, R + WIDTH / 2 + 20, 0.85)}`,
    `  <g>${sparks.join('')}</g>`,
    `  <line x1="${n(stop0x)}" y1="${n(stop0y)}" x2="${n(stop1x)}" y2="${n(stop1y)}" stroke="${C.coral}" ` +
      `stroke-width="13" stroke-linecap="round" opacity="0.92"/>`,
    `  <line x1="${n(pt0x)}" y1="${n(pt0y)}" x2="${n(pt1x)}" y2="${n(pt1y)}" stroke="${C.ice}" ` +
      `stroke-width="17" stroke-linecap="round" opacity="0.35" filter="url(#blur8)"/>`,
    `  <line x1="${n(pt0x)}" y1="${n(pt0y)}" x2="${n(pt1x)}" y2="${n(pt1y)}" stroke="${C.ice}" ` +
      `stroke-width="8" stroke-linecap="round" opacity="0.95"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="230" fill="url(#h-gold)" opacity="0.45"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="126" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(cx, cy, 224)}</g>`,
    `  <g>${mark(cx, cy, 224)}</g>`,
  ].join('\n');
}
// ------------------------------------------------------------- valkey-bundle
//
// One package that carries several capabilities you would otherwise install one
// at a time. Two readings of that: containment (`bundleCrate`) and delivery
// (`bundleOneInstall`). Both draw the *same four* modules valkey-bundle ships,
// so the pair reads as two views of one thing rather than two piles of shapes.
//
//   bloom   a run of bit cells with a few of them set
//   json    indented rows inside a bracket pair, i.e. a nested document
//   search  a magnifier over a scatter of points, the hits inside it tethered
//   ldap    a padlock, since the module is authentication against a directory
//
// Deterministic on purpose: a module glyph must not change shape depending on
// how many PRNG draws happened before it.
const GLYPH_HALF_W = { bloom: 172, json: 156, search: 121, ldap: 82 };

// Each glyph is drawn around its own origin, but its ink is not symmetric about
// that origin: bloom hangs the hash ticks above the cell run. These offsets pull
// the drawn bounds back onto (cx, cy) so four glyphs on a grid look centred, and
// so a line aimed at (cx, cy) arrives at the middle of the glyph.
const GLYPH_SHIFT = { bloom: 25, json: 0, search: 0, ldap: 0 };

function moduleGlyph(kind, cx, cy, s, color, key) {
  cy += (GLYPH_SHIFT[kind] ?? 0) * s;
  const X = (v) => n(cx + v * s);
  const Y = (v) => n(cy + v * s);
  const w = (v) => n(v * s);
  const glow = (x, y, rad, op = 0.9, halo = 3) =>
    dot(cx + x * s, cy + y * s, rad * s, color, key, op, halo);

  // valkey-bloom: a miniature bit array, three bits set.
  if (kind === 'bloom') {
    const cell = 40;
    const gap = 9;
    const cols = 7;
    const total = cols * cell + (cols - 1) * gap;
    const x0 = -total / 2;
    const set = [1, 3, 6];
    const out = [];
    for (let i = 0; i < cols; i++) {
      const on = set.includes(i);
      out.push(
        `<rect x="${X(x0 + i * (cell + gap))}" y="${Y(-cell / 2)}" width="${w(cell)}" height="${w(cell)}" rx="${w(7)}" ` +
          `fill="${color}" fill-opacity="${on ? 0.85 : 0}" stroke="${color}" stroke-width="${w(2.6)}" opacity="${on ? 1 : 0.34}"/>`
      );
    }
    // One tick dropping into each bit that got set.
    for (const i of set) {
      const x = x0 + i * (cell + gap) + cell / 2;
      out.push(
        `<line x1="${X(x)}" y1="${Y(-74)}" x2="${X(x)}" y2="${Y(-30)}" stroke="${color}" stroke-width="${w(3)}" stroke-linecap="round" opacity="0.75"/>`,
        glow(x, -82, 6, 0.95, 3.2)
      );
    }
    // A span under the run, so it reads as one array and not seven loose cells.
    out.push(
      `<path d="M ${X(x0)} ${Y(24)} L ${X(x0)} ${Y(38)} L ${X(x0 + total)} ${Y(38)} L ${X(x0 + total)} ${Y(24)}" ` +
        `fill="none" stroke="${color}" stroke-width="${w(2.6)}" opacity="0.5"/>`
    );
    return out.join('');
  }

  // valkey-json: rows at three indent depths, held inside a bracket pair.
  if (kind === 'json') {
    const lvl = [0, 1, 2, 2, 1];
    const len = [78, 104, 74, 92, 62];
    const out = [];
    for (const sgn of [-1, 1]) {
      out.push(
        `<path d="M ${X(sgn * 128)} ${Y(-100)} L ${X(sgn * 150)} ${Y(-100)} L ${X(sgn * 150)} ${Y(100)} L ${X(sgn * 128)} ${Y(100)}" ` +
          `fill="none" stroke="${color}" stroke-width="${w(6)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`
      );
    }
    lvl.forEach((d, i) => {
      const y = -64 + i * 32;
      const x = -104 + d * 30;
      out.push(
        `<line x1="${X(x + 14)}" y1="${Y(y)}" x2="${X(x + 14 + len[i])}" y2="${Y(y)}" stroke="${color}" ` +
          `stroke-width="${w(5)}" stroke-linecap="round" opacity="0.7"/>`,
        glow(x, y, 5.5, 0.9, 3)
      );
    });
    return out.join('');
  }

  // valkey-search: a query. Magnifier over a point set; whatever falls inside
  // the ring is a hit and is tethered to the query point.
  if (kind === 'search') {
    const qx = -16;
    const qy = -19;
    const rad = 68;
    const pts = [[-112, 50], [-60, -52], [-30, 6], [-4, -44], [22, 62], [66, -6], [104, 54], [112, -66]];
    const out = [];
    for (const [px, py] of pts) {
      const hit = Math.hypot(px - qx, py - qy) < rad - 8;
      if (hit) {
        out.push(
          `<line x1="${X(qx)}" y1="${Y(qy)}" x2="${X(px)}" y2="${Y(py)}" stroke="${color}" stroke-width="${w(2.2)}" opacity="0.55"/>`
        );
      }
      out.push(glow(px, py, hit ? 7 : 4.5, hit ? 0.95 : 0.45, 3));
    }
    out.push(
      `<line x1="${X(qx + 48)}" y1="${Y(qy + 48)}" x2="${X(86)}" y2="${Y(83)}" stroke="${color}" ` +
        `stroke-width="${w(14)}" stroke-linecap="round" opacity="0.85"/>`,
      `<circle cx="${X(qx)}" cy="${Y(qy)}" r="${w(rad)}" fill="${C.ink}" fill-opacity="0.16" ` +
        `stroke="${color}" stroke-width="${w(7)}" opacity="0.9"/>`
    );
    return out.join('');
  }

  // valkey-ldap: a padlock. The module is authentication against a directory, so
  // the glyph has to read as auth. A tree of nodes reads as a data structure and
  // sits oddly beside the other three, which are all storage shapes.
  //
  // Every line in it is one weight, and the keyhole is a circle plus a slot of that
  // same weight: mixed stroke widths and a filled tapered slot were what made this
  // read as a cartoon rather than as a drawing.
  const LINE = 6;
  const bodyW = 152;
  const bodyH = 116;
  const bodyTop = -36; // shackle above + body below, so the glyph is centred on cy
  const shackleR = 44;
  const keyCy = bodyTop + 40;
  return [
    // Shackle: a half arc rising out of the top edge of the body.
    `<path d="M ${X(-shackleR)} ${Y(bodyTop)} A ${w(shackleR)} ${w(shackleR)} 0 0 1 ${X(shackleR)} ${Y(bodyTop)}" ` +
      `fill="none" stroke="${color}" stroke-width="${w(LINE)}" opacity="0.9"/>`,
    `<rect x="${X(-bodyW / 2)}" y="${Y(bodyTop)}" width="${w(bodyW)}" height="${w(bodyH)}" rx="${w(20)}" ` +
      `fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="${w(LINE)}" opacity="0.9"/>`,
    // Keyhole: a bored circle and a straight slot, both the same weight.
    `<circle cx="${X(0)}" cy="${Y(keyCy)}" r="${w(14)}" fill="none" stroke="${color}" ` +
      `stroke-width="${w(LINE)}" opacity="0.95"/>`,
    `<line x1="${X(0)}" y1="${Y(keyCy + 14)}" x2="${X(0)}" y2="${Y(keyCy + 50)}" stroke="${color}" ` +
      `stroke-width="${w(LINE)}" stroke-linecap="round" opacity="0.95"/>`,
  ].join('');
}

// The four modules, in a fixed order and a fixed colour each, so bundle-crate
// and bundle-one-install label the same module the same way.
const BUNDLE_MODULES = [
  { kind: 'bloom', color: C.cyanLt, key: 'cyan' },
  { kind: 'json', color: C.mint, key: 'mint' },
  { kind: 'search', color: C.gold, key: 'gold' },
  { kind: 'ldap', color: C.coral, key: 'coral' },
];

// Containment: one package boundary with the four modules packed inside it two
// by two, the mark sealing the lid.
function bundleCrate(r) {
  const x0 = 462;
  const x1 = 1458;
  const y0 = 254;
  const y1 = 872;
  const lid = y0 + 76;
  const mid = (lid + y1) / 2;
  const cx = (x0 + x1) / 2;

  const s = 1.02;
  // One slot per quadrant of the crate, each at the exact centre of its quadrant:
  // the quadrants are (x0..960, 960..x1) x (lid..mid, mid..y1).
  const slots = [
    [(x0 + 960) / 2, (lid + mid) / 2],
    [(960 + x1) / 2, (lid + mid) / 2],
    [(x0 + 960) / 2, (mid + y1) / 2],
    [(960 + x1) / 2, (mid + y1) / 2],
  ];
  const modules = BUNDLE_MODULES.map((m, i) => moduleGlyph(m.kind, slots[i][0], slots[i][1], s, m.color, m.key)).join('');

  // Corner brackets, so the outline reads as a crate rather than a panel.
  const arm = 96;
  const brackets = [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x0, y1, 1, -1],
    [x1, y1, -1, -1],
  ]
    .map(
      ([bx, by, sx, sy]) =>
        `<path d="M ${n(bx + sx * arm)} ${n(by)} L ${n(bx + sx * 22)} ${n(by)} ` +
        `A 22 22 0 0 ${sx * sy > 0 ? 0 : 1} ${n(bx)} ${n(by + sy * 22)} L ${n(bx)} ${n(by + sy * arm)}" ` +
        `fill="none" stroke="${C.ice}" stroke-width="9" stroke-linecap="round" opacity="0.9"/>`
    )
    .join('');

  return [
    starfield(r, 55),
    // The only lit things are the four modules: nothing washes the background, and
    // nothing haloes the mark, so the four glyphs are what the eye goes to.
    ...slots.map((p, i) => `  <circle cx="${n(p[0])}" cy="${n(p[1])}" r="150" fill="url(#h-${BUNDLE_MODULES[i].key})" opacity="0.22"/>`),
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="${C.ink}" fill-opacity="0.3"/>`,
    `  <g>${modules}</g>`,
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="none" stroke="${C.ice}" stroke-width="14" opacity="0.28" filter="url(#blur8)"/>`,
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="none" stroke="${C.ice}" stroke-width="3.6" opacity="0.85"/>`,
    `  <line x1="${x0}" y1="${lid}" x2="${x1}" y2="${lid}" stroke="${C.ice}" stroke-width="2" stroke-dasharray="14 12" opacity="0.4"/>`,
    `  <line x1="960" y1="${lid}" x2="960" y2="${y1}" stroke="${C.ice}" stroke-width="2" stroke-dasharray="14 12" opacity="0.22"/>`,
    `  <line x1="${x0}" y1="${n(mid)}" x2="${x1}" y2="${n(mid)}" stroke="${C.ice}" stroke-width="2" stroke-dasharray="14 12" opacity="0.22"/>`,
    `  <g>${brackets}</g>`,
    // The seal: one mark on one lid, unlit.
    `  <g>${mark(cx, y0, 112)}</g>`,
  ].join('\n');
}


// ------------------------------------------------------- data structure survey
//
// An ordered catalogue of Valkey value types, one per cell on an even grid.
// `data-structures` looks *inside* two of them (hash buckets, a skip list);
// this one is the survey across several, and the point of it is the order.
function dataStructuresGrid(r) {
  const cw = 320;
  const chh = 338;
  const gap = 40;
  const cols = [960 - (cw + gap), 960, 960 + (cw + gap)];
  const rows = [540 - (chh + gap) / 2, 540 + (chh + gap) / 2];

  const glyph = (kind, cx, cy, color, key) => {
    const X = (v) => n(cx + v);
    const Y = (v) => n(cy + v);
    const glow = (x, y, rad, op = 0.9, halo = 3) => dot(cx + x, cy + y, rad, color, key, op, halo);

    // A string: one contiguous run of bytes, spanned as a single value.
    if (kind === 'string') {
      const out = [];
      const cell = 40;
      const g = 8;
      const total = 6 * cell + 5 * g;
      const x0 = -total / 2;
      for (let i = 0; i < 6; i++) {
        out.push(
          `<rect x="${X(x0 + i * (cell + g))}" y="${Y(-10)}" width="${cell}" height="52" rx="7" fill="${color}" ` +
            `fill-opacity="${n(0.4 + r() * 0.28)}" stroke="${color}" stroke-width="2.4" opacity="0.9"/>`
        );
      }
      out.push(
        `<path d="M ${X(x0)} ${Y(-24)} L ${X(x0)} ${Y(-36)} L ${X(x0 + total)} ${Y(-36)} L ${X(x0 + total)} ${Y(-24)}" ` +
          `fill="none" stroke="${color}" stroke-width="2.6" opacity="0.55"/>`
      );
      return out.join('');
    }

    // A list: nodes linked head to tail, in order.
    if (kind === 'list') {
      const out = [];
      const ys = [-105, -35, 35, 105];
      for (let i = 0; i < ys.length - 1; i++) {
        out.push(
          `<line x1="${X(0)}" y1="${Y(ys[i] + 23)}" x2="${X(0)}" y2="${Y(ys[i + 1] - 30)}" stroke="${color}" stroke-width="3" opacity="0.6"/>`,
          `<path d="M ${X(-8)} ${Y(ys[i + 1] - 36)} L ${X(0)} ${Y(ys[i + 1] - 23)} L ${X(8)} ${Y(ys[i + 1] - 36)}" ` +
            `fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`
        );
      }
      for (const y of ys) {
        out.push(
          `<rect x="${X(-62)}" y="${Y(y - 23)}" width="124" height="46" rx="11" fill="${color}" fill-opacity="0.16" ` +
            `stroke="${color}" stroke-width="2.8" opacity="0.9"/>`,
          `<line x1="${X(18)}" y1="${Y(y - 23)}" x2="${X(18)}" y2="${Y(y + 23)}" stroke="${color}" stroke-width="2" opacity="0.5"/>`,
          glow(-22, y, 5.5, 0.9, 3)
        );
      }
      return out.join('');
    }

    // A set: unordered members inside a boundary, no position and no repeats.
    if (kind === 'set') {
      const out = [
        `<circle cx="${X(0)}" cy="${Y(0)}" r="104" fill="${C.ink}" fill-opacity="0.14" stroke="${color}" ` +
          `stroke-width="3" stroke-dasharray="9 12" opacity="0.7"/>`,
      ];
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.pow(r(), 0.5) * 78;
        out.push(glow(Math.cos(a) * d, Math.sin(a) * d, 7, 0.85, 3));
      }
      return out.join('');
    }

    // A hash: field on the left, value on the right, one pair per row.
    if (kind === 'hash') {
      const out = [];
      const len = [70, 110, 84, 120];
      [-66, -22, 22, 66].forEach((y, i) => {
        out.push(
          `<rect x="${X(-90)}" y="${Y(y - 18)}" width="36" height="36" rx="8" fill="${color}" fill-opacity="0.24" ` +
            `stroke="${color}" stroke-width="2.6" opacity="0.9"/>`,
          `<line x1="${X(-48)}" y1="${Y(y)}" x2="${X(-32)}" y2="${Y(y)}" stroke="${color}" stroke-width="2.4" opacity="0.55"/>`,
          `<line x1="${X(-26)}" y1="${Y(y)}" x2="${X(-26 + len[i])}" y2="${Y(y)}" stroke="${color}" stroke-width="7" ` +
            `stroke-linecap="round" opacity="0.7"/>`
        );
      });
      return out.join('');
    }

    // A sorted set: members ranked by score, tallest first.
    if (kind === 'zset') {
      const out = [
        `<line x1="${X(-126)}" y1="${Y(98)}" x2="${X(126)}" y2="${Y(98)}" stroke="${color}" stroke-width="2.4" opacity="0.45"/>`,
      ];
      const h = [190, 158, 128, 98, 70];
      h.forEach((hh, i) => {
        const x = -104 + i * 52;
        out.push(
          `<rect x="${X(x - 17)}" y="${Y(98 - hh)}" width="34" height="${hh}" rx="7" fill="${color}" ` +
            `fill-opacity="${n(0.6 - i * 0.07)}" stroke="${color}" stroke-width="2.2" opacity="0.9"/>`,
          glow(x, 98 - hh, 6, 0.9, 3)
        );
      });
      return out.join('');
    }

    // A bitmap: dense on/off cells.
    const out = [];
    const cell = 24;
    const g = 6;
    const bw = 8 * cell + 7 * g;
    const bh = 6 * cell + 5 * g;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 6; j++) {
        const on = r() < 0.45;
        out.push(
          `<rect x="${X(-bw / 2 + i * (cell + g))}" y="${Y(-bh / 2 + j * (cell + g))}" width="${cell}" height="${cell}" rx="4" ` +
            `fill="${color}" fill-opacity="${on ? 0.82 : 0}" stroke="${color}" stroke-width="1.6" opacity="${on ? 0.95 : 0.26}"/>`
        );
      }
    }
    return out.join('');
  };

  const cells = [
    { kind: 'string', color: C.cyanLt, key: 'cyan' },
    { kind: 'list', color: C.mint, key: 'mint' },
    { kind: 'set', color: C.gold, key: 'gold' },
    { kind: 'hash', color: C.coral, key: 'coral' },
    { kind: 'zset', color: C.violet, key: 'violet' },
    { kind: 'bitmap', color: C.ice, key: 'ice' },
  ].map((c, i) => ({ ...c, cx: cols[i % 3], cy: rows[Math.floor(i / 3)] }));

  const frames = cells
    .map(
      (c) =>
        `<rect x="${n(c.cx - cw / 2)}" y="${n(c.cy - chh / 2)}" width="${cw}" height="${chh}" rx="22" ` +
        `fill="${C.ink}" fill-opacity="0.26" stroke="${C.ice}" stroke-width="2.4" opacity="0.32"/>` +
        // A short coloured tab on the top edge ties the cell to its type.
        `<line x1="${n(c.cx - cw / 2 + 26)}" y1="${n(c.cy - chh / 2)}" x2="${n(c.cx - cw / 2 + 100)}" y2="${n(c.cy - chh / 2)}" ` +
        `stroke="${c.color}" stroke-width="6" stroke-linecap="round" opacity="0.9"/>`
    )
    .join('');

  return [
    starfield(r, 55),
    // Ambient glow behind the grid, never over it.
    `  <ellipse cx="960" cy="540" rx="640" ry="430" fill="url(#h-cyan)" opacity="0.16"/>`,
    ...cells.map((c) => `  <circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="168" fill="url(#h-${c.key})" opacity="0.16"/>`),
    `  <g>${frames}</g>`,
    `  <g>${cells.map((c) => glyph(c.kind, c.cx, c.cy, c.color, c.key)).join('')}</g>`,
  ].join('\n');
}

// Key size distribution in Valkey Admin, beside the shards it is measured across:
// the panel ranks keys by size with the size printed next to each bar, two of them
// far larger than the rest, and each enclosure on the right holds the three servers
// of one shard. Connectors are elbows rather than curves, because a swept curve
// over this distance reads as decoration.
// The Valkey Admin panel: the ranked bars with their sizes printed. Pulled out of
// keySizeDistribution so the card layout can show it on its own; the coordinates are
// the originals, so the parent theme's output is unchanged.
const ADMIN_PANEL = { sx: 440, sw: 420, sTop: 210, sH: 660 };

function adminPanel() {
  const { sx, sw, sTop, sH } = ADMIN_PANEL;

  // The header (mark plus title) is centred in the panel, and the chart baseline
  // runs down from the middle of the mark, so both readings hold at once.
  const HEADER_W = 352;
  const headX = sx + (sw - HEADER_W) / 2;
  const axisX = headX + 24;
  const labelX = sx + sw - 28;

  // Ranked keys with their sizes printed. The top two are a different class of
  // object, not the top of a ramp: tens of megabytes against a few.
  const SIZES = [
    ['42 MB', 210],
    ['36 MB', 185],
    ['3.1 MB', 56],
    ['2.7 MB', 48],
    ['2.0 MB', 41],
    ['1.6 MB', 36],
    ['1.2 MB', 29],
    ['860 KB', 22],
  ];

  const bars = [];
  SIZES.forEach(([size, len], i) => {
    const y = 372 + i * 62;
    const outlier = i < 2;
    if (outlier) {
      bars.push(
        `<rect x="${n(axisX)}" y="${n(y - 12)}" width="${n(len)}" height="24" rx="12" fill="none" ` +
          `stroke="${C.coral}" stroke-width="12" opacity="0.32" filter="url(#blur8)"/>`
      );
    }
    bars.push(
      `<rect x="${n(axisX)}" y="${n(y - 12)}" width="${n(len)}" height="24" rx="12" ` +
        `fill="${outlier ? C.coral : C.cyanLt}" opacity="${outlier ? 0.95 : n(0.7 - i * 0.05)}"/>`,
      `<text x="${n(labelX)}" y="${n(y + 14)}" fill="${outlier ? C.coral : C.ice}" text-anchor="end" ` +
        `font-family="${FONT}" font-size="38" font-weight="500" opacity="${outlier ? 0.95 : 0.6}">${esc(size)}</text>`
    );
  });

  const panel =
    `<rect x="${sx}" y="${sTop}" width="${sw}" height="${sH}" rx="22" fill="${C.ink}" fill-opacity="0.5" ` +
      `stroke="${C.ice}" stroke-width="3" opacity="0.9"/>` +
    `<line x1="${n(sx + 28)}" y1="${sTop + 96}" x2="${n(sx + sw - 28)}" y2="${sTop + 96}" stroke="${C.ice}" ` +
      `stroke-width="2" opacity="0.45"/>` +
    `<g opacity="0.95">${mark(axisX, sTop + 52, 48)}</g>` +
    `<text x="${n(headX + 62)}" y="${sTop + 68}" fill="#FFFFFF" font-family="${FONT}" font-size="44" ` +
      `font-weight="600" letter-spacing="0.6">Valkey Admin</text>` +
    `<line x1="${n(axisX)}" y1="${sTop + 126}" x2="${n(axisX)}" y2="816" stroke="${C.ice}" stroke-width="2" opacity="0.4"/>`;

  return { panel, bars: bars.join('') };
}

// `spread` adds air between the panel and the shards, and defaults to 0, so
// key-size-distribution itself is unchanged. The panel's own width is not a parameter:
// the header is centred on it, the axis is offset from that, the bar lengths are
// absolute and the size labels are right-aligned to its far edge, so widening it pulls
// the bars away from their labels and the chart stops reading as one column.
function keySizeDistribution(r, { spread = 0, colPitch = 144 } = {}) {
  const { sx, sw } = ADMIN_PANEL;
  const { panel, bars } = adminPanel();

  // The narrow crop keeps only the middle 70% of the width, so the whole
  // composition has about 1050px to live in at this zoom. Tiles are therefore
  // 120 with a 24px gap and 26px of enclosure padding: at 134 they filled the
  // budget exactly and ended up edge to edge.
  //
  // `colPitch` is the column spacing, and the tile stays 120 whatever it is, so
  // raising it widens the gap between servers rather than the servers. The enclosure
  // is derived from the outer columns instead of being written out, which is what
  // keeps it hugging them at any pitch.
  const rows = [310, 540, 770];
  const tile = 120;
  const PAD = 26;
  const cols = [0, 1, 2].map((i) => 1106 + i * colPitch + spread);
  const shardX0 = cols[0] - tile / 2 - PAD; // 160px of air between the panel and the shards
  const shardX1 = cols[2] + tile / 2 + PAD;
  const shardH = 200;


  // One curve per shard, leaving the panel at the middle and arriving level with
  // its enclosure. Both control points sit near the middle of the run, so the
  // bend is a rounded corner rather than a swoop across the frame.
  const harness = rows
    .map((y) => {
      const x0 = sx + sw + 10;
      return (
        `<path d="M ${n(x0)} 540 C ${n(x0 + 58)} 540 ${n(shardX0 - 58)} ${n(y)} ${shardX0} ${n(y)}" ` +
        `fill="none" stroke="${C.cyanLt}" stroke-width="2.6" opacity="0.5"/>`
      );
    })
    .join('');

  // A shard is the enclosure: three servers sharing one slot range.
  const shards = rows
    .map(
      (y) =>
        `<rect x="${shardX0}" y="${n(y - shardH / 2)}" width="${n(shardX1 - shardX0)}" height="${shardH}" rx="26" ` +
        `fill="${C.ink}" fill-opacity="0.22" stroke="${C.ice}" stroke-width="2.4" opacity="0.4"/>`
    )
    .join('');

  // Filled first tile, hollow other two: primary and replicas, a convention that
  // reads without a legend and costs no extra shapes. Two of the three primaries
  // carry the coral of the outlier bars, which is how the chart says where those
  // keys actually live: the colour does the routing, so the fan stays as it is.
  const HOT = [0, 2];
  const pods = [];
  rows.forEach((y, row) => {
    cols.forEach((x, col) => {
      const primary = col === 0;
      const hot = primary && HOT.includes(row);
      const stroke = hot ? C.coral : C.cyanLt;
      if (hot) {
        pods.push(
          `<rect x="${n(x - tile / 2)}" y="${n(y - tile / 2)}" width="${tile}" height="${tile}" rx="26" ` +
            `fill="none" stroke="${C.coral}" stroke-width="12" opacity="0.32" filter="url(#blur8)"/>`
        );
      }
      pods.push(
        `<rect x="${n(x - tile / 2)}" y="${n(y - tile / 2)}" width="${tile}" height="${tile}" rx="26" ` +
          `fill="${hot ? C.coral : C.cyan}" fill-opacity="${primary ? (hot ? 0.42 : 0.4) : 0}" ` +
          `stroke="${stroke}" stroke-width="2.6" opacity="0.9"/>`,
        mark(x, y, 72)
      );
    });
  });

  return [
    // No background wash and no speckle: the only thing lit is the pair of outsized
    // keys, which is the one thing the image is pointing at.
    `  <g>${harness}</g>`,
    `  <g>${shards}</g>`,
    `  <g>${pods.join('')}</g>`,
    `  <g>${panel}</g>`,
    `  <g>${bars}</g>`,
  ].join('\n');
}

// ------------------------------------------------------------------ cards
//
// The card layout, after the Neon blog covers: the lockup in the upper left, the
// title on solid blocks in the lower left, and the subject on the right. The lockup
// comes from stamp() and the title from the caption slot, both of which every other
// banner already uses, so a card theme only places the subject.
//
// There is no frame around the subject any more. A thin rectangle was tried and it
// looked wrong either way round: closed, its far edge showed straight through the
// translucent artwork; open on one side, it read as a stray bracket.
//
// The subject is key-size-distribution's motif, drawn by the same function as the
// parent theme so the two cannot drift. Three fixed things set where it goes, all in
// the framed box x 198..1722, y 111..969:
//
//   the corner lockup   x 262..469,  y 158..228
//   the caption blocks  x 274..838,  y 682..904
//   the motif's own box  x 440..1480, y 210..870 before scaling
//
// Two caption lines rather than three shortened the block stack to 146 units, which
// moved its top edge down from 682 to 758 and left room for the whole chart above it.
// The bottom size label's baseline lands at 735 and the last bar at 723, both clear, so
// nothing in the panel is behind the blocks any more. The panel's rounded bottom still
// runs 20 units under them, which is the overlap that ties the title to the artwork.
//
// The artwork is centred in the frame on both axes, 298 units of margin left and right
// and 145 top and bottom, and those numbers are computed rather than tuned.
//
// The labels do not constrain the horizontal. They are right-aligned at 832 before
// scaling, which once had to clear a three-line caption reaching to 838, but at two lines
// the clearance is vertical instead. Widening the panel was tried and rejected: the header
// is centred on the panel, the axis is offset from that and the bar lengths are absolute,
// so a wider panel pulls the bars away from their labels and the chart stops reading as
// one column.
//
// Centring costs the bottom row of the chart, the 860 KB bar and its label, which the
// block stack crosses. One row, and the same overlap the parent theme has.
//
// Spread came down from 150 to 40 rather than to 0 because the shards have to stay clear
// of the harness curves leaving the panel. At 40, centred, the enclosures end at 1424 and
// the panel starts at 496, both inside the narrow crop's 427..1493, so the whole cluster
// sits in both crops. The
// intermediate values do not work: 26 units of enclosure padding is all that separates the
// third tile's right edge from the enclosure's, so any framing that bleeds the enclosure
// meaningfully also slices a tile, and a half-cut hexagon reads as a bug rather than as
// the cluster continuing.
//
// The placement is computed, not tuned. The motif's drawn box runs from x 440 to the
// right edge of the last shard enclosure, y 210..870; scale it, then centre it in the
// framed box. Every hand-tuned attempt at this drifted, most recently to 352 left against
// 243 right, because the numbers to balance are the scaled box against the frame and
// neither is obvious by eye.
//
// The right edge is derived, not written down, because two arguments move it: `spread`
// slides the shards away from the panel and `colPitch` spaces the columns. It is the last
// column's centre plus half a tile plus the enclosure's 26 units of padding, which comes
// out at 1480 for the defaults.
//
// `clearY` is the one constraint that overrides centring, and only ever upwards. Vertical
// centring knows about the framed box and nothing about the caption, so a variant that has
// to sit clear of the title blocks states the y it must stay above and gets its dy from
// that instead. Without a `clearY` the behaviour is unchanged.
function keySizeCardBox(theme, { scale, spread, colPitch = 144, clearY }) {
  const { vx, vy, vw, vh } = frameBox(theme);
  const right = 1192 + 2 * colPitch + spread;
  const w = (right - 440) * scale;
  const h = 660 * scale;
  const dy = vy + (vh - h) / 2 - 210 * scale;
  return {
    dx: vx + (vw - w) / 2 - 440 * scale,
    dy: clearY === undefined ? dy : Math.min(dy, clearY - 870 * scale),
    w,
    h,
  };
}

function keySizeCard(opts) {
  return (r, _opts, theme) => {
    const { dx, dy } = keySizeCardBox(theme, opts);
    return [
      `  <g transform="translate(${n(dx)} ${n(dy)}) scale(${opts.scale})">`,
      keySizeDistribution(r, { spread: opts.spread, colPitch: opts.colPitch }),
      `  </g>`,
    ].join('\n');
  };
}

// ------------------------------------------------------- relativistic disk
//
// A small accretion-disk model, used by the blackhole-* themes. Not a ray tracer:
// it evaluates the standard closed-form pieces on a grid of circular orbits and
// emits one short stroke per sample, so the asymmetry, the colour gradient and the
// far side arcing over the shadow fall out of the formulae instead of being drawn
// in by hand. Geometrised units, M = 1, c = 1.
//
//   Keplerian speed         beta = sqrt(M / rho)
//   shift factor            delta = sqrt(1 - 3M/rho) / (1 - beta . n)   (Schwarzschild
//                           circular orbit, gravitational and Doppler together)
//   observed brightness     F_obs = F_emit * delta^4                    (I/nu^3 invariant)
//   emitted flux            F_emit ~ rho^-3 (1 - sqrt(rho_isco/rho))    (Shakura-Sunyaev)
//   observed colour temp    T_obs ~ delta * F_emit^(1/4)
//   apparent radius         r_app = hypot(r_flat, b_ph * sqrt(w))       (see below)
//
// The last line is the one approximation with no textbook behind it. Proper light
// bending needs an elliptic integral; instead the flat projected radius is added in
// quadrature with the photon-ring radius, weighted by how much of the ray's path
// grazes the hole. That reproduces what matters — no part of the image can appear
// inside the photon ring, so the far side of the disk is pushed up over the shadow,
// and the effect dies away for orbits already far from it.
const ISCO = 6; // innermost stable circular orbit, 6M
const B_PH = 3 * Math.sqrt(3); // photon-ring impact parameter, 5.196M: the shadow's edge

function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (u, v) => Math.round(u + (v - u) * clamp(t, 0, 1)).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

// Cold to hot across the palette's three warm accents. Nothing outside them: the
// intermediate values are interpolations of C, the same way a gradient's stops are.
const diskColor = (t) =>
  t > 0.62 ? mixHex(C.gold, C.ice, (t - 0.62) / 0.38 * 0.8) : mixHex(C.coral, C.gold, t / 0.62);

// `rings + 1` orbits of `segs + 1` samples each: the grid corners of a mesh, so
// the disk can be tiled with quads that neither overlap nor leave gaps. Overlapping
// translucent strokes were the first attempt and they saturate to a flat blob.
function diskSamples({ inc, outer, rings, segs, beam }) {
  const si = Math.sin(inc);
  const ci = Math.cos(inc);
  const drho = (outer - ISCO) / rings;
  const out = [];
  for (let i = 0; i <= rings; i++) {
    const rho = ISCO + i * drho;
    const beta = 1 / Math.sqrt(rho);
    const grav = Math.sqrt(Math.max(1e-3, 1 - 3 / rho));
    const emit = Math.max(0, Math.pow(rho, -3) * (1 - Math.sqrt(ISCO / rho)));

    const ring = [];
    for (let j = 0; j <= segs; j++) {
      const th = (2 * Math.PI * j) / segs;
      const x0 = rho * Math.cos(th);
      const up0 = rho * Math.sin(th) * ci; // screen-up; sin(th) > 0 is the far side

      // Lensing. `w` is the far-side weighting: a ray from behind the hole grazes
      // it, a ray from the near side does not.
      const w = Math.max(0, Math.sin(th));
      const flat = Math.hypot(x0, up0) || 1e-6;
      const k = Math.hypot(flat, B_PH * Math.sqrt(w)) / flat;

      // Beaming. `los` is the orbital velocity projected onto the line of sight,
      // positive when that patch of disk is coming towards the viewer.
      // `beam` scales the Doppler term. At 1 it is the real thing and one side of the
      // disk blazes; at 0 the disk is left-right symmetric, which is the choice
      // Interstellar made for Gargantua because the asymmetry read as a mistake.
      const los = -Math.cos(th) * si;
      const delta = grav / (1 - beam * beta * los);

      // The secondary image: light that passes the other side of the hole and comes
      // back out. Every orbit lands just outside the photon ring, and the image is
      // flipped through the horizontal, so the far side of the disk that the primary
      // lifted over the top of the shadow appears again below it. That second arc is
      // what closes the primary's arc into a ring all the way round the shadow, and
      // it is the thing that was missing from these before.
      const px = x0 * k;
      const pu = up0 * k;
      const ang = Math.atan2(pu, px);
      const rsec = B_PH * (1 + 3.4 / rho);

      ring.push({
        x: px,
        up: pu,
        sx: rsec * Math.cos(ang),
        sup: -rsec * Math.sin(ang),
        flux: emit * Math.pow(delta, 4),
        temp: delta * Math.pow(emit, 0.25),
      });
    }
    out.push(ring);
  }
  return out;
}

// The secondary image: light that loops the hole and emerges on the other side.
// Every radius piles up just outside the photon ring, so it is one thin arc rather
// than a disk, and its azimuth mapping is flipped.
function photonRing({ inc, scale, cx, cy }) {
  const si = Math.sin(inc);
  const segs = 120;
  const rad = B_PH * 1.035 * scale;
  const parts = [];
  for (let j = 0; j < segs; j++) {
    const th = (2 * Math.PI * j) / segs;
    const beta = 1 / Math.sqrt(ISCO);
    const delta = Math.sqrt(1 - 3 / ISCO) / (1 - beta * (-Math.cos(th) * si));
    const a0 = th;
    const a1 = th + (2 * Math.PI) / segs;
    const p = (a) => `${n(cx + rad * Math.cos(a))} ${n(cy - rad * Math.sin(a))}`;
    const op = clamp(Math.pow(delta, 3) * 0.8, 0.12, 0.98);
    parts.push(
      `<path d="M ${p(a0)} L ${p(a1)}" stroke="${mixHex(C.gold, C.ice, 0.55)}" stroke-width="${n(scale * 0.13)}" ` +
        `opacity="${op.toFixed(3)}"/>`
    );
  }
  return parts.join('');
}

// Draws the model. Returns the far half, the near half and the shadow separately,
// because the shadow has to sit between them.
function relativisticDisk({ inc, outer, scale, cx, cy, beam = 1, rings = 28, segs = 100 }) {
  const s = diskSamples({ inc, outer, rings, segs, beam });
  const flat = s.flat();
  const fMax = Math.max(...flat.map((p) => p.flux));
  const tLo = Math.min(...flat.map((p) => p.temp));
  const tHi = Math.max(...flat.map((p) => p.temp));

  // One quad per cell of the mesh. Because quads tile rather than overlap, the
  // computed brightness lands on screen as written instead of compounding. No
  // stroke: a stroke doubles the alpha along every shared edge, which is what
  // turned the first version of this into visible graph paper.
  // Three groups, not two. Splitting the whole disk into far and near halves means
  // the split line runs the full width of the frame, and because the halves are
  // blurred separately it shows there as a hairline. Only quads that actually
  // overlap the shadow need ordering, so the rest go into one group and the split
  // is confined to the shadow's edge, where the photon ring covers it.
  const outside = [];
  const far = [];
  const near = [];
  const sec = [];
  const shadowR = B_PH * scale;
  const at = (p) => [cx + p.x * scale, cy - p.up * scale];
  const atSec = (p) => [cx + p.sx * scale, cy - p.sup * scale];
  // Tiling exactly leaves a half-covered pixel on every shared edge, which reads as
  // a faint grid. Inflating the quads to overlap only trades it for a brighter grid,
  // so the seams are dissolved with a 3px blur on the layer instead (see below);
  // disk features are tens of pixels across, so nothing real is lost.
  const quad = (pts) => pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ');
  // The model is truncated at `outer`, where the real disk still has brightness.
  // Fading the last fifth of the radial range is the one purely cosmetic step here;
  // without it the disk ends on a hard ellipse.
  const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  for (let i = 0; i < rings; i++) {
    const taper = 1 - smooth(((i + 0.5) / rings - 0.66) / 0.34);
    for (let j = 0; j < segs; j++) {
      const corners = [s[i][j], s[i][j + 1], s[i + 1][j + 1], s[i + 1][j]];
      const flux = corners.reduce((t, p) => t + p.flux, 0) / 4;
      const op = clamp(Math.pow(flux / fMax, 1.05) * 0.95 * taper, 0, 0.96);
      if (op < 0.006) continue;
      const temp = corners.reduce((t, p) => t + p.temp, 0) / 4;
      // 1.4 compresses the ramp towards the cool end, so only the genuinely hottest
      // patch goes ice-white instead of half the disk.
      const col = diskColor(Math.pow(clamp((temp - tLo) / (tHi - tLo || 1), 0, 1), 2.2));
      // Three decimals, not one: rounding alpha to 0.1 quantises the disk into
      // visible contour bands.
      const pts = corners.map(at);
      const el = `<path d="M ${quad(pts)} Z" fill="${col}" opacity="${op.toFixed(3)}"/>`;
      const inner = Math.min(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      if (inner > shadowR) outside.push(el);
      else (Math.sin((2 * Math.PI * (j + 0.5)) / segs) >= 0 ? far : near).push(el);

      // The same cell's secondary image. Dimmer, because the ray that loops the hole
      // gives up more of its flux getting here.
      const sop = op * 0.45;
      if (sop >= 0.012) {
        sec.push(
          `<path d="M ${quad(corners.map(atSec))} Z" fill="${col}" opacity="${sop.toFixed(3)}"/>`
        );
      }
    }
  }

  return {
    outside: outside.join(''),
    far: far.join(''),
    near: near.join(''),
    sec: sec.join(''),
    shadowR,
    ring: photonRing({ inc, scale, cx, cy }),
  };
}

// One black-hole theme, parameterised by inclination. `inc` is measured from the
// disk axis, so 90 degrees is edge on.
function blackholeAt({ incDeg, outer, scale, markH, beam = 1, rings, segs }) {
  return (r) => {
    const cx = 960;
    const cy = 540;
    const d = relativisticDisk({ inc: (incDeg * Math.PI) / 180, outer, scale, cx, cy, beam, rings, segs });
    return [
      `  <defs><g id="bh-out">${d.outside}</g><g id="bh-far">${d.far}</g>` +
        `<g id="bh-near">${d.near}</g><g id="bh-sec">${d.sec}</g></defs>`,
      `  <g>${starfield(r, 70)}</g>`,
      // Bloom: the same geometry blurred, behind everything, so the light spills the
      // way a bright source does instead of sitting flat on the background.
      `  <use href="#bh-out" filter="url(#blur40)" opacity="0.16"/>`,
      `  <use href="#bh-out" filter="url(#blur18)" opacity="0.2"/>`,
      // The 8px blur dissolves the mesh. 3px was enough for the seams but not for the
      // facets on the halo, where lensing stretches the cells until their outlines show.
      `  <use href="#bh-out" filter="url(#blur8)"/>`,
      `  <use href="#bh-far" filter="url(#blur8)"/>`,
      // The shadow: the hole swallows the middle of everything behind it.
      `  <circle cx="${cx}" cy="${cy}" r="${n(d.shadowR)}" fill="#03040F"/>`,
      `  <use href="#bh-sec" filter="url(#blur18)" opacity="0.35"/>`,
      `  <use href="#bh-sec" filter="url(#blur8)"/>`,
      `  <g>${d.ring}</g>`,
      `  <use href="#bh-near" filter="url(#blur8)"/>`,
      `  <circle cx="${cx}" cy="${cy}" r="${n(markH * 0.7)}" fill="url(#scrim)"/>`,
      `  ${mark(cx, cy, markH)}`,
    ].join('\n');
  };
}

// ---------------------------------------------------------------- planet art
//
// A wireframe globe: the limb, three latitudes, two meridians. Everything is one
// stroke width, because they are all the same kind of line (rule 10), and the set
// is deliberately sparse — a full lattice turns to dirt at the narrow crop.
function globe(cx, cy, rad, { width = 3.6, opacity = 0.55 } = {}) {
  const line = (body) => `<${body} fill="none" stroke="${C.cyanLt}" stroke-width="${n(width)}"/>`;
  const parts = [];
  // Latitudes. Half-width is the circle's chord at that height; the squash factor
  // is what sets the apparent tilt, and is shared with the meridians below.
  for (const f of [-0.46, 0, 0.46]) {
    const rx = rad * Math.sqrt(1 - f * f);
    parts.push(line(`ellipse cx="${n(cx)}" cy="${n(cy + f * rad)}" rx="${n(rx)}" ry="${n(rx * 0.24)}"`));
  }
  // Meridians: one ellipse is two of them, plus the pole-to-pole line.
  parts.push(line(`ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rad * 0.52)}" ry="${n(rad)}"`));
  parts.push(line(`line x1="${n(cx)}" y1="${n(cy - rad)}" x2="${n(cx)}" y2="${n(cy + rad)}"`));
  return `<g opacity="${opacity}">${parts.join('')}</g>`;
}





// ------------------------------------------- GLIDE transparent compression
//
// Three candidates for one idea: the client library shrinks a value before it
// leaves the application, so the smaller form is what crosses the network and
// what the server holds. All three keep the transformation on the client's side
// of the wire and put the mark at the far end of it, which is what separates
// them from `memory-efficiency` (a static field of cells getting denser, with no
// client and no wire) and from `limits-tight-envelope` (work packed into a box).
// They differ in the device: plates closing on the content, the content folding
// itself, and unlike values leaving the client in one identical form.

// The press: two plates converge on the lanes of content running between them,
// so what enters the client loose leaves it as one dense band on the wire.



// ------------------------------------------------------- prometheus scraping
//
// One post, three readings of the same pipeline: the counters come out of the
// server on a schedule (`prometheus-scrape-tick`), every node's come out into the
// same store (`prometheus-scrape-every-node`), and what you do with them is read
// them all on one screen (`prometheus-scrape-wall`). None of them is a single
// chart, because `benchmarks` is already that.

// The scrape interval: the same handful of counters is read out of the server at a
// fixed cadence, and each reading is kept beside the last, so a number that only
// ever existed as an instant becomes a history.


// One screen, every series: the stored metrics come back as a wall of panels, and
// the reason to have them is that the one that has gone wrong is the only thing on
// the wall that is not flat.
function prometheusScrapeWall(r) {
  const smallW = 222;
  const smallH = 200;
  const smallX = [460, 700];
  const smallY = [232, 446, 660];
  const bx0 = 950;
  const bx1 = 1460;
  const byTop = 285;
  const byBottom = 805;

  // A quiet series: it wanders around its own level and stays there.
  const trace = (x0, x1, level, amp, steps) => {
    const pts = [];
    let v = level;
    for (let i = 0; i <= steps; i++) {
      v += (level - v) * 0.5 + (r() - 0.5) * amp;
      pts.push([x0 + ((x1 - x0) * i) / steps, v]);
    }
    return pts;
  };
  const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${n(x)} ${n(y)}`).join(' ');

  const panels = [];
  for (const y of smallY) {
    for (const x of smallX) {
      const pts = trace(x + 24, x + smallW - 24, y + smallH * 0.66, 26, 9);
      panels.push(
        `<rect x="${x}" y="${y}" width="${smallW}" height="${smallH}" rx="18" fill="${C.ink}" ` +
          `fill-opacity="0.42" stroke="${C.cyanLt}" stroke-width="2.6" opacity="0.5"/>`,
        `<rect x="${x + 24}" y="${y + 26}" width="${n(58 + r() * 46)}" height="12" rx="6" fill="${C.ice}" opacity="0.4"/>`,
        `<path d="${path(pts)}" fill="none" stroke="${C.cyan}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`
      );
    }
  }

  // The panel that is why you built the wall: flat, then away it goes.
  const bPts = [];
  const bx = (t) => bx0 + 40 + t * (bx1 - bx0 - 110);
  const flatY = byBottom - 120;
  let v = flatY;
  for (let i = 0; i <= 8; i++) {
    v += (flatY - v) * 0.5 + (r() - 0.5) * 30;
    bPts.push([bx(i / 16), v]);
  }
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    bPts.push([bx(0.5 + t * 0.5), flatY - Math.pow(t, 1.7) * (flatY - byTop - 152)]);
  }
  const bDraw = path(bPts);
  const bFill =
    `<path d="${bDraw} L ${n(bx(1))} ${n(byBottom - 34)} L ${n(bx(0))} ${n(byBottom - 34)} Z" ` +
    `fill="${C.coral}" opacity="0.16"/>`;
  const bEnd = bPts[bPts.length - 1];

  const big =
    `<rect x="${bx0}" y="${byTop}" width="${bx1 - bx0}" height="${byBottom - byTop}" rx="22" fill="${C.ink}" ` +
      `fill-opacity="0.5" stroke="${C.ice}" stroke-width="5" opacity="0.92"/>` +
    `<line x1="${bx0 + 30}" y1="${byTop + 84}" x2="${bx1 - 30}" y2="${byTop + 84}" stroke="${C.ice}" ` +
      `stroke-width="2.6" opacity="0.45"/>` +
    `<g opacity="0.9">${mark(bx0 + 66, byTop + 44, 44)}</g>` +
    `<rect x="${bx0 + 108}" y="${byTop + 34}" width="150" height="14" rx="7" fill="${C.ice}" opacity="0.45"/>`;

  return [
    `  <ellipse cx="${n((bx0 + bx1) / 2)}" cy="${n((byTop + byBottom) / 2)}" rx="360" ry="360" fill="url(#h-coral)" opacity="0.2"/>`,
    `  <g>${panels.join('')}</g>`,
    `  ${big}`,
    `  ${bFill}`,
    `  <path d="${bDraw}" fill="none" stroke="${C.coral}" stroke-width="20" stroke-linecap="round" opacity="0.28" filter="url(#blur8)"/>`,
    `  <path d="${bDraw}" fill="none" stroke="${C.coral}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`,
    `  ${dot(bEnd[0], bEnd[1], 13, C.coral, 'coral', 0.95)}`,
  ].join('\n');
}


// The large value: the focal element of all three themes, so it is the only
// thing carrying a halo, drawn the way `large-key` draws its outsized key.

const LOT_CYAN = [[C.cyan, 6], [C.cyanLt, 4]];




// ------------------------------------------------------------- LLM KV caching
//
// Three candidates for the KV-cache post, and they share one colour reading:
// mint is KV that came back from Valkey, cyan is the work the GPU still has to
// do, violet is the recompute that no longer happens, gold is the first token
// reaching the reader.
//
// A processor glyph appears in two of them, because the thing being spared here
// is GPU work and no existing theme has a compute element. It is one shape used
// one way: a rounded die with an even grid of cells inside it and pin stubs on
// the outer edges, always quieter than whatever it is feeding.
function die(x, y, w, h, r, { slots = 0, slotY = 0, slotH = 0 } = {}) {
  const rows = slots ? 2 : 3;
  const cells = [];
  for (let c = 0; c < 6; c++) {
    for (let j = 0; j < rows; j++) {
      cells.push(
        `<rect x="${n(x + 36 + c * 45)}" y="${n(y + 30 + j * 34)}" width="36" height="26" rx="5" ` +
          `fill="${C.cyanLt}" opacity="${n(0.26 + r() * 0.2)}"/>`
      );
    }
  }
  const pins = [];
  for (let i = 0; i < 7; i++) {
    const px = x + 40 + i * 44;
    pins.push(
      `<rect x="${n(px)}" y="${n(y - 18)}" width="12" height="18" rx="3" fill="${C.ice}" opacity="0.3"/>`,
      `<rect x="${n(px)}" y="${n(y + h)}" width="12" height="18" rx="3" fill="${C.ice}" opacity="0.3"/>`
    );
  }
  // The local tier, when the die carries one: a row of identical slots along its
  // lower edge, so a slot standing empty is legible as room for exactly one more.
  const tier = [];
  if (slots) {
    tier.push(
      `<line x1="${n(x + 26)}" y1="${n(slotY - 22)}" x2="${n(x + w - 26)}" y2="${n(slotY - 22)}" ` +
        `stroke="${C.ice}" stroke-width="2" opacity="0.3"/>`
    );
    for (let i = 0; i < slots; i++) {
      tier.push(
        `<rect x="${n(x + 26 + i * 64)}" y="${n(slotY)}" width="52" height="${n(slotH)}" rx="10" ` +
          `fill="none" stroke="${C.ice}" stroke-width="2.4" opacity="0.3"/>`
      );
    }
  }
  return (
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="26" fill="${C.ink}" fill-opacity="0.45" ` +
      `stroke="${C.ice}" stroke-width="3" opacity="0.55"/>` +
    pins.join('') +
    cells.join('') +
    tier.join('')
  );
}

// Idea: only the new tail of a prompt is computed, because the KV for everything
// ahead of it is loaded back out of Valkey instead of being processed again.
// Focal: the long mint run of loaded chunks that makes up most of the prompt bar.
function kvCacheNewTail(r) {
  const x0 = 340;
  const x1 = 1560;
  const chunks = 22;
  const split = 15; // chunks before this one are loaded, the rest are computed
  const pitch = (x1 - x0) / chunks;
  const cw = pitch - 9;
  const barTop = 496;
  const cellH = 104;
  const boundary = x0 + split * pitch;

  // A gap at the split, so the two provenances read as two runs rather than as a
  // gradient across one.
  const gap = 20;
  const cells = [];
  for (let i = 0; i < chunks; i++) {
    const loaded = i < split;
    cells.push(
      `<rect x="${n(x0 + i * pitch + (loaded ? 0 : gap))}" y="${barTop}" width="${n(cw)}" height="${cellH}" rx="12" ` +
        `fill="${loaded ? C.mint : C.cyan}" opacity="${n(loaded ? 0.9 + r() * 0.1 : 0.72 + r() * 0.12)}"/>`
    );
  }

  // The compute side, sitting over the tail and only as wide as the tail.
  const chip = die(1120, 220, 340, 160, r);
  const feed = (x, color, y0, y1) =>
    `<line x1="${n(x)}" y1="${n(y0)}" x2="${n(x)}" y2="${n(y1)}" stroke="${color}" stroke-width="11" ` +
    `stroke-linecap="round" opacity="0.5"/>`;
  const feeds = [1210, 1300, 1390].map((x) => feed(x, C.cyan, 400, 490)).join('');

  // The store, sitting under the loaded run, feeding it the same way.
  const sy = 716;
  const sh = 150;
  const store =
    `<rect x="556" y="${sy}" width="400" height="${sh}" rx="30" fill="${C.cyan}" fill-opacity="0.14" ` +
      `stroke="${C.ice}" stroke-width="3.4" opacity="0.6"/>` +
    `<circle cx="756" cy="${sy + sh / 2}" r="84" fill="url(#scrim)"/>` +
    mark(756, sy + sh / 2, 108);
  const loads = [640, 756, 872].map((x) => feed(x, C.mint, barTop + cellH + 6, sy - 6)).join('');

  return [
    `  <ellipse cx="${n((x0 + boundary) / 2)}" cy="${n(barTop + cellH / 2)}" rx="470" ry="215" fill="url(#h-mint)" opacity="0.22"/>`,
    `  <g>${chip}</g>`,
    `  <g>${feeds}</g>`,
    `  <g>${store}</g>`,
    `  <g>${loads}</g>`,
    `  <g>${cells.join('')}</g>`,
  ].join('\n');
}





// Idea: the per-node exporter hands you one readout per node, the cluster exporter
// hands you a single readout for the whole cluster, and they are not the same shape.
// Focal: the one large cluster readout, its hottest slot picked out in red.
function exporterManyAndOne(r) {
  const cw = 320; // the per-node readouts, one per node, fanned as a deck
  const ch = 140;
  const deck = [];
  for (let i = 0; i < 5; i++) {
    const x = 500 + i * 24;
    const y = 380 + i * 42;
    const top = i === 4;
    deck.push(
      `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="18" fill="${C.ink}" ` +
        `fill-opacity="0.6" stroke="${C.cyanLt}" stroke-width="4" opacity="${top ? 0.6 : 0.5}"/>`
    );
    if (top) {
      deck.push(`<g opacity="0.55">${mark(x + 46, y + 70, 46)}</g>`);
      for (let j = 0; j < 3; j++) {
        deck.push(
          `<rect x="${x + 92}" y="${n(y + 37 + j * 28)}" width="${n(90 + r() * 100)}" height="11" ` +
            `rx="5.5" fill="${C.cyanLt}" opacity="0.5"/>`
        );
      }
    }
  }

  // The single cluster readout: per-slot counters, which is the series the per-node
  // exporter has no equivalent for, with the hottest slot standing out.
  const bars = [];
  const hot = 7;
  for (let i = 0; i < 12; i++) {
    const h = i === hot ? 396 : 96 + r() * 250;
    bars.push(
      `<rect x="${n(1032 + i * 30)}" y="${n(790 - h)}" width="22" height="${n(h)}" rx="5" ` +
        `fill="${i === hot ? C.coral : C.cyan}" opacity="${i === hot ? 0.95 : n(0.5 + r() * 0.25)}"/>`
    );
  }

  return [
    `  <circle cx="1207" cy="540" r="360" fill="url(#h-ice)" opacity="0.2"/>`,
    `  <g>${deck.join('')}</g>`,
    `  <rect x="996" y="230" width="422" height="620" rx="24" fill="${C.ink}" fill-opacity="0.5" ` +
      `stroke="${C.ice}" stroke-width="8" opacity="0.95"/>`,
    `  <g opacity="0.85">${mark(1048, 280, 44)}</g>`,
    `  <line x1="1020" y1="312" x2="1394" y2="312" stroke="${C.ice}" stroke-width="1.8" opacity="0.45"/>`,
    `  <g>${bars.join('')}</g>`,
    `  <line x1="1020" y1="790" x2="1394" y2="790" stroke="${C.ice}" stroke-width="2.4" opacity="0.5"/>`,
  ].join('\n');
}

// --------------------------------------- browsing a keyspace safely from a GUI
//
// Three readings of one post about pointing a graphical client at a server that
// is taking traffic. `keyspace-gui-safe-refusal` is the enforcement: the write is
// turned back by the server, not by a switch in the client. `keyspace-gui-safe-grant`
// is the grant itself: one slice of the command surface, with the dangerous part
// taken back out of the middle of it. `keyspace-gui-safe-readout` is what that
// leaves the client to be: panels, each one read command's reply.
//
// `keyspace-scan` already owns the cursor over a key field, so none of the three
// draws one, and `security-shield-clean` owns the shield.

// Idea: the reads a client sends carry on across the server's boundary, and the
// write it sends is turned back at that same boundary.
// Focal: the thick coral write lane, doubling back on itself where it arrives.
function keyspaceGuiSafeRefusal() {
  const wall = 1000;
  const top = 258;
  const bottom = 866;
  const mid = 562;
  const reads = [312, 420, 700, 808];
  const LANE = 9;
  const FACE = 14; // half the boundary's thickness

  // The boundary, one unbroken bar the height of the frame. Two earlier passes cut
  // openings in it where the permitted commands cross, and both read as a dashed
  // rule at banner size rather than as something a command has to get past. A lane
  // simply drawn over a solid bar reads as passing through it, which is cheaper and
  // truer: the boundary is one rule and what happens at it depends on the caller.
  const barrier = (w, fill, op, filter) =>
    `<rect x="${n(wall - w / 2)}" y="${top}" width="${n(w)}" height="${bottom - top}" rx="${n(w / 2)}" ` +
    `fill="${fill}" opacity="${op}"${filter ? ` filter="url(#${filter})"` : ''}/>`;

  // One direction device for the whole image: a chevron at the end of each lane.
  const chevron = (x, y, dx, wing, color, w, op) =>
    `<path d="M ${n(x)} ${n(y - wing)} L ${n(x + dx)} ${n(y)} L ${n(x)} ${n(y + wing)}" fill="none" ` +
    `stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;

  const lanes = reads
    .map(
      (y) =>
        `<line x1="200" y1="${y}" x2="1720" y2="${y}" stroke="${C.cyanLt}" stroke-width="${LANE}" ` +
        `stroke-linecap="round" opacity="0.5"/>` +
        chevron(1100, y, 46, 24, C.cyanLt, LANE, '0.5')
    )
    .join('');

  // The write. It arrives, the boundary refuses it, and the refusal is what goes
  // back to the caller: one lane in, the same lane out, tangent to the wall.
  const inY = mid - 58;
  const outY = mid + 58;
  const turn = wall - FACE - 58; // puts the arc's apex on the boundary's near face
  const write = `M 200 ${inY} L ${turn} ${inY} A 58 58 0 0 1 ${turn} ${outY} L 660 ${outY}`;

  return [
    `  <circle cx="920" cy="${mid}" r="380" fill="url(#h-coral)" opacity="0.26"/>`,
    `  ${barrier(FACE * 2 + 22, C.ice, '0.16', 'blur18')}`,
    `  ${barrier(FACE * 2, C.ice, '0.55')}`,
    `  <g>${lanes}</g>`,
    // The boundary lit where it did the refusing.
    `  <rect x="${n(wall - FACE)}" y="${n(inY - 22)}" width="${FACE * 2}" ` +
      `height="${n(outY - inY + 44)}" rx="${FACE}" fill="${C.coral}" opacity="0.9"/>`,
    `  <path d="${write}" fill="none" stroke="${C.coral}" stroke-width="36" opacity="0.32" filter="url(#blur18)"/>`,
    `  <path d="${write}" fill="none" stroke="${C.coral}" stroke-width="20" stroke-linecap="round"/>`,
    `  ${chevron(660, outY, -52, 34, C.coral, 20, '1')}`,
    `  <g opacity="0.6">${mark(1290, mid, 180)}</g>`,
  ].join('\n');
}



// ------------------------------------------------ conditions in the command
//
// Valkey 9.2 pushes conditional logic into plain commands: a check that used to
// cost extra round trips, or a Lua script, is now an option on one command. All
// three themes below are the same substitution seen from a different side, so
// they share two glyphs: the condition chip (two values set against each other)
// and the chevron head.

// The check the command now carries: two values held against each other, the
// lower one shorter so they read as unequal rather than as a pair of bars.
function conditionGlyph(cx, cy, w, h, color) {
  const barH = Math.max(11, h * 0.125);
  const inner = w * 0.58;
  return (
    `<rect x="${n(cx - w / 2)}" y="${n(cy - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(h * 0.24)}" ` +
      `fill="${C.ink}" fill-opacity="0.66" stroke="${color}" stroke-width="${n(Math.max(4.5, h * 0.05))}"/>` +
    `<rect x="${n(cx - inner / 2)}" y="${n(cy - h * 0.21 - barH / 2)}" width="${n(inner)}" height="${n(barH)}" ` +
      `rx="${n(barH / 2)}" fill="${color}" opacity="0.95"/>` +
    `<rect x="${n(cx - inner * 0.275)}" y="${n(cy + h * 0.21 - barH / 2)}" width="${n(inner * 0.55)}" height="${n(barH)}" ` +
      `rx="${n(barH / 2)}" fill="${color}" opacity="0.95"/>`
  );
}

// A chevron arrowhead at (x, y) pointing along the unit vector (ux, uy).
function chevronHead(x, y, ux, uy, size, color, width, opacity = 0.9) {
  const bx = x - ux * size;
  const by = y - uy * size;
  const px = -uy * size * 0.82;
  const py = ux * size * 0.82;
  return (
    `<path d="M ${n(bx + px)} ${n(by + py)} L ${n(x)} ${n(y)} L ${n(bx - px)} ${n(by - py)}" fill="none" ` +
    `stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round" opacity="${n(opacity)}"/>`
  );
}

// Idea: the conditional update that took a four-message exchange now takes one
// call, because the call carries the condition.
// Focal: the single thick green call along the bottom, with the check on it.
function commandsRoundTrips() {
  const cx = 596; // the caller's rail
  const sx = 1324; // the server's rail
  const endY = 222;
  const callY = 778;

  const rails = [cx, sx]
    .map(
      (x) =>
        `<line x1="${x}" y1="${endY + 60}" x2="${x}" y2="${callY + 46}" stroke="${C.cyanLt}" ` +
        `stroke-width="4" stroke-dasharray="12 16" opacity="0.3"/>`
    )
    .join('');

  // The old exchange: ask, get the value back, decide, write, get the reply.
  // Violet because it is the retired way of doing it, and thin because it is not
  // what the picture is about.
  const hops = [340, 444, 548, 652]
    .map((y, i) => {
      const rightward = i % 2 === 0;
      const tip = rightward ? sx - 8 : cx + 8;
      const u = rightward ? 1 : -1;
      return (
        `<line x1="${cx}" y1="${y}" x2="${sx}" y2="${y}" stroke="${C.violet}" stroke-width="7" opacity="0.5"/>` +
        chevronHead(tip, y, u, 0, 26, C.violet, 7, 0.5)
      );
    })
    .join('');

  // The one call. Everything about it is heavier: the lane, its halo, its head.
  const call =
    `<line x1="${cx}" y1="${callY}" x2="${sx}" y2="${callY}" stroke="${C.mint}" stroke-width="60" ` +
      `opacity="0.2" filter="url(#blur18)"/>` +
    `<line x1="${cx}" y1="${callY}" x2="${sx}" y2="${callY}" stroke="${C.mint}" stroke-width="24" opacity="0.95"/>` +
    chevronHead(sx - 6, callY, 1, 0, 40, C.mint, 24, 0.95);

  return [
    `  <ellipse cx="960" cy="${callY}" rx="480" ry="150" fill="url(#h-mint)" opacity="0.3"/>`,
    `  <g>${rails}</g>`,
    `  <g>${hops}</g>`,
    // The two ends of the exchange, differently shaped so the direction reads: a
    // caller on the left, the server on the right.
    `  <rect x="${cx - 48}" y="${endY - 48}" width="96" height="96" rx="24" fill="${C.cyan}" ` +
      `fill-opacity="0.18" stroke="${C.cyanLt}" stroke-width="5" opacity="0.8"/>`,
    `  <g opacity="0.85">${mark(sx, endY, 96)}</g>`,
    `  <g>${call}</g>`,
    `  <g>${conditionGlyph(952, callY, 196, 124, C.ice)}</g>`,
  ].join('\n');
}

// Idea: the Lua script written for a conditional write collapses into one plain
// command with the condition hung on the end of it.
// Focal: the single wide command bar and the green condition seated at its tail.
function commandsOneLine(r) {
  // Kept clear of the corner lockup, which reaches x 521 and y 247 at this zoom.
  const px = 580;
  const pw = 336;
  const pTop = 200;
  const pH = 300;

  // The script, suggested as ragged indented lines rather than written out. Quiet
  // and violet: it is what is being replaced.
  const lines = [];
  let ly = pTop + 46;
  while (ly < pTop + pH - 30) {
    const indent = weighted(r, [[0, 3], [1, 5], [2, 3]]) * 26;
    const w = 58 + r() * (pw - 126 - indent);
    lines.push(
      `<rect x="${n(px + 32 + indent)}" y="${n(ly)}" width="${n(w)}" height="11" rx="5.5" ` +
        `fill="${C.violet}" opacity="${n(0.42 + r() * 0.18)}"/>`
    );
    ly += 38;
  }
  const script =
    `<rect x="${px}" y="${pTop}" width="${pw}" height="${pH}" rx="20" fill="${C.ink}" fill-opacity="0.35" ` +
      `stroke="${C.violet}" stroke-width="3" opacity="0.55"/>` +
    lines.join('');

  // One command: a run of pale words on a single bar, and the option that carries
  // the condition sitting at the end of it.
  const bx = 510;
  const bw = 900;
  const by = 716;
  const bh = 196;
  const words = [[bx + 56, 240], [bx + 320, 150], [bx + 500, 130]]
    .map(
      ([x, w]) =>
        `<rect x="${n(x)}" y="${n(by - 19)}" width="${n(w)}" height="38" rx="19" fill="${C.ice}" opacity="0.82"/>`
    )
    .join('');

  const arrowX = px + pw / 2;
  const arrow =
    `<line x1="${n(arrowX)}" y1="${pTop + pH + 34}" x2="${n(arrowX)}" y2="${by - bh / 2 - 44}" ` +
      `stroke="${C.mint}" stroke-width="9" opacity="0.7"/>` +
    chevronHead(arrowX, by - bh / 2 - 36, 0, 1, 30, C.mint, 9, 0.7);

  return [
    `  <ellipse cx="${n(bx + bw / 2)}" cy="${by}" rx="600" ry="200" fill="url(#h-cyan)" opacity="0.26"/>`,
    `  <g>${script}</g>`,
    `  <g>${arrow}</g>`,
    `  <rect x="${bx}" y="${n(by - bh / 2)}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.cyan}" ` +
      `fill-opacity="0.22" stroke="${C.ice}" stroke-width="6"/>`,
    `  <g>${words}</g>`,
    `  <g>${conditionGlyph(bx + bw - 140, by, 216, 132, C.mint)}</g>`,
  ].join('\n');
}


// ------------------------------------------------ advisories in the AI era
//
// AI made vulnerability reports nearly free to produce, so the inbound volume
// jumped and a handful of maintainers have to keep up with it. Three readings of
// that, one per section of the post: the flood against the bar that sorts it
// (`ai-advisory-surge-sieve`), the project generating and killing its own
// candidates before anyone reports them (`ai-advisory-surge-reproducer`), and one
// verified fix landing on every supported version at once
// (`ai-advisory-surge-backport-rails`). None of them draws a shield or a padlock:
// `security-shield-clean` already owns security in general.


function aiAdvisorySurgeReproducer(r) {
  // Idea: the project proposes its own candidate bugs, and only the one that comes with a reproducing crash survives a second reading.
  // Focal: the reproducer panel under the surviving candidate.
  const cx = 960;
  const rowY = 300;
  const pitch = 175;
  const cw = 130;
  const ch = 86;

  // Four candidates struck out on the second reading. One line weight for the
  // cross, one size for the card, everywhere.
  const struck = [];
  for (const i of [0, 1, 3, 4]) {
    const x = cx + (i - 2) * pitch;
    struck.push(
      `<rect x="${n(x - cw / 2)}" y="${n(rowY - ch / 2)}" width="${cw}" height="${ch}" rx="14" fill="${C.cyan}" opacity="0.3"/>`,
      `<rect x="${n(x - cw / 2)}" y="${n(rowY - ch / 2)}" width="${cw}" height="${ch}" rx="14" fill="none" stroke="${C.cyanLt}" stroke-width="3" opacity="0.4"/>`,
      `<g stroke="${C.coral}" stroke-width="12" stroke-linecap="round" opacity="0.6">` +
        `<line x1="${n(x - 40)}" y1="${n(rowY - 26)}" x2="${n(x + 40)}" y2="${n(rowY + 26)}"/>` +
        `<line x1="${n(x + 40)}" y1="${n(rowY - 26)}" x2="${n(x - 40)}" y2="${n(rowY + 26)}"/></g>`
    );
  }

  const survivor =
    `<rect x="${n(cx - 75)}" y="${n(rowY - 50)}" width="150" height="100" rx="16" fill="${C.mint}" opacity="0.85"/>` +
    `<rect x="${n(cx - 75)}" y="${n(rowY - 50)}" width="150" height="100" rx="16" fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.9"/>`;

  // The evidence it carries: a run of lines and, at the end, the crash they produce.
  const px0 = 720;
  const py0 = 500;
  const bars = [];
  for (let i = 0; i < 4; i++) {
    bars.push(
      `<rect x="${px0 + 42}" y="${n(py0 + 46 + i * 46)}" width="${n(210 + r() * 150)}" height="18" rx="9" fill="${C.ice}" opacity="0.75"/>`
    );
  }
  bars.push(
    `<rect x="${px0 + 42}" y="${n(py0 + 236)}" width="300" height="18" rx="9" fill="${C.coral}" opacity="0.9"/>`
  );

  return [
    `  <ellipse cx="${cx}" cy="670" rx="340" ry="250" fill="url(#h-mint)" opacity="0.35"/>`,
    `  <g>${struck.join('')}</g>`,
    `  <line x1="${cx}" y1="${rowY + 50}" x2="${cx}" y2="${py0}" stroke="${C.mint}" stroke-width="10" opacity="0.7"/>`,
    `  <g>${survivor}</g>`,
    `  <rect x="${px0}" y="${py0}" width="480" height="300" rx="22" fill="${C.ink}" opacity="0.45"/>`,
    `  <rect x="${px0}" y="${py0}" width="480" height="300" rx="22" fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.9"/>`,
    `  <g>${bars.join('')}</g>`,
  ].join('\n');
}

function aiAdvisorySurgeBackportRails(r) {
  // Idea: one verified fix lands on every supported version at the same time instead of being carried to them one at a time.
  // Focal: the vertical run of the same fix, one node on every branch.
  const RAILS = [290, 425, 560, 695, 830];
  const branchX = [200, 420, 560, 700, 840];
  const right = 1700;
  const fixX = 1010;

  const rails = RAILS.map(
    (y, i) =>
      `<line x1="${branchX[i]}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.ice}" stroke-width="7" opacity="0.32"/>`
  );

  // Where each maintenance line left the one above it, so the rails read as
  // supported versions rather than as rows.
  const branches = RAILS.slice(1).map((y, k) => {
    const bx = branchX[k + 1];
    const yp = RAILS[k];
    return `<path d="M ${bx - 96} ${yp} C ${bx - 40} ${yp} ${bx - 56} ${y} ${bx} ${y}" fill="none" stroke="${C.ice}" stroke-width="6" opacity="0.22"/>`;
  });

  const commits = [];
  for (let i = 0; i < RAILS.length; i++) {
    for (let x = branchX[i] + 104; x < right - 50; x += 116) {
      if (Math.abs(x - fixX) < 84) continue;
      commits.push(dot(x, RAILS[i], 9, C.cyanLt, 'cyan', 0.42 + r() * 0.12, 2.2));
    }
  }

  const spine = `<line x1="${fixX}" y1="275" x2="${fixX}" y2="845" stroke="${C.mint}" stroke-width="11" opacity="0.85"/>`;
  const nodes = RAILS.map((y) => dot(fixX, y, 21, C.mint, 'mint', 1, 3.2));

  return [
    `  <ellipse cx="${fixX}" cy="560" rx="205" ry="370" fill="url(#h-mint)" opacity="0.3"/>`,
    `  <g>${branches.join('')}</g>`,
    `  <g>${rails.join('')}</g>`,
    `  <g>${commits.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.4"><line x1="${fixX}" y1="275" x2="${fixX}" y2="845" stroke="${C.mint}" stroke-width="28"/></g>`,
    `  ${spine}`,
    `  <g>${nodes.join('')}</g>`,
  ].join('\n');
}










// ------------------------------------------------- large values and the tail
//
// The post: 10 req/s of 10MB GETs wrecks the p99.9 of 100K req/s of 1KB GETs,
// because before 9.0 the main thread copied the whole 10MB into a reply buffer
// before it could go back to serving anything else. Valkey 9 hands the I/O
// threads a reference instead, so the payload never crosses that thread.
//
// In both of these the small requests are one repeated shape on one even pitch,
// and the large value is the only coral object and the only thing that breaks the
// pitch. What differs is what it breaks: a run of waits, or a queue.
//
// `large-object-tail-*` failed by putting a big translucent coral box beside a
// field of small pills, which reads as "one item is bigger". The value is solid
// here, and in both themes it is in contact with the thing it is holding up.
//
// A third candidate, the 9.0 fix, was drawn three times and dropped: see the
// rejected list in the README. A large coral mass anywhere near a row of small
// requests is read as blocking them, whichever way the picture is arranged.

// The large value. Solid rather than the translucent outline the earlier
// candidates used, which read as an empty glass panel instead of a heavy object.
function bvlPayload(x, y, w, h, rx = 12) {
  const box = `x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}"`;
  // Fully opaque: at 0.9 the halo behind it showed through as a faint oval, which
  // a blind read called out as decoration inside the object.
  return `<rect ${box} fill="${C.coral}"/><rect ${box} fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.35"/>`;
}

function bvlCopyBlock(r) {
  // Idea: the one big copy owns the thread for as long as it takes, and the small
  // requests underneath it wait exactly that long.
  // Focal: the coral block of occupied thread time.
  const axis = 400;
  const pitch = 74;
  const big = { x: 760, w: 390, h: 180 };

  // Every small request's wait, hanging off the thread's own timeline at the rate
  // they arrive. An even row of stubs is the workload behaving.
  const waits = [];
  const wait = (x, depth) =>
    `<rect x="${n(x)}" y="${n(axis + 14)}" width="30" height="${n(depth)}" rx="15" fill="${C.cyan}" opacity="0.6"/>`;

  for (let x = 240; x < 1720; x += pitch) {
    if (x + 30 > big.x && x < big.x + big.w) continue;
    waits.push(wait(x, 58 + r() * 16));
  }

  // The requests that arrive while the copy runs. The first one waits out the
  // whole copy, the last one almost none of it, so the wedge is deepest against
  // the block's leading edge and its span is the block's span.
  // A clean ramp, not a jittered one: a blind read called the varying heights
  // inside the wedge arbitrary, and the ramp is the whole point.
  for (let i = 0; i < 5; i++) {
    waits.push(wait(big.x + 12 + i * pitch, 390 - i * 76));
  }

  return [
    `  <ellipse cx="${n(big.x + big.w / 2)}" cy="${n(axis - big.h / 2)}" rx="420" ry="290" fill="url(#h-coral)" opacity="0.2"/>`,
    `  <g>${waits.join('')}</g>`,
    `  <line x1="200" y1="${axis}" x2="1720" y2="${axis}" stroke="${C.ice}" stroke-width="10" opacity="0.75"/>`,
    `  <g>${bvlPayload(big.x, axis - big.h, big.w, big.h)}</g>`,
  ].join('\n');
}

function bvlStalledQueue() {
  // Idea: there is one channel out of the server, and while the large value is in
  // it nothing else moves through.
  // Focal: the coral value filling the channel.
  const lanes = [330, 540, 750];
  const bh = 96;
  const bw = 80;
  const plug = { x: 1000, w: 370, y: 236, h: 608 };

  // One fill for every request. A blind read read the two-tone version as shading
  // for its own sake, and nothing here differs in kind.
  const block = (x, cy) =>
    `<rect x="${n(x)}" y="${n(cy - bh / 2)}" width="${bw}" height="${bh}" rx="20" ` +
    `fill="${C.cyan}" opacity="0.55"/>`;

  // Held: single file, packed nose to tail back from the value's near face. The
  // run ends inside the frame rather than bleeding, so the queue has a visible
  // tail and the narrow crop is not cutting a column in half.
  const held = [];
  for (const cy of lanes) {
    for (let x = plug.x - 8 - bw; x > 470; x -= bw + 14) held.push(block(x, cy));
  }

  return [
    `  <ellipse cx="${n(plug.x + plug.w / 2)}" cy="540" rx="330" ry="420" fill="url(#h-coral)" opacity="0.2"/>`,
    `  <g>${held.join('')}</g>`,
    `  <g>${bvlPayload(plug.x, plug.y, plug.w, plug.h, 8)}</g>`,
  ].join('\n');
}

// -------------------------------------------- client-side compression (GLIDE)
//
// The visible fact about compression is that the thing gets smaller, so both of
// these draw the value itself at two sizes and nothing else. The run below is the
// value's own content: the same number of fields at both sizes, because the content
// does not change, only how much room each field takes. Equal field counts are what
// keeps "smaller" from reading as "truncated".
//
// A first pass gave each of them a pale bar for the client's edge, horizontal in one
// and vertical in the other. The blind read called it decoration in one and asked
// whether it was a timeline axis in the other, so both are gone: a boundary that has
// to be labelled to be a boundary is furniture, and the size drop says on its own
// that it happened before the value reached the server.
function ccRun(cx, cy, fieldW, h, { fields = 8, gap = 4, color, opacity = 1 }) {
  const pitch = fieldW + gap;
  const x0 = cx - (fields * pitch - gap) / 2;
  const rx = Math.min(6, fieldW / 2.6);
  return Array.from(
    { length: fields },
    (_, i) =>
      `<rect x="${n(x0 + i * pitch)}" y="${n(cy - h / 2)}" width="${n(fieldW)}" height="${n(h)}" ` +
      `rx="${n(rx)}" fill="${color}" opacity="${n(opacity)}"/>`
  ).join('');
}

// Idea: the client shrinks the value before it leaves the application, so what
// crosses the network and lands in the server is a fraction of what the
// application holds.
// Focal: the short dense green run, the value as it now travels.
//
// Both rows start at the same x and end at the same x, so the row is the measure and
// the fill is the message: the top row is the value filling it, the bottom row is the
// same eight fields taking a fifth of it and the rest of the row is the saving. An
// earlier pass ran a long lane down from one row to the other; the blind read went to
// that lane first and took it as one column feeding down rather than the whole value
// getting narrower, so the lane is gone and the rows moved together instead.
function clientCompressionPackedRun() {
  const FIELDS = 8;
  const H = 220;
  const appY = 330; // the value as the application holds it
  const outY = 685; // the value on the wire
  const wide = FIELDS * 106 - 6;
  const packed = FIELDS * 30 - 4;
  const left = 960 - wide / 2;
  const markX = left + wide - 83;

  // The one direction device: what leaves for the server is the short run.
  const send =
    `<line x1="${n(left + packed + 22)}" y1="${outY}" x2="${n(markX - 120)}" y2="${outY}" ` +
      `stroke="${C.mint}" stroke-width="26" opacity="0.5"/>` +
    chevronHead(markX - 114, outY, 1, 0, 34, C.mint, 26, 0.5);

  return [
    `  <ellipse cx="${n(left + packed / 2)}" cy="${outY}" rx="250" ry="200" fill="url(#h-mint)" opacity="0.3"/>`,
    `  <g>${ccRun(960, appY, 100, H, { fields: FIELDS, gap: 6, color: C.cyanLt, opacity: 0.5 })}</g>`,
    `  <g>${send}</g>`,
    `  <g>${ccRun(left + packed / 2, outY, 26, H, { fields: FIELDS, color: C.mint, opacity: 0.95 })}</g>`,
    `  <g opacity="0.55">${mark(markX, outY, 190)}</g>`,
  ].join('\n');
}

// Idea: the same value sent by the same unchanged application code crosses the
// network at a third of the size once the client compresses it.
// Focal: the short green send, the one bright thing in the frame.
//
// Both sends get the same length of wire, drawn as a pale channel, because the
// journey is what does not change. An earlier pass drew the wire as a plain arrow
// per send, and the blind read compared the two arrows instead of the two payloads:
// equal arrows read as "the same", which is the opposite of the point. As a channel
// the equal length is the measure and the fill is the message.
//
// Both runs use the same gap so the field count can be counted at crop size: a blind
// read miscounted them at gap 4 and asked whether the point was fewer fields or
// narrower ones. It is narrower ones, and the equal count is what says so.
//
// No hexagon mark in the art. It sat in the empty band between the two channels with
// nothing arriving at it, and two blind reads in a row called it decoration; the
// corner lockup already says whose wire this is.
function clientCompressionTwinSends() {
  const FIELDS = 6;
  const H = 150;
  const left = 600; // both sends start here: the same call site, the same code
  const wireEnd = 1352; // the chevron tip past this has to stay inside the narrow crop
  const newY = 340; // what crosses now
  const oldY = 720; // what used to cross

  const wire = (y) =>
    `<rect x="${left}" y="${n(y - H / 2)}" width="${wireEnd - left}" height="${H}" rx="${H / 2}" ` +
    `fill="${C.ice}" opacity="0.1"/>`;

  // Inset from the channel's rounded cap, or the run's square corners poke out of it.
  const send = (y, fieldW, gap, color, opacity) =>
    ccRun(left + 14 + (FIELDS * (fieldW + gap) - gap) / 2, y, fieldW, H, { fields: FIELDS, gap, color, opacity }) +
    chevronHead(wireEnd + 54, y, 1, 0, 44, color, 26, n(opacity * 0.85));

  return [
    `  <ellipse cx="${left + 120}" cy="${newY}" rx="300" ry="210" fill="url(#h-mint)" opacity="0.3"/>`,
    `  ${wire(newY)}`,
    `  ${wire(oldY)}`,
    `  <g>${send(oldY, 85, 9, C.violet, 0.45)}</g>`,
    `  <g>${send(newY, 27, 9, C.mint, 0.95)}</g>`,
  ].join('\n');
}


// ------------------------------------------------------- SCAN, page by page
//
// One sentence: a scan walks a keyspace a page at a time under a cursor, so a client
// reads every key without ever asking for all of them at once. `scan-cursor-pages`
// draws that as a partition. The pages stack up to make the keyspace, so they visibly
// cover all of it, and exactly one of them is lit.
//
// The keys are content here, not texture: they sit on a declared pitch at 0.45 and
// above, which is what the deleted `keyspace-scan` got wrong by scattering dots
// under a translucent panel until the field read as a starfield.
//
// Two other readings were built and dropped; see README's Rejected section. Both were
// after the same thing, the bounded reply and the cursor you resume from, and both lost
// the keys in the process. Lifting pages out of the field needs two pages to say "again"
// and they can then only differ by colour, and closing the pages into a ring shrinks a
// key to a dash. The flat partition keeps the keys full size, which is the constraint
// that matters most here.

// Idea: a scan hands back one bounded page of the keyspace at a time, and the pages
// together tile the whole of it.
// Focal: the lit page, one band of gold keys across a field of resting ones.
function scanCursorPages(r) {
  const PAGES = 5;
  const LIT = 2; // the page under the cursor: two pages behind it, two still ahead
  const ROWS = 2;
  const left = 480;
  const right = 1440;
  const gap = 22;
  const rowPitch = 50;
  // The gutter between pages has to beat the 20 gap between rows by a lot, or the
  // stack reads as one even list rather than as five pages.
  const pagePitch = 132;
  const y0 = 240;
  const keyH = 30; // 30 framed units is ~7px in the narrow crop: content, not texture

  // Keys are laid end to end and wrapped, the way names of different lengths actually
  // sit in a list. An earlier pass put them on four fixed columns and the blind read
  // took the columns for page boundaries, which is exactly the wrong reading: a page
  // here is a contiguous run of keys, not a column of them. Rows share a baseline, a
  // height and a gap; only the length of a key varies.
  const keys = [];
  for (let p = 0; p < PAGES; p++) {
    for (let row = 0; row < ROWS; row++) {
      const y = y0 + p * pagePitch + row * rowPitch;
      let x = left;
      for (;;) {
        const w = 96 + r() * 94;
        if (x + w > right) break;
        keys.push({ p, x, y, w });
        x += w + gap;
      }
    }
  }

  const pill = (k, fill, op) =>
    `<rect x="${n(k.x)}" y="${n(k.y)}" width="${n(k.w)}" height="${keyH}" rx="${keyH / 2}" ` +
    `fill="${fill}" opacity="${op}"/>`;

  // Every page not under the cursor is drawn the same: data at rest. An earlier pass
  // coloured the pages above the cursor mint for "already returned", and the blind read
  // called that split decoration, because a stack of pages is a sequence whether or not
  // the drawing says which way it runs. One system, one exception.
  const resting = keys.filter((k) => k.p !== LIT).map((k) => pill(k, C.cyanLt, '0.45'));
  const held = keys.filter((k) => k.p === LIT);

  const bandY = y0 + LIT * pagePitch;
  const bandH = rowPitch + keyH;

  return [
    `  <ellipse cx="960" cy="${n(bandY + bandH / 2)}" rx="600" ry="168" fill="url(#h-gold)" opacity="0.34"/>`,
    `  <g>${resting.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.55">${held.map((k) => pill(k, C.gold, '1')).join('')}</g>`,
    `  <g>${held.map((k) => pill(k, C.gold, '1')).join('')}</g>`,
  ].join('\n');
}


// Idea: an agent keeps its whole conversation in Valkey and reads back only the
// turns that matter for the next one, so the context holds the recent run plus a
// few recalled older turns.
// Focal: the one older turn far down the transcript, lit, with a thick band
// carrying it back up into the newest turns.
function agentContextRecallArc() {
  const turns = 12;
  // Pitch and start are set so the whole column clears the caption blocks: a bar
  // half-hidden behind one reads as an accidental crop.
  const pitch = 42;
  const cy0 = 165;
  const dimH = 26;
  const onH = 36; // under the pitch, so the three newest turns stay three bars
  const barX = 680;
  const barW = 320;
  const recent = 3; // the newest turns, still in the window
  const pulled = 9; // the older turn fetched back for this turn

  const cy = (i) => cy0 + i * pitch;
  const bar = (i, fill, opacity, h) =>
    `<rect x="${barX}" y="${n(cy(i) - h / 2)}" width="${barW}" height="${h}" rx="${n(h / 2)}" ` +
    `fill="${fill}" opacity="${opacity}"/>`;

  const rest = [];
  for (let i = recent; i < turns; i++) {
    if (i !== pulled) rest.push(bar(i, C.cyan, 0.45, dimH));
  }
  // One code for every turn in the window: the blind read read two brightnesses
  // of mint as a gradient artifact rather than as a distinction.
  const held = [];
  for (let i = 0; i < recent; i++) held.push(bar(i, C.mint, 0.95, onH));

  // The one connector, thick enough to survive the narrow crop: out of the
  // recalled turn, up the outside of the transcript, into the newest ones. The
  // head overlaps the newest bar so it lands on a turn, not above the column.
  const end = barX + barW;
  const base = end + 64;
  const band =
    `M ${n(end)} ${n(cy(pulled))} C 1250 ${n(cy(pulled) - 40)} 1250 ${n(cy(0))} ${n(base)} ${n(cy(0))}`;
  const head =
    `M ${n(end - 8)} ${n(cy(0))} L ${n(base)} ${n(cy(0) - 26)} ` +
    `L ${n(base)} ${n(cy(0) + 26)} Z`;

  return [
    `  <g>${rest.join('')}</g>`,
    `  <g>${held.join('')}</g>`,
    `  <g fill="none" stroke="${C.mint}" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="${band}" stroke-width="24" opacity="0.9"/>` +
      `<path d="${head}" fill="${C.mint}" opacity="0.95"/></g>`,
    `  ${bar(pulled, C.mint, 0.95, onH)}`,
  ].join('\n');
}

// --------------------------------------------------- primitives, and what is built
//
// One lattice at one pitch, and one block on it: every unit in the picture is the
// same rect at the same size, so the only difference between the three structures is
// how the blocks are arranged. The pitch is 96x100 with a 12px gap both ways, and
// every structure stands on the same bottom row, which is what makes three unlike
// silhouettes read as three things built out of one part rather than as three drawings.
const BOP = { w: 84, h: 88, px: 96, py: 100, x0: 480, baseY: 840 };

const bopCell = (c, r) => [BOP.x0 + c * BOP.px, BOP.baseY - r * BOP.py];

const bopUnit = (c, r, opacity) => {
  const [x, y] = bopCell(c, r);
  return (
    `<rect x="${n(x - BOP.w / 2)}" y="${n(y - BOP.h / 2)}" width="${BOP.w}" height="${BOP.h}" rx="14" ` +
    `fill="${C.cyanLt}" fill-opacity="0.34" stroke="${C.cyanLt}" stroke-width="3.4" opacity="${opacity}"/>`
  );
};

// ------------------------------------------- fbtree, drawn in the quiet register
//
// Same subject as `fbtreeWideRoot` and `fbtreeTowerAndTree`: Valkey 9.2 replaces the
// skiplist behind large sorted sets with fbtree, a high-fanout B+ tree variant, so
// the ordering is unchanged and the container is one wide contiguous structure
// instead of a tower of pointers per member. Those two drew it at focal weight
// throughout — solid fills, 3 to 4px strokes, 90x70 cells — which is the fault
// DESIGN.md 15 names: when every element is loud, none of them is.
//
// These three are the same structure in `dataStructures`' register: structural
// strokes 1.2 to 1.8px at 0.14 to 0.6 and varied per element, hollow nodes over
// fill-opacity 0.12, entries 24 tall and 36 to 44 wide, and the accent mixed by weight
// across a field rather than a region filled with one colour. What carries the sentence
// is the shape of the whole, so no single node has to.
//
//   fbtreeSoftWideTree     the shape: one wide node of separator keys over packed leaves
//   fbtreeSoftOrderedWalk  the read: an ordered scan runs along the leaf level itself
//   fbtreeSoftScatterRun   the change: one allocation per member becomes a few wide nodes
//
// Colour roles are unchanged from the two they replace: members are content at rest,
// the fbtree's nodes are `mint` as the state arrived at, and the skiplist's pointer
// and span overhead is `violet` as the thing retired.

// One packed entry: small, low and hollow of detail, because a dozen of them in a row
// are a mass and not a dozen readable things (DESIGN.md 14). The mix is by weight, so
// the run has tonal variation without colour being asked to tell entries apart.
//
// `dataStructures` mixes cyan 6, mint 3, violet 2, and the first pass copied that. It
// gets away with a hue mix because it has 35 of these spread over 12 ragged chains, so no
// one of them is the odd one out. Here there are 9 to 12 in three or four tidy leaves, and
// every blind read named the single off-hue cell as the thing its eye went to first — DESIGN.md 6's
// exception-in-a-uniform-field working against the picture. So the mix is two tones of
// the one colour that means content at rest, and the variation is carried by opacity.
// Violet is out for a second reason: it is this set's accent for the thing retired, and
// `fbtreeSoftScatterRun` spends it on the skiplist's overhead in the same frame.
const FBS_MIX = [[C.cyan, 6], [C.cyanLt, 4]];

function fbsCell(r, x, y, w, h) {
  return (
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="4" ` +
    `fill="${weighted(r, FBS_MIX)}" opacity="${n(0.42 + r() * 0.38)}"/>`
  );
}

// A node: hollow, a thin stroke over a fill that only just separates the inside from
// the ground. Every caller passes its own stroke and opacity, because one flat value
// across a structure is what makes a field of nodes read as a wall.
function fbsNode(x, y, w, h, stroke, opacity, color = C.mint, rx = 5) {
  return (
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="${color}" ` +
    `fill-opacity="0.12" stroke="${color}" stroke-width="${n(stroke)}" opacity="${n(opacity)}"/>`
  );
}

// An inner node: one wide box divided into child slots by separator keys, each slot
// holding the small feature fbtree keeps for its child. Drawn hollow with the box
// divided rather than filled, and the features are what stop it reading as an empty
// container: on the first pass the divisions alone were too faint to see and the node
// read as a bar with strings hanging off it, which is DESIGN.md 2's furniture.
function fbsInner(x, y, w, h, slots, stroke, opacity) {
  const pitch = w / slots;
  const parts = [fbsNode(x, y, w, h, stroke, opacity, C.mint, 7)];
  for (let i = 1; i < slots; i++) {
    parts.push(
      `<line x1="${n(x + i * pitch)}" y1="${n(y)}" x2="${n(x + i * pitch)}" y2="${n(y + h)}" ` +
        `stroke="${C.mint}" stroke-width="1.8" opacity="0.55"/>`
    );
  }
  for (let i = 0; i < slots; i++) {
    parts.push(
      `<rect x="${n(x + (i + 0.25) * pitch)}" y="${n(y + h / 2 - 7)}" width="${n(pitch / 2)}" ` +
        `height="14" rx="4" fill="${C.mint}" opacity="0.5"/>`
    );
  }
  return parts.join('');
}

function fbtreeSoftWideTree(r) {
  // Idea: the ordered index behind a large sorted set is one wide node of separator keys over a single row of leaves holding their members packed side by side and linked to their neighbours.
  // Focal: the two-level shape itself, per DESIGN.md 15 — nothing in it is drawn at focal weight.
  // Four leaves, not five, and the row 640 grid units wide rather than 900. Framing was
  // exhausted at zoom 1.401, and the next move is DESIGN.md 12 step 2: a narrower drawing
  // takes more zoom and says the same thing. Four leaves of three entries is still a
  // fanout no binary tree has.
  //
  // Only ratios matter here, because the zoom is then set to put the row's edges on
  // 0.17/0.83 whatever `SPAN` is: every element renders at `0.66 * w / SPAN` of the framed
  // width, and the height the drawing fills is `450.6 / SPAN`. So `SPAN` alone buys the
  // fill, and the grid sizes below are chosen to hold each leaf and each gap at the share
  // of the row they already had. The entries are still 36 wide on the grid and land 41%
  // larger in frame; growing them in grid units would have bought the same pixels and
  // spent the zoom that pays for them.
  const LEAVES = 4;
  const ENTRIES = 3;
  const EW = 36;
  const EH = 24;
  const EPITCH = 42;
  const PAD = 9;
  const LEAF_W = PAD * 2 + (ENTRIES - 1) * EPITCH + EW;
  const LEAF_H = 64;
  const LEAF_Y = 620;
  const SPAN = 640;
  const GAP = (SPAN - LEAVES * LEAF_W) / (LEAVES - 1);
  const X0 = 960 - SPAN / 2;
  const leafX = [];
  for (let i = 0; i < LEAVES; i++) leafX.push(X0 + i * (LEAF_W + GAP));

  // The root: one allocation wide enough to route the whole set, a child slot per
  // leaf. Narrower than the leaf row it feeds, so the child pointers fan; drawn at
  // the same weight as the leaves, because the shape and not the node is the subject.
  const ROOT_Y = 300;
  const ROOT_H = 72;
  const SLOT = 100;
  const ROOT_W = LEAVES * SLOT;
  const ROOT_X = 960 - ROOT_W / 2;
  const slotCx = [];
  for (let i = 0; i < LEAVES; i++) slotCx.push(ROOT_X + (i + 0.5) * SLOT);

  // One child pointer per slot, leaving the node's baseline for its leaf. Straight
  // lines: descending into a child and running along the leaf level are different
  // moves, and the second is the whole difference from a B tree.
  const links = slotCx
    .map(
      (cx, i) =>
        `<line x1="${n(cx)}" y1="${ROOT_Y + ROOT_H}" x2="${n(leafX[i] + LEAF_W / 2)}" y2="${LEAF_Y}" ` +
        `stroke="${C.mint}" stroke-width="${n(1.3 + r() * 0.3)}" opacity="${n(0.22 + r() * 0.18)}"/>`
    )
    .join('');

  const leaves = leafX
    .map((x) => {
      const cells = [];
      for (let j = 0; j < ENTRIES; j++) {
        cells.push(fbsCell(r, x + PAD + j * EPITCH, LEAF_Y + (LEAF_H - EH) / 2, EW, EH));
      }
      return fbsNode(x, LEAF_Y, LEAF_W, LEAF_H, 1.3 + r() * 0.4, 0.34 + r() * 0.2) + cells.join('');
    })
    .join('');

  // Sibling links: the leaves are a linked list, so an ordered read walks along them
  // instead of climbing back into the root between members. Above the 1.8px the rest of
  // the structure holds to, because it is the one fact a B tree would not have and at
  // 1.8px across a 40-unit gap the blind read said it nearly disappeared.
  const chain = leafX
    .slice(0, -1)
    .map(
      (x) =>
        `<line x1="${n(x + LEAF_W)}" y1="${n(LEAF_Y + LEAF_H / 2)}" x2="${n(x + LEAF_W + GAP)}" ` +
        `y2="${n(LEAF_Y + LEAF_H / 2)}" stroke="${C.mint}" stroke-width="2.6" opacity="0.72"/>`
    )
    .join('');

  // One halo, not the two DESIGN.md 15 allows. A second one sat behind the root, and the
  // deletion test took it out with nothing lost — the blind read had been attaching the
  // root's importance to "the brightest part of the background glow" rather than to the
  // node, which is DESIGN.md 3's ambient wash earning its ban.
  //
  // The remaining one shrinks with the drawing. At r="430" and the new zoom it reached
  // past every edge of the frame, which turns a glow behind the motif into the wash the
  // same rule bans; 305 keeps the footprint it had at zoom 1.401.
  return [
    `  <circle cx="960" cy="${LEAF_Y + LEAF_H / 2}" r="305" fill="url(#h-cyan)" opacity="0.18"/>`,
    `  <g>${links}</g>`,
    `  <g>${leaves}</g>`,
    `  <g>${chain}</g>`,
    `  ${fbsInner(ROOT_X, ROOT_Y, ROOT_W, ROOT_H, LEAVES, 1.8, 0.55)}`,
  ].join('\n');
}

function fbtreeSoftOrderedWalk(r) {
  // Idea: an ordered read of a large sorted set runs along the leaf level itself, from one leaf into the next, instead of climbing back into the tree between members.
  // Focal: the rail through the leaf row, the one element above 0.6 opacity and the only one with a halo.
  // Three leaves, for the reason `fbtreeSoftWideTree` drops to four: DESIGN.md 12 step 2,
  // a narrower drawing takes more zoom. The rail is the subject and it wants length at
  // scale, not more leaves to pass through. Three is still a row, and the entries go from
  // 40 to 44 on the grid inside a frame zoomed in by a further third, so each one lands
  // 47% larger and the packing reads where it used to be implied.
  //
  // Here the drawn width is the rail and its arrowhead, not the leaf row: it overhangs by
  // 20 on the left (the round cap) and 41 on the right (the tip), so the zoom is set from
  // `SPAN + 61`. The overhangs shrank with everything else to hold the share of the width
  // they had, which keeps the tip's lead past the last leaf at the length it read at.
  const LEAVES = 3;
  const ENTRIES = 3;
  const EW = 44;
  const EH = 24;
  const EPITCH = 52;
  const PAD = 13;
  const LEAF_W = PAD * 2 + (ENTRIES - 1) * EPITCH + EW;
  const LEAF_H = 64;
  const LEAF_Y = 620;
  const SPAN = 612;
  const GAP = (SPAN - LEAVES * LEAF_W) / (LEAVES - 1);
  const X0 = 960 - SPAN / 2;
  const leafX = [];
  for (let i = 0; i < LEAVES; i++) leafX.push(X0 + i * (LEAF_W + GAP));

  // The root is drawn quieter than anything else here, and its pointers quieter still,
  // because the point of the picture is that the read does not use them.
  const ROOT_Y = 300;
  const ROOT_H = 68;
  const SLOT = 130;
  const ROOT_W = LEAVES * SLOT;
  const ROOT_X = 960 - ROOT_W / 2;
  const slotCx = [];
  for (let i = 0; i < LEAVES; i++) slotCx.push(ROOT_X + (i + 0.5) * SLOT);

  const links = slotCx
    .map(
      (cx, i) =>
        `<line x1="${n(cx)}" y1="${ROOT_Y + ROOT_H}" x2="${n(leafX[i] + LEAF_W / 2)}" y2="${LEAF_Y}" ` +
        `stroke="${C.mint}" stroke-width="${n(1.2 + r() * 0.3)}" opacity="${n(0.2 + r() * 0.1)}"/>`
    )
    .join('');

  const leaves = leafX
    .map((x) => {
      const cells = [];
      for (let j = 0; j < ENTRIES; j++) {
        cells.push(fbsCell(r, x + PAD + j * EPITCH, LEAF_Y + 20, EW, EH));
      }
      return fbsNode(x, LEAF_Y, LEAF_W, LEAF_H, 1.2 + r() * 0.4, 0.28 + r() * 0.16) + cells.join('');
    })
    .join('');

  // The rail: one continuous path at the leaf level, running through every leaf and out
  // the far side behind a single arrowhead. Still 24 units, which is 8px in the narrow crop
  // at this zoom rather than the 6px it was: the number is a floor in DESIGN.md 4, and
  // thinning it to hold 6px would have made the one focal element the only thing in the
  // picture that did not get crisper.
  const railY = LEAF_Y + LEAF_H;
  const railX0 = leafX[0] - 8;
  const railX1 = leafX[LEAVES - 1] + LEAF_W + 8;
  const tip = railX1 + 33;
  const rail =
    `<line x1="${n(railX0)}" y1="${n(railY)}" x2="${n(railX1)}" y2="${n(railY)}" stroke="${C.mint}" ` +
    `stroke-width="24" stroke-linecap="round" opacity="0.78"/>` +
    `<path d="M ${n(tip)} ${n(railY)} L ${n(railX1 + 4)} ${n(railY - 26)} L ${n(railX1 + 4)} ` +
    `${n(railY + 26)} Z" fill="${C.mint}" opacity="0.9"/>`;

  return [
    // Shrunk with the drawing, for the reason given in `fbtreeSoftWideTree`: at r="430"
    // the new zoom pushes the glow past every edge and it becomes an ambient wash.
    `  <circle cx="960" cy="${n(railY)}" r="315" fill="url(#h-mint)" opacity="0.19"/>`,
    `  <g>${links}</g>`,
    `  ${fbsInner(ROOT_X, ROOT_Y, ROOT_W, ROOT_H, LEAVES, 1.3, 0.3)}`,
    `  <g>${rail}</g>`,
    `  <g>${leaves}</g>`,
  ].join('\n');
}

function fbtreeSoftScatterRun(r) {
  // Idea: the same ordered members that each needed their own allocation and its own tower of forward pointers now sit packed inside a few wide nodes.
  // Focal: the density difference between the two rows, which is the shape of the whole and not any one object.
  const MEMBERS = 12;
  const CW = 40;
  const CH = 24;
  const SPAN = 800;
  const X0 = 960 - SPAN / 2;
  const mPitch = (SPAN - CW) / (MEMBERS - 1);

  // What it replaced, drawn the way a skiplist is drawn: the members in order with
  // heap between them, one allocation each, every one carrying its own tower of
  // forward pointers, and a link at each level skipping to the next tall enough node.
  const BASE_Y = 265;
  const LVL_H = 14;
  const LVL_PITCH = 18;
  const nodes = [];
  for (let i = 0; i < MEMBERS; i++) {
    let levels = 1;
    while (levels < 3 && r() < 0.42) levels++;
    nodes.push({ x: X0 + i * mPitch, levels });
  }
  const towerY = (l) => BASE_Y - 4 - (l + 1) * LVL_PITCH;

  const towers = nodes
    .map((nd) => {
      const out = [fbsCell(r, nd.x, BASE_Y, CW, CH)];
      for (let l = 0; l < nd.levels; l++) {
        out.push(
          `<rect x="${n(nd.x)}" y="${n(towerY(l))}" width="${CW}" height="${LVL_H}" rx="4" ` +
            `fill="${C.violet}" opacity="${n(0.3 + r() * 0.2)}"/>`
        );
      }
      return out.join('');
    })
    .join('');

  // The forward links sit at the top of the structural band, not the middle of it: the
  // levels skipping over shorter nodes are what makes the top row a skiplist rather than
  // a queue, and at 0.32 the blind read called the top structure's topology unreadable.
  const forwards = [];
  for (let l = 0; l < 3; l++) {
    const have = nodes.filter((nd) => nd.levels > l);
    for (let k = 0; k < have.length - 1; k++) {
      const y = towerY(l) + LVL_H / 2;
      forwards.push(
        `<line x1="${n(have[k].x + CW)}" y1="${n(y)}" x2="${n(have[k + 1].x)}" y2="${n(y)}" ` +
          `stroke="${C.violet}" stroke-width="${n(1.6 + r() * 0.2)}" opacity="${n(0.44 + r() * 0.16)}"/>`
      );
    }
  }

  // The fbtree below: the same twelve members, in the same order, three to a leaf in
  // four leaves under one wide node. Nothing joins the two rows — an arrow between
  // them would say the skiplist feeds the tree rather than that it was replaced.
  const LEAVES = 4;
  const ENTRIES = MEMBERS / LEAVES;
  const EPITCH = 46;
  const PAD = 14;
  const LEAF_W = PAD * 2 + (ENTRIES - 1) * EPITCH + CW;
  const LEAF_H = 64;
  const LEAF_Y = 655;
  const LEAF_SPAN = 680;
  const GAP = (LEAF_SPAN - LEAVES * LEAF_W) / (LEAVES - 1);
  const LX0 = 960 - LEAF_SPAN / 2;
  const leafX = [];
  for (let i = 0; i < LEAVES; i++) leafX.push(LX0 + i * (LEAF_W + GAP));

  const ROOT_Y = 440;
  const ROOT_H = 68;
  const SLOT = 130;
  const ROOT_W = LEAVES * SLOT;
  const ROOT_X = 960 - ROOT_W / 2;
  const slotCx = [];
  for (let i = 0; i < LEAVES; i++) slotCx.push(ROOT_X + (i + 0.5) * SLOT);

  const links = slotCx
    .map(
      (cx, i) =>
        `<line x1="${n(cx)}" y1="${ROOT_Y + ROOT_H}" x2="${n(leafX[i] + LEAF_W / 2)}" y2="${LEAF_Y}" ` +
        `stroke="${C.mint}" stroke-width="${n(1.3 + r() * 0.4)}" opacity="${n(0.26 + r() * 0.22)}"/>`
    )
    .join('');

  const leaves = leafX
    .map((x) => {
      const cells = [];
      for (let j = 0; j < ENTRIES; j++) {
        cells.push(fbsCell(r, x + PAD + j * EPITCH, LEAF_Y + (LEAF_H - CH) / 2, CW, CH));
      }
      return fbsNode(x, LEAF_Y, LEAF_W, LEAF_H, 1.3 + r() * 0.4, 0.34 + r() * 0.2) + cells.join('');
    })
    .join('');

  const chain = leafX
    .slice(0, -1)
    .map(
      (x) =>
        `<line x1="${n(x + LEAF_W)}" y1="${n(LEAF_Y + LEAF_H / 2)}" x2="${n(x + LEAF_W + GAP)}" ` +
        `y2="${n(LEAF_Y + LEAF_H / 2)}" stroke="${C.mint}" stroke-width="2.6" opacity="0.72"/>`
    )
    .join('');

  // One halo, over the tree. A violet one under the skiplist row went the same way as the
  // root halo in `fbtreeSoftWideTree`: deleted, re-rendered, and the two rows still read as
  // two structures because their glyphs differ, which is what DESIGN.md 10 asks of them.
  return [
    `  <circle cx="960" cy="595" r="430" fill="url(#h-mint)" opacity="0.18"/>`,
    `  <g>${forwards.join('')}</g>`,
    `  <g>${towers}</g>`,
    `  <g>${links}</g>`,
    `  <g>${leaves}</g>`,
    `  <g>${chain}</g>`,
    `  ${fbsInner(ROOT_X, ROOT_Y, ROOT_W, ROOT_H, LEAVES, 1.8, 0.55)}`,
  ].join('\n');
}

const BASE_THEMES = [
  { name: 'community', seed: 1041, zoom: 1.32, center: [960, 540], title: 'Valkey community', desc: 'An abstract constellation of connected nodes, the best-connected of them drawn as the white Valkey hexagon mark, representing the Valkey community.', art: community },
  { name: 'memory-efficiency', seed: 3313, zoom: 1.3, center: [885, 540], title: 'Valkey memory efficiency', desc: 'An abstract grid of cells that grows denser from left to right, representing the same data stored in less memory.', art: memoryEfficiency },
  { name: 'clustering', seed: 4421, zoom: 1.34, center: [960, 540], title: 'Valkey clustering and scale', desc: 'An abstract ring of slot segments around a meshed core centred on the white Valkey hexagon mark, with shards joining from outside, representing cluster mode and horizontal scale.', art: clustering },
  { name: 'release', seed: 5527, zoom: 1.2, center: [1130, 540], title: 'Valkey release', desc: 'Valkey chevrons driving into a golden burst centred on the white Valkey hexagon mark, representing a new Valkey release.', art: release },
  { name: 'release-version', seed: 5528, zoom: 1.3, center: [960, 520], title: 'Valkey release with a caption', text: '9.0', desc: 'A golden burst centred on the white Valkey hexagon mark above a large caption, representing a specific Valkey release.', art: releaseVersion },
  { name: 'atomic-slot-migration', seed: 14041, zoom: 1.1, center: [960, 522], title: 'Valkey atomic slot migration', desc: 'Two shard slot rings, each centred on the white Valkey hexagon mark, with a chevron arrow driving a stream of slot segments from one to the other and a magnifier inspecting them mid-flight, representing atomic slot migration.', art: slotMigrationRings },
  { name: 'security-shield-clean', seed: 44011, zoom: 1.38, center: [960, 545], title: 'Valkey security', desc: 'A shield woven from a single even lattice with the white Valkey hexagon mark at its centre and nothing else inside it, representing security and hardening.', art: securityShieldClean },
  { name: 'benchmarks', seed: 7741, zoom: 1.12, center: [900, 568], title: 'Valkey benchmarks', desc: 'A bar chart of throughput climbing left to right, beneath two flat latency series labelled P99 in green and P50 in red, representing benchmarking and observability.', art: observability },
  { name: 'data-structures', seed: 8849, zoom: 1.22, center: [960, 540], title: 'Valkey data structures', desc: 'Abstract hash table buckets chaining outward beside a skip list of express lanes, representing Valkey data structures and internals.', art: dataStructures },
  { name: 'how-to', seed: 9953, zoom: 1.22, center: [960, 540], title: 'Valkey how-to', desc: 'An abstract track of numbered steps with the current step lit, representing a step-by-step guide.', art: howTo },
  { name: 'large-key', seed: 21193, zoom: 1.4, center: [960, 548], title: 'Valkey large key', desc: 'An even field of small identical key tiles with one key of the same shape scaled up until it dwarfs them all, outlined in red, representing a single key far larger than everything else in the keyspace.', art: largeKey },
  { name: 'bloom-bit-array', seed: 31013, zoom: 1.4, center: [960, 475], title: 'Valkey Bloom filters', desc: 'The white Valkey hexagon mark above a long row of bit cells, with five hash nodes fanning out of it and the five cells they land on lit in green, representing one item hashed to a handful of positions in a Bloom filter.', art: bloomBitArray },
  { name: 'search-vector-nearest', seed: 32011, zoom: 1.2, center: [960, 540], title: 'Valkey vector search', desc: 'A dark field of indexed vectors with the white Valkey hexagon mark at the centre as the query, spokes reaching out to six bright green nearest matches inside a dashed search radius, representing vector similarity search.', art: searchNearest },
  { name: 'search-field-index', seed: 32047, zoom: 1.1, center: [960, 540], title: 'Valkey secondary indexing', desc: 'Four record cards each contributing one highlighted green field to a sorted index lane below, with a query caliper bracketing three matched entries above the white Valkey hexagon mark, representing secondary indexing on hashes and JSON.', art: searchFieldIndex },
  { name: 'client-ports', seed: 34037, zoom: 1, center: [960, 540], title: 'Valkey client protocol', desc: 'Six differently drawn channels reaching in from distinct outer shapes, each meeting an identical port at the same radius, beyond which every spoke becomes the same run of pale segments arriving at the white Valkey hexagon mark, representing different client libraries meeting one protocol at one server.', art: clientPorts },
  { name: 'workload-fanout', seed: 35023, zoom: 1.18, center: [960, 540], title: 'Valkey workload primitives', desc: 'The white Valkey hexagon mark fanning out into five lanes, each ending in a differently shaped structure: a ring of slots, a chain of entries, a ranked stack, a grid of bits and a row of embedding magnitudes, representing a workload decomposing into the primitives Valkey already has.', art: workloadFanout },
  { name: 'conn-storm-spike', seed: 36011, zoom: 1.34, center: [960, 547], title: 'Valkey connection storms', desc: 'A timeline of connection attempts that is quiet, then spikes into a wall of simultaneous reconnects whose top rises in red above a dashed accept-capacity line, then falls quiet again, representing a connection storm.', art: connStormSpike },
  { name: 'bundle-crate', seed: 33101, zoom: 1.2, center: [960, 540], title: 'Valkey bundle', desc: 'One bracketed package outline sealed with the white Valkey hexagon mark, holding four module diagrams inside it: a bit array, a nested document in brackets, a magnifier over a scatter of points, and a padlock, representing the four modules valkey-bundle ships as one package.', art: bundleCrate },
  { name: 'data-structures-grid', seed: 33419, zoom: 1.2, center: [960, 540], title: 'Valkey data types', desc: 'Six Valkey value types laid out one per cell on an even three-by-two grid: a run of bytes, a linked list, unordered members inside a boundary, field and value pairs, members ranked by score, and a dense bitmap, representing the range of structures Valkey stores.', art: dataStructuresGrid },
  { name: 'k8s-spec-fanout', seed: 42011, zoom: 1.34, center: [960, 540], title: 'Valkey deployed from a chart', desc: 'A declared specification panel on the left fanning out along rails into a grid of nine identical instances, each drawn as the white Valkey hexagon mark, representing deploying Valkey on Kubernetes from a Helm chart.', art: k8sSpecFanout },
  { name: 'k8s-desired-count', seed: 42021, zoom: 1.34, center: [960, 540], title: 'Valkey replicas reaching the declared count', desc: 'Six declared slots under a gold span, four filled with instances drawn as the white Valkey hexagon mark, one instance rising into place and one slot still empty, representing a declared replica count and the running instances converging on it.', art: k8sDesiredCount },
  { name: 'limits-gauge-pinned', seed: 42041, zoom: 1.34, center: [960, 540], title: 'Valkey pinned near its limit', desc: 'A large gauge around the white Valkey hexagon mark, filled from blue through green into gold and stopping just short of a red end zone, representing a small resource envelope run right up to its limit.', art: limitsGaugePinned },
  { name: 'key-size-distribution', seed: 43011, zoom: 1.26, center: [960, 540], title: 'Valkey key size distribution', desc: 'A Valkey Admin panel ranking keys by size with each size printed beside its bar, the top two at tens of megabytes and drawn in red, wired along a trunk into three shard enclosures of three servers each drawn as the white Valkey hexagon mark, representing a few outsized objects spread across a deployment.', art: keySizeDistribution },
  // Gargantua-style: the Doppler beaming switched off, so the ring is even all
  // the way round, which is what Interstellar did and why its black hole reads as
  // an object rather than as a lopsided smear.
  { name: 'blackhole-gargantua', experimental: true, space: true, seed: 52041, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A black hole seen almost edge on: a black circular shadow wrapped by one thin bright ring that closes all the way round it, the accretion disk lensed over the top and its secondary image returning underneath, the flat disk running out to both edges of the frame as a warm band, even in brightness on both sides, with the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 84, outer: 30, scale: 46, markH: 210, beam: 0, rings: 32, segs: 150 }) },
  { name: 'blackhole-halo', experimental: true, space: true, seed: 52051, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A black hole seen at a slight tilt so the lensed ring around its shadow opens into a broad halo, white at the inner edge through gold to red at the rim, even in brightness on both sides, with the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 74, outer: 24, scale: 40, markH: 185, beam: 0, rings: 32, segs: 150 }) },
  // The same model with the beaming left in, which is what a real disk does.
  { name: 'blackhole-beamed', experimental: true, space: true, seed: 52011, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A relativistic accretion disk seen almost edge on: a dark circular shadow ringed by a thin bright photon ring, the disk lensed up over the top of the shadow and crossing in front of it below, blazing white on the left where the orbiting gas comes towards the viewer and fading to dim red on the right where it recedes, the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 80, outer: 24, scale: 47.6, markH: 220, beam: 1, rings: 28, segs: 108 }) },
  { name: 'key-size-card-a', seed: 43041, zoom: 1.26, center: [960, 540], title: 'Finding big keys in a running Valkey cluster with Valkey Admin', desc: 'A card layout: the Valkey lockup in the upper left, the post title on solid light blocks in the lower left, and a Valkey Admin panel ranking keys by size with the top two at tens of megabytes drawn in red, wired into three shard enclosures of servers drawn as the white Valkey hexagon mark, sitting whole down the height of the frame.', art: keySizeCard({ scale: 0.86, spread: 40 }) },
  { name: 'key-size-card-flat', seed: 43049, zoom: 1.26, center: [960, 540], title: 'Finding big keys in a running Valkey cluster with Valkey Admin', desc: 'A card layout: the Valkey lockup in the upper left, the post title on solid light blocks in the lower left, and a Valkey Admin panel ranking keys by size with the top two at tens of megabytes drawn in red, wired into three widely spaced shard enclosures of servers drawn as the white Valkey hexagon mark, the whole chart sitting in a shallow band clear above the title blocks.', art: keySizeCard({ scale: 0.8, spread: 62, colPitch: 168, clearY: 748 }) },
  { name: 'prometheus-scrape-wall', seed: 62721, zoom: 1.3, center: [960, 545], title: 'Valkey metrics in one view', desc: 'A wall of dashboard panels: six small panels holding flat blue traces, and one much larger panel carrying the white Valkey hexagon mark in its header whose red trace runs flat and then climbs steeply off the top of its range, representing a screen of stored Valkey metrics where the one that has gone wrong is the only thing that is not flat.', art: prometheusScrapeWall },
  { name: 'llm-kv-cache-new-tail', seed: 37011, zoom: 1.22, center: [960, 535], title: 'Valkey KV cache reuse', desc: 'One long prompt drawn as a run of identical chunks, the first fifteen of them green and fed by three lanes rising from a store marked with the white Valkey hexagon, the last seven blue and fed by three matching lanes dropping from a processor that sits only as wide as they run, representing a prompt whose repeated context is loaded from Valkey so that only its new tail is computed on the GPU.', art: kvCacheNewTail },
  { name: 'exporter-two-views-many-and-one', seed: 64031, zoom: 1.34, center: [959, 540], title: 'Valkey metrics from two exporters', desc: 'A fanned deck of five identical small readout cards, one per Valkey node with its own memory, client and command bars, beside one large single card holding per-slot counters for the whole cluster with the hottest slot drawn in red, representing one readout per node from one exporter and a single cluster-wide readout from the other.', art: exporterManyAndOne },
  { name: 'keyspace-gui-safe-refusal', seed: 64901, zoom: 1.36, center: [960, 562], title: 'Valkey server-side read-only', desc: 'Four blue command lanes running in from the left, crossing a tall pale boundary bar and carrying on towards the white Valkey hexagon mark on the far side, and one much thicker red lane that reaches the same boundary, turns back on itself and returns the way it came, representing a write refused by the server rather than by a setting in the client.', art: keyspaceGuiSafeRefusal },
  { name: 'commands-replace-lua-round-trips', seed: 65911, zoom: 1.28, center: [960, 520], title: 'Valkey one round trip, not four', desc: 'A caller on the left and a Valkey server drawn as the white hexagon mark on the right, with four thin purple messages crossing back and forth between them above, and one thick green call below carrying a pale condition chip that holds two unequal values, representing a conditional update that used to take an exchange of messages and now takes one command.', art: commandsRoundTrips },
  { name: 'commands-replace-lua-one-line', seed: 65921, zoom: 1.31, center: [960, 540], title: 'Valkey one command, no script', desc: 'A small quiet panel of ragged purple script lines above an arrow pointing down to one long bright command bar holding a run of pale words, with a green condition chip of two unequal values seated at the bar\'s end, representing a Lua script replaced by a single command with a condition option on it.', art: commandsOneLine },
  { name: 'ai-advisory-surge-reproducer', seed: 47023, zoom: 1.5, center: [960, 525], title: 'Valkey security audits', desc: 'A row of five identical candidate bug cards, four of them crossed out in red, the middle one lit green and dropping into a large panel holding four pale lines and a red one, representing self-run adversarial audits where a candidate only reaches a person once it comes with a reproducing crash.', art: aiAdvisorySurgeReproducer },
  { name: 'ai-advisory-surge-backport-rails', seed: 47041, zoom: 1.5, center: [960, 560], title: 'Valkey backported fixes', desc: 'Five stacked version rails, each branching off the one above it and carrying a run of small blue commits, crossed by one bright green vertical line that places the same fix node on every rail at the same point, representing one security fix shipped to every supported version at once.', art: aiAdvisorySurgeBackportRails },
  { name: 'big-value-latency-copy-block', seed: 67101, zoom: 1.38, center: [960, 540], title: 'Valkey one big copy holds the thread', desc: 'One bright pale timeline with a solid red block sitting on it, and under the line a run of short identical blue bars at an even pitch that, along the span the red block covers, lengthen into a deep wedge deepest against the block\'s leading edge, representing small requests waiting exactly as long as one large value occupies the main thread.', art: bvlCopyBlock },
  { name: 'big-value-latency-stalled-queue', seed: 67111, zoom: 1.34, center: [923, 540], title: 'Valkey one big value blocks the rest', desc: 'A tall solid red value standing across three lanes, with identical blue request blocks packed nose to tail behind it in every lane and nothing at all beyond it, representing every small request held up while one large value occupies the only path out.', art: bvlStalledQueue },
  { name: 'client-compression-packed-run', seed: 48111, zoom: 1.36, center: [960, 540], title: 'Valkey compressed before the wire', desc: 'Two rows of the same eight fields spanning the same width: above, a wide dim blue run filling its row, and below, the same eight fields in bright green taking a fifth of it, with a green arrow crossing the empty remainder to the white Valkey hexagon mark, representing a client library shrinking a value before it leaves the application so the smaller form is what crosses the network and what the server stores.', art: clientCompressionPackedRun },
  { name: 'client-compression-twin-sends', seed: 48121, zoom: 1.4, center: [1010, 530], title: 'Valkey a third of the bytes on the wire', desc: 'Two pale capsule-shaped wires of equal length, one above the other, each ending in a chevron: the upper wire holds six narrow bright green fields filling a quarter of its length, and the lower holds the same six fields in dim purple filling most of it, representing the same value crossing the network at a fraction of the size once the client compresses it.', art: clientCompressionTwinSends },
  { name: 'scan-cursor-pages', seed: 67501, zoom: 1.35, center: [960, 544], title: 'Valkey scan by page', desc: 'A field of key pills on an even pitch, grouped into five stacked pages, with the middle page lit in gold and the other four blue at rest, representing a scan that hands back one bounded page of the keyspace at a time.', art: scanCursorPages },
  { name: 'agent-context-recall-arc', seed: 51021, zoom: 1.54, center: [944, 421], title: 'Valkey recalling an older turn', desc: 'A tall single column of twelve rounded bars standing for the turns of an agent conversation, newest at the top, most of them short and dim blue, the three newest and one much older turn far down the column drawn taller and solid green, and a single thick green band running out of that older turn, up the outside of the column and into the newest bar behind an arrowhead, representing an agent conversation held in Valkey out of which an older turn is loaded back into the next context window.', art: agentContextRecallArc },
  { name: 'fbtree-soft-two-levels', seed: 66627, zoom: 1.98, center: [960, 518], title: 'Valkey sorted sets in one wide tree', desc: 'One wide hollow green node at the top, divided by three thin vertical separator lines into four child slots each holding a small green routing bar, a thin green pointer fanning out of every slot onto one of four small hollow green leaf nodes in a row below, every leaf holding three blue entries packed side by side, and each pair of neighbouring leaves joined by a short green link, representing the ordered index behind a large sorted set as a high-fanout B+ tree two levels deep.', art: fbtreeSoftWideTree },
  { name: 'fbtree-soft-leaf-rail', seed: 66631, zoom: 1.883, center: [970, 532], title: 'Valkey reading a sorted set in order', desc: 'A faint wide green node of three child slots at the top, each slot holding a small green routing bar, with barely visible pointers fanning down to three small hollow green leaf nodes in a row below, each holding three blue entries, and one thick bright green rail running horizontally through all three leaves and out past the last of them behind a single arrowhead, representing an ordered read of a large sorted set walking along the linked leaves instead of climbing back into the tree between members.', art: fbtreeSoftOrderedWalk },
  { name: 'fbtree-soft-scatter-run', seed: 66643, zoom: 1.461, center: [960, 524], title: 'Valkey the same members, fewer nodes', desc: 'Above, twelve small blue member cells spread far apart along a row with gaps between them, each carrying a short stack of purple forward-pointer cells with thin purple links skipping between the stacks at every level; below, unconnected to it, the same twelve cells three to a leaf inside four small hollow green leaf nodes joined by short green links, under one wide hollow green node divided into four child slots, each holding a small green routing bar and dropping a thin pointer onto one leaf, representing the ordered index moving from one allocation per member to a few wide nodes that hold them packed.', art: fbtreeSoftScatterRun },
];

// The caption is on by default, because a banner with no words on it is the rarer
// case. Each theme is one output: there used to be a derived `-caption` twin of
// every theme, which doubled the set to 95 files for 51 pictures.
//
// Excluded: themes that draw their own text, where a sticker would be text on text,
// and the captioned theme whose caption is the whole point.
const NO_CAPTION = new Set(['benchmarks', 'release-version']);

const THEMES = BASE_THEMES.map((t) =>
  NO_CAPTION.has(t.name)
    ? t
    : {
        ...t,
        caption: t.title.replace(/^Valkey /, '').replace(/^./, (c) => c.toUpperCase()),
        desc: `${t.desc} The title "${t.title}" is set on solid light blocks in the lower left.`,
      }
);

// -------------------------------------------------------------------- render

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`No Chrome-based browser found. Looked in:\n  ${candidates.join('\n  ')}`);
  return found;
}

// Downsamples the 2x screenshot and encodes it as WebP.
const ENCODE = `
import sys
from PIL import Image
src, dst, width, height, quality, og = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
im = Image.open(src).convert("RGB")
im.resize((width, height), Image.LANCZOS).save(dst, "WEBP", quality=quality, method=6)
# The unfurl copy: 1200x630, the 1.91:1 that og:image consumers expect. Centre
# crop the height rather than squash, so nothing is distorted, then downsample.
ow, oh = 1200, 630
keep = round(im.width / (ow / oh))
top = (im.height - keep) // 2
im.crop((0, top, im.width, top + keep)).resize((ow, oh), Image.LANCZOS).save(og, "WEBP", quality=quality, method=6)
`;

// The plain copy needs the master size only: link previews use the captioned one.
const ENCODE_ONE = `
import sys
from PIL import Image
src, dst, width, height, quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
Image.open(src).convert("RGB").resize((width, height), Image.LANCZOS).save(dst, "WEBP", quality=quality, method=6)
`;

function checkPillow() {
  try {
    execFileSync('python3', ['-c', 'from PIL import features; assert features.check("webp")'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    throw new Error('python3 with Pillow (WebP support) is required. Install it with: pip3 install Pillow');
  }
}

// Positional args select themes. --text sets the big drawn number on release-version,
// --caption replaces a sticker's text, --no-caption drops it, --out renames the file.
const flags = {};
const wanted = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const flag = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
  if (!flag) {
    wanted.push(argv[i]);
    continue;
  }
  // Accepts both `--text=9.0` and `--text 9.0`.
  const next = argv[i + 1];
  flags[flag[1]] = flag[2] ?? (next && !next.startsWith('--') ? argv[++i] : true);
}

const themes = wanted.length ? THEMES.filter((t) => wanted.includes(t.name)) : THEMES;
if (!themes.length) {
  console.error(`Unknown theme(s). Available: ${THEMES.map((t) => t.name).join(', ')}`);
  process.exit(1);
}
if (flags.out && themes.length > 1) {
  console.error('--out names a single output file, so pass exactly one theme with it.');
  process.exit(1);
}
// Guard against `--text foo` with no theme named, which would otherwise rebuild
// everything and quietly stamp the caption onto the captioned theme.
if (flags.text !== undefined && !(wanted.length && themes.every((t) => t.text !== undefined))) {
  const captioned = THEMES.filter((t) => t.text !== undefined).map((t) => t.name);
  console.error(`--text needs a captioned theme named explicitly. Captioned themes: ${captioned.join(', ')}`);
  process.exit(1);
}

if (flags.caption !== undefined && !wanted.length) {
  console.error('--caption changes one banner\'s sticker text, so name the theme explicitly.');
  process.exit(1);
}

mkdirSync(SVG_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(OG_DIR, { recursive: true });
mkdirSync(PLAIN_DIR, { recursive: true });

// themes.json: the machine-readable index of the set, so consumers do not have to
// parse this file or the README. madelynolson.com/valkey-banners reads it through
// a submodule. Written on every run and always covering every theme, even when
// only a subset was asked for, so it cannot drift from THEMES.
{
  const table = new Map();
  for (const line of readFileSync(join(HERE, 'README.md'), 'utf8').split('\n')) {
    const row = /^\|\s*`([\w.-]+)`\s*\|([^|]*)\|([^|]*)\|/.exec(line);
    if (row) table.set(row[1], { motif: row[2].trim(), useFor: row[3].trim() });
  }
  const missing = THEMES.filter((t) => !table.has(t.name)).map((t) => t.name);
  if (missing.length) throw new Error(`No README table row for: ${missing.join(', ')}`);
  const manifest = {
    generatedBy: 'generate.mjs',
    count: THEMES.length,
    themes: THEMES.map((t) => ({
      name: t.name,
      title: t.title,
      desc: t.desc,
      motif: table.get(t.name).motif,
      useFor: table.get(t.name).useFor,
      image: `images/${t.name}.webp`,
      plain: `images/plain/${t.name}.webp`,
      svg: `svg/${t.name}.svg`,
      captioned: t.text !== undefined,
      caption: t.caption ?? null,
      space: t.space === true,
      experimental: t.experimental === true,
    })),
  };
  writeFileSync(join(HERE, 'themes.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

// Rendering is the whole cost of a run: two Chrome screenshots and two Pillow encodes per
// theme, about six seconds each, so a full rebuild is four minutes and almost all of it is
// spent redrawing files that did not change. The SVG fully determines the raster, so its
// hash is the cache key. A theme is re-rendered when its markup differs from the hash on
// record or when any of its outputs is missing; otherwise it is skipped. --force ignores
// the cache. Nothing about correctness rests on this: delete .render-cache.json and the
// next run rebuilds everything.
const sha = (v) => createHash('sha256').update(v).digest('hex').slice(0, 16);
const cache = (() => {
  if (flags.force) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
})();

const chrome = findChrome();
checkPillow();
const scratch = mkdtempSync(join(tmpdir(), 'valkey-headers-'));
let rendered = 0;
let skipped = 0;

try {
  for (const theme of themes) {
    const text = flags.text ?? theme.text;
    const slug = flags.out ?? theme.name;
    const svgPath = join(SVG_DIR, `${slug}.svg`);
    // --caption replaces the sticker text, --no-caption drops the sticker entirely.
    const withCaption = flags['no-caption']
      ? { ...theme, caption: undefined }
      : flags.caption
        ? { ...theme, caption: String(flags.caption) }
        : theme;
    SPACE = theme.space === true;
    const captioned =
      theme.text !== undefined
        ? { ...withCaption, desc: `${withCaption.desc} The caption reads "${esc(text)}".` }
        : withCaption;
    const art = theme.art(rng(theme.seed), { text }, captioned);
    const svgText = wrap(captioned, art);
    const plainText = wrap(captioned, art, { chrome: false });
    writeFileSync(svgPath, svgText);

    const webpPath = join(OUT_DIR, `${slug}.webp`);
    const ogPath = join(OG_DIR, `${slug}.webp`);
    const plainPath = join(PLAIN_DIR, `${slug}.webp`);
    const key = `${sha(svgText)}-${sha(plainText)}`;
    const fresh =
      !flags.out &&
      cache[slug] === key &&
      [webpPath, ogPath, plainPath].every((f) => existsSync(f));
    if (fresh) {
      skipped++;
      continue;
    }

    // Render at 2x and downsample, so thin strokes get proper antialiasing.
    const pngPath = join(scratch, `${slug}.png`);
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=2',
        `--window-size=${W},${H}`,
        `--screenshot=${pngPath}`,
        `file://${svgPath}`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    );

    execFileSync('python3', ['-c', ENCODE, pngPath, webpPath, String(W), String(H), '92', ogPath], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    // The plain copy. Its SVG is not committed: it is the same art with two elements
    // left off, so keeping it would be a second file to notice drifting.
    const plainSvg = join(scratch, `${slug}-plain.svg`);
    const plainPng = join(scratch, `${slug}-plain.png`);
    writeFileSync(plainSvg, plainText);
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=2',
        `--window-size=${W},${H}`,
        `--screenshot=${plainPng}`,
        `file://${plainSvg}`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    );
    execFileSync('python3', ['-c', ENCODE_ONE, plainPng, plainPath, String(W), String(H), '92'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    if (!flags.out) cache[slug] = key;
    rendered++;
    console.log(`${theme.name.padEnd(22)} svg/${slug}.svg -> images/${slug}.webp + og + plain`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

console.log(`${rendered} rendered, ${skipped} unchanged`);
