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
const LOGO = join(HERE, 'assets', 'Valkey-logo.svg');

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

// Any header carrying text depends on this font resolving at render time, which
// makes those two themes reproducible per-machine rather than everywhere.
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

function defs(focal) {
  const [fx, fy] = focal;
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
    <radialGradient id="focus" gradientUnits="userSpaceOnUse" cx="${fx}" cy="${fy}" r="900">
      <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.42"/>
      <stop offset="0.35" stop-color="${C.violet}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
    </radialGradient>
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
function frame(theme) {
  const zoom = theme.zoom ?? 1;
  const vw = W / zoom;
  const vh = H / zoom;
  const [cx, cy] = theme.center ?? [W / 2, H / 2];
  const vx = clamp(cx - vw / 2, 0, W - vw);
  const vy = clamp(cy - vh / 2, 0, H - vh);
  return `${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}`;
}

function wrap(theme, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${frame(theme)}">
  <title>${theme.title}</title>
  <desc>${theme.desc}</desc>
${defs(theme.focal)}
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#focus)"/>
${art}
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.055" style="mix-blend-mode:overlay"/>
</svg>
`;
}

// Faint far-field specks, used to keep the empty corners from looking flat.
function starfield(r, count = 90) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = 0.8 + r() * 1.9;
    const op = 0.08 + r() * 0.3;
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${C.ice}" opacity="${n(op)}"/>`);
  }
  return `  <g>${out.join('')}</g>`;
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

// Security: a shield woven out of the lattice it protects.
function security(r) {
  const shield =
    'M 690 300 L 1230 300 L 1230 606 C 1230 736 1086 806 960 846 ' +
    'C 834 806 690 736 690 606 Z';

  const lattice = [];
  for (let k = -60; k <= 60; k++) {
    const off = k * 38;
    lattice.push(
      `<line x1="${n(off)}" y1="0" x2="${n(off + H)}" y2="${H}" stroke="${C.cyanLt}" stroke-width="1.5"/>`,
      `<line x1="${n(off)}" y1="0" x2="${n(off - H)}" y2="${H}" stroke="${C.cyanLt}" stroke-width="1.5"/>`
    );
  }
  const latticeGroup = lattice.join('');

  // Lattice intersections, brighter where they fall inside the shield.
  const nodes = [];
  for (let i = 0; i < 170; i++) {
    const x = 680 + r() * 560;
    const y = 290 + r() * 570;
    nodes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(1.6 + r() * 2.8)}" fill="${weighted(r, [[C.ice, 7], [C.mint, 3]])}" opacity="${n(0.3 + r() * 0.55)}"/>`);
  }

  const backRings = [330, 430, 540]
    .map((rad, i) => `<circle cx="960" cy="560" r="${rad}" fill="none" stroke="${C.violet}" stroke-width="1.6" stroke-dasharray="3 18" opacity="${n(0.22 - i * 0.05)}"/>`)
    .join('');

  const logo = mark(960, 550, 332);

  return [
    starfield(r, 50),
    `  <clipPath id="shield"><path d="${shield}"/></clipPath>`,
    `  <linearGradient id="shieldFill" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${C.cyan}" stop-opacity="0.3"/>` +
      `<stop offset="1" stop-color="${C.violet}" stop-opacity="0.12"/></linearGradient>`,
    `  <g>${backRings}</g>`,
    `  <g opacity="0.08">${latticeGroup}</g>`,
    `  <g clip-path="url(#shield)">` +
      `<path d="${shield}" fill="url(#shieldFill)"/>` +
      `<g opacity="0.72">${latticeGroup}</g>` +
      `<g>${nodes.join('')}</g>` +
      `</g>`,
    `  <path d="${shield}" fill="none" stroke="${C.cyanLt}" stroke-width="16" opacity="0.4" filter="url(#blur18)"/>`,
    `  <path d="${shield}" fill="none" stroke="${C.ice}" stroke-width="3.4" opacity="0.9"/>`,
    `  <circle cx="960" cy="555" r="250" fill="url(#h-mint)" opacity="0.45"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${logo}</g>`,
    `  <g>${logo}</g>`,
  ].join('\n');
}

// Security, access-control flavour: commands arriving at an authenticated gate,
// most admitted, some turned away. More specific than the shield in `security`,
// and the better fit for ACL, auth and TLS posts.
function securityGate(r) {
  const gate = 1010;
  const cy = 540;
  const lanes = 22;
  const top = 272;
  const span = 536;

  const approach = [];
  const admitted = [];
  const refused = [];

  for (let i = 0; i < lanes; i++) {
    const y = top + (i + 0.5) * (span / lanes) + (r() - 0.5) * 9;
    const pass = r() > 0.2;

    // Inbound traffic, same colour whichever way it ends up going.
    let x = 240 + r() * 130;
    while (x < gate - 150) {
      const len = 26 + r() * 118;
      if (x + len > gate - 130) break;
      approach.push(
        `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + len)}" y2="${n(y)}" stroke="${weighted(r, [[C.cyanLt, 7], [C.ice, 3]])}" ` +
          `stroke-width="${n(2 + r() * 2.4)}" stroke-linecap="round" opacity="${n(0.28 + r() * 0.38)}"/>`
      );
      x += len + 18 + r() * 58;
    }

    if (pass) {
      let ox = gate + 40;
      while (ox < 1760) {
        const len = 30 + r() * 152;
        admitted.push(
          `<line x1="${n(ox)}" y1="${n(y)}" x2="${n(ox + len)}" y2="${n(y)}" stroke="${weighted(r, [[C.mint, 7], [C.ice, 3]])}" ` +
            `stroke-width="${n(2.4 + r() * 2.6)}" stroke-linecap="round" opacity="${n(0.5 + r() * 0.45)}"/>`
        );
        ox += len + 20 + r() * 68;
      }
    } else {
      // Turned away short of the gate, deflected clear of the traffic.
      const dir = y < cy ? -1 : 1;
      const bx = gate - 96;
      const kick = 58 + r() * 26;
      refused.push(
        `<path d="M ${n(bx - 104)} ${n(y)} L ${n(bx)} ${n(y)} L ${n(bx - 62)} ${n(y + dir * kick)}" ` +
          `fill="none" stroke="${C.coral}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`,
        `<circle cx="${n(bx)}" cy="${n(y)}" r="26" fill="url(#h-coral)" opacity="0.95"/>`,
        `<path d="M ${n(bx - 9)} ${n(y - 9)} L ${n(bx + 9)} ${n(y + 9)} M ${n(bx + 9)} ${n(y - 9)} L ${n(bx - 9)} ${n(y + 9)}" ` +
          `stroke="${C.coral}" stroke-width="3.4" stroke-linecap="round" opacity="0.95"/>`
      );
    }
  }

  // Tick marks up the gate, so it reads as a checkpoint rather than a wall.
  const ticks = [];
  for (let i = 0; i <= 30; i++) {
    const y = top - 44 + (i / 30) * (span + 88);
    ticks.push(
      `<line x1="${gate - 20}" y1="${n(y)}" x2="${gate + 20}" y2="${n(y)}" stroke="${C.ice}" stroke-width="1.6" opacity="${i % 5 === 0 ? 0.4 : 0.16}"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <circle cx="${gate}" cy="${cy}" r="430" fill="url(#h-cyan)" opacity="0.18"/>`,
    `  <g>${approach.join('')}</g>`,
    `  <g>${admitted.join('')}</g>`,
    `  <rect x="${gate - 19}" y="${top - 52}" width="38" height="${span + 104}" rx="19" fill="${C.ice}" opacity="0.17"/>`,
    `  <line x1="${gate}" y1="${top - 56}" x2="${gate}" y2="${top + span + 56}" stroke="${C.ice}" stroke-width="12" opacity="0.32" filter="url(#blur18)"/>`,
    `  <g>${ticks.join('')}</g>`,
    `  <line x1="${gate}" y1="${top - 56}" x2="${gate}" y2="${top + span + 56}" stroke="${C.ice}" stroke-width="3.6" opacity="0.9"/>`,
    `  <g>${refused.join('')}</g>`,
    `  <circle cx="${gate}" cy="${cy}" r="190" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(gate, cy, 262)}</g>`,
    `  <g>${mark(gate, cy, 262)}</g>`,
  ].join('\n');
}

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

const THEMES = [
  { name: 'community', seed: 1041, focal: [960, 540], zoom: 1.32, center: [960, 540], title: 'Valkey community', desc: 'An abstract constellation of connected nodes, the best-connected of them drawn as the white Valkey hexagon mark, representing the Valkey community.', art: community },
  { name: 'performance', seed: 2207, focal: [1530, 505], zoom: 1.22, center: [1160, 515], title: 'Valkey performance', desc: 'Abstract streaks of light converging on the white Valkey hexagon mark at a bright vanishing point, representing throughput and low latency.', art: performance },
  { name: 'memory-efficiency', seed: 3313, focal: [1200, 540], zoom: 1.3, center: [885, 540], title: 'Valkey memory efficiency', desc: 'An abstract grid of cells that grows denser from left to right, representing the same data stored in less memory.', art: memoryEfficiency },
  { name: 'clustering', seed: 4421, focal: [960, 540], zoom: 1.34, center: [960, 540], title: 'Valkey clustering and scale', desc: 'An abstract ring of slot segments around a meshed core centred on the white Valkey hexagon mark, with shards joining from outside, representing cluster mode and horizontal scale.', art: clustering },
  { name: 'release', seed: 5527, focal: [1420, 460], zoom: 1.2, center: [1130, 540], title: 'Valkey release', desc: 'Valkey chevrons driving into a golden burst centred on the white Valkey hexagon mark, representing a new Valkey release.', art: release },
  { name: 'release-version', seed: 5528, focal: [960, 430], zoom: 1.3, center: [960, 520], title: 'Valkey release with a caption', text: '9.0', desc: 'A golden burst centred on the white Valkey hexagon mark above a large caption, representing a specific Valkey release.', art: releaseVersion },
  { name: 'atomic-slot-migration', seed: 14041, focal: [960, 470], zoom: 1.1, center: [960, 522], title: 'Valkey atomic slot migration', desc: 'Two shard slot rings, each centred on the white Valkey hexagon mark, with a chevron arrow driving a stream of slot segments from one to the other and a magnifier inspecting them mid-flight, representing atomic slot migration.', art: slotMigrationRings },
  { name: 'security', seed: 6631, focal: [960, 520], zoom: 1.35, center: [960, 565], title: 'Valkey security', desc: 'An abstract shield woven from a lattice with the white Valkey hexagon mark at its centre, representing security and access control.', art: security },
  { name: 'security-acl', seed: 17071, focal: [1010, 540], zoom: 1.14, center: [960, 540], title: 'Valkey access control', desc: 'Streams of commands arriving at a lit gate centred on the white Valkey hexagon mark, most admitted in green and some turned away in red, representing access control and authentication.', art: securityGate },
  { name: 'benchmarks', seed: 7741, focal: [960, 560], zoom: 1.12, center: [900, 568], title: 'Valkey benchmarks', desc: 'A bar chart of throughput climbing left to right, beneath two flat latency series labelled P99 in green and P50 in red, representing benchmarking and observability.', art: observability },
  { name: 'data-structures', seed: 8849, focal: [820, 540], zoom: 1.22, center: [960, 540], title: 'Valkey data structures', desc: 'Abstract hash table buckets chaining outward beside a skip list of express lanes, representing Valkey data structures and internals.', art: dataStructures },
  { name: 'how-to', seed: 9953, focal: [1180, 540], zoom: 1.22, center: [960, 540], title: 'Valkey how-to', desc: 'An abstract track of numbered steps with the current step lit, representing a step-by-step guide.', art: howTo },
];

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
src, dst, width, height, quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = Image.open(src).convert("RGB").resize((width, height), Image.LANCZOS)
im.save(dst, "WEBP", quality=quality, method=6)
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

// Positional args select themes; --text and --out configure the captioned ones.
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

mkdirSync(SVG_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const chrome = findChrome();
checkPillow();
const scratch = mkdtempSync(join(tmpdir(), 'valkey-headers-'));

try {
  for (const theme of themes) {
    const text = flags.text ?? theme.text;
    const slug = flags.out ?? theme.name;
    const svgPath = join(SVG_DIR, `${slug}.svg`);
    const captioned = theme.text !== undefined ? { ...theme, desc: `${theme.desc} The caption reads "${esc(text)}".` } : theme;
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
    execFileSync('python3', ['-c', ENCODE, pngPath, webpPath, String(W), String(H), '92'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    console.log(`${theme.name.padEnd(22)} svg/${slug}.svg -> images/${slug}.webp`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
