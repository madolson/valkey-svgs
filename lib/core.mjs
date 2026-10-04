// Core drawing utilities: the palette, the seeded rng, the atmosphere, the frame, the
// caption machinery, and the primitives every banner is built from. Everything a theme
// needs and nothing about any particular theme.
//
// Split out of a single 4600-line generate.mjs. That file made parallel work impossible:
// git interleaved two function bodies into broken JS when two branches were merged, and
// four agents died trying to read it in one call.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const LOGO = join(ROOT, 'assets', 'Valkey-logo.svg');
// The official horizontal lockup, mark plus wordmark, copied from
// valkey-io.github.io/static/img/valkey-horizontal.svg. Used for the corner stamp
// so the wordmark is the real one and not a font approximation.

// The official horizontal lockup, mark plus wordmark, copied from
// valkey-io.github.io/static/img/valkey-horizontal.svg. Used for the corner stamp
// so the wordmark is the real one and not a font approximation.
export const LOCKUP_FILE = join(ROOT, 'assets', 'valkey-horizontal.svg');

export const W = 1920;

export const H = 1080;

// Composition band, a framing guide rather than a hard limit. These are consumed
// as CSS `object-fit: cover` banners, so some of the edge always gets cropped.
// The tighter constraint is horizontal: see the note on `frame` below.

// Composition band, a framing guide rather than a hard limit. These are consumed
// as CSS `object-fit: cover` banners, so some of the edge always gets cropped.
// The tighter constraint is horizontal: see the note on `frame` below.
export const BAND_TOP = 250;

export const BAND_BOTTOM = 830;

// Brand palette, from sass/_colors.scss.

// Brand palette, from sass/_colors.scss.
export const C = {
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

// ---------------------------------------------------------------- primitives

// mulberry32: seeded so regenerating never churns the committed images.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const n = (v) => Math.round(v * 10) / 10;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The one typeface for the whole set. Every theme that draws text uses this and
// nothing else, so labels look like they came from the same system; weights are
// 700 for a title and 600 for a label. Text depends on the font resolving at
// render time, which makes those themes reproducible per-machine, not everywhere.

// The one typeface for the whole set. Every theme that draws text uses this and
// nothing else, so labels look like they came from the same system; weights are
// 700 for a title and 600 for a label. Text depends on the font resolving at
// render time, which makes those themes reproducible per-machine, not everywhere.
export const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function weighted(r, pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let t = r() * total;
  for (const [value, w] of pairs) {
    t -= w;
    if (t <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

export function arcPath(cx, cy, rad, a0, a1) {
  const at = (a) => [n(cx + rad * Math.cos(a)), n(cy + rad * Math.sin(a))];
  const [x0, y0] = at(a0);
  const [x1, y1] = at(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${rad} ${rad} 0 ${large} 1 ${x1} ${y1}`;
}

// The Valkey hexagon mark, read out of assets/Valkey-logo.svg so the artwork
// tracks the logo if it is ever updated.

// The Valkey hexagon mark, read out of assets/Valkey-logo.svg so the artwork
// tracks the logo if it is ever updated.
export const MARK = (() => {
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

// The official lockup, read the same way the mark is. `cls-2` is the hexagon and
// carries fill-rule evenodd; `cls-1` is the wordmark. Both are recoloured to one
// fill here, because these banners sit on dark ground and the brand's two-tone
// version is drawn for light.
export const LOCKUP = (() => {
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

// The lockup, top-left cornered at (x, y) and scaled to the given height.
export function lockup(x, y, height, fill = '#FFFFFF') {
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

// The mark, centred on (cx, cy) at the given height. `fill-rule` is what hollows
// out the hexagon, so it has to be carried over from the source logo.
export function mark(cx, cy, height, fill = '#FFFFFF') {
  const s = height / MARK.vh;
  return (
    `<g transform="translate(${n(cx - (MARK.vw * s) / 2)} ${n(cy - height / 2)}) scale(${s.toFixed(4)})">` +
    `<path d="${MARK.d}" fill="${fill}" fill-rule="evenodd"/></g>`
  );
}

// A glowing dot: soft halo plus a solid core. Drop `halo` for tightly packed
// runs of dots, where the default bloom overlaps into a haze.

// A glowing dot: soft halo plus a solid core. Drop `halo` for tightly packed
// runs of dots, where the default bloom overlaps into a haze.
export function dot(x, y, rad, color, key, opacity = 1, halo = 4.5) {
  return (
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad * halo)}" fill="url(#h-${key})" opacity="${n(opacity * 0.7)}"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${color}" opacity="${n(opacity)}"/>`
  );
}

// --------------------------------------------------------------- atmosphere

// --------------------------------------------------------------- atmosphere

export function defs() {
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

// Themes are drawn on the full 1920x1080 grid, then framed. `zoom` crops in on a
// sub-rectangle of that grid so the motif fills more of the frame; `center` moves
// the crop off-centre when a composition isn't symmetric. Output stays 1920x1080.
//
// Mind the horizontal safe area when raising a zoom. On desktop the post page
// renders 810x400 and crops height; below 1024px it renders 200px tall in a much
// narrower column, so the crop flips to horizontal and keeps only the middle ~70%
// of the width. Anything that must stay whole (the mark, a label) belongs between
// 15% and 85% of the framed width. Streaks, chevrons and graph edges can bleed.
export function frameBox(theme) {
  const zoom = theme.zoom ?? 1;
  const vw = W / zoom;
  const vh = H / zoom;
  const [cx, cy] = theme.center ?? [W / 2, H / 2];
  return { vx: clamp(cx - vw / 2, 0, W - vw), vy: clamp(cy - vh / 2, 0, H - vh), vw, vh };
}

export function frame(theme) {
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
export const CAPTION_SLOT = { left: 0.05, bottom: 0.075, size: 62, gap: 8, padX: 22, padY: 13 };

// Rough advance widths, enough to size a block around a line of Helvetica. Getting
// this wrong by a few percent shows up as uneven padding, not as broken layout.

// Rough advance widths, enough to size a block around a line of Helvetica. Getting
// this wrong by a few percent shows up as uneven padding, not as broken layout.
export const GLYPH_W = { i: 0.27, j: 0.27, l: 0.27, t: 0.35, f: 0.32, r: 0.38, ' ': 0.29, m: 0.88, w: 0.76, M: 0.9, W: 0.96, I: 0.29 };

export function textWidth(str, size) {
  let em = 0;
  for (const c of str) em += GLYPH_W[c] ?? (c === c.toUpperCase() && c !== c.toLowerCase() ? 0.7 : 0.58);
  return em * size;
}

// Wrap a title into at most two sticker lines. 32 characters is the smallest limit
// that fits the longest title in the set into two, and it puts the widest block at
// 1038 of the 1920; short theme titles still land on one line. Overflowing throws
// rather than silently dropping the tail.

// Wrap a title into at most two sticker lines. 32 characters is the smallest limit
// that fits the longest title in the set into two, and it puts the widest block at
// 1038 of the 1920; short theme titles still land on one line. Overflowing throws
// rather than silently dropping the tail.
export function captionLines(text, max = 32) {
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

export function captionBlocks(theme, text) {
  const { vx, vy, vw, vh } = frameBox(theme);
  // captionScale enlarges one theme's sticker, padding and all, from the same corner.
  const px = (vh / H) * (theme.captionScale ?? 1);
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

export function stamp(theme) {
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

// One background for the whole set: the sky gradient, a vignette and film grain.
// There used to be three settings here (a focal glow, `flat` without it, and
// `solid` with no gradient at all) and the result was that no two banners sat on
// the same ground. The gradient is the ground now, everywhere, and the only thing
// a theme varies is what it draws on top. The stamp and the caption sit above the
// vignette, because they are chrome rather than art and the vignette was visibly
// darkening the outer end of every caption block.
export function wrap(theme, art, { chrome = true } = {}) {
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

// Faint far-field specks. Only the space themes get them now: on everything else a
// purple gradient with scattered stars was the most generic thing in the set.
//
// The PRNG draws happen either way. Returning the stars or dropping them is decided
// after the fact, so suppressing them cannot shift anything else a theme draws.
// Shared mutable state, and the one piece of coupling left in here. The pipeline sets it
// per theme before wrap(); starfield() reads it and returns nothing when it is false.
//
// 27 of the 38 themes call starfield() while declaring no `space`, so in those the call
// emits nothing. Do NOT delete those calls to tidy this up: starfield(r, n) advances the
// seeded rng whether or not it draws, so removing one reshuffles every subsequent random
// value in that theme. Tried it; it silently redrew 27 banners. Breaking this properly
// means accepting those redraws, which is a decision about the artwork, not a refactor.
export let SPACE = false;

export function starfield(r, count = 90) {
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

// SPACE is set per theme by the pipeline before wrap(), and read by starfield(). It was
// a bare module-level `let` in the single file; splitting makes the write explicit.
export function setSpace(v) { SPACE = v; }
