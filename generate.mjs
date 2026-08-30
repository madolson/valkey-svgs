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

// Keyspace scan: a cursor holding one bounded window of a large keyspace, with
// the keys behind it already visited and the rest still ahead. The hop track
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

// Read-only ACL: the command space as a grid, with the grant drawn as a bounded
// region lit inside it and one command struck back out of that region.
function aclReadOnly(r) {
  const cols = 8;
  const rows = 14;
  const pitchX = 196;
  const pitchY = 44;
  const tileH = 24;
  const x0 = 198;
  const y0 = 250;
  const GRANT = { c0: 2, c1: 4, r0: 3, r1: 10 };
  const CUT = { c: 3, r: 6 };

  const inGrant = (c, i) => c >= GRANT.c0 && c <= GRANT.c1 && i >= GRANT.r0 && i <= GRANT.r1;
  const box = {
    x: x0 + GRANT.c0 * pitchX - 26,
    y: y0 + GRANT.r0 * pitchY - 26,
    w: (GRANT.c1 - GRANT.c0) * pitchX + 152 + 52,
    h: (GRANT.r1 - GRANT.r0) * pitchY + tileH + 52,
  };

  const outside = [];
  const granted = [];
  const cut = [];
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < rows; i++) {
      const x = x0 + c * pitchX;
      const y = y0 + i * pitchY;
      const w = 94 + r() * 58;
      if (CUT.c === c && CUT.r === i) {
        cut.push(
          `<rect x="${n(x)}" y="${y}" width="${n(w)}" height="${tileH}" rx="12" fill="${C.coral}" opacity="0.3"/>`,
          `<rect x="${n(x)}" y="${y}" width="${n(w)}" height="${tileH}" rx="12" fill="none" stroke="${C.coral}" stroke-width="2.4" opacity="0.9"/>`,
          `<line x1="${n(x - 10)}" y1="${y + tileH / 2}" x2="${n(x + w + 10)}" y2="${y + tileH / 2}" stroke="${C.coral}" stroke-width="4" stroke-linecap="round" opacity="0.95"/>`,
          `<circle cx="${n(x + w + 66)}" cy="${y + tileH / 2}" r="54" fill="url(#h-coral)" opacity="0.95"/>`,
          `<path d="M ${n(x + w + 48)} ${y + tileH / 2 - 18} L ${n(x + w + 84)} ${y + tileH / 2 + 18} M ${n(x + w + 84)} ${y + tileH / 2 - 18} L ${n(x + w + 48)} ${y + tileH / 2 + 18}" stroke="${C.coral}" stroke-width="5" stroke-linecap="round" opacity="0.95"/>`
        );
      } else if (inGrant(c, i)) {
        granted.push(
          `<rect x="${n(x)}" y="${y}" width="${n(w)}" height="${tileH}" rx="12" fill="${C.mint}" opacity="${n(0.5 + r() * 0.35)}"/>`
        );
      } else {
        outside.push(
          `<rect x="${n(x)}" y="${y}" width="${n(w)}" height="${tileH}" rx="12" fill="${C.ice}" opacity="${n(0.07 + r() * 0.07)}"/>`
        );
      }
    }
  }

  return [
    starfield(r, 50),
    `  <ellipse cx="${n(box.x + box.w / 2)}" cy="${n(box.y + box.h / 2)}" rx="520" ry="380" fill="url(#h-mint)" opacity="0.17"/>`,
    `  <g>${outside.join('')}</g>`,
    `  <rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="34" fill="${C.mint}" opacity="0.06"/>`,
    `  <rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="34" fill="none" stroke="${C.mint}" stroke-width="12" opacity="0.3" filter="url(#blur18)"/>`,
    `  <rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="34" fill="none" stroke="${C.mint}" stroke-width="3.4" opacity="0.9"/>`,
    `  <g>${granted.join('')}</g>`,
    `  <g>${cut.join('')}</g>`,
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

// Large key, as a grid: an even field of ordinary keys with one key occupying the
// space of dozens of them, and holding the elements to justify it.
function largeKeyGrid(r) {
  const pitchX = 118;
  const pitchY = 40;
  const tileH = 20;
  const BIG = { x: 700, y: 300, w: 520, h: 500 };

  const tiles = [];
  for (let x = 140; x < 1800; x += pitchX) {
    for (let y = 250; y < 860; y += pitchY) {
      const w = 52 + r() * 34;
      // Leave the big key its room, with a gap so the field reads as displaced.
      const clear = x + w > BIG.x - 30 && x < BIG.x + BIG.w + 30 && y + tileH > BIG.y - 24 && y < BIG.y + BIG.h + 24;
      if (clear) continue;
      tiles.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${tileH}" rx="10" fill="${C.ice}" opacity="${n(0.09 + r() * 0.09)}"/>`
      );
    }
  }

  // The big key's contents, the same kind of thing at the same scale, just far
  // more of it than any of the tiles beside it holds.
  const inner = [];
  for (let y = BIG.y + 24; y < BIG.y + BIG.h - 14; y += 20) {
    let x = BIG.x + 26 + r() * 22;
    while (x < BIG.x + BIG.w - 40) {
      const w = 40 + r() * 130;
      if (x + w > BIG.x + BIG.w - 26) break;
      inner.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="10" rx="5" fill="${C.coral}" opacity="${n(0.34 + r() * 0.34)}"/>`
      );
      x += w + 14 + r() * 30;
    }
  }

  return [
    starfield(r, 50),
    `  <ellipse cx="960" cy="550" rx="480" ry="420" fill="url(#h-coral)" opacity="0.17"/>`,
    `  <g>${tiles.join('')}</g>`,
    `  <rect x="${BIG.x}" y="${BIG.y}" width="${BIG.w}" height="${BIG.h}" rx="34" fill="${C.ink}" opacity="0.4"/>`,
    `  <rect x="${BIG.x}" y="${BIG.y}" width="${BIG.w}" height="${BIG.h}" rx="34" fill="${C.coral}" opacity="0.07"/>`,
    `  <g>${inner.join('')}</g>`,
    `  <rect x="${BIG.x}" y="${BIG.y}" width="${BIG.w}" height="${BIG.h}" rx="34" fill="none" stroke="${C.coral}" stroke-width="14" opacity="0.3" filter="url(#blur18)"/>`,
    `  <rect x="${BIG.x}" y="${BIG.y}" width="${BIG.w}" height="${BIG.h}" rx="34" fill="none" stroke="${C.coral}" stroke-width="3.6" opacity="0.92"/>`,
  ].join('\n');
}

// Large key, as a measurement: key sizes side by side, all of them short except
// one that runs clean off the frame.
function largeKeyBars(r) {
  const anchor = 520;
  const rowY = [300, 388, 476, 564, 652, 740, 828];
  const BIG = 3; // the row that does not fit

  // Faint scale behind the bars, so length reads as a measured size.
  const ticks = [];
  for (let x = anchor; x < 1860; x += 96) {
    ticks.push(
      `<line x1="${n(x)}" y1="270" x2="${n(x)}" y2="858" stroke="${C.ice}" stroke-width="1.4" opacity="${x === anchor ? 0.32 : 0.09}"/>`
    );
  }

  const rows = [];
  rowY.forEach((y, i) => {
    const big = i === BIG;
    const w = big ? 1920 - anchor : 74 + r() * 132;
    rows.push(
      dot(anchor, y, big ? 11 : 7, big ? C.coral : C.mint, big ? 'coral' : 'mint', 0.95, 3.2),
      `<rect x="${anchor}" y="${n(y - (big ? 26 : 13))}" width="${n(w)}" height="${big ? 52 : 26}" rx="${big ? 26 : 13}" ` +
        `fill="${big ? C.coral : C.mint}" opacity="${big ? 0.85 : n(0.42 + r() * 0.22)}"/>`
    );
    if (big) {
      rows.push(
        `<rect x="${anchor}" y="${n(y - 26)}" width="${n(w)}" height="52" rx="26" fill="none" stroke="${C.coral}" stroke-width="16" opacity="0.3" filter="url(#blur18)"/>`
      );
    }
  });

  return [
    starfield(r, 50),
    `  <ellipse cx="1000" cy="560" rx="520" ry="400" fill="url(#h-coral)" opacity="0.15"/>`,
    `  <g>${ticks.join('')}</g>`,
    `  <g>${rows.join('')}</g>`,
  ].join('\n');
}

// Large key, as mass: one key holding more elements than the whole keyspace
// around it holds keys.
function largeKeyMass(r) {
  const cx = 960;
  const cy = 540;
  const R = 250;

  // Packed contents, drawn as the same unit as the keys outside it.
  const packed = [];
  let guard = 0;
  const inside = [];
  while (inside.length < 300 && guard++ < 60000) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (R - 20);
    const x = cx + d * Math.cos(a);
    const y = cy + d * Math.sin(a);
    if (inside.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 24 ** 2)) inside.push({ x, y });
  }
  for (const p of inside) {
    packed.push(
      `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(2.8 + r() * 1.6)}" fill="${C.coral}" opacity="${n(0.5 + r() * 0.4)}"/>`
    );
  }

  const outside = [];
  guard = 0;
  const pts = [];
  while (pts.length < 46 && guard++ < 40000) {
    const x = 60 + r() * (W - 120);
    const y = 240 + r() * 610;
    if ((x - cx) ** 2 + (y - cy) ** 2 < (R + 84) ** 2) continue;
    if (pts.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 92 ** 2)) pts.push({ x, y });
  }
  for (const p of pts) outside.push(dot(p.x, p.y, 4.5 + r() * 2.5, C.mint, 'mint', 0.6 + r() * 0.3, 3));

  return [
    starfield(r, 50),
    `  <circle cx="${cx}" cy="${cy}" r="430" fill="url(#h-coral)" opacity="0.2"/>`,
    `  <g>${outside.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${R}" fill="${C.ink}" opacity="0.45"/>`,
    `  <g>${packed.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.coral}" stroke-width="16" opacity="0.3" filter="url(#blur18)"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.coral}" stroke-width="3.6" opacity="0.92"/>`,
  ].join('\n');
}

// Event, as a date: a month of days with exactly one lit, and travel converging
// on it. The set forbids text, so the day is circled rather than written.
function eventCalendarDay(r) {
  const CW = 150;
  const CH = 110;
  const GAP = 20;
  const COLS = 7;
  const ROWS = 5;
  const x0 = 960 - (COLS * (CW + GAP) - GAP) / 2;
  const y0 = 540 - (ROWS * (CH + GAP) - GAP) / 2;
  const MC = 3;
  const MR = 2;
  const mx = x0 + MC * (CW + GAP) + CW / 2;
  const my = y0 + MR * (CH + GAP) + CH / 2;

  const cells = [];
  for (let c = 0; c < COLS; c++) {
    for (let i = 0; i < ROWS; i++) {
      if (c === MC && i === MR) continue;
      const x = x0 + c * (CW + GAP);
      const y = y0 + i * (CH + GAP);
      cells.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${CW}" height="${CH}" rx="16" fill="${C.ice}" opacity="${n(0.05 + r() * 0.05)}"/>`,
        `<rect x="${n(x)}" y="${n(y)}" width="${CW}" height="${CH}" rx="16" fill="none" stroke="${C.ice}" stroke-width="1.6" opacity="0.12"/>`
      );
    }
  }

  // Travel in from off-frame, stopping short of the marked day.
  const trips = [];
  for (const [sx, sy] of [[70, 150], [1850, 170], [40, 930], [1880, 900], [1900, 540]]) {
    const a = Math.atan2(my - sy, mx - sx);
    const ex = mx - Math.cos(a) * 168;
    const ey = my - Math.sin(a) * 168;
    const bend = 150 - r() * 300;
    trips.push(
      `<path d="M ${n(sx)} ${n(sy)} Q ${n((sx + ex) / 2 + bend)} ${n((sy + ey) / 2 - bend)} ${n(ex)} ${n(ey)}" ` +
        `fill="none" stroke="${C.cyanLt}" stroke-width="2.6" stroke-dasharray="14 12" opacity="0.5"/>`,
      dot(ex, ey, 6, C.cyanLt, 'cyan', 0.85, 3)
    );
  }

  return [
    starfield(r, 50),
    `  <ellipse cx="${n(mx)}" cy="${n(my)}" rx="470" ry="420" fill="url(#h-mint)" opacity="0.17"/>`,
    `  <g>${cells.join('')}</g>`,
    `  <g>${trips.join('')}</g>`,
    `  <circle cx="${n(mx)}" cy="${n(my)}" r="132" fill="none" stroke="${C.mint}" stroke-width="14" opacity="0.28" filter="url(#blur18)"/>`,
    `  <circle cx="${n(mx)}" cy="${n(my)}" r="132" fill="none" stroke="${C.mint}" stroke-width="3.4" opacity="0.9"/>`,
    `  <rect x="${n(x0 + MC * (CW + GAP))}" y="${n(y0 + MR * (CH + GAP))}" width="${CW}" height="${CH}" rx="16" fill="${C.mint}" opacity="0.24"/>`,
    `  <rect x="${n(x0 + MC * (CW + GAP))}" y="${n(y0 + MR * (CH + GAP))}" width="${CW}" height="${CH}" rx="16" fill="none" stroke="${C.mint}" stroke-width="3.6" opacity="0.95"/>`,
  ].join('\n');
}

// Event, as a gathering: arrivals from every direction closing on one lit venue
// centred on the mark, densest right up against it.
function eventGatherRing(r) {
  const cx = 960;
  const cy = 540;
  const R = 158;

  const arrivals = [];
  for (let i = 0; i < 54; i++) {
    // Bias the radius inward so the crowd thickens toward the venue.
    const rad = R + 46 + Math.pow(r(), 1.7) * 430;
    const a = r() * Math.PI * 2;
    const x = cx + rad * Math.cos(a) * 1.5;
    const y = cy + rad * Math.sin(a);
    if (y < 210 || y > 870) continue;
    // The dot leads and the trail sits behind it, further out, so the crowd
    // reads as arriving rather than as rays leaving.
    const trail = 26 + r() * 54;
    const tx = x + Math.cos(a) * trail * 1.5;
    const ty = y + Math.sin(a) * trail;
    arrivals.push(
      `<line x1="${n(tx)}" y1="${n(ty)}" x2="${n(x)}" y2="${n(y)}" stroke="${C.cyanLt}" stroke-width="2" stroke-linecap="round" opacity="${n(0.2 + r() * 0.3)}"/>`,
      dot(x, y, 4 + r() * 3, weighted(r, [[C.cyanLt, 6], [C.mint, 3], [C.ice, 2]]), weighted(r, [['cyan', 6], ['mint', 3], ['ice', 2]]), 0.55 + r() * 0.35, 3)
    );
  }

  const rings = [];
  for (const [rad, op] of [[R + 130, 0.13], [R + 260, 0.09], [R + 400, 0.06]]) {
    rings.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${n(rad * 1.5)}" ry="${rad}" fill="none" stroke="${C.ice}" stroke-width="1.6" opacity="${op}"/>`
    );
  }

  return [
    starfield(r, 50),
    `  <ellipse cx="${cx}" cy="${cy}" rx="560" ry="430" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <g>${rings.join('')}</g>`,
    `  <g>${arrivals.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${R}" fill="${C.ink}" opacity="0.4"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.ice}" stroke-width="16" opacity="0.3" filter="url(#blur18)"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.ice}" stroke-width="3.6" opacity="0.92"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="120" fill="url(#scrim)"/>`,
    `  <g>${mark(cx, cy, 176)}</g>`,
  ].join('\n');
}

// Release candidate, as a hold: the build arrives at a checkpoint that has not
// opened, with the release itself waiting dim on the far side.
function releaseCandidateHold(r) {
  const gate = 1060;
  const top = 240;
  const bottom = 840;

  const chevrons = [];
  for (let i = 0; i < 6; i++) {
    const y = 316 + i * 82 + (r() - 0.5) * 10;
    let x = 180 + r() * 90;
    while (x < gate - 150) {
      const w = 26 + r() * 16;
      const h = 26 + r() * 12;
      if (x + w > gate - 130) break;
      chevrons.push(
        `<path d="M ${n(x)} ${n(y - h / 2)} L ${n(x + w)} ${n(y)} L ${n(x)} ${n(y + h / 2)}" fill="none" ` +
          `stroke="${weighted(r, [[C.cyanLt, 7], [C.ice, 3]])}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" ` +
          `opacity="${n(0.3 + r() * 0.45)}"/>`
      );
      x += w + 22 + r() * 40;
    }
  }

  // The release on the far side, present but not let out yet.
  const rays = [];
  for (let i = 0; i < 26; i++) {
    const a = -0.85 + (i / 25) * 1.7;
    const len = 150 + r() * 330;
    rays.push(
      `<line x1="${n(1250 + Math.cos(a) * 40)}" y1="${n(540 + Math.sin(a) * 40)}" ` +
        `x2="${n(1250 + Math.cos(a) * len)}" y2="${n(540 + Math.sin(a) * len)}" ` +
        `stroke="${C.gold}" stroke-width="${n(2 + r() * 3)}" stroke-linecap="round" opacity="${n(0.1 + r() * 0.14)}"/>`
    );
  }

  const ticks = [];
  for (let i = 0; i <= 26; i++) {
    const y = top + (i / 26) * (bottom - top);
    ticks.push(
      `<line x1="${gate - 22}" y1="${n(y)}" x2="${gate + 22}" y2="${n(y)}" stroke="${C.ice}" stroke-width="1.6" opacity="${i % 4 === 0 ? 0.36 : 0.14}"/>`
    );
  }

  return [
    starfield(r, 50),
    `  <ellipse cx="1140" cy="540" rx="520" ry="420" fill="url(#h-gold)" opacity="0.12"/>`,
    `  <g>${rays.join('')}</g>`,
    `  <g>${chevrons.join('')}</g>`,
    `  <rect x="${gate - 21}" y="${top}" width="42" height="${bottom - top}" rx="21" fill="${C.ice}" opacity="0.18"/>`,
    `  <line x1="${gate}" y1="${top}" x2="${gate}" y2="${bottom}" stroke="${C.ice}" stroke-width="14" opacity="0.32" filter="url(#blur18)"/>`,
    `  <g>${ticks.join('')}</g>`,
    `  <line x1="${gate}" y1="${top}" x2="${gate}" y2="${bottom}" stroke="${C.ice}" stroke-width="3.8" opacity="0.95"/>`,
    `  <circle cx="${gate}" cy="540" r="58" fill="${C.ink}" opacity="0.6"/>`,
    `  <circle cx="${gate}" cy="540" r="58" fill="none" stroke="${C.ice}" stroke-width="3.6" opacity="0.95"/>`,
    `  <circle cx="${gate}" cy="540" r="14" fill="${C.ice}" opacity="0.9"/>`,
  ].join('\n');
}

// Release candidate, as a soak: time deliberately spent under test before the
// release at the end of the bar is allowed to happen.
function releaseCandidateSoak(r) {
  const x0 = 340;
  const x1 = 1320;
  const done = 900; // how far the soak has got
  const by = 500;
  const bh = 80;

  const results = [];
  for (const [ymin, ymax] of [[260, 462], [618, 820]]) {
    for (let y = ymin; y < ymax; y += 42) {
      let x = x0 + 6;
      while (x < x1 - 20) {
        const past = x < done;
        const bad = past && r() < 0.07;
        results.push(
          dot(x, y, past ? 6 : 4.5, bad ? C.coral : past ? C.mint : C.cyanLt, bad ? 'coral' : past ? 'mint' : 'cyan', past ? 0.85 : 0.28, 2.8)
        );
        x += 40 + r() * 26;
      }
    }
  }

  const ticks = [];
  for (let x = x0; x <= x1; x += 70) {
    ticks.push(
      `<line x1="${n(x)}" y1="${by - 22}" x2="${n(x)}" y2="${by + bh + 22}" stroke="${C.ice}" stroke-width="1.6" opacity="0.12"/>`
    );
  }

  const rays = [];
  for (let i = 0; i < 22; i++) {
    const a = -0.8 + (i / 21) * 1.6;
    const len = 120 + r() * 280;
    rays.push(
      `<line x1="${n(1370 + Math.cos(a) * 34)}" y1="${n(540 + Math.sin(a) * 34)}" ` +
        `x2="${n(1370 + Math.cos(a) * len)}" y2="${n(540 + Math.sin(a) * len)}" ` +
        `stroke="${C.gold}" stroke-width="${n(2 + r() * 3)}" stroke-linecap="round" opacity="${n(0.09 + r() * 0.13)}"/>`
    );
  }

  return [
    starfield(r, 50),
    `  <ellipse cx="960" cy="540" rx="560" ry="420" fill="url(#h-mint)" opacity="0.15"/>`,
    `  <g>${rays.join('')}</g>`,
    `  <g>${ticks.join('')}</g>`,
    `  <g>${results.join('')}</g>`,
    `  <rect x="${x0}" y="${by}" width="${x1 - x0}" height="${bh}" rx="${bh / 2}" fill="${C.ice}" opacity="0.1"/>`,
    `  <rect x="${x0}" y="${by}" width="${x1 - x0}" height="${bh}" rx="${bh / 2}" fill="none" stroke="${C.ice}" stroke-width="2.4" opacity="0.4"/>`,
    `  <rect x="${x0}" y="${by}" width="${done - x0}" height="${bh}" rx="${bh / 2}" fill="${C.mint}" opacity="0.8"/>`,
    `  <line x1="${done}" y1="${by - 34}" x2="${done}" y2="${by + bh + 34}" stroke="${C.ice}" stroke-width="4" stroke-linecap="round" opacity="0.95"/>`,
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

  // The fan: mark -> hash node -> the one cell that node sets.
  const spokes = [];
  const nodes = [];
  const drops = [];
  picks.forEach((i, k) => {
    const t = (k - (K - 1) / 2) / ((K - 1) / 2);
    const hx = mx + t * 300;
    spokes.push(
      `<line x1="${mx}" y1="${my + 72}" x2="${n(hx)}" y2="${hy - 20}" stroke="${C.violet}" stroke-width="1.8" opacity="0.45"/>`
    );
    nodes.push(
      `<circle cx="${n(hx)}" cy="${hy}" r="30" fill="url(#h-violet)" opacity="0.55"/>`,
      `<circle cx="${n(hx)}" cy="${hy}" r="17" fill="${C.ink}" fill-opacity="0.55" stroke="${C.ice}" stroke-width="2.2" opacity="0.9"/>`,
      `<circle cx="${n(hx)}" cy="${hy}" r="5" fill="${C.ice}" opacity="0.85"/>`
    );
    drops.push(
      `<path d="M ${n(hx)} ${hy + 18} Q ${n(hx)} ${top - 58} ${n(bc(i))} ${top - 8}" fill="none" stroke="${C.mint}" stroke-width="2.4" opacity="0.6"/>`
    );
  });

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
    // Ambient glow behind the motif, never over it.
    `  <ellipse cx="${mx}" cy="${top + CH / 2}" rx="720" ry="270" fill="url(#h-cyan)" opacity="0.17"/>`,
    `  <circle cx="${mx}" cy="${my}" r="240" fill="url(#h-violet)" opacity="0.4"/>`,
    `  <g>${slots.join('')}</g>`,
    `  <g>${already.join('')}</g>`,
    `  <g>${spokes.join('')}</g>`,
    `  <g>${drops.join('')}</g>`,
    `  <g>${lit.join('')}</g>`,
    `  <g>${nodes.join('')}</g>`,
    `  <line x1="${n(x0 - 14)}" y1="${axisY}" x2="${n(bx(CELLS - 1) + CW + 14)}" y2="${axisY}" stroke="${C.ice}" stroke-width="3" opacity="0.72"/>`,
    `  <g>${ticks.join('')}</g>`,
    `  <circle cx="${mx}" cy="${my}" r="118" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.45">${mark(mx, my, 150)}</g>`,
    `  <g>${mark(mx, my, 150)}</g>`,
  ].join('\n');
}

// Bloom filter, read side. Two lookups over the same bit field. The upper probe
// finds every position set and can only answer "probably": a soft, dashed tick.
// The lower probe finds a clear bit at its third position and short-circuits to
// a hard cross; the two positions after it are never examined.
function bloomVerdict(r) {
  const COLS = 24;
  const ROWS = 12;
  const SX = 52;
  const SY = 54;
  const gx0 = 960 - ((COLS - 1) * SX) / 2;
  const gy0 = 540 - ((ROWS - 1) * SY) / 2;
  const colX = (c) => gx0 + c * SX;
  const rowY = (v) => gy0 + v * SY;

  const maybe = [[4, 3], [7, 1], [10, 3], [13, 1], [16, 2]];
  const absent = [[4, 8], [7, 10], [10, 8], [13, 10], [16, 9]];
  const CLEAR = 2; // the position in `absent` that lands on a clear bit

  // Field state first, then the probes force the cells they need, so what the
  // verdicts claim matches what is actually drawn.
  const on = new Set();
  for (let c = 0; c < COLS; c++) {
    for (let v = 0; v < ROWS; v++) if (r() < 0.4) on.add(`${c},${v}`);
  }
  maybe.forEach(([c, v]) => on.add(`${c},${v}`));
  absent.forEach(([c, v], i) => (i === CLEAR ? on.delete(`${c},${v}`) : on.add(`${c},${v}`)));

  const field = [];
  for (let c = 0; c < COLS; c++) {
    for (let v = 0; v < ROWS; v++) {
      const x = colX(c) - 11;
      const y = rowY(v) - 11;
      field.push(
        on.has(`${c},${v}`)
          ? `<rect x="${n(x)}" y="${n(y)}" width="22" height="22" rx="5" fill="${C.cyanLt}" opacity="${n(0.38 + r() * 0.3)}"/>`
          : `<rect x="${n(x)}" y="${n(y)}" width="22" height="22" rx="5" fill="${C.cyan}" fill-opacity="0.06" stroke="${C.cyanLt}" stroke-width="1.3" opacity="0.26"/>`
      );
    }
  }

  // Routed at right angles, like an address bus, so a probe does not read as a
  // line chart the way `benchmarks` deliberately does.
  const trace = (pts, color, width, opacity, dash = '') => {
    const d = [`M ${n(pts[0][0])} ${n(pts[0][1])}`];
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1];
      const [x, y] = pts[i];
      if (Math.abs(y - py) < 1) d.push(`L ${n(x)} ${n(y)}`);
      else {
        const mid = (px + x) / 2;
        d.push(`L ${n(mid)} ${n(py)}`, `L ${n(mid)} ${n(y)}`, `L ${n(x)} ${n(y)}`);
      }
    }
    return (
      `<path d="${d.join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" ` +
      `stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
    );
  };

  const ring = (x, y, color, key) =>
    `<circle cx="${n(x)}" cy="${n(y)}" r="34" fill="url(#h-${key})" opacity="0.7"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="19" fill="none" stroke="${color}" stroke-width="3.2" opacity="0.92"/>`;

  const mPts = maybe.map(([c, v]) => [colX(c), rowY(v)]);
  const aPts = absent.map(([c, v]) => [colX(c), rowY(v)]);
  const mEnd = [1348, rowY(2)];
  const aEnd = [1348, rowY(9)];
  const lead = (p) => [gx0 - 140, p[1]];

  const probes = [
    trace([lead(mPts[0]), ...mPts, mEnd], C.mint, 2.6, 0.75),
    ...mPts.map(([x, y]) => ring(x, y, C.mint, 'mint')),
    // Solid up to the clear bit, then a faint continuation nobody has to walk.
    trace([lead(aPts[0]), ...aPts.slice(0, CLEAR + 1)], C.coral, 2.6, 0.8),
    trace([aPts[CLEAR], aEnd], C.coral, 2.6, 0.8),
    trace(aPts.slice(CLEAR), C.coral, 1.8, 0.3, '8 12'),
    ...aPts.slice(0, CLEAR).map(([x, y]) => ring(x, y, C.coral, 'coral')),
    ...aPts.slice(CLEAR + 1).map(([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="19" fill="none" stroke="${C.coral}" stroke-width="1.8" opacity="0.3"/>`),
    // The clear bit: circled hard, and left visibly empty, because the empty cell
    // is the whole evidence.
    `<circle cx="${n(aPts[CLEAR][0])}" cy="${n(aPts[CLEAR][1])}" r="36" fill="url(#scrim)"/>`,
    `<circle cx="${n(aPts[CLEAR][0])}" cy="${n(aPts[CLEAR][1])}" r="27" fill="none" stroke="${C.coral}" stroke-width="4.4" opacity="0.95"/>`,
    `<rect x="${n(aPts[CLEAR][0] - 11)}" y="${n(aPts[CLEAR][1] - 11)}" width="22" height="22" rx="5" fill="${C.cyan}" fill-opacity="0.06" stroke="${C.coral}" stroke-width="1.8" opacity="0.6"/>`,
  ];

  const sources = [
    dot(lead(mPts[0])[0], mPts[0][1], 9, C.ice, 'ice', 0.9),
    dot(lead(aPts[0])[0], aPts[0][1], 9, C.ice, 'ice', 0.9),
  ];

  // The asymmetry, carried by the drawing style: the yes is soft and dashed, the
  // no is solid and crisp.
  const verdicts = [
    `<circle cx="${mEnd[0]}" cy="${n(mEnd[1])}" r="72" fill="url(#scrim)"/>`,
    `<circle cx="${mEnd[0]}" cy="${n(mEnd[1])}" r="76" fill="url(#h-mint)" opacity="0.85"/>`,
    `<circle cx="${mEnd[0]}" cy="${n(mEnd[1])}" r="42" fill="none" stroke="${C.mint}" stroke-width="3.4" stroke-dasharray="11 13" opacity="0.85"/>`,
    // A second, looser ring: the yes has a margin of error the no does not.
    `<circle cx="${mEnd[0]}" cy="${n(mEnd[1])}" r="56" fill="none" stroke="${C.mint}" stroke-width="2" stroke-dasharray="5 17" opacity="0.4"/>`,
    `<path d="M ${mEnd[0] - 20} ${n(mEnd[1] + 2)} L ${mEnd[0] - 6} ${n(mEnd[1] + 17)} L ${mEnd[0] + 22} ${n(mEnd[1] - 17)}" fill="none" stroke="${C.mint}" stroke-width="9" opacity="0.35" filter="url(#blur8)"/>`,
    `<path d="M ${mEnd[0] - 20} ${n(mEnd[1] + 2)} L ${mEnd[0] - 6} ${n(mEnd[1] + 17)} L ${mEnd[0] + 22} ${n(mEnd[1] - 17)}" fill="none" stroke="${C.mint}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`,
    `<circle cx="${aEnd[0]}" cy="${n(aEnd[1])}" r="72" fill="url(#scrim)"/>`,
    `<circle cx="${aEnd[0]}" cy="${n(aEnd[1])}" r="62" fill="url(#h-coral)" opacity="0.7"/>`,
    `<circle cx="${aEnd[0]}" cy="${n(aEnd[1])}" r="42" fill="none" stroke="${C.coral}" stroke-width="5.4" opacity="0.95"/>`,
    `<path d="M ${aEnd[0] - 17} ${n(aEnd[1] - 17)} L ${aEnd[0] + 17} ${n(aEnd[1] + 17)} M ${aEnd[0] + 17} ${n(aEnd[1] - 17)} L ${aEnd[0] - 17} ${n(aEnd[1] + 17)}" fill="none" stroke="${C.coral}" stroke-width="5.4" stroke-linecap="round" opacity="0.95"/>`,
  ];

  return [
    starfield(r, 55),
    `  <ellipse cx="960" cy="${n(rowY(2))}" rx="620" ry="220" fill="url(#h-mint)" opacity="0.12"/>`,
    `  <ellipse cx="960" cy="${n(rowY(9))}" rx="620" ry="220" fill="url(#h-coral)" opacity="0.1"/>`,
    `  <g>${field.join('')}</g>`,
    `  <g>${sources.join('')}</g>`,
    `  <g>${probes.join('')}</g>`,
    `  <g>${verdicts.join('')}</g>`,
  ].join('\n');
}

// ----------------------------------------------------------- valkey-search
//
// Three readings of one claim: a query lands in an indexed field, and only a
// small part of that field has to be looked at. What separates these from each
// other is where the narrowing happens — around the query (`searchNearest`),
// along the pipeline (`searchNarrowing`), or inside one indexed field
// (`searchFieldIndex`).

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

// The index as a funnel: the whole indexed space on the left, the candidate set
// the index keeps in the middle, the few results that come back on the right.
// The dots thin out and brighten together, so "fewer" and "better" are the same
// gesture.
function searchNarrowing(r) {
  const cy = 540;
  const x0 = 230;
  const x1 = 1360; // the tip, where the mark sits, clear of the narrow crop's edge
  const h0 = 384;
  const h1 = 66;
  const halfAt = (x) => h0 + ((x - x0) / (x1 - x0)) * (h1 - h0);

  // Five passes rather than two, so the thinning reads as a gradient instead of
  // as three unrelated columns. Count falls, size and brightness rise, and the
  // vertical spread is tied to the wedge, so all four cues say "fewer" together.
  const PASSES = 5;
  const stages = Array.from({ length: PASSES }, (_, i) => {
    const t = i / (PASSES - 1);
    const x = 240 + t * 960;
    const count = Math.round(46 - t * 41);
    const pts = [];
    // Stratified down the column, so no pass leaves a hole the eye reads as a gap.
    for (let j = 0; j < count; j++) {
      const half = halfAt(x);
      const y = cy - half + ((j + r()) / count) * half * 2;
      pts.push({
        x: x + (r() - 0.5) * (58 - t * 40),
        y,
        rad: 2.6 + t * 4.4 + r() * 1.6,
        op: 0.3 + t * 0.62 + r() * 0.12,
      });
    }
    return { x, t, pts, color: t > 0.7 ? C.mint : C.cyanLt, key: t > 0.7 ? 'mint' : 'cyan' };
  });

  // Each survivor is wired back to the nearest couple it came from, so the
  // funnel reads as selection rather than as five separate scatters.
  const sift = [];
  for (let i = 1; i < PASSES; i++) {
    for (const p of stages[i].pts) {
      stages[i - 1].pts
        .map((q) => ({ q, d: Math.abs(p.y - q.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach(({ q }) => sift.push(`<line x1="${n(q.x)}" y1="${n(q.y)}" x2="${n(p.x)}" y2="${n(p.y)}"/>`));
    }
  }

  const results = stages[PASSES - 1].pts
    .map((p) => `<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(x1 - 104)}" y2="${cy}"/>`)
    .join('');

  const cloud = stages
    .map((s) => s.pts.map((p) => dot(p.x, p.y, p.rad, s.color, s.key, p.op, 2.6 + s.t * 1.8)).join(''))
    .join('');

  const edge = (sign) =>
    `<line x1="${x0}" y1="${n(cy + sign * h0)}" x2="${x1}" y2="${n(cy + sign * h1)}" ` +
    `stroke="${C.ice}" stroke-width="2.2" opacity="0.32"/>`;

  return [
    starfield(r, 55),
    `  <linearGradient id="sift" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">` +
      `<stop offset="0" stop-color="${C.cyan}" stop-opacity="0.24"/>` +
      `<stop offset="1" stop-color="${C.mint}" stop-opacity="0.07"/></linearGradient>`,
    `  <circle cx="420" cy="${cy}" r="470" fill="url(#h-cyan)" opacity="0.13"/>`,
    `  <circle cx="${x1}" cy="${cy}" r="330" fill="url(#h-mint)" opacity="0.28"/>`,
    `  <path d="M ${x0} ${n(cy - h0)} L ${x1} ${n(cy - h1)} L ${x1} ${n(cy + h1)} L ${x0} ${n(cy + h0)} Z" fill="url(#sift)"/>`,
    `  ${edge(-1)}`,
    `  ${edge(1)}`,
    `  <g stroke="${C.cyanLt}" stroke-width="1.1" opacity="0.14">${sift.join('')}</g>`,
    `  <g stroke="${C.mint}" stroke-width="2" opacity="0.5">${results}</g>`,
    `  <g>${cloud}</g>`,
    `  <circle cx="${x1}" cy="${cy}" r="130" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(x1, cy, 180)}</g>`,
    `  <g>${mark(x1, cy, 180)}</g>`,
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

// Confluence: five callers, each drawn in its own grammar, bending through one
// aperture and leaving it as a single uniform protocol stream.
function clientConfluence(r) {
  const cy = 540;
  const waist = 1010; // where the callers stop being different
  const mx = 1440; // the server
  const x0 = 90;

  // One quadratic per caller: flat while it is still in its own idiom, bending
  // only near the waist. Sampled once, then walked by arc length so a grammar
  // can be laid along it.
  const channel = (y) => {
    const c = [x0 + 0.66 * (waist - x0), y];
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const t = i / 96;
      const u = 1 - t;
      pts.push([u * u * x0 + 2 * t * u * c[0] + t * t * waist, u * u * y + 2 * t * u * c[1] + t * t * cy]);
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    const at = (s) => {
      const d = clamp(s, 0, total);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
      return [
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
        a,
      ];
    };
    // The same curve offset along its own normal, for rails and sawtooths.
    const rail = (off, step = 16) => {
      const out = [];
      for (let s = 0; s <= total; s += step) {
        const [x, yy, a] = at(s);
        const o = typeof off === 'function' ? off(s) : off;
        out.push([x - Math.sin(a) * o, yy + Math.cos(a) * o]);
      }
      return out.map((p, i) => `${i ? 'L' : 'M'} ${n(p[0])} ${n(p[1])}`).join(' ');
    };
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${n(p[0])} ${n(p[1])}`).join(' ');
    return { at, rail, total, d };
  };

  const lanes = [
    { y: 190, color: C.mint, key: 'mint', kind: 'beads' },
    { y: 364, color: C.coral, key: 'coral', kind: 'blocks' },
    { y: 540, color: C.gold, key: 'gold', kind: 'ladder' },
    { y: 718, color: C.violet, key: 'violet', kind: 'sawtooth' },
    { y: 890, color: C.cyanLt, key: 'cyan', kind: 'ticks' },
  ];

  const guides = [];
  const callers = [];
  for (const lane of lanes) {
    const p = channel(lane.y);
    const end = p.total - 58; // stop short of the aperture
    guides.push(`<path d="${p.d}" fill="none" stroke="${lane.color}" stroke-width="2" opacity="0.14"/>`);

    if (lane.kind === 'beads') {
      for (let s = 10; s < end; s += 46 + r() * 12) {
        const [x, y] = p.at(s);
        callers.push(dot(x, y, 7 + r() * 3.5, lane.color, lane.key, 0.55 + r() * 0.4, 3));
      }
    } else if (lane.kind === 'blocks') {
      for (let s = 8; s < end; ) {
        const len = 46 + r() * 42;
        if (s + len > end) break;
        const [x, y, a] = p.at(s + len / 2);
        callers.push(
          `<rect x="${n(x - len / 2)}" y="${n(y - 12)}" width="${n(len)}" height="24" rx="7" ` +
            `fill="${lane.color}" opacity="${n(0.45 + r() * 0.42)}" ` +
            `transform="rotate(${n((a * 180) / Math.PI)} ${n(x)} ${n(y)})"/>`
        );
        s += len + 22 + r() * 18;
      }
    } else if (lane.kind === 'ladder') {
      callers.push(
        `<path d="${p.rail(-11)}" fill="none" stroke="${lane.color}" stroke-width="3.4" opacity="0.62"/>`,
        `<path d="${p.rail(11)}" fill="none" stroke="${lane.color}" stroke-width="3.4" opacity="0.62"/>`
      );
      for (let s = 18; s < end; s += 54) {
        const [x, y, a] = p.at(s);
        const nx = -Math.sin(a) * 11;
        const ny = Math.cos(a) * 11;
        callers.push(
          `<line x1="${n(x - nx)}" y1="${n(y - ny)}" x2="${n(x + nx)}" y2="${n(y + ny)}" ` +
            `stroke="${lane.color}" stroke-width="3" opacity="${n(0.4 + r() * 0.35)}"/>`
        );
      }
    } else if (lane.kind === 'sawtooth') {
      let flip = 1;
      const zig = [];
      for (let s = 0; s <= end; s += 34) {
        const [x, y, a] = p.at(s);
        const o = 15 * flip;
        zig.push([x - Math.sin(a) * o, y + Math.cos(a) * o]);
        flip = -flip;
      }
      callers.push(
        `<path d="${zig.map((q, i) => `${i ? 'L' : 'M'} ${n(q[0])} ${n(q[1])}`).join(' ')}" fill="none" ` +
          `stroke="${lane.color}" stroke-width="4" stroke-linejoin="round" opacity="0.8"/>`
      );
    } else {
      callers.push(`<path d="${p.rail(0)}" fill="none" stroke="${lane.color}" stroke-width="4.5" opacity="0.65"/>`);
      for (let s = 14; s < end; s += 28) {
        const [x, y, a] = p.at(s);
        const nx = -Math.sin(a) * 15;
        const ny = Math.cos(a) * 15;
        callers.push(
          `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + nx)}" y2="${n(y + ny)}" stroke="${lane.color}" ` +
            `stroke-width="3" stroke-linecap="round" opacity="${n(0.35 + r() * 0.4)}"/>`
        );
      }
    }
  }

  // Downstream of the aperture every packet is the same length, the same gap and
  // the same colour: one protocol, whoever asked.
  const SEG = 34;
  const GAP = 13;
  const flow = [];
  for (let x = waist + 56; x + SEG <= mx - 126; x += SEG + GAP) {
    flow.push(
      `<rect x="${n(x)}" y="${cy - 14}" width="${SEG}" height="28" rx="14" fill="${C.ice}" opacity="0.92"/>`
    );
  }
  const walls = [-38, 38]
    .map(
      (o) =>
        `<line x1="${waist + 44}" y1="${cy + o}" x2="${mx - 116}" y2="${cy + o}" stroke="${C.ice}" ` +
        `stroke-width="2.4" opacity="0.34"/>`
    )
    .join('');

  return [
    starfield(r, 55),
    `  <circle cx="${waist}" cy="${cy}" r="300" fill="url(#h-ice)" opacity="0.16"/>`,
    `  <circle cx="${mx}" cy="${cy}" r="340" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <g>${guides.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.3">${callers.join('')}</g>`,
    `  <g>${callers.join('')}</g>`,
    `  <g>${walls}</g>`,
    `  <g filter="url(#blur8)" opacity="0.5">${flow.join('')}</g>`,
    `  <g>${flow.join('')}</g>`,
    // The aperture: one opening, and nothing reaches the server except through it.
    `  <circle cx="${waist}" cy="${cy}" r="50" fill="none" stroke="${C.ice}" stroke-width="18" opacity="0.3" filter="url(#blur8)"/>`,
    `  <circle cx="${waist}" cy="${cy}" r="50" fill="none" stroke="${C.ice}" stroke-width="9" opacity="0.95"/>`,
    `  <circle cx="${mx}" cy="${cy}" r="150" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(mx, cy, 210)}</g>`,
    `  <g>${mark(mx, cy, 210)}</g>`,
  ].join('\n');
}

// Round trip: three unlike callers on their own lifelines, one server lifeline,
// a handshake at the top and then request and response rungs interleaving. Every
// response comes back in the same colour because it comes back in one protocol.
function clientRoundTrip(r) {
  const server = 1250;
  const head = 300;
  const first = 404;
  const step = 44;
  const bot = 916;

  const clients = [
    { x: 420, color: C.mint, key: 'mint', glyph: 'ring' },
    { x: 650, color: C.coral, key: 'coral', glyph: 'square' },
    { x: 880, color: C.violet, key: 'violet', glyph: 'triangle' },
  ];

  const rows = [
    { c: 0, out: true, hs: true },
    { c: 0, out: false, hs: true },
    { c: 1, out: true, hs: true },
    { c: 1, out: false, hs: true },
    { c: 2, out: true, hs: true },
    { c: 2, out: false, hs: true },
    { c: 0, out: true },
    { c: 1, out: true },
    { c: 0, out: false },
    { c: 2, out: true },
    { c: 1, out: false },
    { c: 2, out: false },
  ];

  const arrow = (from, to, y, color, width, dash, op) => {
    const dir = Math.sign(to - from);
    const tip = to - dir * 4;
    return (
      `<line x1="${n(from)}" y1="${n(y)}" x2="${n(tip - dir * 15)}" y2="${n(y)}" stroke="${color}" ` +
      `stroke-width="${width}" ${dash} stroke-linecap="round" opacity="${op}"/>` +
      `<path d="M ${n(tip)} ${n(y)} L ${n(tip - dir * 19)} ${n(y - 10)} L ${n(tip - dir * 19)} ${n(y + 10)} Z" ` +
      `fill="${color}" opacity="${op}"/>`
    );
  };

  const lifelines = clients.map(
    (c) =>
      `<line x1="${c.x}" y1="${head + 50}" x2="${c.x}" y2="${bot}" stroke="${c.color}" stroke-width="2.2" ` +
      `stroke-dasharray="5 15" opacity="0.34"/>`
  );

  const heads = clients.map((c) => {
    const g = `<circle cx="${c.x}" cy="${head}" r="60" fill="url(#h-${c.key})" opacity="0.55"/>`;
    if (c.glyph === 'ring') {
      return (
        g +
        `<circle cx="${c.x}" cy="${head}" r="36" fill="${C.ink}" fill-opacity="0.4" stroke="${c.color}" stroke-width="5.5"/>` +
        `<circle cx="${c.x}" cy="${head}" r="11" fill="${c.color}"/>`
      );
    }
    if (c.glyph === 'square') {
      return (
        g +
        `<rect x="${c.x - 32}" y="${head - 32}" width="64" height="64" rx="10" fill="${C.ink}" fill-opacity="0.4" ` +
        `stroke="${c.color}" stroke-width="5.5"/>` +
        `<rect x="${c.x - 11}" y="${head - 11}" width="22" height="22" rx="4" fill="${c.color}"/>`
      );
    }
    return (
      g +
      `<path d="M ${c.x} ${head - 39} L ${c.x + 37} ${head + 25} L ${c.x - 37} ${head + 25} Z" fill="${C.ink}" ` +
      `fill-opacity="0.4" stroke="${c.color}" stroke-width="5.5" stroke-linejoin="round"/>` +
      `<circle cx="${c.x}" cy="${head + 7}" r="9" fill="${c.color}"/>`
    );
  });

  const rungs = [];
  const ticks = [];
  rows.forEach((row, i) => {
    const c = clients[row.c];
    const y = first + i * step;
    const near = c.x + 10;
    const far = server - 12;
    if (row.out) {
      rungs.push(arrow(near, far, y, c.color, row.hs ? 2.6 : 4.2, row.hs ? 'stroke-dasharray="9 10"' : '', row.hs ? 0.6 : 0.95));
    } else {
      rungs.push(arrow(far, near, y, C.ice, row.hs ? 2.6 : 3.6, row.hs ? 'stroke-dasharray="9 10"' : '', row.hs ? 0.55 : 0.88));
    }
    ticks.push(
      `<rect x="${server - 13}" y="${n(y - 2.5)}" width="26" height="5" rx="2.5" fill="${C.ice}" opacity="${row.hs ? 0.45 : 0.85}"/>`
    );
  });

  return [
    starfield(r, 55),
    `  <circle cx="${server}" cy="${head + 120}" r="420" fill="url(#h-cyan)" opacity="0.18"/>`,
    `  <g>${lifelines.join('')}</g>`,
    `  <line x1="${server}" y1="${head + 96}" x2="${server}" y2="${bot}" stroke="${C.ice}" stroke-width="16" opacity="0.26" filter="url(#blur8)"/>`,
    `  <line x1="${server}" y1="${head + 96}" x2="${server}" y2="${bot}" stroke="${C.ice}" stroke-width="5" opacity="0.85"/>`,
    `  <g>${rungs.join('')}</g>`,
    `  <g>${ticks.join('')}</g>`,
    `  <g>${heads.join('')}</g>`,
    `  <circle cx="${server}" cy="${head}" r="126" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(server, head, 178)}</g>`,
    `  <g>${mark(server, head, 178)}</g>`,
  ].join('\n');
}

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
function aiWorkloadFanout(r) {
  const hx = 640;
  const hy = 540;
  const glyphX = 1206;

  // Inbound: one workload arriving as many requests, funnelling into the split.
  // Straight dashed lanes rather than long curves, so it reads as traffic.
  const inbound = [];
  const iLanes = 21;
  for (let i = 0; i < iLanes; i++) {
    const y0 = hy + (i / (iLanes - 1) - 0.5) * 620 + (r() - 0.5) * 18;
    const x0 = 20 + r() * 130;
    inbound.push(
      `<line x1="${n(x0)}" y1="${n(y0)}" x2="${n(hx - 178)}" y2="${n(hy + (y0 - hy) * 0.1)}" ` +
        `stroke="${weighted(r, [[C.cyanLt, 6], [C.ice, 4]])}" stroke-width="${n(1.6 + r() * 2)}" ` +
        `stroke-dasharray="${n(26 + r() * 96)} ${n(20 + r() * 44)}" stroke-linecap="round" ` +
        `opacity="${n(0.16 + r() * 0.34)}"/>`
    );
  }

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
    `  <g>${inbound.join('')}</g>`,
    `  <g>${wires.join('')}</g>`,
    `  <g>${packets.join('')}</g>`,
    `  <g>${glyphs.join('')}</g>`,
    `  <circle cx="${hx}" cy="${hy}" r="158" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(hx, hy, 196)}</g>`,
    `  <g>${mark(hx, hy, 196)}</g>`,
  ].join('\n');
}

// Vector recall: a cloud of stored embeddings with a query at the centre. The
// recall radius is fitted to the nearest handful, and only those come back.
// Nothing here is addressed by a key: distance decides.
function aiVectorRecall(r) {
  const cx = 960;
  const cy = 540;
  const inner = 200; // the query itself, the mark sits inside this
  const K = 7;

  // Elliptical placement keeps the cloud banner-shaped; colour and size follow
  // true radial distance, so the rings read as isolines of similarity.
  const pts = [];
  let guard = 0;
  while (pts.length < 72 && guard++ < 40000) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r());
    const x = cx + Math.cos(a) * rad * 800;
    const y = cy + Math.sin(a) * rad * 366;
    const d = Math.hypot(x - cx, y - cy);
    if (d < inner + 46) continue;
    if (pts.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 96 ** 2)) pts.push({ x, y, d });
  }
  pts.sort((a, b) => a.d - b.d);
  const recallR = pts[K - 1].d + 32;

  const far = [];
  const near = [];
  pts.forEach((p, i) => {
    if (i < K) {
      const ux = (p.x - cx) / p.d;
      const uy = (p.y - cy) / p.d;
      near.push(
        `<line x1="${n(cx + ux * inner)}" y1="${n(cy + uy * inner)}" x2="${n(p.x - ux * 14)}" y2="${n(p.y - uy * 14)}" ` +
          `stroke="${C.mint}" stroke-width="2.2" opacity="${n(0.62 - (p.d / recallR) * 0.2)}"/>`,
        dot(p.x, p.y, 10, C.mint, 'mint', 0.95, 3.4)
      );
    } else {
      const fade = clamp(0.5 - ((p.d - recallR) / 620) * 0.42, 0.1, 0.5);
      far.push(
        dot(p.x, p.y, 3.4 + clamp(1 - (p.d - recallR) / 520, 0, 1) * 2.6, weighted(r, [[C.cyanLt, 6], [C.ice, 3], [C.violet, 3]]), 'cyan', fade, 2.4)
      );
    }
  });

  return [
    starfield(r, 50),
    `  <circle cx="${cx}" cy="${cy}" r="330" fill="url(#h-violet)" opacity="0.3"/>`,
    `  <g>${far.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(inner)}" fill="none" stroke="${C.ice}" stroke-width="1.8" stroke-dasharray="6 12" opacity="0.3"/>`,
    `  <g>${near.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(recallR)}" fill="none" stroke="${C.mint}" stroke-width="11" opacity="0.22" filter="url(#blur8)"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(recallR)}" fill="none" stroke="${C.mint}" stroke-width="3.2" stroke-dasharray="15 14" opacity="0.8"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="200" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(cx, cy, 220)}</g>`,
    `  <g>${mark(cx, cy, 220)}</g>`,
  ].join('\n');
}


// -------------------------------------------------------- connection storms
//
// Two halves of the same subject. `connStormSpike` is the shape of the storm in
// time: quiet, a wall of simultaneous connection attempts, quiet again, with the
// part of the wall the server cannot accept in one pass stacked above its
// capacity. `connStormJitter` is the remedy: the same synchronised wall combed
// out into a spread. Neither draws a gate, which is `security-acl`'s job.

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

// The remedy: one synchronised wall of reconnects on the left, spreading into a
// staggered fan as exponential backoff with jitter pushes each client's retries
// further apart. Coral is the simultaneous attempt, mint is the one that lands.
function connStormJitter(r) {
  const cy = 540;
  const wall = 430;
  const reach = 1330;
  const lanes = 24;
  const wallSpan = 484;
  const spread = 1.62; // the bundle opens out by this factor across the frame

  const rays = [];
  const wallDots = [];
  const landed = [];
  for (let i = 0; i < lanes; i++) {
    const off = (i - (lanes - 1) / 2) * (wallSpan / (lanes - 1));
    const yAt = (x) => cy + off * (1 + (spread - 1) * ((x - wall) / (reach - wall)));

    // Retries, each gap roughly double the last and jittered per client, then
    // fitted to how far this client happens to run before it lands.
    const pts = [{ x: wall, y: yAt(wall) }];
    const gaps = Array.from({ length: 4 + Math.floor(r() * 2) }, (_, k) => 1.75 ** k * (0.55 + r() * 0.9));
    const scale = ((reach - wall) * (0.52 + r() * 0.48)) / gaps.reduce((a, b) => a + b, 0);
    let x = wall;
    for (const g of gaps) {
      x += g * scale;
      pts.push({ x, y: yAt(x) });
    }

    rays.push(
      `<path d="${pts.map((p, k) => `${k ? 'L' : 'M'} ${n(p.x)} ${n(p.y)}`).join(' ')}" fill="none" ` +
        `stroke="${C.cyanLt}" stroke-width="1.6" opacity="0.28"/>`
    );
    wallDots.push(dot(pts[0].x, pts[0].y, 6, C.coral, 'coral', 0.95, 2.6));
    pts.slice(1, -1).forEach((p, k) => {
      const color = k === 0 ? C.coral : C.gold;
      rays.push(
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(4.6 + k * 0.5)}" fill="${color}" opacity="${n(0.5 + k * 0.14)}"/>`
      );
    });
    const end = pts[pts.length - 1];
    landed.push(dot(end.x, end.y, 8, C.mint, 'mint', 0.95, 3.2));
  }

  return [
    starfield(r, 55),
    `  <ellipse cx="${wall}" cy="${cy}" rx="130" ry="300" fill="url(#h-coral)" opacity="0.4"/>`,
    `  <ellipse cx="1180" cy="${cy}" rx="380" ry="420" fill="url(#h-mint)" opacity="0.14"/>`,
    `  <g>${rays.join('')}</g>`,
    `  <g>${wallDots.join('')}</g>`,
    `  <g>${landed.join('')}</g>`,
  ].join('\n');
}

// ------------------------------------------------------------- operations
//
// Both ops themes carry the same one idea: at scale you are looking at a fleet,
// not a server. `ops-fleet-triage` says the fleet is uniform and only a handful
// of it needs you; `ops-rolling-wave` says a change crosses that fleet one group
// at a time. Neither reuses the slot ring (`clustering`) or a chart
// (`benchmarks`).

// Fleet triage: a wide field of identical deployments, unremarkable and healthy,
// with the three that actually need attention lit and bracketed. The subject is
// the ratio: almost everything is fine, and the work is picking out the few.
function opsFleetTriage(r) {
  const cols = 9;
  const rows = 6;
  const dx = 178;
  const dy = 133;
  const x0 = 246;
  const y0 = 235;
  const HEX = 46;

  // Odd rows are offset half a step so the fleet reads as a field rather than a
  // spreadsheet, and each unit is jittered a few pixels off its slot.
  const units = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      units.push({
        i,
        j,
        x: x0 + i * dx + (j % 2) * (dx / 2) + (r() - 0.5) * 10,
        y: y0 + j * dy + (r() - 0.5) * 8,
      });
    }
  }

  // Flagged by slot, not at random: all three sit inside the horizontal safe
  // area, spread across the field so none reads as the subject of the image.
  const FLAGS = ['1-2', '3-5', '4-4'];
  const flagged = units.filter((u) => FLAGS.includes(`${u.j}-${u.i}`));
  const quiet = units.filter((u) => !flagged.includes(u));

  // The same signal read across every row, faint enough to stay a substrate.
  const rails = units
    .filter((u) => u.i === 0)
    .map(
      (u) =>
        `<line x1="120" y1="${n(y0 + u.j * dy)}" x2="1800" y2="${n(y0 + u.j * dy)}" stroke="${C.cyanLt}" ` +
        `stroke-width="1.2" stroke-dasharray="3 13" opacity="0.13"/>`
    )
    .join('');

  const field = quiet
    .map((u) => `<g opacity="${n(0.34 + r() * 0.16)}">${mark(u.x, u.y, HEX, C.cyanLt)}</g>`)
    .join('');

  // Corner brackets: a reticle rather than a ring, so it reads as "being looked
  // at" instead of as another kind of node.
  const bracket = (x, y, s = 58, arm = 21) =>
    [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      .map(
        ([sx, sy]) =>
          `<path d="M ${n(x + sx * s)} ${n(y + sy * (s - arm))} L ${n(x + sx * s)} ${n(y + sy * s)} ` +
          `L ${n(x + sx * (s - arm))} ${n(y + sy * s)}" fill="none" stroke="${C.coral}" stroke-width="4" ` +
          `stroke-linecap="round" opacity="0.92"/>`
      )
      .join('');

  const attended = flagged
    .map(
      (u) =>
        `<circle cx="${n(u.x)}" cy="${n(u.y)}" r="40" fill="url(#scrim)"/>` +
        `<g filter="url(#blur8)" opacity="0.5">${mark(u.x, u.y, HEX + 12)}</g>` +
        `<g>${mark(u.x, u.y, HEX + 12)}</g>` +
        bracket(u.x, u.y)
    )
    .join('');

  return [
    starfield(r, 55),
    // Ambient glow first: over the field it veils the hexagons into a smear.
    `  <ellipse cx="960" cy="560" rx="830" ry="410" fill="url(#h-cyan)" opacity="0.16"/>`,
    `  <g>${flagged.map((u) => `<circle cx="${n(u.x)}" cy="${n(u.y)}" r="82" fill="url(#h-coral)" opacity="0.95"/>`).join('')}</g>`,
    `  <g>${rails}</g>`,
    `  <g>${field}</g>`,
    `  <g>${attended}</g>`,
  ].join('\n');
}

// Rolling wave: the fleet as groups of nodes, and one operation crossing it a
// group at a time. Everything behind the front is on the new state, everything
// ahead of it is untouched, and exactly one group is in flight.
function opsRollingWave(r) {
  const groups = 9;
  const per = 7;
  const cur = 3; // the group currently being worked, kept inside the safe area
  const gx = (i) => 240 + i * 180;
  const ny = (j) => 250 + j * 100;
  const top = 195;
  const bot = 905;

  const spines = [];
  const nodes = [];
  for (let i = 0; i < groups; i++) {
    const x = gx(i);
    const done = i < cur;
    const live = i === cur;
    const color = done ? C.mint : live ? C.ice : C.cyanLt;
    spines.push(
      `<line x1="${n(x)}" y1="${n(ny(0) - 36)}" x2="${n(x)}" y2="${n(ny(per - 1) + 36)}" stroke="${color}" ` +
        `stroke-width="${live ? 2.6 : 1.6}" opacity="${done ? 0.42 : live ? 0.6 : 0.2}"/>`
    );
    for (let j = 0; j < per; j++) {
      const y = ny(j);
      // Inside the live group the roll is partway down: the top half has come
      // back on the new state, the bottom half is still waiting its turn.
      if (live && j === 3) continue; // the mark stands in for this node
      const nodeDone = done || (live && j < 3);
      if (nodeDone) {
        nodes.push(dot(x, y, 7.5, C.mint, 'mint', done ? 0.8 : 0.95, 3));
      } else if (live) {
        // In flight: an open ring, still coming back up.
        nodes.push(
          `<circle cx="${n(x)}" cy="${n(y)}" r="13" fill="url(#h-ice)" opacity="0.8"/>` +
            `<circle cx="${n(x)}" cy="${n(y)}" r="12" fill="none" stroke="${C.ice}" stroke-width="3.4" ` +
            `stroke-dasharray="7 7" opacity="0.95"/>`
        );
      } else {
        nodes.push(dot(x, y, 6.5, C.cyanLt, 'cyan', 0.52 + r() * 0.16, 2.8));
      }
    }
  }

  // The front itself: a lit capsule around the live group.
  const fx = gx(cur);
  const band =
    `<rect x="${n(fx - 66)}" y="${top}" width="132" height="${bot - top}" rx="66" fill="${C.ice}" opacity="0.08"/>` +
    `<rect x="${n(fx - 66)}" y="${top}" width="132" height="${bot - top}" rx="66" fill="none" stroke="${C.ice}" ` +
    `stroke-width="14" opacity="0.22" filter="url(#blur8)"/>` +
    `<rect x="${n(fx - 66)}" y="${top}" width="132" height="${bot - top}" rx="66" fill="none" stroke="${C.ice}" ` +
    `stroke-width="3.2" opacity="0.85"/>`;

  // Rails run the width of the fleet; the mint stretch behind the front is how
  // far the operation has got.
  const rail = (y) =>
    `<line x1="110" y1="${y}" x2="1810" y2="${y}" stroke="${C.cyanLt}" stroke-width="1.6" ` +
    `stroke-dasharray="5 15" opacity="0.2"/>` +
    `<line x1="110" y1="${y}" x2="${n(fx - 66)}" y2="${y}" stroke="${C.mint}" stroke-width="3" opacity="0.5"/>`;

  // Direction of travel, the same chevron the release art uses.
  const chev = (x, w, sw, op) =>
    `<path d="M ${n(x - w)} ${n(550 - w * 1.18)} L ${n(x)} 550 L ${n(x - w)} ${n(550 + w * 1.18)}" fill="none" ` +
    `stroke="${C.mint}" stroke-width="${sw}" stroke-linejoin="miter" opacity="${op}"/>`;

  return [
    starfield(r, 55),
    `  <ellipse cx="960" cy="550" rx="860" ry="380" fill="url(#h-cyan)" opacity="0.13"/>`,
    `  <ellipse cx="${n(fx)}" cy="550" rx="230" ry="420" fill="url(#h-ice)" opacity="0.22"/>`,
    `  <g>${rail(top)}${rail(bot)}</g>`,
    `  <g>${spines.join('')}</g>`,
    `  ${band}`,
    `  <g>${nodes.join('')}</g>`,
    `  ${chev(fx + 116, 26, 9, 0.3)}`,
    `  ${chev(fx + 168, 26, 9, 0.16)}`,
    `  <circle cx="${n(fx)}" cy="${n(ny(3))}" r="56" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur8)" opacity="0.5">${mark(fx, ny(3), 92)}</g>`,
    `  <g>${mark(fx, ny(3), 92)}</g>`,
  ].join('\n');
}

// ------------------------------------------------------------- valkey-bundle
//
// One package that carries several capabilities you would otherwise install
// one at a time. Two readings of that: containment (`bundleCrate`) and delivery
// (`bundleOneInstall`). In both, every module has to be a *different* shape --
// repeated identical blocks say "many of the same" instead of "several
// different capabilities in one package".

// Containment: a single package boundary with six differently shaped modules
// packed inside it, the mark sealing the lid.
function bundleCrate(r) {
  const x0 = 462;
  const x1 = 1458;
  const y0 = 212;
  const y1 = 868;
  const lid = y0 + 76;
  const cx = (x0 + x1) / 2;

  // A cell grid: on/off slots.
  const cells = (mx, my, color) => {
    const s = 28;
    const gap = 9;
    const cols = 5;
    const rows = 4;
    const w = cols * s + (cols - 1) * gap;
    const h = rows * s + (rows - 1) * gap;
    const out = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const on = r() < 0.5;
        out.push(
          `<rect x="${n(mx - w / 2 + i * (s + gap))}" y="${n(my - h / 2 + j * (s + gap))}" width="${s}" height="${s}" rx="5" ` +
            `fill="${color}" fill-opacity="${on ? n(0.5 + r() * 0.4) : 0}" stroke="${color}" stroke-width="1.7" ` +
            `opacity="${on ? 0.95 : 0.38}"/>`
        );
      }
    }
    return out.join('');
  };

  // A branching document tree.
  const tree = (mx, my, color, key) => {
    const root = [mx - 104, my];
    const mid = [[mx - 4, my - 62], [mx - 4, my + 62]];
    const leaf = [[mx + 96, my - 94], [mx + 96, my - 34], [mx + 96, my + 34], [mx + 96, my + 94]];
    const lines = [...mid.map((m) => [root, m]), ...leaf.map((l, i) => [mid[i < 2 ? 0 : 1], l])]
      .map(
        ([a, b]) =>
          `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${color}" stroke-width="2" opacity="0.5"/>`
      )
      .join('');
    return (
      lines +
      dot(root[0], root[1], 9, color, key, 0.95, 3.4) +
      mid.map((m) => dot(m[0], m[1], 6.5, color, key, 0.85, 3.2)).join('') +
      leaf.map((l) => dot(l[0], l[1], 5, color, key, 0.7, 3)).join('')
    );
  };

  // A jagged series.
  const spark = (mx, my, color, key) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([mx - 110 + i * 27.5, my + (r() - 0.5) * 112]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${n(p[0])} ${n(p[1])}`).join(' ');
    return (
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="3.4" opacity="0.9" stroke-linejoin="round" stroke-linecap="round"/>` +
      pts.filter((_, i) => i % 2 === 0).map((p) => dot(p[0], p[1], 4, color, key, 0.85, 3)).join('')
    );
  };

  // Ragged index rows, each anchored on a term.
  const postings = (mx, my, color, key) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const y = my - 68 + i * 34;
      const len = 66 + r() * 126;
      out.push(
        `<line x1="${n(mx - 100)}" y1="${n(y)}" x2="${n(mx - 100 + len)}" y2="${n(y)}" stroke="${color}" ` +
          `stroke-width="3" stroke-linecap="round" opacity="${n(0.42 + r() * 0.42)}"/>`,
        dot(mx - 100, y, 4.5, color, key, 0.9, 3)
      );
    }
    return out.join('');
  };

  // A point cloud with a neighbourhood drawn round its middle.
  const cloud = (mx, my, color, key) => {
    const out = [
      `<circle cx="${n(mx)}" cy="${n(my)}" r="56" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="6 9" opacity="0.6"/>`,
    ];
    for (let i = 0; i < 17; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.55) * 94;
      out.push(dot(mx + Math.cos(a) * d, my + Math.sin(a) * d, 3.6, color, key, n(0.45 + r() * 0.5), 3));
    }
    return out.join('');
  };

  // A counter sketch.
  const bars = (mx, my, color) => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const h = 32 + r() * 108;
      out.push(
        `<rect x="${n(mx - 96 + i * 34)}" y="${n(my + 70 - h)}" width="22" height="${n(h)}" rx="4" fill="${color}" opacity="${n(0.38 + r() * 0.47)}"/>`
      );
    }
    return out.join('');
  };

  // Scaled about the crate's middle so the six modules pack the box instead of
  // leaving a dead band across the centre.
  const modules =
    `<g transform="translate(960 570) scale(1.13) translate(-960 -570)">` +
    [
      cells(668, 428, C.cyanLt),
      tree(966, 424, C.mint, 'mint'),
      spark(1268, 442, C.coral, 'coral'),
      postings(664, 712, C.ice, 'ice'),
      cloud(966, 716, C.violet, 'violet'),
      bars(1266, 714, C.gold),
    ].join('') +
    `</g>`;

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
    // Ambient glow behind the contents, never over them.
    `  <ellipse cx="${cx}" cy="540" rx="520" ry="360" fill="url(#h-cyan)" opacity="0.22"/>`,
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="${C.ink}" fill-opacity="0.3"/>`,
    `  <g>${modules}</g>`,
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="none" stroke="${C.ice}" stroke-width="14" opacity="0.28" filter="url(#blur8)"/>`,
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="none" stroke="${C.ice}" stroke-width="3.6" opacity="0.85"/>`,
    `  <line x1="${x0}" y1="${lid}" x2="${x1}" y2="${lid}" stroke="${C.ice}" stroke-width="2" stroke-dasharray="14 12" opacity="0.4"/>`,
    `  <g>${brackets}</g>`,
    // The seal: one mark on one lid.
    `  <circle cx="${cx}" cy="${y0}" r="118" fill="url(#h-ice)" opacity="0.55"/>`,
    `  <circle cx="${cx}" cy="${y0}" r="82" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur8)" opacity="0.5">${mark(cx, y0, 112)}</g>`,
    `  <g>${mark(cx, y0, 112)}</g>`,
  ].join('\n');
}

// Delivery: one conduit arrives, and five distinct modules come out of it. The
// single strap on the left is what you install; the fan on the right is what
// you get.
function bundleOneInstall(r) {
  const px = 700;
  const cy = 540;

  const shape = (kind, mx, my, color, key) => {
    if (kind === 'ring') {
      const out = [`<circle cx="${n(mx)}" cy="${n(my)}" r="50" fill="none" stroke="${color}" stroke-width="3.4" opacity="0.8"/>`];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        out.push(dot(mx + Math.cos(a) * 50, my + Math.sin(a) * 50, 7, color, key, 0.9, 3.2));
      }
      return out.join('');
    }
    if (kind === 'lattice') {
      const out = [];
      const pts = [];
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) pts.push([mx + i * 46, my + j * 46]);
      }
      for (const [ax, ay] of pts) {
        for (const [bx, by] of pts) {
          if (bx > ax && Math.abs(bx - ax) === 46 && Math.abs(by - ay) === 46) {
            out.push(`<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="${color}" stroke-width="2" opacity="0.45"/>`);
          }
        }
      }
      out.push(...pts.map(([ax, ay]) => dot(ax, ay, 5.5, color, key, 0.8, 3)));
      return out.join('');
    }
    if (kind === 'stack') {
      return [110, 88, 66, 44]
        .map(
          (w, i) =>
            `<rect x="${n(mx - w / 2)}" y="${n(my - 54 + i * 30)}" width="${n(w)}" height="20" rx="10" fill="${color}" opacity="${n(0.9 - i * 0.16)}"/>`
        )
        .join('');
    }
    if (kind === 'triangle') {
      const v = [[mx, my - 56], [mx + 56, my + 40], [mx - 56, my + 40]];
      return (
        `<path d="M ${n(v[0][0])} ${n(v[0][1])} L ${n(v[1][0])} ${n(v[1][1])} L ${n(v[2][0])} ${n(v[2][1])} Z" ` +
        `fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="3.4" stroke-linejoin="round" opacity="0.85"/>` +
        v.map((p) => dot(p[0], p[1], 6, color, key, 0.9, 3)).join('')
      );
    }
    // chevrons
    return [0, 1, 2]
      .map(
        (i) =>
          `<path d="M ${n(mx - 46 + i * 34)} ${n(my - 52)} L ${n(mx - 4 + i * 34)} ${n(my)} L ${n(mx - 46 + i * 34)} ${n(my + 52)}" ` +
          `fill="none" stroke="${color}" stroke-width="9" stroke-linejoin="miter" opacity="${n(0.4 + i * 0.28)}"/>`
      )
      .join('');
  };

  const mods = [
    { kind: 'ring', x: 1318, y: 248, color: C.cyanLt, key: 'cyan' },
    { kind: 'lattice', x: 1340, y: 394, color: C.mint, key: 'mint' },
    { kind: 'stack', x: 1354, y: 540, color: C.ice, key: 'ice' },
    { kind: 'triangle', x: 1340, y: 686, color: C.gold, key: 'gold' },
    { kind: 'chevrons', x: 1318, y: 832, color: C.coral, key: 'coral' },
  ];

  // The single strap: one bound thing, tapering into the port.
  const strapD = `M 120 ${cy - 100} L ${px} ${cy - 64} L ${px} ${cy + 64} L 120 ${cy + 100} Z`;
  const halfAt = (x) => 100 - ((x - 120) / (px - 120)) * 36;

  const flow = [];
  for (let i = 0; i < 34; i++) {
    const t = r();
    const x = 130 + t * (px - 250);
    const y = cy + (r() * 2 - 1) * (halfAt(x) - 8);
    const len = 60 + r() * 190;
    flow.push(
      `<line x1="${n(x)}" y1="${n(y)}" x2="${n(Math.min(px - 20, x + len))}" y2="${n(y)}" ` +
        `stroke="${weighted(r, [[C.cyanLt, 6], [C.ice, 3], [C.mint, 1]])}" stroke-width="${n(1.6 + r() * 3)}" ` +
        `stroke-linecap="round" opacity="${n(0.18 + r() * 0.4)}"/>`
    );
  }

  // Binding straps, so the arriving thing reads as one parcel rather than a beam.
  const bindings = [300, 452, 596]
    .map(
      (x) =>
        `<line x1="${n(x)}" y1="${n(cy - halfAt(x))}" x2="${n(x)}" y2="${n(cy + halfAt(x))}" ` +
        `stroke="${C.ice}" stroke-width="11" stroke-linecap="round" opacity="0.3"/>`
    )
    .join('');

  // One strap in, five branches out.
  const sx = 812;
  const harness = mods
    .map((m) => {
      const ex = m.x - 78;
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
    `  <clipPath id="strap"><path d="${strapD}"/></clipPath>`,
    // Ambient glow behind everything that follows.
    `  <circle cx="${px}" cy="${cy}" r="330" fill="url(#h-cyan)" opacity="0.18"/>`,
    ...mods.map((m) => `  <circle cx="${n(m.x)}" cy="${n(m.y)}" r="122" fill="url(#h-${m.key})" opacity="0.24"/>`),
    `  <path d="${strapD}" fill="${C.cyan}" fill-opacity="0.18" stroke="${C.cyanLt}" stroke-width="10" opacity="0.3" filter="url(#blur8)"/>`,
    `  <g clip-path="url(#strap)">${flow.join('')}${bindings}</g>`,
    `  <path d="${strapD}" fill="none" stroke="${C.ice}" stroke-width="3.8" opacity="0.9"/>`,
    `  <g>${harness}</g>`,
    `  <circle cx="${px}" cy="${cy}" r="150" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(px, cy, 208)}</g>`,
    `  <g>${mark(px, cy, 208)}</g>`,
    `  <g>${mods.map((m) => shape(m.kind, m.x, m.y, m.color, m.key)).join('')}</g>`,
  ].join('\n');
}

// ------------------------------------------------- primitives becoming tools
//
// Small server-side building blocks assembling into something larger than any
// of them alone. Here the repetition is the point: the base units are meant to
// be identical, and it is the things built on top of them that differ.

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

// The same primitive, recombined: one unit on the left, and three different
// tools on the right that are all made of copies of it.
function toolingRecombine(r) {
  const ax = 600;
  const ay = 540;

  const chip = (x, y, s, color, key, op = 1) =>
    `<rect x="${n(x - s / 2)}" y="${n(y - (s * 0.7) / 2)}" width="${n(s)}" height="${n(s * 0.7)}" rx="${n(s * 0.2)}" ` +
    `fill="${color}" fill-opacity="${n(op * 0.22)}" stroke="${color}" stroke-width="${n(s * 0.045 + 1.2)}" opacity="${n(op)}"/>` +
    dot(x, y, n(s * 0.075), color, key, n(op * 0.9), 3);

  // Fat soft link under a crisp one: it binds each assembly into a single
  // silhouette without drawing a box round it.
  const link = (a, b, color) =>
    `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${color}" stroke-width="16" opacity="0.16" filter="url(#blur8)"/>` +
    `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${color}" stroke-width="3.4" opacity="0.7"/>`;

  // Assembly 1: a chain.
  const chain = [];
  const chainPts = [0, 1, 2, 3, 4].map((i) => [1090 + (i - 2) * 94, 262]);
  for (let i = 1; i < chainPts.length; i++) chain.push(link(chainPts[i - 1], chainPts[i], C.mint));
  chain.push(...chainPts.map((p) => chip(p[0], p[1], 60, C.mint, 'mint', 0.95)));

  // Assembly 2: a cycle.
  const ring = [];
  const ringPts = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return [1090 + Math.cos(a) * 118, 545 + Math.sin(a) * 118];
  });
  for (let i = 0; i < ringPts.length; i++) ring.push(link(ringPts[i], ringPts[(i + 1) % ringPts.length], C.gold));
  ring.push(...ringPts.map((p) => chip(p[0], p[1], 60, C.gold, 'gold', 0.95)));

  // Assembly 3: a fan-out tree.
  const treeRoot = [950, 805];
  const treeMid = [[1072, 754], [1072, 856]];
  const treeLeaf = [[1212, 726], [1212, 782], [1212, 828], [1212, 884]];
  const tre = [
    ...treeMid.map((m) => link(treeRoot, m, C.coral)),
    ...treeLeaf.map((l, i) => link(treeMid[i < 2 ? 0 : 1], l, C.coral)),
    chip(treeRoot[0], treeRoot[1], 60, C.coral, 'coral', 0.95),
    ...treeMid.map((m) => chip(m[0], m[1], 54, C.coral, 'coral', 0.9)),
    ...treeLeaf.map((l) => chip(l[0], l[1], 46, C.coral, 'coral', 0.8)),
  ];

  // The primitive itself, called out once and wired to every assembly built out
  // of copies of it.
  const feeds = [
    [chainPts[0], C.mint, -34],
    [ringPts[4], C.gold, 0],
    [treeRoot, C.coral, 34],
  ]
    .map(
      ([p, color, off]) =>
        `<line x1="${n(ax + 96)}" y1="${n(ay + off)}" x2="${n(p[0] - 38)}" y2="${n(p[1])}" stroke="${color}" ` +
        `stroke-width="2.4" stroke-dasharray="10 13" opacity="0.5"/>`
    )
    .join('');

  const halos = [
    `<ellipse cx="1090" cy="262" rx="300" ry="120" fill="url(#h-mint)" opacity="0.2"/>`,
    `<circle cx="1090" cy="545" r="216" fill="url(#h-gold)" opacity="0.2"/>`,
    `<ellipse cx="1075" cy="805" rx="256" ry="146" fill="url(#h-coral)" opacity="0.2"/>`,
    `<circle cx="${ax}" cy="${ay}" r="240" fill="url(#h-cyan)" opacity="0.3"/>`,
  ].join('');

  return [
    starfield(r, 55),
    `  <g>${halos}</g>`,
    `  <g>${feeds}</g>`,
    `  <circle cx="${ax}" cy="${ay}" r="146" fill="none" stroke="${C.cyanLt}" stroke-width="2" stroke-dasharray="5 13" opacity="0.45"/>`,
    `  <circle cx="${ax}" cy="${ay}" r="194" fill="none" stroke="${C.violet}" stroke-width="2" stroke-dasharray="4 20" opacity="0.3"/>`,
    `  <g>${chip(ax, ay, 176, C.cyanLt, 'cyan', 1)}</g>`,
    `  <g>${chain.join('')}</g>`,
    `  <g>${ring.join('')}</g>`,
    `  <g>${tre.join('')}</g>`,
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
// A client glyph: an app instance rather than a server, so it never gets confused
// with the mark.
function azClient(x, y, size = 88) {
  const h = size / 2;
  const pips = [];
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      pips.push(`<circle cx="${n(x + dx * 18)}" cy="${n(y + dy * 18)}" r="6.5" fill="${C.ice}" opacity="0.9"/>`);
    }
  }
  return (
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size * 0.9)}" fill="url(#h-ice)" opacity="0.3"/>` +
    `<rect x="${n(x - h)}" y="${n(y - h)}" width="${n(size)}" height="${n(size)}" rx="22" fill="${C.ink}" ` +
    `fill-opacity="0.55" stroke="${C.ice}" stroke-width="3" opacity="0.92"/>` +
    pips.join('')
  );
}


function azZoneLocalReads(r) {
  const zoneW = 260;
  const gap = 90;
  const left = 480;
  const zTop = 236;
  const zH = 669;
  const clientY = 300;
  const nodeY = 810;
  const cxs = [0, 1, 2].map((i) => left + i * (zoneW + gap) + zoneW / 2);

  const zones = cxs
    .map(
      (x) =>
        `<rect x="${n(x - zoneW / 2)}" y="${zTop}" width="${zoneW}" height="${zH}" rx="34" ` +
        `fill="${C.violet}" fill-opacity="0.07" stroke="${C.cyanLt}" stroke-width="2.2" ` +
        `stroke-dasharray="16 18" opacity="0.42"/>`
    )
    .join('');

  // The in-zone read: short, lit, and inside the boundary the whole way.
  const local = [];
  for (const x of cxs) {
    const y0 = clientY + 46;
    const y1 = nodeY - 82;
    local.push(
      `<line x1="${n(x)}" y1="${n(y0)}" x2="${n(x)}" y2="${n(y1)}" stroke="${C.mint}" stroke-width="14" ` +
        `opacity="0.3" filter="url(#blur8)"/>`,
      `<line x1="${n(x)}" y1="${n(y0)}" x2="${n(x)}" y2="${n(y1)}" stroke="${C.mint}" stroke-width="5.5" ` +
        `stroke-linecap="round" opacity="0.95"/>`,
      [0.28, 0.52, 0.76].map((t) => dot(x, y0 + t * (y1 - y0), 5.5, C.ice, 'ice', 0.9, 3)).join(''),
      `<path d="M ${n(x - 17)} ${n(y1 - 22)} L ${n(x)} ${n(y1)} L ${n(x + 17)} ${n(y1 - 22)}" fill="none" ` +
        `stroke="${C.mint}" stroke-width="5" stroke-linejoin="round" opacity="0.95"/>`
    );
  }

  // The hops that would leave the zone: drawn, dashed, and struck out on the
  // boundary they would have to cross.
  const cross = [];
  for (const s of [-1, 1]) {
    const gx = cxs[1] + s * (zoneW / 2 + gap / 2);
    const ax = cxs[1] + s * (zoneW + gap) - s * 96;
    cross.push(
      `<path d="M ${n(cxs[1] + s * 48)} ${clientY} C ${n(gx)} ${clientY} ${n(gx)} ${n(clientY + 120)} ` +
        `${n(gx)} ${n(clientY + 220)} L ${n(gx)} ${n(nodeY - 190)} C ${n(gx)} ${n(nodeY - 60)} ` +
        `${n((gx + ax) / 2)} ${nodeY} ${n(ax)} ${nodeY}" fill="none" stroke="${C.cyanLt}" stroke-width="2.6" ` +
        `stroke-dasharray="13 15" opacity="0.35"/>`
    );
    const mx = cxs[1] + s * (zoneW / 2);
    cross.push(
      `<circle cx="${n(mx)}" cy="${n(clientY + 14)}" r="30" fill="url(#h-coral)" opacity="0.85"/>`,
      `<path d="M ${n(mx - 12)} ${n(clientY + 2)} L ${n(mx + 12)} ${n(clientY + 26)} ` +
        `M ${n(mx + 12)} ${n(clientY + 2)} L ${n(mx - 12)} ${n(clientY + 26)}" stroke="${C.coral}" ` +
        `stroke-width="4.2" stroke-linecap="round" opacity="0.95"/>`
    );
  }

  const nodes = cxs
    .map(
      (x) =>
        `<circle cx="${n(x)}" cy="${nodeY}" r="150" fill="url(#h-cyan)" opacity="0.3"/>` +
        `<circle cx="${n(x)}" cy="${nodeY}" r="106" fill="none" stroke="${C.mint}" stroke-width="2.4" ` +
        `stroke-dasharray="10 12" opacity="0.5"/>` +
        `<circle cx="${n(x)}" cy="${nodeY}" r="70" fill="url(#scrim)"/>` +
        mark(x, nodeY, 150)
    )
    .join('');

  return [
    starfield(r, 55),
    `  <g>${zones}</g>`,
    `  <g>${cross.join('')}</g>`,
    `  <g>${local.join('')}</g>`,
    `  <g>${nodes}</g>`,
    `  <g>${cxs.map((x) => azClient(x, clientY)).join('')}</g>`,
  ].join('\n');
}

// One client, three replicas it could read from. It takes the hop that stays in
// its own zone; the two that leave are long, metered, and not taken.
function azShortPath(r) {
  const cy = 540;
  const clientX = 620;
  const localX = 980;
  const remoteX = 1330;
  const remoteYs = [268, 812];

  const cube = (p, t) => {
    const u = 1 - t;
    const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [0, 1].map((k) => p.reduce((s, q, i) => s + b[i] * q[k], 0));
  };

  // Each long route sweeps well clear of the local replica, so it reads as the
  // expensive way round rather than as a second short hop.
  const routes = [
    [[618, cy - 48], [598, 262], [800, 178], [remoteX - 92, remoteYs[0]]],
    [[618, cy + 48], [598, 818], [800, 902], [remoteX - 92, remoteYs[1]]],
  ];

  const long = [];
  for (const p of routes) {
    const d =
      `M ${n(p[0][0])} ${n(p[0][1])} C ${n(p[1][0])} ${n(p[1][1])} ${n(p[2][0])} ${n(p[2][1])} ` +
      `${n(p[3][0])} ${n(p[3][1])}`;
    long.push(
      `<path d="${d}" fill="none" stroke="${C.cyanLt}" stroke-width="2.8" stroke-dasharray="14 16" opacity="0.38"/>`
    );
    // Meter ticks along the route: distance that gets charged for.
    for (const t of [0.2, 0.34, 0.48, 0.62, 0.76]) {
      const [x, y] = cube(p, t);
      const [x2, y2] = cube(p, t + 0.012);
      const len = Math.hypot(x2 - x, y2 - y) || 1;
      const nx = -(y2 - y) / len;
      const ny = (x2 - x) / len;
      long.push(
        `<line x1="${n(x - nx * 12)}" y1="${n(y - ny * 12)}" x2="${n(x + nx * 12)}" y2="${n(y + ny * 12)}" ` +
          `stroke="${C.coral}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`
      );
    }
    const [mx, my] = cube(p, 0.5);
    long.push(
      `<circle cx="${n(mx)}" cy="${n(my)}" r="32" fill="url(#h-coral)" opacity="0.85"/>`,
      `<path d="M ${n(mx - 13)} ${n(my - 13)} L ${n(mx + 13)} ${n(my + 13)} M ${n(mx + 13)} ${n(my - 13)} ` +
        `L ${n(mx - 13)} ${n(my + 13)}" stroke="${C.coral}" stroke-width="4.4" stroke-linecap="round" opacity="0.95"/>`
    );
  }

  const shortX0 = clientX + 56;
  const shortX1 = localX - 88;
  const short = [
    `<line x1="${n(shortX0)}" y1="${cy}" x2="${n(shortX1)}" y2="${cy}" stroke="${C.mint}" stroke-width="16" ` +
      `opacity="0.32" filter="url(#blur8)"/>`,
    `<line x1="${n(shortX0)}" y1="${cy}" x2="${n(shortX1)}" y2="${cy}" stroke="${C.mint}" stroke-width="6" ` +
      `stroke-linecap="round" opacity="0.95"/>`,
    [0.3, 0.6].map((t) => dot(shortX0 + t * (shortX1 - shortX0), cy, 6, C.ice, 'ice', 0.95, 3)).join(''),
    `<path d="M ${n(shortX1 - 24)} ${cy - 18} L ${n(shortX1)} ${cy} L ${n(shortX1 - 24)} ${cy + 18}" fill="none" ` +
      `stroke="${C.mint}" stroke-width="5" stroke-linejoin="round" opacity="0.95"/>`,
    // A measure under the hop, because its length is the whole point.
    `<path d="M ${n(shortX0)} ${cy + 86} L ${n(shortX0)} ${cy + 100} L ${n(shortX1)} ${cy + 100} ` +
      `L ${n(shortX1)} ${cy + 86}" fill="none" stroke="${C.mint}" stroke-width="2.8" opacity="0.6"/>`,
  ].join('');

  const remotes = remoteYs
    .map(
      (y) =>
        `<circle cx="${remoteX}" cy="${n(y)}" r="96" fill="none" stroke="${C.cyanLt}" stroke-width="2" ` +
        `stroke-dasharray="12 14" opacity="0.3"/>` +
        `<g opacity="0.5">${mark(remoteX, y, 128)}</g>`
    )
    .join('');

  return [
    starfield(r, 55),
    `  <ellipse cx="${n((clientX + localX) / 2)}" cy="${cy}" rx="360" ry="230" fill="url(#h-mint)" opacity="0.26"/>`,
    `  <g>${long.join('')}</g>`,
    `  <g>${remotes}</g>`,
    `  <g>${short}</g>`,
    `  <circle cx="${localX}" cy="${cy}" r="190" fill="url(#h-cyan)" opacity="0.34"/>`,
    `  <circle cx="${localX}" cy="${cy}" r="86" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.45">${mark(localX, cy, 180)}</g>`,
    `  <g>${mark(localX, cy, 180)}</g>`,
    `  <g>${azClient(clientX, cy, 96)}</g>`,
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
  { name: 'keyspace-scan', seed: 19087, focal: [960, 540], zoom: 1.26, center: [960, 540], title: 'Valkey keyspace scan', desc: 'A wide field of keys with one bounded window lit in green, the keys behind it dimmed and the keys ahead of it unlit, above a track of uneven cursor steps, representing scanning a keyspace a window at a time instead of reading it all at once.', art: keyspaceScan },
  { name: 'acl-read-only', seed: 21193, focal: [960, 540], zoom: 1.4, center: [960, 548], title: 'Valkey read-only access', desc: 'A grid of abstract command names with one bounded group lit in green and a single command inside that group struck out in red, representing a read-only access control list grant with one command taken back out.', art: aclReadOnly },
  { name: 'key-prefix-groups', seed: 23299, focal: [1000, 540], zoom: 1.3, center: [960, 542], title: 'Valkey key prefix groups', desc: 'A scattered cloud of sampled keys on the left funnelling into a short list of prefix rows with count bars on the right, representing a sample of key names grouped into browsable prefixes.', art: keyPrefixGroups },
  { name: 'large-key-grid', seed: 25309, focal: [960, 550], zoom: 1.4, center: [960, 552], title: 'Valkey large key', desc: 'An even field of small key tiles with one key occupying the space of dozens of them, outlined in red and densely packed with elements, representing a single key far larger than the rest of the keyspace.', art: largeKeyGrid },
  { name: 'large-key-bars', seed: 27407, focal: [1000, 560], zoom: 1.3, center: [960, 564], title: 'Valkey large key', desc: 'Seven key sizes measured against a common scale, six of them short and one running clean off the frame in red, representing a single key far larger than the rest of the keyspace.', art: largeKeyBars },
  { name: 'event-calendar-day', seed: 38011, focal: [960, 540], zoom: 1.32, center: [960, 540], title: 'Valkey event', desc: 'A month of day cells with exactly one lit and circled in green, and travel converging on it from off the frame, representing a dated community event.', art: eventCalendarDay },
  { name: 'event-gather-ring', seed: 38029, focal: [960, 540], zoom: 1.3, center: [960, 540], title: 'Valkey event', desc: 'Arrivals closing in from every direction on a lit venue ring centred on the white Valkey hexagon mark, thickest right against it, representing a community gathering.', art: eventGatherRing },
  { name: 'release-candidate-hold', seed: 38047, focal: [1140, 540], zoom: 1.4, center: [900, 540], title: 'Valkey release candidate', desc: 'A stream of chevrons stopped at a lit checkpoint that has not opened, with a dim golden burst waiting on the far side, representing a release candidate held for testing before general availability.', art: releaseCandidateHold },
  { name: 'release-candidate-soak', seed: 38063, focal: [960, 540], zoom: 1.45, center: [900, 540], title: 'Valkey release candidate', desc: 'A soak bar part filled in green with test results accumulating above and below it and a dim golden burst at the unreached end, representing time deliberately spent under test before a release ships.', art: releaseCandidateSoak },
  { name: 'large-key-mass', seed: 29501, focal: [960, 540], zoom: 1.3, center: [960, 540], title: 'Valkey large key', desc: 'One key drawn as a large circle packed with hundreds of elements, surrounded by a sparse scattering of ordinary single keys, representing a single key holding more than the rest of the keyspace around it.', art: largeKeyMass },
  { name: 'bloom-bit-array', seed: 31013, focal: [960, 400], zoom: 1.4, center: [960, 475], title: 'Valkey Bloom filters', desc: 'The white Valkey hexagon mark above a long row of bit cells, with five hash nodes fanning out of it and the five cells they land on lit in green, representing one item hashed to a handful of positions in a Bloom filter.', art: bloomBitArray },
  { name: 'bloom-verdict', seed: 31029, focal: [960, 540], zoom: 1.36, center: [960, 540], title: 'Valkey Bloom filter lookups', desc: 'A grid of bit cells crossed by two lookups: an upper one in green that finds every position set and ends in a soft dashed tick, and a lower one in red that finds one clear cell and ends in a solid cross, representing a probable yes and a definite no.', art: bloomVerdict },
  { name: 'search-vector-nearest', seed: 32011, focal: [960, 540], zoom: 1.2, center: [960, 540], title: 'Valkey vector search', desc: 'A dark field of indexed vectors with the white Valkey hexagon mark at the centre as the query, spokes reaching out to six bright green nearest matches inside a dashed search radius, representing vector similarity search.', art: searchNearest },
  { name: 'search-narrowing', seed: 32029, focal: [1200, 540], zoom: 1.12, center: [940, 540], title: 'Valkey search index', desc: 'A wedge narrowing from left to right, where a wide field of dim indexed points thins into a few bright green candidates converging on the white Valkey hexagon mark, representing an index reducing a large space to a small candidate set.', art: searchNarrowing },
  { name: 'search-field-index', seed: 32047, focal: [960, 600], zoom: 1.1, center: [960, 540], title: 'Valkey secondary indexing', desc: 'Four record cards each contributing one highlighted green field to a sorted index lane below, with a query caliper bracketing three matched entries above the white Valkey hexagon mark, representing secondary indexing on hashes and JSON.', art: searchFieldIndex },
  { name: 'client-confluence', seed: 34011, focal: [1400, 520], zoom: 1.22, center: [1060, 540], title: 'Valkey client libraries', desc: 'Five inbound channels, each drawn in a different visual language, bending through one bright aperture and continuing as a single stream of identical packets into the white Valkey hexagon mark, representing many client libraries speaking one protocol to one server.', art: clientConfluence },
  { name: 'client-round-trip', seed: 34023, focal: [1250, 430], zoom: 1.2, center: [860, 557], title: 'Valkey client round trip', desc: 'Three unlike client shapes on their own lifelines exchanging dashed handshakes and then coloured request and pale response arrows with a single bright server lifeline headed by the white Valkey hexagon mark, representing the request and response round trip a client library performs.', art: clientRoundTrip },
  { name: 'client-ports', seed: 34037, focal: [960, 540], zoom: 1, center: [960, 540], title: 'Valkey client protocol', desc: 'Six differently drawn channels reaching in from distinct outer shapes, each meeting an identical port at the same radius, beyond which every spoke becomes the same run of pale segments arriving at the white Valkey hexagon mark, representing different client libraries meeting one protocol at one server.', art: clientPorts },
  { name: 'ai-agent-memory', seed: 35011, focal: [1120, 380], zoom: 1.29, center: [960, 540], title: 'Valkey AI agent memory', desc: 'A row of conversation turns with the most recent ones lit inside a bright window, older turns dimmed and parked in an archive below the white Valkey hexagon mark, and two of them arcing back up into the window, representing agent memory with hot recent context and older context recalled on demand.', art: aiAgentMemory },
  { name: 'ai-workload-fanout', seed: 35023, focal: [700, 520], zoom: 1.18, center: [960, 540], title: 'Valkey AI workload primitives', desc: 'A single bundled stream of requests arriving at the white Valkey hexagon mark and fanning out into five lanes, each ending in a differently shaped structure: a ring of slots, a chain of entries, a ranked stack, a grid of bits and a row of embedding magnitudes, representing an AI workload decomposing into the primitives Valkey already has.', art: aiWorkloadFanout },
  { name: 'ai-vector-recall', seed: 35037, focal: [960, 540], zoom: 1.19, center: [960, 540], title: 'Valkey vector recall', desc: 'A cloud of stored points around the white Valkey hexagon mark, with a bright dashed radius enclosing the nearest handful, each tethered to the centre while everything farther out stays dim, representing an embedding recalled by similarity rather than by key.', art: aiVectorRecall },
  { name: 'conn-storm-spike', seed: 36011, focal: [960, 620], zoom: 1.34, center: [960, 547], title: 'Valkey connection storms', desc: 'A timeline of connection attempts that is quiet, then spikes into a wall of simultaneous reconnects whose top rises in red above a dashed accept-capacity line, then falls quiet again, representing a connection storm.', art: connStormSpike },
  { name: 'conn-storm-jitter', seed: 36029, focal: [640, 540], zoom: 1.25, center: [880, 540], title: 'Valkey connection backoff jitter', desc: 'A tight vertical wall of simultaneous reconnect attempts in red on the left, fanning out to the right into a wide staggered spread of retries ending in green, representing backoff jitter spreading a connection storm out over time.', art: connStormJitter },
  { name: 'ops-fleet-triage', seed: 41011, focal: [960, 540], zoom: 1.15, center: [960, 540], title: 'Valkey operations at fleet scale', desc: 'A wide field of identical small Valkey hexagon marks representing many deployments, with three of them lit and framed by red corner brackets, representing picking out the few deployments that need attention.', art: opsFleetTriage },
  { name: 'ops-rolling-wave', seed: 41303, focal: [780, 540], zoom: 1.15, center: [900, 540], title: 'Valkey rolling fleet operation', desc: 'Columns of nodes across a fleet, the left ones green and finished, the right ones dim and waiting, and one column lit inside a bright capsule around the white Valkey hexagon mark, representing an operation rolling across a fleet one group at a time.', art: opsRollingWave },
  { name: 'bundle-crate', seed: 33101, focal: [960, 500], zoom: 1.2, center: [960, 540], title: 'Valkey bundle', desc: 'One bracketed package outline sealed with the white Valkey hexagon mark, holding six differently shaped module diagrams inside it, representing several separate modules shipped as a single bundle.', art: bundleCrate },
  { name: 'bundle-one-install', seed: 33207, focal: [760, 540], zoom: 1.2, center: [975, 540], title: 'Valkey bundle, one install', desc: 'A single tapering conduit arriving at a port marked with the white Valkey hexagon, fanning out into five differently shaped modules, representing one install that delivers several distinct capabilities.', art: bundleOneInstall },
  { name: 'tooling-stack', seed: 33311, focal: [960, 620], zoom: 1.25, center: [960, 540], title: 'Valkey primitives and tools', desc: 'A base course of identical small primitives with four differently detailed tools resting on runs of them, two larger composites above those, and the white Valkey hexagon mark at the top, representing tools built out of server primitives.', art: toolingStack },
  { name: 'tooling-recombine', seed: 33419, focal: [700, 540], zoom: 1.25, center: [910, 540], title: 'Valkey primitives recombined', desc: 'One highlighted primitive unit on the left wired to three assemblies of copies of itself on the right, a chain, a cycle and a branching tree, representing the same server primitive reused to build different tools.', art: toolingRecombine },
  { name: 'k8s-spec-fanout', seed: 42011, focal: [1150, 520], zoom: 1.34, center: [960, 540], title: 'Valkey deployed from a chart', desc: 'A declared specification panel on the left fanning out along rails into a grid of nine identical instances, each drawn as the white Valkey hexagon mark, representing deploying Valkey on Kubernetes from a Helm chart.', art: k8sSpecFanout },
  { name: 'k8s-desired-count', seed: 42021, focal: [960, 400], zoom: 1.34, center: [960, 540], title: 'Valkey replicas reaching the declared count', desc: 'Six declared slots under a gold span, four filled with instances drawn as the white Valkey hexagon mark, one instance rising into place and one slot still empty, representing a declared replica count and the running instances converging on it.', art: k8sDesiredCount },
  { name: 'limits-tight-envelope', seed: 42031, focal: [960, 540], zoom: 1.03, center: [960, 540], title: 'Valkey in a tight resource envelope', desc: 'A small bright box packed edge to edge with work around the white Valkey hexagon mark, pushing outward on all four walls, set inside two much larger dashed outlines, representing a full server running in far less space than usual.', art: limitsTightEnvelope },
  { name: 'limits-gauge-pinned', seed: 42041, focal: [960, 540], zoom: 1.34, center: [960, 540], title: 'Valkey pinned near its limit', desc: 'A large gauge around the white Valkey hexagon mark, filled from blue through green into gold and stopping just short of a red end zone, representing a small resource envelope run right up to its limit.', art: limitsGaugePinned },
  { name: 'az-zone-local-reads', seed: 42051, focal: [960, 560], zoom: 1.34, center: [960, 570], title: 'Valkey zone-local reads', desc: 'Three dashed availability zones, each with a client reading down a lit green path to the replica beside it drawn as the white Valkey hexagon mark, and the paths that would leave a zone dashed and struck out in red at the boundary.', art: azZoneLocalReads },
  { name: 'az-short-path', seed: 42061, focal: [900, 540], zoom: 1.26, center: [990, 540], title: 'Valkey in-zone read path', desc: 'A client taking one short lit green hop to the replica in its own zone, with two long dashed routes to replicas in other zones marked with red meter ticks and crosses, representing reading in-zone instead of across zones.', art: azShortPath },
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
