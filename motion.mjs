#!/usr/bin/env node
//
// Generates the animated Valkey banners.
//
// These sit alongside the static set in generate.mjs and share its atmosphere: the same
// navy-to-purple sky, the same vignette, film grain, corner lockup and caption blocks. What
// they do not share is the drawing surface. A static banner is SVG; a motion banner is a
// canvas, because the thing that makes glowing particles read as light is additive
// compositing -- `globalCompositeOperation = 'lighter'`, so overlapping glows sum toward
// white. SVG has no additive blend mode. Its `feGaussianBlur` + `feMerge` halos composite
// *over*, which is why a dense field of them in the blackhole themes saturates into flat
// haze instead of getting brighter. That is a format limit, not a tuning problem, and it is
// the whole reason this file exists.
//
// Output per theme:
//   html/<theme>.html            the source, self-contained; open it and it loops live
//   motion/<theme>.webp          animated WebP, 1280x720, seamless
//   motion/<theme>-poster.webp   one still at the theme's `poster` time, 1920x1080
//
// Usage: node motion.mjs [theme ...] [--force] [--fps 24] [--width 1280]
//
// Requires a Chrome-based browser and Python with Pillow, same as generate.mjs. Frames are
// captured through the DevTools protocol rather than one `--screenshot` per frame, because a
// four-second loop is a hundred frames and a hundred Chrome launches is two minutes of
// process spawning.
//
// EVERY FRAME IS A PURE FUNCTION OF TIME. No theme integrates state between frames. A dot's
// position, size and opacity are closed-form in its age, and its age is taken modulo the loop
// period, which is what makes the loop seamless rather than approximately seamless: frame 0
// and frame N are the same pixels because they are the same expression. It also means a
// dropped frame cannot drift the render, and `?t=` in the browser is exact.

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_DIR = join(HERE, 'html');
const MOTION_DIR = join(HERE, 'motion');
const CACHE_FILE = join(HERE, '.motion-cache.json');

// The art grid, same as the static set: a theme draws on 1920x1080 and is then framed.
const W = 1920;
const H = 1080;

// Brand palette. Copied from generate.mjs, which copied it from sass/_colors.scss. Two
// copies is one more than ideal, but generate.mjs is a script that renders on import, so
// there is nothing to import from without restructuring it.
const C = {
  ink: '#060A24',
  mid: '#171043',
  deep: '#301868',
  cyan: '#00A3E0',
  cyanLt: '#46BDE9',
  ice: '#CCF1FF',
  mint: '#2CD5C4',
  coral: '#F65275',
  violet: '#963CBD',
  gold: '#FFB81C',
};

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// The mark and the lockup are read out of the same files generate.mjs reads, so the artwork
// tracks the logo. Canvas takes the path strings directly through Path2D.
function svgPaths(file) {
  const svg = readFileSync(join(HERE, 'assets', file), 'utf8');
  const box = /viewBox="([-\d.\s]+)"/.exec(svg);
  if (!box) throw new Error(`No viewBox in ${file}`);
  const [, , vw, vh] = box[1].trim().split(/\s+/).map(Number);
  return { svg, vw, vh };
}

const MARK = (() => {
  const { svg, vw, vh } = svgPaths('Valkey-logo.svg');
  const d = /\sd="([^"]+)"/.exec(svg);
  if (!d) throw new Error('No path in Valkey-logo.svg');
  return { d: d[1], vw, vh };
})();

const LOCKUP = (() => {
  const { svg, vw, vh } = svgPaths('valkey-horizontal.svg');
  const paths = [...svg.matchAll(/<path[^>]*class="(cls-[12])"[^>]*\sd="([^"]+)"/g)].map((m) => m[2]);
  if (paths.length < 2) throw new Error("Expected the lockup's two paths");
  return { paths, vw, vh };
})();

// --------------------------------------------------------------- the runtime
//
// Everything in RUNTIME runs in the page, not in Node. It is one template literal, so nothing
// inside it may contain a backtick or a ${ -- not even in a comment. Theme code is embedded by
// interpolation instead, so themes are free to use both.
//
// A theme is two functions. `setup(R)` runs once and returns whatever static layout the
// theme needs; it is the only place a PRNG is allowed, so the layout cannot drift between
// frames. `draw(g, t, u, s, R)` runs per frame with `g` already transformed into framed
// coordinates on the 1920x1080 grid, `t` in seconds within the loop, `u` the loop phase in
// [0,1), and `s` whatever setup returned.

const RUNTIME = `
const W = 1920, H = 1080;
const TAU = Math.PI * 2;

// mulberry32, the same generator the static set uses.
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash to [0,1). Used for per-particle jitter that has to be recoverable from an
// index alone, with no array to store it in and no order to depend on.
function hash(i) {
  i = (i ^ 61) ^ (i >>> 16);
  i = i + (i << 3);
  i ^= i >>> 4;
  i = Math.imul(i, 0x27d4eb2d);
  i ^= i >>> 15;
  return (i >>> 0) / 4294967296;
}

const lerp = (a, b, x) => a + (b - a) * x;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

// The framed box. Themes draw on the full grid; zoom crops in on it, center moves the crop.
// Same arithmetic as generate.mjs's frameBox, so a motion theme frames like a static one.
const FRAME = (() => {
  const zoom = THEME.zoom || 1;
  const vw = W / zoom, vh = H / zoom;
  const cx = (THEME.center || [W / 2, H / 2])[0], cy = (THEME.center || [W / 2, H / 2])[1];
  return { vx: clamp(cx - vw / 2, 0, W - vw), vy: clamp(cy - vh / 2, 0, H - vh), vw, vh };
})();

const cv = document.getElementById('art');
const DPR = Math.max(1, window.devicePixelRatio || 1);
// ?w= is the logical width; the backing store is that times the device pixel ratio, so the
// capture harness gets a supersampled render by asking Chrome for a device scale factor
// rather than for a viewport it may refuse to allocate.
const OUT_W = Number(new URLSearchParams(location.search).get('w')) || THEME.renderWidth;
const OUT_H = Math.round(OUT_W * H / W);
cv.style.width = OUT_W + 'px';
cv.style.height = OUT_H + 'px';
cv.width = Math.round(OUT_W * DPR);
cv.height = Math.round(OUT_H * DPR);
const g = cv.getContext('2d');

// One transform for the whole scene: device pixels, then output scale, then the frame crop.
// Set fresh every frame so a theme that leaves the matrix dirty cannot corrupt the next one.
function reset() {
  const s = (OUT_W * DPR) / FRAME.vw;
  g.setTransform(s, 0, 0, s, -FRAME.vx * s, -FRAME.vy * s);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

// One glow sprite per tint, pre-rendered once and stamped additively. This is the whole
// trick: a stamped sprite under 'lighter' costs one drawImage and overlapping stamps sum,
// where shadowBlur costs a real blur per call and an SVG halo composites over.
const SPRITES = {};
// A soft sprite drops the white core and paints itself in its own colour throughout. It matters
// for anything drawn as a dense low-alpha field: a white core added a few hundred times over
// the purple ground just lightens it toward lavender, and the tint never gets a say. Without
// the core, the accumulation is the tint's colour and only saturation drives it to white,
// which is what a glowing gas actually does. Discrete dots keep the core; it reads as heat.
function sprite(hex, soft) {
  const key = hex + (soft ? 's' : 'h');
  if (SPRITES[key]) return SPRITES[key];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const q = c.getContext('2d');
  const r = parseInt(hex.slice(1, 3), 16), gg = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const rgba = (o) => 'rgba(' + r + ',' + gg + ',' + b + ',' + o + ')';
  const rg = q.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    rg.addColorStop(0, rgba(1));
    rg.addColorStop(0.45, rgba(0.42));
    rg.addColorStop(1, rgba(0));
  } else {
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.20, 'rgba(' + [lerp(r, 255, 0.55) | 0, lerp(gg, 255, 0.55) | 0, lerp(b, 255, 0.55) | 0] + ',0.92)');
    rg.addColorStop(0.52, rgba(0.36));
    rg.addColorStop(1, rgba(0));
  }
  q.fillStyle = rg;
  q.fillRect(0, 0, 64, 64);
  SPRITES[key] = c;
  return c;
}

// Stamp a glow. Stretching the destination rectangle is the motion blur: a dot travelling
// fast is drawn as a long thin sprite, which is what a real exposure would record.
function stamp(x, y, w, h, alpha, hex, soft) {
  if (alpha <= 0.002) return;
  g.globalAlpha = alpha;
  g.drawImage(sprite(hex || '#CCF1FF', soft), x - w / 2, y - h / 2, w, h);
}

// Scope an additive pass. Anything drawn inside sums with what is under it.
function additive(fn) {
  const prev = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  fn();
  g.globalAlpha = 1;
  g.globalCompositeOperation = prev;
}

const MARK_PATH = new Path2D(MARK_D);
// The mark, centred, at the given height. fill-rule evenodd is what hollows the hexagon out.
function mark(cx, cy, height, fill) {
  const s = height / MARK_VH;
  g.save();
  g.translate(cx - (MARK_VW * s) / 2, cy - height / 2);
  g.scale(s, s);
  g.fillStyle = fill || '#FFFFFF';
  g.fill(MARK_PATH, 'evenodd');
  g.restore();
}

// A soft dark disc, for putting the white mark on top of a bright field without the white
// washing out. The static set's url(#scrim) circle, in canvas form.
function scrim(cx, cy, r, strength) {
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  rg.addColorStop(0, 'rgba(6,10,36,' + (strength === undefined ? 0.72 : strength) + ')');
  rg.addColorStop(0.6, 'rgba(6,10,36,' + (strength === undefined ? 0.45 : strength * 0.62) + ')');
  rg.addColorStop(1, 'rgba(6,10,36,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.fill();
}

// A broad soft light, for putting behind the mark. The static set gets this out of a blur
// filter; here it is one stamped sprite, which is the same picture for a hundredth of the cost.
function bloom(cx, cy, r, alpha, hex) {
  const prev = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  stamp(cx, cy, r * 2, r * 2, alpha, hex || '#46BDE9');
  g.globalAlpha = 1;
  g.globalCompositeOperation = prev;
}

const R = { W, H, TAU, C, rand, hash, lerp, clamp, smooth, stamp, additive, mark, scrim, bloom, sprite, T: THEME.loop, frame: FRAME };

// ------------------------------------------------------------- atmosphere

// One background for the whole set, matching generate.mjs's wrap(): the sky gradient, then
// the motif, then a vignette, then film grain, then the chrome above all of it.
function sky() {
  const lg = g.createLinearGradient(0, 0, 0.32 * W, H);
  lg.addColorStop(0, C.ink);
  lg.addColorStop(0.48, C.mid);
  lg.addColorStop(1, C.deep);
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);
}

function vignette() {
  const rg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 1180);
  rg.addColorStop(0.5, 'rgba(3,4,15,0)');
  rg.addColorStop(1, 'rgba(3,4,15,0.8)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
}

// Grain is generated once at device resolution and re-drawn identically every frame. Static
// on purpose: animated grain would flicker, and worse, it would make every frame differ
// everywhere and destroy the encoder's interframe compression.
const GRAIN = (() => {
  const c = document.createElement('canvas');
  c.width = cv.width;
  c.height = cv.height;
  const q = c.getContext('2d');
  const img = q.createImageData(c.width, c.height);
  const d = img.data, r = rand(70707);
  for (let i = 0; i < d.length; i += 4) {
    const v = (r() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  q.putImageData(img, 0, 0);
  return c;
})();

function grain() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.055;
  g.drawImage(GRAIN, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

// Faint far-field specks, only on the space themes, same rule as the static set.
const STARS = (() => {
  if (!THEME.space) return [];
  const r = rand(THEME.seed ^ 0x5f5f), out = [];
  for (let i = 0; i < 90; i++) out.push([r() * W, r() * H, 0.8 + r() * 1.9, 0.08 + r() * 0.3]);
  return out;
})();

function stars() {
  g.fillStyle = C.ice;
  for (const s of STARS) {
    g.globalAlpha = s[3];
    g.beginPath();
    g.arc(s[0], s[1], s[2], 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------- chrome
//
// The lockup and the caption blocks sit above the vignette, in framed coordinates, at the
// same rendered size whatever the zoom -- exactly as stamp() and captionBlocks() place them
// in generate.mjs. Positions are the same fractions, so a motion banner and a static one
// line up if you cross-fade them.

const LOCKUP_PATHS = LOCKUP_D.map((d) => new Path2D(d));
function drawLockup() {
  const px = FRAME.vh / H;
  const height = 88 * px;
  const s = height / LOCKUP_VH;
  g.save();
  g.globalAlpha = 0.95;
  g.translate(FRAME.vx + 0.042 * FRAME.vw, FRAME.vy + 0.055 * FRAME.vh);
  g.scale(s, s);
  g.fillStyle = '#FFFFFF';
  for (let i = 0; i < LOCKUP_PATHS.length; i++) g.fill(LOCKUP_PATHS[i], i === 0 ? 'nonzero' : 'evenodd');
  g.restore();
}

const SLOT = { left: 0.05, bottom: 0.075, size: 62, gap: 8, padX: 22, padY: 13 };

function captionLines(text, max) {
  const words = String(text).split(/\\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (next.length > (max || 32) && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > 2) throw new Error('Caption needs ' + lines.length + ' lines, the slot holds 2');
  return lines;
}

function drawCaption(text) {
  const px = FRAME.vh / H;
  const size = SLOT.size * px, padX = SLOT.padX * px, padY = SLOT.padY * px, gap = SLOT.gap * px;
  const lines = captionLines(text);
  g.font = '600 ' + size + 'px ' + FONT;
  g.textBaseline = 'alphabetic';
  const blockH = size + padY * 2;
  const x = FRAME.vx + SLOT.left * FRAME.vw;
  const bottom = FRAME.vy + FRAME.vh - SLOT.bottom * FRAME.vh;
  const top = bottom - lines.length * blockH - (lines.length - 1) * gap;
  const rx = 4 * px;
  const boxes = lines.map((l, i) => ({ y: top + i * (blockH + gap), w: g.measureText(l).width + padX * 2 }));

  // Three shadow passes per block, tight then mid then a broad low pool. The ground is
  // already dark, so one shadow that would be obvious on white barely registers here.
  // Cast onto the artwork, not onto each other, so every shadow is drawn before every block.
  g.save();
  for (const pass of [[26, 40, 0.55], [10, 18, 0.5], [4, 8, 0.55]]) {
    g.shadowColor = 'rgba(6,10,36,' + pass[2] + ')';
    g.shadowBlur = pass[1] * px * 2;
    g.shadowOffsetY = pass[0] * px;
    g.fillStyle = 'rgba(6,10,36,' + pass[2] + ')';
    for (const b of boxes) { g.beginPath(); g.roundRect(x, b.y, b.w, blockH, rx); g.fill(); }
  }
  g.restore();

  for (let i = 0; i < lines.length; i++) {
    g.fillStyle = C.ice;
    g.beginPath();
    g.roundRect(x, boxes[i].y, boxes[i].w, blockH, rx);
    g.fill();
    g.fillStyle = C.ink;
    g.fillText(lines[i], x + padX, boxes[i].y + padY + size * 0.79);
  }
}

// ------------------------------------------------------------- the frame

const STATE = SETUP(R);

// The one entry point. Called by the capture harness with an exact time, and by the live
// loop with the wall clock. t is wrapped into the loop, so t and t + loop are identical.
function frameAt(time) {
  const t = ((time % THEME.loop) + THEME.loop) % THEME.loop;
  reset();
  sky();
  if (STARS.length) stars();
  DRAW(g, t, t / THEME.loop, STATE, R);
  reset();
  vignette();
  grain();
  reset();
  drawLockup();
  if (THEME.caption) drawCaption(THEME.caption);
  return 'ok';
}
window.frameAt = frameAt;

// ?t=SECONDS renders one frame and stops, which is how the poster and every captured frame
// are taken. Without it the banner loops live off the wall clock, so opening the file in a
// browser shows the published animation and nothing else has to be built to preview it.
const q = new URLSearchParams(location.search);
if (q.get('t') !== null) {
  frameAt(parseFloat(q.get('t')));
} else {
  const t0 = performance.now();
  const tick = () => { frameAt((performance.now() - t0) / 1000); requestAnimationFrame(tick); };
  tick();
}
`;

// ------------------------------------------------------------------- themes
//
// A theme's setup and draw are serialised with Function.prototype.toString and embedded in
// the page, so they can only use the runtime's globals and whatever setup returns. They must
// not close over anything in this file. Every one of them is a pure function of time.
//
// SEAMLESS LOOPING, the two techniques used here:
//
//   Streams. A stream emits N dots per loop at fixed phases n/N. A dot's age is
//   (t - n*T/N) mod T, and it is drawn only while age < lifetime. Because the age is taken
//   modulo the period and the lifetime is shorter than the period, the set of visible dots
//   at t and at t + T is the same set in the same places.
//
//   Orbits. A ring of m particles evenly spaced in angle is unchanged by a rotation of
//   2*pi/m, so a band may rotate any integer number of slots per loop: omega = 2*pi*j/(m*T).
//   With m = 48 that is 48 available speeds per revolution, fine enough to read as Keplerian
//   shear. The catch is that particles within a band must be identical, or rotating by one
//   slot would move a particle's own jitter with it. Appearance therefore varies by *screen
//   position* rather than by particle identity, which costs nothing: any function of position
//   is invariant under the band's rotation, so Doppler, lensing and colour gradients are all
//   still available.

// -- Client streams. The server serving: clients dock on a padding hexagon around the mark
// and glowing dots pour outward down every connection. Lifted from the sign-on prototype's
// CONNECT mode and re-cut as a loop, which means dropping the one-time arrival and keeping
// the steady state: connections held, dots streaming, ports twinkling on a stagger.
function clientStreamsSetup(R) {
  const cx = 960, cy = 486, markH = 292;
  // The padding hexagon the lines stop at: the mark's own outer hexagon, pushed out far
  // enough to leave a visible gap. Pointy-top, so its left and right sides are vertical.
  // Nobody draws it; the line endpoints trace it, which is a stronger read than an outline.
  const pad = 1.62;
  const HEX = { apex: markH * 0.489 * pad, hw: markH * 0.418 * pad, vh: markH * 0.243 * pad };
  const halfWidth = (dy) => {
    dy = Math.abs(dy);
    return dy <= HEX.vh ? HEX.hw : HEX.hw * (HEX.apex - dy) / (HEX.apex - HEX.vh);
  };
  const r = R.rand(9101), lines = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 14; k++) {
      const dy = (k - 6.5) * 30;
      const stopX = cx + side * halfWidth(dy);
      const edgeX = side < 0 ? 0 : R.W;
      lines.push({
        side, y: cy + dy, stopX, edgeX,
        D: Math.abs(edgeX - stopX),
        alpha: 0.1 + r() * 0.11,
        twinkle: r(),                       // this port's phase within the loop
        // Emission phase, per line. Without it every line emits on the same beat and the
        // whole field reads as a grid of columns rather than as 28 independent streams.
        // This one offset is the difference between traffic and texture.
        offset: r(),
        // Mostly ice, a fifth of them coloured, the same restraint the static set uses to
        // keep a field of strokes from turning into confetti.
        tint: r() < 0.2 ? [R.C.cyanLt, R.C.mint, R.C.gold, R.C.coral][(r() * 4) | 0] : R.C.ice,
      });
    }
  }
  return { cx, cy, markH, lines, perLoop: 22, life: 1.15, v0: 300, acc: 1500 };
}

function clientStreamsDraw(g, t, u, s, R) {
  const T = R.T;

  // The connections themselves: held, not animated. They are the quiet layer that makes the
  // moving dots read as traffic on a wire rather than as sparks in space.
  g.lineWidth = 1.4;
  g.lineCap = 'round';
  for (const l of s.lines) {
    g.strokeStyle = 'rgba(70,189,233,' + l.alpha.toFixed(3) + ')';
    g.beginPath();
    g.moveTo(l.edgeX, l.y);
    g.lineTo(l.stopX, l.y);
    g.stroke();
  }

  R.additive(() => {
    for (let li = 0; li < s.lines.length; li++) {
      const l = s.lines[li];
      R.stamp(l.stopX, l.y, 13, 13, 0.4, l.tint);                     // the port, lit

      // One twinkle per port per loop, phases spread so the ring is never quiet and never
      // busy. A cross rather than a blob, because a blob is just a brighter port.
      const tw = ((u - l.twinkle) % 1 + 1) % 1 / 0.13;
      if (tw < 1) {
        const k = 1 - tw;
        R.stamp(l.stopX, l.y, 16 + 54 * k, 16 + 54 * k, k * 0.75, l.tint);
        g.globalAlpha = k * 0.7;
        g.strokeStyle = '#FFFFFF';
        g.lineWidth = 1.2;
        const rr = 8 + 30 * k;
        g.beginPath();
        g.moveTo(l.stopX - rr, l.y); g.lineTo(l.stopX + rr, l.y);
        g.moveTo(l.stopX, l.y - rr); g.lineTo(l.stopX, l.y + rr);
        g.stroke();
      }

      // The stream. Dots leave slow and get flung, stretching into long thin dashes as they
      // speed up, which is what an exposure of something accelerating actually records.
      for (let n = 0; n < s.perLoop; n++) {
        const a = ((t - ((n + l.offset) * T) / s.perLoop) % T + T) % T;
        if (a > s.life) continue;
        const h0 = R.hash(li * 7919 + n * 4), h1 = R.hash(li * 7919 + n * 4 + 1);
        const h2 = R.hash(li * 7919 + n * 4 + 2), h3 = R.hash(li * 7919 + n * 4 + 3);
        const sf = 0.8 + 0.4 * h0;
        const d = s.v0 * sf * a + 0.5 * s.acc * sf * a * a;
        if (d >= l.D) continue;
        const v = s.v0 * sf + s.acc * sf * a;
        const len = Math.min(150, 12 + v * 0.055);
        const size = 5 + 3 * h1;
        // Fade in over the first stretch so a dot does not pop into being on the hexagon,
        // and out well before the frame edge so nothing gets clipped.
        const alpha = (0.5 + 0.5 * h2) * R.smooth(0, 0.1, d / l.D) * (1 - R.smooth(0.62, 0.98, d / l.D));
        const lead = l.stopX + l.side * d;
        R.stamp(lead - (l.side * len) / 2, l.y + (h3 - 0.5) * 3, len, size, alpha, l.tint);
      }
    }
  });

  // The mark reads as the source of the light, so it gets a bloom rather than a scrim. Kept
  // low: a wide bright core here washes out the ring of ports, which is the whole motif.
  R.bloom(s.cx, s.cy, s.markH * 1.05, 0.16, R.C.cyanLt);
  R.mark(s.cx, s.cy, s.markH);
}

// -- Black hole, particles instead of ribbons. Same subject as blackhole-gargantua, drawn as
// a few thousand additive orbiting particles rather than stacked SVG arcs. The disk is a
// luminous fluid because the glows sum; that is the comparison this theme exists to make.
function blackholeSetup(R) {
  const cx = 960, cy = 520;
  // Almost edge on, matching blackhole-gargantua. A moderate tilt turns the disk into a
  // filled lens covering half the frame; at 84 degrees it is a band, which is both the
  // recognisable picture and the one the shipped static theme already settled on.
  const cosI = Math.cos((84 * Math.PI) / 180);
  // The shadow is large and the disk runs off both edges, again following the static theme.
  // A small shadow reads as a planet with a ring rather than as a hole.
  const rs = 272;
  const rIn = rs * 1.13, rOut = 1120;
  const r = R.rand(52041), bands = [];
  for (let i = 0; i < 300; i++) {
    // Radii biased inward, which is where a real disk's brightness is.
    const rad = rIn + (rOut - rIn) * Math.pow(i / 299, 1.5) + (r() - 0.5) * 6;
    // Particles per band scale with the radius, so the spacing along a band is the same
    // everywhere. A fixed count leaves the outer bands with gaps between stamps, which is
    // what turns a disk into a dotted lattice.
    const m = Math.round(R.clamp(105 * (rad / rIn), 105, 520));
    // Keplerian: revolutions per loop fall off as r^-1.5, quantised to whole slots so the
    // band lands back on itself at the end of the loop. With m in the hundreds the quantum
    // is a fraction of a percent of a revolution, so the shear reads as continuous.
    const revs = 2.6 / Math.pow(rad / rIn, 1.5);
    bands.push({ r: rad, phase: r() * R.TAU, j: Math.max(3, Math.round(revs * m)), m });
  }
  return { cx, cy, cosI, rs, rIn, rOut, bands, markH: 205 };
}

function blackholeDraw(g, t, u, s, R) {
  const TAU = R.TAU;

  // The far half of the disk is lensed up over the shadow; the near half crosses in front of
  // it. Both are the same particles, split by which side of the line of sight they are on.
  //
  // The far side's offset is the flat disk's own offset plus a lift that dies away with
  // radius. sin(th)^0.55 rather than sin(th) is the whole shape of it: the lift has to reach
  // zero at th = 0 and pi so the two images join at the disk's outer edge instead of meeting
  // at a crease, but it has to rise fast enough off zero to carry the arc clear of the
  // shadow. Where it does not clear, the particle is behind the hole, and the shadow -- drawn
  // after this pass -- correctly hides it.
  const project = (rad, sn) => {
    if (sn > 0) {
      const lift = s.rs * 1.3 * Math.exp(-(rad - s.rIn) / (2.4 * s.rIn));
      return s.cy - (sn * rad * s.cosI + lift * Math.pow(sn, 0.55));
    }
    return s.cy - sn * rad * s.cosI;
  };

  const half = (far) => {
    for (const b of s.bands) {
      const q = (b.r - s.rIn) / (s.rOut - s.rIn);
      // White hot at the inner edge, through gold, to red at the rim. Gold carries most of
      // the disk: it is the colour the shipped static theme is recognised by.
      const tint = q < 0.26 ? '#FFFFFF' : q < 0.82 ? R.C.gold : R.C.coral;
      const fall = Math.pow(s.rIn / b.r, 1.1) * (1 - R.smooth(0.82, 1, q));
      const size = R.lerp(42, 82, q);
      const sizeY = size * R.lerp(0.4, 0.7, q);
      const step = TAU / b.m;
      const spin = b.phase + (TAU * b.j * u) / b.m;
      for (let k = 0; k < b.m; k++) {
        const th = spin + k * step;
        const sn = Math.sin(th), cs = Math.cos(th);
        if (far !== sn > 0) continue;
        // Brightness is a function of screen position only, never of which particle this is.
        // That is what keeps a rotating band identical to itself one slot on, and it is why
        // the edge-on concentration below is free.
        //
        // Kept shallow. A stronger term is closer to real column density, but it dims exactly
        // the particles that cross in front of the shadow, which is the one part of the disk
        // that has to stay legible.
        const edgeOn = 0.62 + 0.38 * Math.abs(cs);
        R.stamp(s.cx + b.r * cs, project(b.r, sn), size, sizeY, 0.03 * fall * edgeOn * (far ? 0.85 : 1), tint, true);
      }
    }
  };

  R.additive(() => half(true));

  // The shadow. Hard-edged and pure black: it is the one thing in the frame that emits
  // nothing, and softening it reads as fog rather than as an event horizon.
  g.fillStyle = '#000000';
  g.beginPath();
  g.arc(s.cx, s.cy, s.rs, 0, TAU);
  g.fill();

  // The photon ring, closing all the way round the shadow. Still, because it is light on a
  // fixed orbit and spinning it would be a lie. The alpha looks implausibly low because the
  // samples sit 5px apart under a 20px sprite: every point on the ring is the sum of four.
  R.additive(() => {
    const rp = s.rs * 1.035;
    for (let i = 0; i < 360; i++) {
      const th = (i / 360) * TAU;
      R.stamp(s.cx + rp * Math.cos(th), s.cy + rp * Math.sin(th), 20, 20, 0.05 + 0.05 * Math.abs(Math.cos(th)), '#FFFFFF');
    }
  });

  R.additive(() => half(false));

  // The mark sits inside the shadow, so it gets the shadow back rather than a bloom: the near
  // side of the disk crosses in front of the hole and would otherwise cut across the mark.
  R.scrim(s.cx, s.cy, s.rs * 0.8, 0.9);
  R.mark(s.cx, s.cy, s.markH);
}

// -- Cluster gossip. Shards on a tilted ring around a slot ring, trading messages. The plane
// is tilted rather than flat so the ring reads as a ring, and so the lowest shards stay above
// the caption slot; a flat circle wide enough to be legible puts a node behind the blocks.
function gossipSetup(R) {
  const cx = 960, cy = 460;
  const rx = 520, ry = 328;              // the shard ellipse
  const n = 7;                           // odd, so no two shards are ever mirror images
  const r = R.rand(31337);
  const shards = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * R.TAU;
    shards.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), a, replicas: 2 });
  }
  // Every ordered pair gossips, which is what a full mesh is. Each edge carries its own
  // whole number of messages per loop so its traffic closes.
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let k = i + 1; k < n; k++) {
      const trips = 1 + ((r() * 3) | 0);
      edges.push({ a: i, b: k, trips, phase: r(), dir: r() < 0.5 ? 1 : -1, tint: r() < 0.25 ? R.C.mint : R.C.cyanLt });
    }
  }
  return { cx, cy, rx, ry, shards, edges, markH: 210, slotRx: 300, slotRy: 189, slots: 128 };
}

function gossipDraw(g, t, u, s, R) {
  const TAU = R.TAU;

  // The slot ring: 128 ticks on the same tilted plane, with one highlight sweeping round per
  // loop. The sweep is the only thing that says which way the ring turns. Brightness only --
  // the first pass grew the lit ticks as well, and a run of longer ticks on a tilted ellipse
  // reads as a torn edge rather than as a highlight.
  // Ticks run a fixed 15px along the ellipse's outward normal. Stepping a fixed *fraction* of
  // the radius instead makes them 14px wide at the sides and 9px tall at the top, and the
  // ring reads as sloppy rather than as tilted.
  g.lineWidth = 3;
  for (let i = 0; i < s.slots; i++) {
    const a = (i / s.slots) * TAU;
    const lit = 1 - R.smooth(0, 0.2, ((i / s.slots - u) % 1 + 1) % 1);
    const c = Math.cos(a), sn = Math.sin(a);
    const x = s.cx + s.slotRx * c, y = s.cy + s.slotRy * sn;
    const nx = s.slotRy * c, ny = s.slotRx * sn, nl = Math.hypot(nx, ny) || 1;
    g.strokeStyle = 'rgba(204,241,255,' + (0.09 + 0.62 * lit).toFixed(3) + ')';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (nx / nl) * 15, y + (ny / nl) * 15);
    g.stroke();
  }

  // The mesh, held faintly so the message paths are legible when nothing is on them.
  g.lineWidth = 1.3;
  g.strokeStyle = 'rgba(70,189,233,0.13)';
  for (const e of s.edges) {
    const A = s.shards[e.a], B = s.shards[e.b];
    g.beginPath();
    g.moveTo(A.x, A.y);
    g.lineTo(B.x, B.y);
    g.stroke();
  }

  // Messages, and the arrival flash each one triggers. Both are closed-form in the loop
  // phase, so a shard's pulse is exactly as periodic as the traffic causing it.
  const flash = new Float64Array(s.shards.length);
  R.additive(() => {
    for (let ei = 0; ei < s.edges.length; ei++) {
      const e = s.edges[ei];
      const A = s.shards[e.a], B = s.shards[e.b];
      const from = e.dir > 0 ? A : B, to = e.dir > 0 ? B : A;
      const toIdx = e.dir > 0 ? e.b : e.a;
      for (let k = 0; k < e.trips; k++) {
        const p = ((u * e.trips - e.phase - k) % 1 + 1) % 1;
        const x = R.lerp(from.x, to.x, p), y = R.lerp(from.y, to.y, p);
        const fade = R.smooth(0, 0.08, p) * (1 - R.smooth(0.9, 1, p));
        R.stamp(x, y, 30, 13, 0.5 * fade, e.tint);
        // The last stretch of the run is the arrival; charge the destination with it.
        flash[toIdx] += 0.9 * R.smooth(0.86, 1, p) * (1 - R.smooth(0.999, 1, p));
      }
    }
  });

  // Shards. A bright core with its replicas trailing outward, so the picture says shard and
  // not just node. Drawn after the messages so an arrival lands behind the thing it hits.
  R.additive(() => {
    for (let i = 0; i < s.shards.length; i++) {
      const sh = s.shards[i], f = Math.min(1.6, flash[i]);
      R.stamp(sh.x, sh.y, 46 + 40 * f, 46 + 40 * f, 0.5 + 0.4 * f, R.C.ice);
      // Two replicas, stacked outward from the primary. Same count on every shard: a varying
      // count read as stray dots rather than as structure.
      for (let k = 1; k <= sh.replicas; k++) {
        const d = 26 * k;
        R.stamp(sh.x + d * Math.cos(sh.a), sh.y + d * Math.sin(sh.a) * 0.63, 19, 19, 0.24 + 0.18 * f, R.C.cyanLt);
      }
    }
  });

  g.lineWidth = 2;
  g.strokeStyle = 'rgba(204,241,255,0.5)';
  for (const sh of s.shards) {
    g.beginPath();
    g.arc(sh.x, sh.y, 15, 0, TAU);
    g.stroke();
  }

  R.scrim(s.cx, s.cy, s.markH * 1.3, 0.55);
  R.mark(s.cx, s.cy, s.markH);
}

// -- Performance traffic. Commands warping in to a vanishing point at the mark. The inbound
// counterpart to client-streams: same additive dots, opposite direction, and a curve on the
// inflow so it reads as flow rather than as an explosion played backwards.
function trafficSetup(R) {
  const cx = 960, cy = 486, markH = 274;
  const r = R.rand(24007), streaks = [];
  // 800 streaks with a lifetime a bit over a third of the loop puts about 280 on screen at
  // once, which is the density the static performance banner uses. The first pass had 300 and
  // most of their life happened outside the frame, so a dozen were ever visible.
  for (let i = 0; i < 800; i++) {
    streaks.push({
      a0: r() * R.TAU,
      r0: 1010 + r() * 130,                                   // just past the frame corner
      swirl: (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.34),
      // Mostly Open Sky, a fifth coloured, matching the static set's restraint.
      tint: r() < 0.2 ? [R.C.gold, R.C.mint, R.C.coral, R.C.violet][(r() * 4) | 0] : R.C.cyanLt,
      wob: r(),
    });
  }
  return { cx, cy, markH, streaks, rStop: markH * 0.56, life: 1.45, squash: 0.86 };
}

function trafficDraw(g, t, u, s, R) {
  const T = R.T, N = s.streaks.length;

  R.additive(() => {
    for (let i = 0; i < N; i++) {
      const k = s.streaks[i];
      const a = ((t - (i * T) / N) % T + T) % T;
      if (a > s.life) continue;
      const p = a / s.life;
      // (1-p)^0.62 falls slowly at first and steeply at the end, so the radial speed grows
      // the whole way in: the streak accelerates into the mark rather than coasting into it.
      const span = k.r0 - s.rStop;
      const rad = s.rStop + span * Math.pow(1 - p, 0.62);
      // Speed is the derivative of that, which is what sets the streak's length. Deriving it
      // rather than guessing from the radius keeps the motion blur honest at any lifetime.
      const speed = (0.62 * span * Math.pow(Math.max(1 - p, 1e-4), -0.38)) / s.life;
      const len = R.clamp(speed * 0.1, 24, 210);
      // Curved inflow: the closer in, the more it has wound round. A pure radial dive is a
      // starburst, and a starburst says nothing about traffic.
      const ang = k.a0 + k.swirl * Math.log(k.r0 / rad);
      const c = Math.cos(ang), sn = Math.sin(ang) * s.squash;
      // Held almost to the end of the run. Fading out at 0.88 sounded harmless and left a
      // dead ring 400px across where every streak had already vanished before reaching the
      // mark, which read as a hole punched in the middle of the field.
      const alpha = 0.42 * R.smooth(0, 0.1, p) * (1 - R.smooth(0.97, 1, p));
      g.save();
      g.translate(s.cx + rad * c, s.cy + rad * sn);
      g.rotate(Math.atan2(sn, c));
      R.stamp(len / 2, 0, len, 7 + 4 * k.wob, alpha, k.tint);   // the trail extends outward
      g.restore();
    }
  });

  // The mark is the vanishing point, so it is also the brightest thing in the frame.
  R.bloom(s.cx, s.cy, s.markH * 1.15, 0.34, R.C.cyanLt);
  R.mark(s.cx, s.cy, s.markH);
}

const THEMES = [
  {
    name: 'client-streams',
    seed: 9101,
    loop: 4,
    fps: 24,
    // The motif is symmetric around a centred mark, which leaves the frame airy at 1:1.
    // Cropping in is the fix the static set uses; rescaling the drawing is not.
    zoom: 1.22,
    center: [960, 512],
    poster: 1.6,
    title: 'Valkey serving clients',
    desc: 'Twenty-eight client connections held from both edges of the frame onto a hexagonal ring of ports around the white Valkey mark, with streams of glowing dots pouring outward along every one of them and the ports twinkling as they work.',
    setup: clientStreamsSetup,
    draw: clientStreamsDraw,
  },
  {
    name: 'blackhole-particles',
    seed: 52041,
    loop: 6,
    fps: 20,
    space: true,
    zoom: 1.04,
    center: [960, 520],
    poster: 2.4,
    title: 'Valkey black hole',
    desc: 'A black hole with its accretion disk drawn as thousands of orbiting points of light: a hard black shadow ringed by a thin bright photon ring, the far side of the disk lensed up over the top and the near side crossing in front below, white hot at the inner edge through gold to red at the rim, all of it turning, with the white Valkey hexagon mark at the centre.',
    setup: blackholeSetup,
    draw: blackholeDraw,
  },
  {
    name: 'cluster-gossip',
    seed: 31337,
    loop: 4.8,
    fps: 24,
    zoom: 1.14,
    center: [960, 500],
    poster: 2,
    title: 'Valkey cluster gossip',
    desc: 'Seven shards on a tilted ring around a slot ring and the white Valkey mark, trading messages along a full mesh, each arriving message flashing the shard it reaches, with a highlight sweeping once round the slot ring.',
    setup: gossipSetup,
    draw: gossipDraw,
  },
  {
    name: 'performance-traffic',
    seed: 24007,
    loop: 4,
    fps: 24,
    poster: 2,
    title: 'Valkey throughput',
    desc: 'Command traffic warping inward from every direction to a vanishing point at the white Valkey mark, each streak curving as it accelerates and stretching into a dash before it is swallowed at the horizon.',
    setup: trafficSetup,
    draw: trafficDraw,
  },
];

// ------------------------------------------------------------------- the page

function page(theme, renderWidth) {
  const cfg = {
    name: theme.name,
    loop: theme.loop,
    zoom: theme.zoom ?? 1,
    center: theme.center ?? [W / 2, H / 2],
    space: theme.space === true,
    seed: theme.seed,
    caption: theme.caption ?? theme.title,
    renderWidth,
  };
  return `<!DOCTYPE html>
<!-- ${theme.title}: ${theme.desc}

     Generated by motion.mjs. Every frame is a pure function of time and the loop is exact,
     so ?t=SECONDS renders that instant and nothing else; without it the banner loops live.
     Valkey and the Valkey logo are trademarks of LF Projects, LLC. -->
<html lang="en">
<head>
<meta charset="utf-8">
<title>${theme.title}</title>
<style>
  html,body{margin:0;height:100%;background:#000}
  body{display:grid;place-items:center}
  canvas{display:block}
</style>
</head>
<body>
<canvas id="art" role="img" aria-label="${theme.desc.replace(/"/g, '&quot;')}"></canvas>
<script>
const THEME = ${JSON.stringify(cfg)};
const C = ${JSON.stringify(C)};
const FONT = ${JSON.stringify(FONT)};
const MARK_D = ${JSON.stringify(MARK.d)}, MARK_VW = ${MARK.vw}, MARK_VH = ${MARK.vh};
const LOCKUP_D = ${JSON.stringify(LOCKUP.paths)}, LOCKUP_VH = ${LOCKUP.vh};
const SETUP = ${theme.setup.toString()};
const DRAW = ${theme.draw.toString()};
${RUNTIME}
</script>
</body>
</html>
`;
}

// ------------------------------------------------------------------- capture
//
// One Chrome, one page, one navigation per theme, then a screenshot per frame over the
// DevTools protocol. Node 22 has a WebSocket client built in, so this needs no dependency.

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`No Chrome-based browser found. Looked in:\n  ${candidates.join('\n  ')}`);
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(chrome, dir) {
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${join(dir, 'ud')}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] }
  );

  // Chrome writes the port it actually bound to into the profile directory.
  const portFile = join(dir, 'ud', 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 200; i++) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (first) {
        port = first;
        break;
      }
    }
    await sleep(50);
  }
  if (!port) {
    proc.kill();
    throw new Error('Chrome did not report a DevTools port');
  }

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  // Every call is bounded. A lost response used to hang the run forever, which is a
  // miserable way to find out Chrome refused a viewport size.
  const send = (method, params = {}, timeout = 30000) =>
    new Promise((res, rej) => {
      const i = ++id;
      const timer = setTimeout(() => {
        pending.delete(i);
        rej(new Error(`${method} did not respond within ${timeout}ms`));
      }, timeout);
      pending.set(i, (m) => {
        clearTimeout(timer);
        res(m);
      });
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  return { proc, ws, send };
}

// Render one theme and write PNGs into `dir`. Returns the paths in order.
//
// The viewport is always 960x540 with a device scale factor of 2, so every screenshot comes
// out 1920x1080 -- the art grid's own size, with the canvas backing store supersampled to
// match. Asking for a 1920x1080 viewport at 2x instead makes Chrome sit on the request
// forever, and asking for it at 1x loses the antialiasing the thin strokes need.
async function capture(sess, htmlPath, dir, prefix, times) {
  const logical = W / 2;
  await sess.send('Emulation.setDeviceMetricsOverride', {
    width: logical,
    height: H / 2,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await sess.send('Page.navigate', { url: `file://${htmlPath}?w=${logical}&t=0` });
  // Wait for the page's own signal rather than a fixed delay: setup allocates the grain
  // buffer, which is 8 megapixels at 2x and takes a moment.
  for (let i = 0; i < 200; i++) {
    const r = await sess.send('Runtime.evaluate', { expression: 'typeof window.frameAt' });
    if (r.result?.result?.value === 'function') break;
    await sleep(50);
  }

  const out = [];
  for (let i = 0; i < times.length; i++) {
    const r = await sess.send('Runtime.evaluate', { expression: `window.frameAt(${times[i]})` });
    if (r.result?.exceptionDetails) {
      throw new Error(`frameAt(${times[i]}) threw: ${r.result.exceptionDetails.text}`);
    }
    const shot = await sess.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (!shot.result?.data) throw new Error('captureScreenshot returned nothing');
    const p = join(dir, `${prefix}-${String(i).padStart(4, '0')}.png`);
    writeFileSync(p, Buffer.from(shot.result.data, 'base64'));
    out.push(p);
  }
  return out;
}

// ------------------------------------------------------------------- encode

// Animated WebP. Pillow writes it, so this needs no ffmpeg. Frames are downsampled one at a
// time and held as RGB, because holding a hundred 1920x1080 RGBA frames is a gigabyte.
const ENCODE_ANIM = `
import sys
from PIL import Image
out, w, h, ms, quality = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
frames = []
for p in sys.argv[6:]:
    with Image.open(p) as im:
        frames.append(im.convert('RGB').resize((w, h), Image.LANCZOS))
frames[0].save(out, format='WEBP', save_all=True, append_images=frames[1:],
               duration=ms, loop=0, quality=quality, method=6, minimize_size=True)
`;

const ENCODE_STILL = `
import sys
from PIL import Image
src, out, w, h, quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
with Image.open(src) as im:
    im.convert('RGB').resize((w, h), Image.LANCZOS).save(out, 'WEBP', quality=quality, method=6)
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

// ------------------------------------------------------------------- main

const argv = process.argv.slice(2);
const flags = {};
const names = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) flags[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
    else flags[k] = true;
  } else names.push(a);
}

const OUT_W = Number(flags.width ?? 1280);
const OUT_H = Math.round((OUT_W * H) / W);
const QUALITY = Number(flags.quality ?? 74);

const themes = names.length ? THEMES.filter((t) => names.includes(t.name)) : THEMES;
if (names.length && themes.length !== names.length) {
  const known = THEMES.map((t) => t.name).join(', ');
  throw new Error(`Unknown theme in ${JSON.stringify(names)}. Known: ${known}`);
}

mkdirSync(HTML_DIR, { recursive: true });
mkdirSync(MOTION_DIR, { recursive: true });

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
const scratch = mkdtempSync(join(tmpdir(), 'valkey-motion-'));
let sess;
let rendered = 0;
let skipped = 0;

try {
  for (const theme of themes) {
    const fps = Number(flags.fps ?? theme.fps ?? 24);
    const frames = Math.round(theme.loop * fps);
    const htmlPath = join(HTML_DIR, `${theme.name}.html`);
    // The committed page defaults to a 1280-wide canvas, which is a sane size to open in a
    // browser. The capture harness overrides it with ?w=.
    const html = page(theme, OUT_W);
    writeFileSync(htmlPath, html);

    const animPath = join(MOTION_DIR, `${theme.name}.webp`);
    const posterPath = join(MOTION_DIR, `${theme.name}-poster.webp`);
    const key = `${sha(html)}-${fps}-${OUT_W}-${QUALITY}`;
    if (!flags.force && cache[theme.name] === key && existsSync(animPath) && existsSync(posterPath)) {
      skipped++;
      continue;
    }

    if (!sess) sess = await launch(chrome, scratch);

    const times = Array.from({ length: frames }, (_, i) => +((i * theme.loop) / frames).toFixed(6));
    const pngs = await capture(sess, htmlPath, scratch, theme.name, times);
    execFileSync(
      'python3',
      ['-c', ENCODE_ANIM, animPath, String(OUT_W), String(OUT_H), String(Math.round(1000 / fps)), String(QUALITY), ...pngs],
      { stdio: ['ignore', 'ignore', 'inherit'] }
    );

    // The poster comes out of the same 1920x1080 capture, so it needs no resample at all.
    const [posterPng] = await capture(sess, htmlPath, scratch, `${theme.name}-poster`, [theme.poster ?? 0]);
    execFileSync('python3', ['-c', ENCODE_STILL, posterPng, posterPath, String(W), String(H), '92'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    for (const p of pngs) rmSync(p, { force: true });
    rmSync(posterPng, { force: true });

    cache[theme.name] = key;
    rendered++;
    const kb = Math.round(readFileSync(animPath).length / 1024);
    console.log(
      `${theme.name.padEnd(22)} html/${theme.name}.html -> motion/${theme.name}.webp (${frames}f @ ${fps}fps, ${kb} KB) + poster`
    );
  }

  // The machine-readable index for the motion set, kept separate from themes.json so the
  // gallery can pick it up without anything that reads themes.json having to change.
  writeFileSync(
    join(HERE, 'motion.json'),
    `${JSON.stringify(
      {
        generated: 'motion.mjs',
        width: OUT_W,
        height: OUT_H,
        themes: THEMES.map((t) => ({
          name: t.name,
          title: t.title,
          desc: t.desc,
          loop: t.loop,
          fps: Number(flags.fps ?? t.fps ?? 24),
          animated: `motion/${t.name}.webp`,
          poster: `motion/${t.name}-poster.webp`,
          source: `html/${t.name}.html`,
        })),
      },
      null,
      2
    )}\n`
  );
} finally {
  if (sess) {
    sess.ws.close();
    sess.proc.kill();
    // Chrome is still flushing its profile when the signal lands, so removing the scratch
    // directory underneath it fails with ENOTEMPTY. Wait for it to actually be gone.
    await Promise.race([new Promise((r) => sess.proc.once('exit', r)), sleep(5000)]);
  }
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

console.log(`${rendered} rendered, ${skipped} unchanged`);
