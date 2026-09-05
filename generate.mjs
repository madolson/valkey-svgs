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

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG_DIR = join(HERE, 'svg');
const OUT_DIR = join(HERE, 'images');
const OG_DIR = join(HERE, 'images', 'og');
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
// Caption stickers: the post title set on solid light blocks in the bottom left.
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

// Wrap a title into at most three sticker lines. 26 characters is what fits beside
// a card's right-hand frame at the sticker size; short theme titles still land on
// one line. Overflowing throws rather than silently dropping the tail, which is what
// the old `.slice(0, 3)` did to any title longer than about fifty characters.
function captionLines(text, max = 26) {
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
  if (lines.length > 3) {
    throw new Error(`Caption needs ${lines.length} lines, the slot holds 3: ${JSON.stringify(text)}`);
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
  return lines
    .map((line, i) => {
      const y = top + i * (blockH + gap);
      const w = textWidth(line, size) + padX * 2;
      return (
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(blockH)}" rx="${n(4 * px)}" fill="${C.ice}"/>` +
        `<text x="${n(x + padX)}" y="${n(y + padY + size * 0.79)}" fill="${C.ink}" font-family="${FONT}" ` +
        `font-size="${n(size)}" font-weight="600">${esc(line)}</text>`
      );
    })
    .join('');
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
function wrap(theme, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${frame(theme)}">
  <title>${theme.title}</title>
  <desc>${theme.desc}</desc>
${defs()}
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
${art}
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.055" style="mix-blend-mode:overlay"/>
${stamp(theme)}${theme.caption ? `\n  <g>${captionBlocks(theme, theme.caption)}</g>` : ''}
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

// Performance: command traffic streaking toward a vanishing point, the same
// gesture as the hero background but without the command names.
function performance(r) {
  const fx = 1530;
  const fy = 505;
  const squash = 0.4;
  // Every streak rides the same spiral, so the field reads as one warp rather
  // than as noise. Twist accumulates with distance from the mark, which means
  // streaks straighten out as they arrive and bend hardest way out in the tail.
  const TWIST = -0.00018;
  const MAX_SWEEP = 0.15; // radians, or long tails curl right round
  const streaks = [];
  const grads = [];

  for (let i = 0; i < 240; i++) {
    const hero = i < 12;
    const angle = Math.PI + (r() * 2 - 1) * 0.62;
    const r0 = 30 + Math.pow(r(), 1.6) * 1600;
    const len = 50 + r0 * (0.2 + r() * 0.55);
    const twist = TWIST * (0.6 + r() * 0.8);
    const bend = -Math.min(Math.abs(twist), MAX_SWEEP / len);

    // Sample the spiral at both ends and the middle, then fit one quadratic
    // through the true midpoint: B(0.5) = (P0 + 2C + P2) / 4.
    const at = (rad) => {
      const a = angle + bend * (rad - r0);
      return [fx + Math.cos(a) * rad, fy + Math.sin(a) * rad * squash];
    };
    const [x1, y1] = at(r0);
    const [mx, my] = at(r0 + len / 2);
    const [x2, y2] = at(r0 + len);
    const qx = 2 * mx - (x1 + x2) / 2;
    const qy = 2 * my - (y1 + y2) / 2;
    if (x2 < -200) continue;

    const width = (hero ? 5 : 1) + (r0 / 700) * (0.5 + r() * 1.4);
    const op = clamp(0.3 + 0.55 * (1 - r0 / 1700) + r() * 0.25, 0.15, 1);
    const color = weighted(r, [
      [C.cyanLt, 46],
      [C.ice, 22],
      [C.mint, 14],
      [C.coral, 9],
      [C.gold, 4],
      [C.violet, 5],
    ]);

    // Taper each streak along its own length: hottest at the leading edge
    // nearest the vanishing point, trailing off into nothing. Hero streaks also
    // cool from ice through their own colour into violet.
    const id = `pf${i}`;
    grads.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">` +
        (hero
          ? `<stop offset="0" stop-color="${C.ice}" stop-opacity="1"/>` +
            `<stop offset="0.3" stop-color="${color}" stop-opacity="0.8"/>` +
            `<stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>`
          : `<stop offset="0" stop-color="${color}" stop-opacity="1"/>` +
            `<stop offset="0.45" stop-color="${color}" stop-opacity="0.55"/>` +
            `<stop offset="1" stop-color="${color}" stop-opacity="0"/>`) +
        `</linearGradient>`
    );

    streaks.push({
      hero,
      s: `<path d="M ${n(x1)} ${n(y1)} Q ${n(qx)} ${n(qy)} ${n(x2)} ${n(y2)}" fill="none" stroke="url(#${id})" stroke-width="${n(width)}" stroke-linecap="round" opacity="${n(op)}"/>`,
    });
  }

  const heroes = streaks.filter((s) => s.hero).map((s) => s.s).join('');
  const rest = streaks.filter((s) => !s.hero).map((s) => s.s).join('');

  return [
    `  <defs>${grads.join('')}</defs>`,
    `  <ellipse cx="${fx}" cy="${fy}" rx="820" ry="150" fill="url(#h-cyan)" opacity="0.35"/>`,
    `  <g opacity="0.45" filter="url(#blur18)">${heroes}</g>`,
    `  <g>${rest}</g>`,
    `  <g>${heroes}</g>`,
    // The mark is the light source the traffic converges on, so the bloom sits
    // outside it rather than behind it: no hot white core to wash it out.
    `  <circle cx="${fx}" cy="${fy}" r="330" fill="url(#h-ice)" opacity="0.5"/>`,
    `  <ellipse cx="${fx}" cy="${fy}" rx="360" ry="10" fill="${C.ice}" opacity="0.35" filter="url(#blur18)"/>`,
    `  <circle cx="${fx}" cy="${fy}" r="132" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.55">${mark(fx, fy, 234)}</g>`,
    `  <g>${mark(fx, fy, 234)}</g>`,
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
function slotMigrationQuiet(r) {
  const cy = 528;
  const src = 500;
  const dst = 1420;
  const R = 196;
  const SEG = 21;
  const FROM = [15, 0, 1, 2]; // contiguous, and facing the target
  const TO = [7, 8, 9, 10]; // the same four, arrived, facing the source

  const x0 = src + R + 16;
  const xEnd = dst - R - 16;

  // Three staggered lanes of slot segments in flight. In-flight data is cyan:
  // mint is reserved for what has arrived, which is the ring's job, and ice for
  // the lens. The opacity ramp toward the target is the only direction cue the
  // stream carries, so the ring stays the one device that states direction.
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
        color: weighted(r, [[C.cyan, 6], [C.cyanLt, 4]]),
        op: 0.42 + ((x - x0) / (xEnd - x0)) * 0.3,
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

  // The lens: half again the radius it had, and the magnification raised so the
  // band resolves into separate slots inside the glass. That resolution is the
  // point of the lens, and it is what the chevron used to compete with.
  // The ring vocabulary, drawn deterministically: neutral slots are cyan at
  // context weight, and the moved range is violet and dashed where it left,
  // mint and solid where it landed, both at full opacity. Dimming the whole ring
  // was the first attempt and it buried the one thing the rings are there to say.
  const ring = (cx, run, color, dashed) => {
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
      const d = arcPath(cx, cy, R, i * SLOT_STEP + 0.05, (i + 1) * SLOT_STEP - 0.05);
      const moved = run.includes(i);
      out.push(
        `<path d="${d}" fill="none" stroke="${moved ? color : C.cyan}" stroke-width="${SEG}" ` +
          `opacity="${moved ? 0.95 : 0.34}"${moved && dashed ? ' stroke-dasharray="5 7"' : ''}/>`
      );
    }
    return out.join('');
  };

  const lx = 960;
  const ly = cy;
  const lr = 186; // leaves the stream visible either side of the glass
  const hand = 0.75;
  const h0 = [lx + Math.cos(hand) * (lr + 4), ly + Math.sin(hand) * (lr + 4)];
  const h1 = [lx + Math.cos(hand) * (lr + 128), ly + Math.sin(hand) * (lr + 128)];

  // One chevron, driving the stream into the destination. It is a second device
  // for direction alongside the ring, which rule 9 argues against, so it is kept
  // at context weight: no halo, no second ghosted copy, and a stroke well under
  // the lens rim's. It says "into that ring" in a way the rings alone cannot.
  const tip = dst - R - 26;
  const chevW = 42;
  const chevron =
    `<path d="M ${n(tip - chevW)} ${n(cy - chevW * 1.18)} L ${tip} ${cy} L ${n(tip - chevW)} ${n(cy + chevW * 1.18)}" ` +
    `fill="none" stroke="${C.mint}" stroke-width="12" stroke-linejoin="miter" opacity="0.6"/>`;

  return [
    `  <clipPath id="lensQuiet"><circle cx="${lx}" cy="${ly}" r="${lr}"/></clipPath>`,
    // Context: the stream, then the two rings at 0.62 so neither competes with
    // the glass. The vacated run is hollow, the arrived run solid, which is what
    // tells you which way the range went.
    `  <g>${drawBlocks()}</g>`,
    `  ${chevron}`,
    `  <g>${ring(src, FROM, C.violet, true)}</g>`,
    `  <g>${ring(dst, TO, C.mint, false)}</g>`,
    // Nothing haloes the marks any more, so they carry at 160 where 112 looked
    // undersized inside a ring this wide.
    `  <g>${mark(src, cy, 160)}</g>`,
    `  <g>${mark(dst, cy, 160)}</g>`,
    // The focal element, and the only halo in the frame.
    `  <g clip-path="url(#lensQuiet)">` +
      `<circle cx="${lx}" cy="${ly}" r="${lr}" fill="${C.ink}" opacity="0.62"/>` +
      `<g transform="translate(${lx} ${ly}) scale(2) translate(${-lx} ${-ly})">${drawBlocks(0.35)}</g>` +
      `</g>`,
    `  <line x1="${n(h0[0])}" y1="${n(h0[1])}" x2="${n(h1[0])}" y2="${n(h1[1])}" stroke="${C.ice}" ` +
      `stroke-width="26" stroke-linecap="round" opacity="0.3" filter="url(#blur8)"/>`,
    `  <line x1="${n(h0[0])}" y1="${n(h0[1])}" x2="${n(h1[0])}" y2="${n(h1[1])}" stroke="${C.ice}" ` +
      `stroke-width="20" stroke-linecap="round" opacity="0.95"/>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${C.ice}" stroke-width="22" opacity="0.3" filter="url(#blur8)"/>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${C.ice}" stroke-width="13" opacity="0.95"/>`,
  ].join('\n');
}

// Keyspace scan: a cursor holding one bounded window of a large keyspace, with
// the keys behind it already visited and the rest still ahead. The hop track
// Slot migration under a lens: the same two-instance migration as
// `atomic-slot-migration`, recomposed so the lens is unambiguously the subject.
// The instances and the stream are context, drawn quiet; the only place anything
// is bright or varied is inside the glass, where the migrating objects differ in
// length and colour. Solid background, because a starfield and a spotlight are
// two more textures competing with the thing you are meant to look at.
function slotMigrationLens() {
  const cx = 960;
  const cy = 520;
  const R = 268; // the glass
  const src = 516;
  const dst = 1404;
  const ringR = 92;

  // The two instances: a plain ring and the mark, at context weight.
  const instance = (x) =>
    `<circle cx="${x}" cy="${cy}" r="${ringR}" fill="none" stroke="${C.ice}" stroke-width="3" opacity="0.4"/>` +
    `<g opacity="0.9">${mark(x, cy, 86)}</g>`;

  // The stream between them, and one small arrowhead so the direction is not
  // ambiguous. It runs behind the glass rather than around it.
  const stream =
    `<line x1="${src + ringR + 16}" y1="${cy}" x2="${dst - ringR - 34}" y2="${cy}" stroke="${C.cyanLt}" ` +
      `stroke-width="3" opacity="0.4"/>` +
    `<path d="M ${dst - ringR - 54} ${cy - 16} L ${dst - ringR - 18} ${cy} L ${dst - ringR - 54} ${cy + 16}" ` +
      `fill="none" stroke="${C.cyanLt}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`;

  // What the glass is for: the objects in transit are not alike. Left-aligned on a
  // common edge so the differing lengths read as differing sizes.
  const left = 775;
  const rowsIn = [
    [-152, 300, C.cyanLt],
    [-76, 400, C.mint],
    [0, 250, C.gold],
    [76, 380, C.ice],
    [152, 330, C.coral],
  ];
  const contents = rowsIn
    .map(
      ([dy, len, color]) =>
        `<rect x="${left}" y="${n(cy + dy - 22)}" width="${len}" height="44" rx="22" fill="${color}" opacity="0.95"/>`
    )
    .join('');

  // The handle points away from the stream, so it does not read as part of it.
  const hx = cx - R * 0.72;
  const hy = cy + R * 0.72;

  return [
    `  <clipPath id="lensGlass"><circle cx="${cx}" cy="${cy}" r="${n(R - 14)}"/></clipPath>`,
    `  <g>${instance(src)}${instance(dst)}</g>`,
    `  <g>${stream}</g>`,
    `  <line x1="${n(hx)}" y1="${n(hy)}" x2="${n(hx - 148)}" y2="${n(hy + 148)}" stroke="${C.mint}" ` +
      `stroke-width="34" stroke-linecap="round" opacity="0.95"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(R - 14)}" fill="${C.ink}" fill-opacity="0.42"/>`,
    `  <g clip-path="url(#lensGlass)">${contents}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.mint}" stroke-width="18" opacity="0.95"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(R - 24)}" fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.5"/>`,
  ].join('\n');
}


// below it steps in uneven bites, because COUNT is a hint and not a batch size.
function keyspaceScan(r) {
  const cx = 960; // where the cursor is
  const half = 168; // half-width of the window it is holding
  const top = 268;
  const bottom = 800;

  const keys = [];
  let guard = 0;
  while (keys.length < 185 && guard++ < 30000) {
    const x = 50 + r() * (W - 100);
    const y = top + r() * (bottom - top);
    if (keys.every((k) => (k.x - x) ** 2 + (k.y - y) ** 2 > 46 ** 2)) keys.push({ x, y });
  }

  const held = [];
  const rest = [];
  for (const k of keys) {
    if (Math.abs(k.x - cx) < half) {
      held.push(dot(k.x, k.y, 6 + r() * 2.5, C.mint, 'mint', 0.95, 3.2));
    } else if (k.x < cx) {
      rest.push(dot(k.x, k.y, 4 + r() * 2.5, C.cyanLt, 'cyan', 0.5, 2.6));
    } else {
      rest.push(dot(k.x, k.y, 3.5 + r() * 2, C.violet, 'violet', 0.44, 2.8));
    }
  }

  // Cursor hops along the bottom, deliberately uneven. Everything up to the
  // current window is done, the rest is still pending.
  const track = 872;
  const hops = [200];
  while (hops[hops.length - 1] < 1720) hops.push(hops[hops.length - 1] + 86 + r() * 178);
  const steps = [];
  for (let i = 0; i < hops.length - 1; i++) {
    const [a, b] = [hops[i], Math.min(hops[i + 1], 1720)];
    const done = b <= cx - half;
    const current = a < cx + half && b > cx - half;
    if (current) {
      steps.push(
        `<line x1="${n(a)}" y1="${track}" x2="${n(b)}" y2="${track}" stroke="${C.ice}" stroke-width="7" stroke-linecap="round" opacity="0.95"/>`
      );
    } else {
      steps.push(
        `<line x1="${n(a)}" y1="${track}" x2="${n(b)}" y2="${track}" stroke="${done ? C.mint : C.cyanLt}" ` +
          `stroke-width="${done ? 5 : 2.4}" stroke-linecap="round" opacity="${done ? 0.7 : 0.25}"/>`
      );
    }
    steps.push(
      `<line x1="${n(a)}" y1="${track - 11}" x2="${n(a)}" y2="${track + 11}" stroke="${C.ice}" stroke-width="2" opacity="${done || current ? 0.45 : 0.16}"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <ellipse cx="${cx}" cy="540" rx="470" ry="400" fill="url(#h-mint)" opacity="0.16"/>`,
    `  <line x1="180" y1="${track}" x2="1740" y2="${track}" stroke="${C.ice}" stroke-width="1.6" stroke-dasharray="9 15" opacity="0.22"/>`,
    `  <rect x="${cx - half}" y="${top - 52}" width="${half * 2}" height="${bottom - top + 104}" rx="26" fill="${C.ice}" opacity="0.07"/>`,
    `  <g stroke="${C.ice}" stroke-width="12" opacity="0.28" filter="url(#blur18)">` +
      `<line x1="${cx - half}" y1="${top - 52}" x2="${cx - half}" y2="${bottom + 52}"/>` +
      `<line x1="${cx + half}" y1="${top - 52}" x2="${cx + half}" y2="${bottom + 52}"/></g>`,
    `  <g>${rest.join('')}</g>`,
    `  <g stroke="${C.ice}" stroke-width="3.4" opacity="0.9">` +
      `<line x1="${cx - half}" y1="${top - 52}" x2="${cx - half}" y2="${bottom + 52}"/>` +
      `<line x1="${cx + half}" y1="${top - 52}" x2="${cx + half}" y2="${bottom + 52}"/></g>`,
    `  <g>${held.join('')}</g>`,
    `  <g>${steps.join('')}</g>`,
    `  <line x1="${cx + half}" y1="${track - 18}" x2="${cx + half}" y2="${track + 18}" stroke="${C.ice}" stroke-width="4" stroke-linecap="round" opacity="0.95"/>`,
    `  <path d="M ${cx + half + 52} ${track - 15} L ${cx + half + 74} ${track} L ${cx + half + 52} ${track + 15}" fill="none" stroke="${C.ice}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>`,
  ].join('\n');
}

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
// Key prefix groups: a scattered sample of keys on the left resolving into a
// short list of prefix groups with counts on the right.
function keyPrefixGroups(r) {
  const ROWS = 6;
  const anchorX = 940;
  const rowY = [292, 392, 492, 592, 692, 792];
  const COUNTS = [1, 0.78, 0.55, 0.4, 0.28, 0.16];

  const keys = [];
  let guard = 0;
  while (keys.length < 92 && guard++ < 30000) {
    const x = 400 + r() * 430;
    const y = 250 + r() * 590;
    if (keys.every((k) => (k.x - x) ** 2 + (k.y - y) ** 2 > 42 ** 2)) keys.push({ x, y, g: (r() * ROWS) | 0 });
  }

  const edges = keys
    .map((k) => {
      const ty = rowY[k.g];
      const mx = (k.x + anchorX) / 2 + 60;
      return `<path d="M ${n(k.x)} ${n(k.y)} C ${n(mx)} ${n(k.y)} ${n(mx)} ${n(ty)} ${n(anchorX - 18)} ${n(ty)}" fill="none" opacity="${n(0.1 + r() * 0.16)}"/>`;
    })
    .join('');

  const dots = keys
    .map((k) => dot(k.x, k.y, 3.4 + r() * 2.6, C.cyanLt, 'cyan', 0.4 + r() * 0.35, 2.8))
    .join('');

  const list = [];
  for (let i = 0; i < ROWS; i++) {
    const y = rowY[i];
    const labelW = 118 + r() * 54;
    const barW = 40 + COUNTS[i] * 180;
    list.push(
      dot(anchorX, y, 8, C.mint, 'mint', 0.95, 3.2),
      `<rect x="${anchorX + 26}" y="${n(y - 9)}" width="${n(labelW)}" height="18" rx="9" fill="${C.ice}" opacity="0.55"/>`,
      `<rect x="${n(anchorX + 26 + labelW + 16)}" y="${n(y - 9)}" width="24" height="18" rx="9" fill="${C.ice}" opacity="0.22"/>`,
      `<rect x="${n(anchorX + 250)}" y="${n(y - 7)}" width="${n(barW)}" height="14" rx="7" fill="${C.mint}" opacity="${n(0.4 + 0.4 * COUNTS[i])}"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <ellipse cx="940" cy="540" rx="520" ry="430" fill="url(#h-cyan)" opacity="0.16"/>`,
    `  <rect x="900" y="240" width="550" height="604" rx="30" fill="${C.ink}" opacity="0.3"/>`,
    `  <rect x="900" y="240" width="550" height="604" rx="30" fill="none" stroke="${C.ice}" stroke-width="2" opacity="0.18"/>`,
    `  <g stroke="${C.cyanLt}" stroke-width="1.6">${edges}</g>`,
    `  <g>${dots}</g>`,
    `  <g>${list.join('')}</g>`,
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

// ------------------------------------------------------------- AI workloads
//
// Three candidate themes, one idea each. Kept deliberately apart: `ai-agent-memory`
// is about recency, `ai-workload-fanout` is about decomposition, `ai-vector-recall`
// is about addressing by distance instead of by key.

// Agent memory: a conversation runs left to right. The most recent turns stay
// hot inside a lit window; everything older is parked in the archive below and
// pulled back into the window only when it is needed.
function aiAgentMemory(r) {
  const tapeY = 292;
  const cardH = 96;
  const left = 120;
  const right = 1400;
  const turns = 18;
  const hotFrom = 12;
  const step = (right - left) / turns;
  const cardW = step - 18;

  // Cold turns are outlines, hot turns are solid: the same turn, held two ways.
  const cold = [];
  const hot = [];
  for (let i = 0; i < turns; i++) {
    const x = left + i * step;
    const t = i / (turns - 1);
    if (i >= hotFrom) {
      hot.push(
        `<rect x="${n(x)}" y="${n(tapeY - cardH / 2)}" width="${n(cardW)}" height="${cardH}" rx="10" ` +
          `fill="${weighted(r, [[C.mint, 5], [C.ice, 4], [C.cyanLt, 2]])}" opacity="${n(0.78 + r() * 0.2)}"/>`
      );
    } else {
      const h = cardH - 22 - r() * 22;
      cold.push(
        `<rect x="${n(x)}" y="${n(tapeY - h / 2)}" width="${n(cardW)}" height="${n(h)}" rx="8" fill="none" ` +
          `stroke="${C.cyanLt}" stroke-width="2" opacity="${n(clamp(0.16 + t * 0.26 + (r() - 0.5) * 0.1, 0.12, 0.5))}"/>`
      );
    }
  }

  const fx0 = left + hotFrom * step - 16;
  const fx1 = left + (turns - 1) * step + cardW + 16;
  const fy0 = tapeY - cardH / 2 - 18;
  const fh = cardH + 36;

  // The archive: dim cells either side of the store, older turns at rest.
  const rows = [742, 794, 846];
  const cellW = 40;
  const cellH = 24;
  const cstep = 52;
  const cells = [];
  for (const cx0 of [300, 1112]) {
    for (let c = 0; c < 10; c++) {
      for (let j = 0; j < rows.length; j++) {
        if (r() < 0.12) continue;
        cells.push(
          `<rect x="${n(cx0 + c * cstep)}" y="${n(rows[j] - cellH / 2)}" width="${cellW}" height="${cellH}" rx="4" ` +
            `fill="${weighted(r, [[C.cyanLt, 6], [C.violet, 3], [C.ice, 2]])}" opacity="${n(0.14 + r() * 0.2)}"/>`
        );
      }
    }
  }

  // Two turns recalled on demand: lit in the archive, arced back into the window.
  const recalls = [
    { sx: 300 + 5 * cstep + cellW / 2, sy: rows[0], tx: 1040 },
    { sx: 1112 + 3 * cstep + cellW / 2, sy: rows[2], tx: 1246 },
  ];
  const ty = fy0 + fh + 8;
  const pulled = [];
  for (const { sx, sy, tx } of recalls) {
    pulled.push(
      `<rect x="${n(sx - cellW / 2)}" y="${n(sy - cellH / 2)}" width="${cellW}" height="${cellH}" rx="4" fill="${C.mint}" opacity="0.9"/>`,
      `<circle cx="${n(sx)}" cy="${n(sy)}" r="46" fill="url(#h-mint)" opacity="0.8"/>`,
      `<path d="M ${n(sx)} ${n(sy - cellH / 2 - 6)} C ${n(sx + 130)} ${n(sy - 190)} ${n(tx - 170)} ${n(ty + 170)} ${n(tx)} ${n(ty)}" ` +
        `fill="none" stroke="${C.mint}" stroke-width="3.4" stroke-dasharray="14 13" stroke-linecap="round" opacity="0.75"/>`,
      `<path d="M ${n(tx - 17)} ${n(ty + 22)} L ${n(tx)} ${n(ty)} L ${n(tx + 17)} ${n(ty + 22)}" fill="none" ` +
        `stroke="${C.mint}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
    );
  }

  // The counter-motion: the oldest end of the tape draining into the archive.
  const evict =
    `<path d="M 360 ${n(tapeY + 36)} C 302 ${n(tapeY + 190)} 288 600 306 ${n(rows[0] - 20)}" fill="none" stroke="${C.cyanLt}" ` +
    `stroke-width="2.6" stroke-dasharray="9 14" stroke-linecap="round" opacity="0.32"/>`;

  return [
    starfield(r, 55),
    // Ambient glow behind the motif: the window is the warm end of the image.
    `  <ellipse cx="1180" cy="${tapeY}" rx="310" ry="160" fill="url(#h-mint)" opacity="0.32"/>`,
    `  <circle cx="960" cy="800" r="430" fill="url(#h-cyan)" opacity="0.16"/>`,
    `  <g>${cold.join('')}</g>`,
    `  <g>${cells.join('')}</g>`,
    `  ${evict}`,
    `  <g>${pulled.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.45">${hot.join('')}</g>`,
    `  <g>${hot.join('')}</g>`,
    `  <rect x="${n(fx0)}" y="${n(fy0)}" width="${n(fx1 - fx0)}" height="${fh}" rx="26" fill="${C.mint}" fill-opacity="0.06" ` +
      `stroke="${C.ice}" stroke-width="3.6" opacity="0.85"/>`,
    `  <circle cx="960" cy="790" r="152" fill="url(#scrim)"/>`,
    `  <g>${mark(960, 790, 178)}</g>`,
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
function toolingStack(r) {
  const baseY = 880;
  const bx0 = 524;
  const bx1 = 1396;
  const count = 11;
  const step = (bx1 - bx0) / (count - 1);
  const prim = Array.from({ length: count }, (_, i) => bx0 + i * step);

  const chips = prim
    .map(
      (x) =>
        `<rect x="${n(x - 22)}" y="${n(baseY - 15)}" width="44" height="30" rx="7" fill="${C.cyan}" fill-opacity="0.2" ` +
        `stroke="${C.cyanLt}" stroke-width="2" opacity="0.85"/>` +
        `<circle cx="${n(x)}" cy="${baseY}" r="3.4" fill="${C.cyanLt}" opacity="0.8"/>`
    )
    .join('');

  // Level one: four tools, each standing on a run of primitives and each drawn
  // with a different inner detail so they do not read as one block repeated.
  const l1y = 718;
  const l1 = [
    { members: [0, 1, 2], glyph: 'dots', h: 62 },
    { members: [3, 4], glyph: 'chevron', h: 50 },
    { members: [5, 6, 7], glyph: 'wave', h: 66 },
    { members: [8, 9, 10], glyph: 'ring', h: 56 },
  ].map((t) => {
    const left = prim[t.members[0]] - 28;
    const right = prim[t.members[t.members.length - 1]] + 28;
    return { ...t, left, right, cx: (left + right) / 2, y: l1y };
  });

  // Level two: two composites, each spanning two of the tools below.
  const l2y = 552;
  const l2 = [[0, 1], [2, 3]].map((pair) => {
    const left = l1[pair[0]].left + 14;
    const right = l1[pair[1]].right - 14;
    return { left, right, cx: (left + right) / 2, y: l2y };
  });

  const inner = (t) => {
    if (t.glyph === 'dots') {
      return [-1, 0, 1].map((i) => `<circle cx="${n(t.cx + i * 26)}" cy="${t.y}" r="6" fill="${C.mint}" opacity="0.9"/>`).join('');
    }
    if (t.glyph === 'chevron') {
      return (
        `<path d="M ${n(t.cx - 13)} ${t.y - 15} L ${n(t.cx + 8)} ${t.y} L ${n(t.cx - 13)} ${t.y + 15}" ` +
        `fill="none" stroke="${C.mint}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
      );
    }
    if (t.glyph === 'wave') {
      const w = (t.right - t.left) * 0.5;
      return (
        `<path d="M ${n(t.cx - w / 2)} ${t.y + 9} L ${n(t.cx - w / 6)} ${t.y - 11} L ${n(t.cx + w / 6)} ${t.y + 6} L ${n(t.cx + w / 2)} ${t.y - 13}" ` +
        `fill="none" stroke="${C.mint}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
      );
    }
    return (
      `<circle cx="${n(t.cx)}" cy="${t.y}" r="15" fill="none" stroke="${C.mint}" stroke-width="4" opacity="0.9"/>` +
      `<circle cx="${n(t.cx)}" cy="${t.y}" r="4.5" fill="${C.mint}" opacity="0.9"/>`
    );
  };

  const l1Boxes = l1
    .map(
      (t) =>
        `<rect x="${n(t.left)}" y="${n(t.y - t.h / 2)}" width="${n(t.right - t.left)}" height="${n(t.h)}" rx="14" ` +
        `fill="${C.mint}" fill-opacity="0.1" stroke="${C.mint}" stroke-width="2.8" opacity="0.85"/>` +
        inner(t)
    )
    .join('');

  const l2Boxes = l2
    .map(
      (t) =>
        `<rect x="${n(t.left)}" y="${n(t.y - 37)}" width="${n(t.right - t.left)}" height="74" rx="18" ` +
        `fill="${C.gold}" fill-opacity="0.1" stroke="${C.gold}" stroke-width="3" opacity="0.85"/>` +
        [-2, -1, 0, 1, 2]
          .map((i) => `<rect x="${n(t.cx + i * 34 - 8)}" y="${n(t.y - 13)}" width="16" height="26" rx="5" fill="${C.gold}" opacity="${n(0.4 + r() * 0.45)}"/>`)
          .join('')
    )
    .join('');

  // What rests on what.
  const legs = [];
  for (const t of l1) {
    for (const m of t.members) {
      legs.push(
        `<line x1="${n(prim[m])}" y1="${n(baseY - 15)}" x2="${n(prim[m])}" y2="${n(t.y + t.h / 2)}" stroke="${C.cyanLt}" stroke-width="2.2" opacity="0.45"/>`
      );
    }
  }
  l2.forEach((c, i) => {
    for (const t of [l1[i * 2], l1[i * 2 + 1]]) {
      legs.push(
        `<line x1="${n(t.cx)}" y1="${n(t.y - t.h / 2)}" x2="${n(t.cx)}" y2="${n(c.y + 37)}" stroke="${C.mint}" stroke-width="2.4" opacity="0.5"/>`
      );
    }
  });
  const markY = 300;
  for (const c of l2) {
    legs.push(
      `<line x1="${n(c.cx)}" y1="${n(c.y - 37)}" x2="960" y2="${n(markY + 76)}" stroke="${C.gold}" stroke-width="2.4" stroke-dasharray="12 10" opacity="0.5"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <ellipse cx="960" cy="560" rx="540" ry="360" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <circle cx="960" cy="${markY}" r="230" fill="url(#h-gold)" opacity="0.4"/>`,
    `  <line x1="${n(bx0 - 34)}" y1="${baseY}" x2="${n(bx1 + 34)}" y2="${baseY}" stroke="${C.cyanLt}" stroke-width="2" stroke-dasharray="8 12" opacity="0.35"/>`,
    `  <g>${legs.join('')}</g>`,
    `  <g>${chips}</g>`,
    `  <g>${l1Boxes}</g>`,
    `  <g>${l2Boxes}</g>`,
    `  <circle cx="960" cy="${markY}" r="112" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(960, markY, 152)}</g>`,
    `  <g>${mark(960, markY, 152)}</g>`,
  ].join('\n');
}

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

function limitsTightEnvelope(r) {
  const cx = 960;
  const cy = 540;
  const bw = 580;
  const bh = 420;
  const x0 = cx - bw / 2;
  const x1 = cx + bw / 2;
  const y0 = cy - bh / 2;
  const y1 = cy + bh / 2;

  // The room a server usually gets, stepping down to the envelope it has here.
  const ghosts = [[980, 820], [780, 620]]
    .map(
      ([w, h], i) =>
        `<rect x="${n(cx - w / 2)}" y="${n(cy - h / 2)}" width="${w}" height="${h}" rx="${28 - i * 6}" ` +
        `fill="none" stroke="${C.ice}" stroke-width="2.2" stroke-dasharray="14 20" opacity="${n(0.5 - i * 0.06)}"/>`
    )
    .join('');

  // The workload, filling the box out to both walls with almost nothing spare.
  const packed = [];
  for (let y = y0 + 15; y <= y1 - 13; y += 20) {
    let x = x0 + 11;
    while (x < x1 - 16) {
      const len = Math.min(36 + r() * 116, x1 - 11 - x);
      packed.push(
        `<rect x="${n(x)}" y="${n(y - 6)}" width="${n(len)}" height="12" rx="6" ` +
          `fill="${weighted(r, [[C.cyanLt, 6], [C.mint, 3], [C.ice, 2]])}" opacity="${n(0.4 + r() * 0.45)}"/>`
      );
      x += len + 6 + r() * 9;
    }
  }

  // Hard corners, so the boundary reads as a limit rather than as a container.
  const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]
    .map(
      ([x, y, dx, dy]) =>
        `<path d="M ${n(x + dx * 54)} ${n(y)} L ${n(x)} ${n(y)} L ${n(x)} ${n(y + dy * 54)}" fill="none" ` +
        `stroke="${C.ice}" stroke-width="8" stroke-linecap="round" opacity="0.95"/>`
    )
    .join('');

  // The workload pushing outward on every wall.
  const push = [];
  for (const t of [-0.56, 0, 0.56]) {
    const px = cx + t * (bw / 2 - 66);
    const py = cy + t * (bh / 2 - 56);
    const chev = (a, b, c, d, e, f) =>
      `<path d="M ${n(a)} ${n(b)} L ${n(c)} ${n(d)} L ${n(e)} ${n(f)}" fill="none" stroke="${C.gold}" ` +
      `stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
    push.push(
      chev(px - 20, y0 + 21, px, y0 + 3, px + 20, y0 + 21),
      chev(px - 20, y1 - 21, px, y1 - 3, px + 20, y1 - 21),
      chev(x0 + 21, py - 20, x0 + 3, py, x0 + 21, py + 20),
      chev(x1 - 21, py - 20, x1 - 3, py, x1 - 21, py + 20)
    );
  }

  return [
    starfield(r, 50),
    `  <circle cx="${cx}" cy="${cy}" r="420" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <g>${ghosts}</g>`,
    `  <rect x="${n(x0)}" y="${n(y0)}" width="${bw}" height="${bh}" rx="16" fill="none" stroke="${C.ice}" ` +
      `stroke-width="15" opacity="0.28" filter="url(#blur8)"/>`,
    `  <rect x="${n(x0)}" y="${n(y0)}" width="${bw}" height="${bh}" rx="16" fill="${C.ink}" fill-opacity="0.35"/>`,
    `  <g>${packed.join('')}</g>`,
    `  <rect x="${n(x0)}" y="${n(y0)}" width="${bw}" height="${bh}" rx="16" fill="none" stroke="${C.ice}" ` +
      `stroke-width="4" opacity="0.95"/>`,
    `  <g>${corners}</g>`,
    `  <g>${push.join('')}</g>`,
    `  <ellipse cx="${cx}" cy="${cy}" rx="200" ry="215" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.45">${mark(cx, cy, 340)}</g>`,
    `  <g>${mark(cx, cy, 340)}</g>`,
  ].join('\n');
}

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

// Delivery: one install, and the four modules it puts on the server. The port is
// what you install into; the fan is what you get.
function bundleOneInstall(r) {
  const px = 700;
  const cy = 540;
  const s = 0.92;

  // json and ldap are the tallest glyphs, so they take the two ends of the fan
  // and the whole thing stays vertically centred on the port.
  const order = ['json', 'bloom', 'search', 'ldap'];
  const mods = order.map((kind, i) => ({
    ...BUNDLE_MODULES.find((m) => m.kind === kind),
    x: 1310,
    y: 275 + i * 178.7,
  }));

  // Four branches out of the port, each stopping at its module's edge.
  const sx = 812;
  const harness = mods
    .map((m) => {
      const ex = m.x - (GLYPH_HALF_W[m.kind] + 26) * s;
      const d = `M ${sx} ${cy} C ${n(sx + 130)} ${cy} ${n(ex - 160)} ${n(m.y)} ${n(ex)} ${n(m.y)}`;
      return (
        `<path d="${d}" fill="none" stroke="${m.color}" stroke-width="14" opacity="0.22" filter="url(#blur8)"/>` +
        `<path d="${d}" fill="none" stroke="${m.color}" stroke-width="3.4" opacity="0.75"/>` +
        dot(ex, m.y, 5, m.color, m.key, 0.85, 3)
      );
    })
    .join('');

  return [
    starfield(r, 55),
    // Ambient glow behind everything that follows.
    `  <circle cx="${px}" cy="${cy}" r="330" fill="url(#h-cyan)" opacity="0.18"/>`,
    ...mods.map((m) => `  <circle cx="${n(m.x)}" cy="${n(m.y)}" r="150" fill="url(#h-${m.key})" opacity="0.22"/>`),
    `  <g>${harness}</g>`,
    `  <circle cx="${px}" cy="${cy}" r="150" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(px, cy, 208)}</g>`,
    `  <g>${mark(px, cy, 208)}</g>`,
    `  <g>${mods.map((m) => moduleGlyph(m.kind, m.x, m.y, s, m.color, m.key)).join('')}</g>`,
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
function keySizeDistribution(r, { spread = 0 } = {}) {
  const { sx, sw } = ADMIN_PANEL;
  const { panel, bars } = adminPanel();

  // The narrow crop keeps only the middle 70% of the width, so the whole
  // composition has about 1050px to live in at this zoom. Tiles are therefore
  // 120 with a 24px gap and 26px of enclosure padding: at 134 they filled the
  // budget exactly and ended up edge to edge.
  const rows = [310, 540, 770];
  const cols = [1106 + spread, 1250 + spread, 1394 + spread];
  const tile = 120;
  const shardX0 = 1020 + spread; // 160px of air between the panel and the shards
  const shardX1 = 1480 + spread;
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
// The motif is vertically centred in the frame, which means the caption crosses the
// bottom rows of the chart. That is unavoidable: the caption band takes the lower 222
// units of the framed height, so anything sitting entirely above it is top-heavy by
// construction, and this composition is the parent theme's own overlap.
//
// What that costs is legibility of the bottom of the chart, so the horizontal buys it
// back. The size labels are right-aligned to the panel's far edge, and the longest of
// them needs dx above 241 to clear the caption's right edge at 838; dx is 245. Widening
// the panel would have done the same job and was tried first, but the header is centred
// on the panel, the axis is offset from that and the bar lengths are absolute, so a
// wider panel pulls the bars away from their labels and the chart stops reading as one
// column. Moving it costs nothing.
//
// The shards are spread 150 further right, filling the space on that side that the
// title's block stack takes on this one. The two shortest bars do end up behind the
// blocks; at 19 and 25 units long they read as dots either way, and their labels show.
//
// dx/dy/scale place the motif, whose drawn box is x 440..1480, y 210..870.
function keySizeCard(opts) {
  return (r) =>
    [
      `  <g transform="translate(${n(opts.dx)} ${n(opts.dy)}) scale(${opts.scale})">`,
      keySizeDistribution(r, { spread: opts.spread }),
      `  </g>`,
    ].join('\n');
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

// The planet body plus its wireframe plus the mark, the object all three planet
// candidates are built around.
function planetBody(cx, cy, rad, markH) {
  return (
    // The body is lit from the upper left, which is what makes a wireframe read as a
    // sphere rather than as a wire ball. The gradient interpolates within C.
    `<radialGradient id="p-lit" cx="0.36" cy="0.3" r="0.82">` +
      `<stop offset="0" stop-color="${C.cyan}" stop-opacity="0.3"/>` +
      `<stop offset="0.5" stop-color="${C.mid}" stop-opacity="0.72"/>` +
      `<stop offset="1" stop-color="${C.ink}" stop-opacity="0.94"/>` +
    `</radialGradient>` +
    // An opaque backing under the gradient, or whatever passes behind the planet
    // shows through it.
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rad)}" fill="${C.ink}"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rad)}" fill="url(#p-lit)"/>` +
    globe(cx, cy, rad) +
    // The limb is the planet's edge, not part of the graticule, so it gets its own
    // weight and the only bright stroke on the object.
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rad)}" fill="none" stroke="${C.ice}" ` +
      `stroke-width="5" opacity="0.8"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(markH * 0.72)}" fill="url(#scrim)"/>` +
    mark(cx, cy, markH)
  );
}

// Half of an ellipse, so an orbit or a ring can pass behind the planet: `top`
// draws the far half, the other draws the near one.
function ellipseHalf(cx, cy, rx, ry, top) {
  // Sweep is 1 either way: clockwise from the left point goes over the top, and
  // clockwise from the right point goes under the bottom.
  const [x0, x1] = top ? [cx - rx, cx + rx] : [cx + rx, cx - rx];
  return `M ${n(x0)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(x1)} ${n(cy)}`;
}

// Idea: Planet Valkey collects what the community writes, and the writing goes
// round the project in a ring.
// Focal: the wireframe globe carrying the mark.
//
// Planet Valkey is an aggregator, so the ring is made of the things it aggregates.
// Each is one article card holding one data structure: a list, a hash, a set, a
// sorted set. Four kinds cycled rather than twelve different ones, so the ring reads
// as one band of content and not as a legend.
function articleCard(cx, cy, size, kind, tilt) {
  const half = size / 2;
  const g = size * 0.3; // the glyph's half-extent inside the card
  const line = (body) => `<${body} fill="none" stroke="${C.cyanLt}" stroke-width="${n(size * 0.05)}"/>`;
  const glyph = [];
  if (kind === 0) {
    // List: three stacked entries.
    for (let i = -1; i <= 1; i++) {
      glyph.push(
        line(
          `rect x="${n(cx - g)}" y="${n(cy + i * g * 0.72 - g * 0.2)}" ` +
            `width="${n(g * 2)}" height="${n(g * 0.4)}" rx="${n(g * 0.2)}"`
        )
      );
    }
  } else if (kind === 1) {
    // Hash: a 2x2 of buckets.
    for (const ax of [-1, 1]) {
      for (const ay of [-1, 1]) {
        glyph.push(
          line(
            `rect x="${n(ax < 0 ? cx - g : cx + g - g * 0.82)}" ` +
              `y="${n(ay < 0 ? cy - g : cy + g - g * 0.82)}" ` +
              `width="${n(g * 0.82)}" height="${n(g * 0.82)}" rx="${n(g * 0.16)}"`
          )
        );
      }
    }
  } else if (kind === 2) {
    // Set: four unordered members.
    for (const [ax, ay] of [[-0.55, -0.5], [0.6, -0.6], [-0.6, 0.55], [0.5, 0.5]]) {
      glyph.push(`<circle cx="${n(cx + ax * g)}" cy="${n(cy + ay * g)}" r="${n(g * 0.3)}" fill="${C.cyanLt}"/>`);
    }
  } else {
    // Sorted set: members ranked by score.
    [0.45, 0.72, 1].forEach((f, i) => {
      const bh = g * 1.7 * f;
      glyph.push(
        line(
          `rect x="${n(cx + (i - 1.2) * g * 0.75)}" y="${n(cy + g * 0.85 - bh)}" ` +
            `width="${n(g * 0.5)}" height="${n(bh)}" rx="${n(g * 0.12)}"`
        )
      );
    });
  }
  return (
    `<g transform="rotate(${n(tilt)} ${n(cx)} ${n(cy)})" opacity="0.85">` +
    `<rect x="${n(cx - half)}" y="${n(cy - half)}" width="${n(size)}" height="${n(size)}" ` +
      `rx="${n(size * 0.16)}" fill="${C.ink}" fill-opacity="0.72" stroke="${C.cyanLt}" ` +
      `stroke-width="${n(size * 0.038)}" opacity="0.9"/>` +
    glyph.join('') +
    `</g>`
  );
}

function planetRing(r) {
  const cx = 960;
  const cy = 540;
  const rad = 300;
  const rrx = 690;
  const rry = 190;
  const TILT = -13;
  const COUNT = 12;
  const SIZE = 78;

  // The rail the articles ride. Thin, because the articles are the content and the
  // rail is only what holds them in one orbit.
  const rail = (top, opacity) =>
    `<path d="${ellipseHalf(cx, cy, rrx, rry, top)}" fill="none" stroke="${C.ice}" ` +
    `stroke-width="3" opacity="${opacity}"/>`;

  // Position on the untilted ellipse, then rotated with it, so the cards sit on the
  // rail rather than near it.
  const a = (TILT * Math.PI) / 180;
  const cards = [];
  for (let i = 0; i < COUNT; i++) {
    const th = (2 * Math.PI * i) / COUNT + Math.PI / COUNT;
    const ex = rrx * Math.cos(th);
    const ey = rry * Math.sin(th);
    const px = cx + ex * Math.cos(a) - ey * Math.sin(a);
    const py = cy + ex * Math.sin(a) + ey * Math.cos(a);
    // A card whose centre falls behind the globe would show as a sliver poking out
    // from the limb, which reads as a rendering fault. Dropping them leaves the ring
    // openly interrupted where it passes behind the planet, which is what a ring does.
    if (Math.hypot(px - cx, py - cy) < rad + SIZE * 0.6) continue;
    cards.push({ far: Math.sin(th) < 0, svg: articleCard(px, py, SIZE, i % 4, TILT) });
  }
  const half = (far) => cards.filter((c) => c.far === far).map((c) => c.svg).join('');

  return [
    `  <g>${starfield(r, 45)}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(rad * 1.1)}" fill="url(#h-ice)" opacity="0.4"/>`,
    `  <g transform="rotate(${TILT} ${cx} ${cy})">${rail(true, 0.3)}</g>`,
    `  <g>${half(true)}</g>`,
    `  <g>${planetBody(cx, cy, rad, 260)}</g>`,
    `  <g transform="rotate(${TILT} ${cx} ${cy})">${rail(false, 0.45)}</g>`,
    `  <g>${half(false)}</g>`,
  ].join('\n');
}

const BASE_THEMES = [
  { name: 'community', seed: 1041, zoom: 1.32, center: [960, 540], title: 'Valkey community', desc: 'An abstract constellation of connected nodes, the best-connected of them drawn as the white Valkey hexagon mark, representing the Valkey community.', art: community },
  { name: 'performance', seed: 2207, zoom: 1.22, center: [1160, 515], title: 'Valkey performance', desc: 'Abstract streaks of light converging on the white Valkey hexagon mark at a bright vanishing point, representing throughput and low latency.', art: performance },
  { name: 'memory-efficiency', seed: 3313, zoom: 1.3, center: [885, 540], title: 'Valkey memory efficiency', desc: 'An abstract grid of cells that grows denser from left to right, representing the same data stored in less memory.', art: memoryEfficiency },
  { name: 'clustering', seed: 4421, zoom: 1.34, center: [960, 540], title: 'Valkey clustering and scale', desc: 'An abstract ring of slot segments around a meshed core centred on the white Valkey hexagon mark, with shards joining from outside, representing cluster mode and horizontal scale.', art: clustering },
  { name: 'release', seed: 5527, zoom: 1.2, center: [1130, 540], title: 'Valkey release', desc: 'Valkey chevrons driving into a golden burst centred on the white Valkey hexagon mark, representing a new Valkey release.', art: release },
  { name: 'release-version', seed: 5528, zoom: 1.3, center: [960, 520], title: 'Valkey release with a caption', text: '9.0', desc: 'A golden burst centred on the white Valkey hexagon mark above a large caption, representing a specific Valkey release.', art: releaseVersion },
  { name: 'atomic-slot-migration', seed: 14041, zoom: 1.1, center: [960, 522], title: 'Valkey atomic slot migration', desc: 'Two shard slot rings, each centred on the white Valkey hexagon mark, with a chevron arrow driving a stream of slot segments from one to the other and a magnifier inspecting them mid-flight, representing atomic slot migration.', art: slotMigrationRings },
  { name: 'atomic-slot-migration-quiet', seed: 46011, zoom: 1.22, center: [960, 528], title: 'Valkey atomic slot migration', desc: 'Two shard slot rings each centred on the white Valkey hexagon mark, the left one showing four contiguous slots vacated in dashed purple and the right one the same four arrived in solid green, a quiet stream of slot segments running between them, a green chevron driving that stream into the destination, and a large magnifier over the middle of the stream resolving the band into separate slots, representing watching one contiguous range migrate atomically.', art: slotMigrationQuiet },
  { name: 'slot-migration-lens', seed: 45011, zoom: 1.26, center: [960, 540], title: 'Valkey slot migration under inspection', desc: 'Two Valkey instances drawn as quiet rings around the white hexagon mark with a thin stream running between them, and a large teal magnifying glass over the middle of that stream showing the objects in transit as bars of different lengths and colours, on a flat purple field, representing observability for slot migration.', art: slotMigrationLens },
  { name: 'security-shield-clean', seed: 44011, zoom: 1.38, center: [960, 545], title: 'Valkey security', desc: 'A shield woven from a single even lattice with the white Valkey hexagon mark at its centre and nothing else inside it, representing security and hardening.', art: securityShieldClean },
  { name: 'benchmarks', seed: 7741, zoom: 1.12, center: [900, 568], title: 'Valkey benchmarks', desc: 'A bar chart of throughput climbing left to right, beneath two flat latency series labelled P99 in green and P50 in red, representing benchmarking and observability.', art: observability },
  { name: 'data-structures', seed: 8849, zoom: 1.22, center: [960, 540], title: 'Valkey data structures', desc: 'Abstract hash table buckets chaining outward beside a skip list of express lanes, representing Valkey data structures and internals.', art: dataStructures },
  { name: 'how-to', seed: 9953, zoom: 1.22, center: [960, 540], title: 'Valkey how-to', desc: 'An abstract track of numbered steps with the current step lit, representing a step-by-step guide.', art: howTo },
  { name: 'keyspace-scan', seed: 19087, zoom: 1.26, center: [960, 540], title: 'Valkey keyspace scan', desc: 'A wide field of keys with one bounded window lit in green, the keys behind it dimmed and the keys ahead of it unlit, above a track of uneven cursor steps, representing scanning a keyspace a window at a time instead of reading it all at once.', art: keyspaceScan },
  { name: 'large-key', seed: 21193, zoom: 1.4, center: [960, 548], title: 'Valkey large key', desc: 'An even field of small identical key tiles with one key of the same shape scaled up until it dwarfs them all, outlined in red, representing a single key far larger than everything else in the keyspace.', art: largeKey },
  { name: 'key-prefix-groups', seed: 23299, zoom: 1.3, center: [960, 542], title: 'Valkey key prefix groups', desc: 'A scattered cloud of sampled keys on the left funnelling into a short list of prefix rows with count bars on the right, representing a sample of key names grouped into browsable prefixes.', art: keyPrefixGroups },
  { name: 'bloom-bit-array', seed: 31013, zoom: 1.4, center: [960, 475], title: 'Valkey Bloom filters', desc: 'The white Valkey hexagon mark above a long row of bit cells, with five hash nodes fanning out of it and the five cells they land on lit in green, representing one item hashed to a handful of positions in a Bloom filter.', art: bloomBitArray },
  { name: 'search-vector-nearest', seed: 32011, zoom: 1.2, center: [960, 540], title: 'Valkey vector search', desc: 'A dark field of indexed vectors with the white Valkey hexagon mark at the centre as the query, spokes reaching out to six bright green nearest matches inside a dashed search radius, representing vector similarity search.', art: searchNearest },
  { name: 'search-field-index', seed: 32047, zoom: 1.1, center: [960, 540], title: 'Valkey secondary indexing', desc: 'Four record cards each contributing one highlighted green field to a sorted index lane below, with a query caliper bracketing three matched entries above the white Valkey hexagon mark, representing secondary indexing on hashes and JSON.', art: searchFieldIndex },
  { name: 'client-ports', seed: 34037, zoom: 1, center: [960, 540], title: 'Valkey client protocol', desc: 'Six differently drawn channels reaching in from distinct outer shapes, each meeting an identical port at the same radius, beyond which every spoke becomes the same run of pale segments arriving at the white Valkey hexagon mark, representing different client libraries meeting one protocol at one server.', art: clientPorts },
  { name: 'ai-agent-memory', seed: 35011, zoom: 1.29, center: [960, 540], title: 'Valkey AI agent memory', desc: 'A row of conversation turns with the most recent ones lit inside a bright window, older turns dimmed and parked in an archive below the white Valkey hexagon mark, and two of them arcing back up into the window, representing agent memory with hot recent context and older context recalled on demand.', art: aiAgentMemory },
  { name: 'workload-fanout', seed: 35023, zoom: 1.18, center: [960, 540], title: 'Valkey workload primitives', desc: 'The white Valkey hexagon mark fanning out into five lanes, each ending in a differently shaped structure: a ring of slots, a chain of entries, a ranked stack, a grid of bits and a row of embedding magnitudes, representing a workload decomposing into the primitives Valkey already has.', art: workloadFanout },
  { name: 'conn-storm-spike', seed: 36011, zoom: 1.34, center: [960, 547], title: 'Valkey connection storms', desc: 'A timeline of connection attempts that is quiet, then spikes into a wall of simultaneous reconnects whose top rises in red above a dashed accept-capacity line, then falls quiet again, representing a connection storm.', art: connStormSpike },
  { name: 'bundle-crate', seed: 33101, zoom: 1.2, center: [960, 540], title: 'Valkey bundle', desc: 'One bracketed package outline sealed with the white Valkey hexagon mark, holding four module diagrams inside it: a bit array, a nested document in brackets, a magnifier over a scatter of points, and a padlock, representing the four modules valkey-bundle ships as one package.', art: bundleCrate },
  { name: 'bundle-one-install', seed: 33207, zoom: 1.2, center: [975, 540], title: 'Valkey bundle, one install', desc: 'A port marked with the white Valkey hexagon fanning out into four module diagrams: a nested document in brackets, a bit array, a magnifier over a scatter of points, and a padlock, representing one install that delivers all four bundled modules.', art: bundleOneInstall },
  { name: 'tooling-stack', seed: 33311, zoom: 1.25, center: [960, 540], title: 'Valkey primitives and tools', desc: 'A base course of identical small primitives with four differently detailed tools resting on runs of them, two larger composites above those, and the white Valkey hexagon mark at the top, representing tools built out of server primitives.', art: toolingStack },
  { name: 'data-structures-grid', seed: 33419, zoom: 1.2, center: [960, 540], title: 'Valkey data types', desc: 'Six Valkey value types laid out one per cell on an even three-by-two grid: a run of bytes, a linked list, unordered members inside a boundary, field and value pairs, members ranked by score, and a dense bitmap, representing the range of structures Valkey stores.', art: dataStructuresGrid },
  { name: 'k8s-spec-fanout', seed: 42011, zoom: 1.34, center: [960, 540], title: 'Valkey deployed from a chart', desc: 'A declared specification panel on the left fanning out along rails into a grid of nine identical instances, each drawn as the white Valkey hexagon mark, representing deploying Valkey on Kubernetes from a Helm chart.', art: k8sSpecFanout },
  { name: 'k8s-desired-count', seed: 42021, zoom: 1.34, center: [960, 540], title: 'Valkey replicas reaching the declared count', desc: 'Six declared slots under a gold span, four filled with instances drawn as the white Valkey hexagon mark, one instance rising into place and one slot still empty, representing a declared replica count and the running instances converging on it.', art: k8sDesiredCount },
  { name: 'limits-tight-envelope', seed: 42031, zoom: 1.03, center: [960, 540], title: 'Valkey in a tight resource envelope', desc: 'A small bright box packed edge to edge with work around the white Valkey hexagon mark, pushing outward on all four walls, set inside two much larger dashed outlines, representing a full server running in far less space than usual.', art: limitsTightEnvelope },
  { name: 'limits-gauge-pinned', seed: 42041, zoom: 1.34, center: [960, 540], title: 'Valkey pinned near its limit', desc: 'A large gauge around the white Valkey hexagon mark, filled from blue through green into gold and stopping just short of a red end zone, representing a small resource envelope run right up to its limit.', art: limitsGaugePinned },
  { name: 'key-size-distribution', seed: 43011, zoom: 1.26, center: [960, 540], title: 'Valkey key size distribution', desc: 'A Valkey Admin panel ranking keys by size with each size printed beside its bar, the top two at tens of megabytes and drawn in red, wired along a trunk into three shard enclosures of three servers each drawn as the white Valkey hexagon mark, representing a few outsized objects spread across a deployment.', art: keySizeDistribution },
  // Gargantua-style: the Doppler beaming switched off, so the ring is even all
  // the way round, which is what Interstellar did and why its black hole reads as
  // an object rather than as a lopsided smear.
  { name: 'blackhole-gargantua', space: true, seed: 52041, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A black hole seen almost edge on: a black circular shadow wrapped by one thin bright ring that closes all the way round it, the accretion disk lensed over the top and its secondary image returning underneath, the flat disk running out to both edges of the frame as a warm band, even in brightness on both sides, with the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 84, outer: 30, scale: 46, markH: 210, beam: 0, rings: 32, segs: 150 }) },
  { name: 'blackhole-halo', space: true, seed: 52051, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A black hole seen at a slight tilt so the lensed ring around its shadow opens into a broad halo, white at the inner edge through gold to red at the rim, even in brightness on both sides, with the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 74, outer: 24, scale: 40, markH: 185, beam: 0, rings: 32, segs: 150 }) },
  // The same model with the beaming left in, which is what a real disk does.
  { name: 'blackhole-beamed', space: true, seed: 52011, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A relativistic accretion disk seen almost edge on: a dark circular shadow ringed by a thin bright photon ring, the disk lensed up over the top of the shadow and crossing in front of it below, blazing white on the left where the orbiting gas comes towards the viewer and fading to dim red on the right where it recedes, the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 80, outer: 24, scale: 47.6, markH: 220, beam: 1, rings: 28, segs: 108 }) },
  { name: 'planet-ring', space: true, seed: 51021, zoom: 1.16, center: [960, 540], title: 'Planet Valkey', desc: 'A wireframe globe carrying the white Valkey hexagon mark, encircled by a thick tilted ring broken into even segments that passes behind the globe and in front of it again, against a sparse starfield, representing one Valkey world wearing its whole keyspace as a ring.', art: planetRing },
  { name: 'key-size-card-a', seed: 43041, zoom: 1.26, center: [960, 540], title: 'Finding big keys in a running Valkey cluster with Valkey Admin', desc: 'A card layout: the Valkey lockup in the upper left, the post title on solid light blocks in the lower left, and a Valkey Admin panel ranking keys by size with the top two at tens of megabytes drawn in red, wired into three shard enclosures of servers drawn as the white Valkey hexagon mark, sitting whole down the height of the frame with the shard enclosures running off the right edge.', art: keySizeCard({ dx: 245, dy: 76, scale: 0.86, spread: 150 }) },
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
      svg: `svg/${t.name}.svg`,
      captioned: t.text !== undefined,
      caption: t.caption ?? null,
      space: t.space === true,
    })),
  };
  writeFileSync(join(HERE, 'themes.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const chrome = findChrome();
checkPillow();
const scratch = mkdtempSync(join(tmpdir(), 'valkey-headers-'));

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
    writeFileSync(svgPath, wrap(captioned, theme.art(rng(theme.seed), { text })));

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

    const webpPath = join(OUT_DIR, `${slug}.webp`);
    const ogPath = join(OG_DIR, `${slug}.webp`);
    execFileSync('python3', ['-c', ENCODE, pngPath, webpPath, String(W), String(H), '92', ogPath], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    console.log(`${theme.name.padEnd(22)} svg/${slug}.svg -> images/${slug}.webp + images/og/${slug}.webp`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
