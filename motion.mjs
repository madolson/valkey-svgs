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
    const m = Math.round(R.clamp(140 * (rad / rIn), 140, 680));
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
        R.stamp(s.cx + b.r * cs, project(b.r, sn), size * (far ? 1.45 : 1), sizeY * (far ? 1.45 : 1), 0.023 * fall * edgeOn * (far ? 0.55 : 1), tint, true);
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
      R.stamp(s.cx + rp * Math.cos(th), s.cy + rp * Math.sin(th), 17, 17, 0.1 + 0.07 * Math.abs(Math.cos(th)), '#FFFFFF');
    }
  });

  // The secondary image: light from the near side of the disk that loops right round the hole and
  // comes back underneath it. Without this the shadow is wrapped over the top and across the
  // middle but bare below, and the thing that makes the Interstellar picture read is that the
  // ring closes all the way round. The lift decays with radius, so only the inner disk forms the
  // tight arc and the outer bands melt back into the flat band.
  R.additive(() => {
    for (const b of s.bands) {
      if (b.r > s.rIn * 3.2) continue;
      const q = (b.r - s.rIn) / (s.rOut - s.rIn);
      const tint = q < 0.3 ? '#FFFFFF' : R.C.gold;
      const lift = s.rs * 1.22 * Math.exp(-(b.r - s.rIn) / (1.4 * s.rIn));
      const fall = Math.pow(s.rIn / b.r, 1.3);
      const size = R.lerp(34, 60, q);
      const step = TAU / b.m;
      const spin = b.phase + (TAU * b.j * u) / b.m;
      for (let k = 0; k < b.m; k++) {
        const th = spin + k * step;
        const sn = Math.sin(th);
        if (sn > 0) continue;
        const an = Math.abs(sn);
        const y = s.cy + (lift + an * b.r * s.cosI * 0.3) * Math.pow(an, 0.5);
        R.stamp(s.cx + b.r * Math.cos(th), y, size, size * 0.5, 0.011 * fall * (0.45 + 0.55 * an), tint, true);
      }
    }
  });

  R.additive(() => half(false));

  // The mark sits inside the shadow, so it gets the shadow back rather than a bloom: the near
  // side of the disk crosses in front of the hole and would otherwise cut across the mark.
  R.scrim(s.cx, s.cy, s.rs * 0.8, 0.9);
  R.mark(s.cx, s.cy, s.markH);
}

// -- Cluster gossip. Shards trading messages around a hexagon. The layout is the Valkey mark
// at scale: pointy-top, and the mark's own width-to-height ratio, so the ring echoes the mark
// at its centre rather than contradicting it. An ellipse was tried first and it fought the
// brand for no gain.
function gossipSetup(R) {
  const cx = 960, cy = 500;
  // A pointy-top hexagon: a vertex top and bottom, and the four corners of two vertical
  // sides. 0.855 is the mark's own half-width over half-height, which is a regular hexagon to
  // within a percent; taking it from the mark rather than from cos(30) keeps them in step if
  // the logo ever moves.
  const A = 330, hw = A * 0.855;
  const verts = [[0, -A], [hw, -A / 2], [hw, A / 2], [0, A], [-hw, A / 2], [-hw, -A / 2]];
  const shards = verts.map(([dx, dy]) => ({ x: cx + dx, y: cy + dy, a: Math.atan2(dy, dx) }));

  const r = R.rand(31337);
  // Every pair gossips except the three that are diametrically opposite, whose edges would run
  // straight through the mark. One focal element: nothing crosses it.
  const edges = [];
  for (let i = 0; i < 6; i++) {
    for (let k = i + 1; k < 6; k++) {
      if (k - i === 3) continue;
      const rim = k - i === 1 || (i === 0 && k === 5);
      edges.push({ a: i, b: k, rim, trips: 1 + ((r() * 3) | 0), phase: r(), dir: r() < 0.5 ? 1 : -1, tint: r() < 0.25 ? R.C.mint : R.C.cyanLt });
    }
  }

  return { cx, cy, shards, edges, markH: 288 };
}

function gossipDraw(g, t, u, s, R) {
  const TAU = R.TAU;

  // The mesh, held faintly so the message paths are legible when nothing is on them.
  for (const e of s.edges) {
    const A = s.shards[e.a], B = s.shards[e.b];
    g.lineWidth = e.rim ? 2.2 : 1.2;
    g.strokeStyle = e.rim ? 'rgba(70,189,233,0.46)' : 'rgba(70,189,233,0.14)';
    g.beginPath();
    g.moveTo(A.x, A.y);
    g.lineTo(B.x, B.y);
    g.stroke();
  }

  // Messages, and the arrival flash each one triggers. Both are closed-form in the loop phase,
  // so a shard's pulse is exactly as periodic as the traffic causing it.
  const flash = new Float64Array(s.shards.length);
  R.additive(() => {
    for (const e of s.edges) {
      const A = s.shards[e.a], B = s.shards[e.b];
      const from = e.dir > 0 ? A : B, to = e.dir > 0 ? B : A;
      const toIdx = e.dir > 0 ? e.b : e.a;
      for (let k = 0; k < e.trips; k++) {
        const p = ((u * e.trips - e.phase - k) % 1 + 1) % 1;
        const fade = R.smooth(0, 0.08, p) * (1 - R.smooth(0.9, 1, p));
        R.stamp(R.lerp(from.x, to.x, p), R.lerp(from.y, to.y, p), 30, 13, 0.5 * fade, e.tint);
        // The last stretch of the run is the arrival; charge the destination with it.
        flash[toIdx] += 0.9 * R.smooth(0.86, 1, p) * (1 - R.smooth(0.999, 1, p));
      }
    }
  });

  // Shards at the vertices, replicas stacked outward. Drawn after the messages so an arrival
  // lands behind the thing it hits.
  R.additive(() => {
    for (let i = 0; i < s.shards.length; i++) {
      const sh = s.shards[i], f = Math.min(1.6, flash[i]);
      R.stamp(sh.x, sh.y, 52 + 44 * f, 52 + 44 * f, 0.6 + 0.4 * f, R.C.ice);
      for (let k = 1; k <= 2; k++) {
        const d = 28 * k;
        R.stamp(sh.x + d * Math.cos(sh.a), sh.y + d * Math.sin(sh.a), 19, 19, 0.24 + 0.18 * f, R.C.cyanLt);
      }
    }
  });

  g.lineWidth = 2.4;
  g.strokeStyle = 'rgba(204,241,255,0.72)';
  for (const sh of s.shards) {
    g.beginPath();
    g.arc(sh.x, sh.y, 15, 0, TAU);
    g.stroke();
  }

  // The interior is a silhouette. The six vertices are the cluster; the shape they surround is
  // the mark, filled. An outline was tried here and it turned the middle into line art competing
  // with the mesh, when what the composition wants is one solid thing for the ring to enclose.
  R.scrim(s.cx, s.cy, s.markH * 1.15, 0.6);
  R.mark(s.cx, s.cy, s.markH);
}

// -- Total eclipse. A black lunar disc over the sun, the corona streaming outward around it.
// The corona is the case additive compositing exists for: tens of thousands of overlapping glows
// that have to sum into a continuous veil and taper into nothing. An SVG blur halo cannot do it,
// which is why there is no static eclipse in the set.
function eclipseSetup(R) {
  const cx = 960, cy = 496, rm = 268;                     // the moon
  const r = R.rand(60606);

  // Angular density of the corona. A real corona is not radially even: helmet streamers bunch
  // along the magnetic equator and short plumes cover the poles. Three fixed harmonics on a
  // tilted axis give that without modelling any of the physics. This one function also decides
  // how far the streamers reach, so it does most of the composition.
  const tilt = -0.46, p1 = r() * R.TAU, p2 = r() * R.TAU;
  const dens = (a) =>
    R.clamp(0.26 + 1.24 * Math.pow(Math.abs(Math.cos(a - tilt)), 2.2) + 0.22 * Math.cos(3 * a + p1) + 0.13 * Math.cos(5 * a + p2), 0.06, 1.55);

  // Particles go into ray bundles rather than spreading evenly round the limb. Uniform angles
  // gave a fuzzy annulus no matter how the brightness was weighted: a corona reads as a corona
  // because it has distinct rays, and rays need particles clustered in angle, not just lit
  // unevenly. Bundle angles are rejection-sampled against dens, so the lobes get most of them.
  const bundles = [];
  for (let guard = 0; bundles.length < 46 && guard < 6000; guard++) {
    const a = r() * R.TAU;
    if (r() > dens(a) / 1.55) continue;
    bundles.push({ a, width: 0.022 + r() * 0.05, reach: 0.62 + r() * 0.62 });
  }

  // Particles sit still. They used to be emitted at the limb and flung outward, and the result
  // read as an ejection: a corona does not do that, it hangs there and shimmers. So position is
  // fixed and only brightness moves.
  //
  // Radius is sampled from the exponential the taper used to apply, so the falloff now lives in
  // where the particles are rather than in how bright they are.
  const N = 21000, parts = [];
  for (let i = 0; i < N; i++) {
    // A fifth sit at a free angle, so the gaps between rays are veiled rather than empty.
    const loose = r() < 0.2;
    const b = bundles[(r() * bundles.length) | 0];
    // Two uniforms summed and centred: a cheap bell, so a bundle has a dense spine and soft edges.
    const a = loose ? r() * R.TAU : b.a + (r() + r() - 1) * b.width;
    const scale = 0.34 * rm * dens(a) * (loose ? 0.5 : b.reach);
    const d = -Math.log(1 - r() * 0.995) * scale;
    if (d > rm * 3.1) { i--; continue; }
    parts.push({ a, d, wob: r(), tw: r(), beats: 2 + ((r() * 3) | 0), tint: r() < 0.16 ? R.C.gold : R.C.ice });
  }

  // The moon is not a circle, and that is the whole reason an eclipse edge sparkles. Mountains
  // and crater rims stand a few kilometres off a 1700 km radius, so in truth the limb is ragged
  // by a tenth of a percent, which at this size is a fifth of a pixel. Exaggerated to about
  // three percent: enough that the edge is visibly uneven and the beads have somewhere to sit.
  //
  // The profile is a sum of sinusoids on INTEGER frequencies, which is what makes it close on
  // itself. Amplitudes fall as 1/n, so it has a few big lobes and a lot of fine detail.
  // The frequencies start high on purpose. Including n = 3 through 8 gave the moon big smooth
  // lobes and it came out as a potato: the real limb is a circle to within a rounding error, with
  // fine notches cut into it. Detail lives at n = 24 and up, and the total amplitude is about
  // one and a half percent, which is a few pixels here.
  const LIMB_N = 2048;
  const harmonics = [];
  for (let k = 0; k < 30; k++) {
    const n = 24 + Math.round(Math.pow(k / 29, 1.3) * 166);
    harmonics.push({ n, amp: 0.0035 / (1 + n * 0.015), ph: r() * R.TAU });
  }
  // Raggedness is not even round the limb. Two slow envelopes on integer frequencies scale the
  // deviation, so some arcs come out nearly smooth and others heavily notched. Without this the
  // edge is a uniform scallop the whole way round and reads as a cog.
  const e1 = r() * R.TAU, e2 = r() * R.TAU;
  const limb = new Float64Array(LIMB_N);
  for (let i = 0; i < LIMB_N; i++) {
    const a = (i / LIMB_N) * R.TAU;
    let v = 0;
    for (const h of harmonics) v += h.amp * Math.sin(h.n * a + h.ph);
    const env = (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(3 * a + e1))) * (0.55 + 0.45 * Math.sin(7 * a + e2));
    limb[i] = 1 + v * env * 1.7;
  }
  const limbAt = (a) => {
    const f = ((((a / R.TAU) % 1) + 1) % 1) * LIMB_N;
    const i0 = Math.floor(f);
    return R.lerp(limb[i0 % LIMB_N], limb[(i0 + 1) % LIMB_N], f - i0);
  };

  // The silhouette, as a path rather than an arc. Built once: it never changes.
  const moonPath = new Path2D();
  for (let i = 0; i <= LIMB_N; i++) {
    const a = (i / LIMB_N) * R.TAU;
    const rr = rm * limb[i % LIMB_N];
    const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
    if (i === 0) moonPath.moveTo(x, y);
    else moonPath.lineTo(x, y);
  }
  moonPath.closePath();

  // Baily's beads are not decoration placed on the edge: they are the photosphere still visible
  // through the valleys between lunar peaks. So they are read off the profile's deepest local
  // minima rather than scattered, and their brightness is how deep the valley is.
  const mins = [];
  for (let i = 0; i < LIMB_N; i++) {
    const prev = limb[(i - 1 + LIMB_N) % LIMB_N], cur = limb[i], next = limb[(i + 1) % LIMB_N];
    if (cur < prev && cur <= next) mins.push({ a: (i / LIMB_N) * R.TAU, depth: 1 - cur });
  }
  mins.sort((x, y) => y.depth - x.depth);
  const beads = mins.slice(0, 14).map((b) => ({ a: b.a, depth: b.depth, tw: r(), beats: 2 + ((r() * 4) | 0) }));

  // Prominences: chromospheric loops at the limb, the one place coral belongs on this theme.
  const proms = [];
  for (let i = 0; i < 4; i++) proms.push({ a: r() * R.TAU, span: 0.11 + r() * 0.09, h: 22 + r() * 20, phase: r(), beats: 2 + ((r() * 2) | 0) });

  // The diffuse veil the rays sit in, computed once per pixel into an offscreen canvas.
  //
  // Three constructions were tried. Concentric shells of stamps banded into visible rings. One
  // radial gradient per one-degree wedge fixed that but left 360 seams: adjacent additive fills
  // either double-count where they overlap, giving bright spokes, or leave an antialiased
  // hairline where they do not, giving dark ones. Evaluating the field itself has neither
  // problem, and since the veil does not move it costs one drawImage a frame. The rays carry the
  // motion; a corona does not visibly change in five seconds anyway.
  const reach = rm * 3.4;
  const veil = document.createElement('canvas');
  const VN = 760;                                          // texture resolution, upscaled at draw
  veil.width = veil.height = VN;
  const vg = veil.getContext('2d');
  const img = vg.createImageData(VN, VN), d8 = img.data;
  for (let py = 0; py < VN; py++) {
    for (let px = 0; px < VN; px++) {
      const x = ((px + 0.5) / VN * 2 - 1) * reach;
      const y = ((py + 0.5) / VN * 2 - 1) * reach;
      const rr = Math.hypot(x, y);
      const i4 = (py * VN + px) * 4;
      d8[i4] = 204; d8[i4 + 1] = 241; d8[i4 + 2] = 255;     // C.ice
      if (rr < rm || rr > reach) continue;
      const dn = dens(Math.atan2(y, x));
      // The exponential still has a percent or so left at the cutoff, which shows up as a faint
      // circular edge, so the last quarter is windowed to nothing.
      const edge = 1 - R.smooth(0.74, 1, rr / reach);
      const a255 = 0.3 * Math.pow(dn, 1.2) * Math.exp(-((rr - rm) / rm) / (0.62 * dn)) * edge * 255;
      d8[i4 + 3] = a255 > 255 ? 255 : a255 < 0 ? 0 : a255;
    }
  }
  vg.putImageData(img, 0, 0);

  return { cx, cy, rm, reach, veil, dens, limbAt, moonPath, beads, parts, proms, markH: 205 };
}

function eclipseDraw(g, t, u, s, R) {
  const TAU = R.TAU, N = s.parts.length;

  // The veil, one draw. Built per pixel in setup, so it has neither the rings that shells gave
  // nor the spokes that wedges gave.
  R.additive(() => {
    g.globalAlpha = 1;
    g.drawImage(s.veil, s.cx - s.reach, s.cy - s.reach, s.reach * 2, s.reach * 2);
  });

  // The rays, shimmering in place. Every term below is an integer harmonic of the loop, which is
  // what lets the whole field flicker and still close: two travelling waves round the limb in
  // opposite directions, a radial ripple, and a per-particle twinkle on its own beat.
  R.additive(() => {
    const breathe = 1 + 0.05 * Math.sin(TAU * u);
    for (let i = 0; i < N; i++) {
      const k = s.parts[i];
      const wave =
        1 +
        0.3 * Math.sin(7 * k.a + TAU * 2 * u) +
        0.22 * Math.sin(4 * k.a - TAU * 3 * u) +
        0.18 * Math.sin(k.d * 0.03 + TAU * 2 * u);
      const twinkle = 0.62 + 0.38 * Math.sin(TAU * (k.tw + u * k.beats));
      const taper = Math.exp(-k.d / (0.85 * s.rm * s.dens(k.a)));
      const alpha = 0.055 * taper * Math.max(0.12, wave) * twinkle * breathe;
      if (alpha <= 0.004) continue;
      const rr = s.rm * s.limbAt(k.a) + k.d;
      g.save();
      g.translate(s.cx + rr * Math.cos(k.a), s.cy + rr * Math.sin(k.a));
      g.rotate(k.a);
      R.stamp(0, 0, 30 + k.d * 0.14, 9 + 6 * k.wob, alpha, k.tint, true);   // elongated along the radius
      g.restore();
    }
  });

  // The moon. Pure black and hard edged, drawn over the corona's inner bleed, and following the
  // ragged profile rather than a circle: the unevenness of this edge is the subject.
  g.fillStyle = '#000000';
  g.fill(s.moonPath);

  // The chromosphere, tracking the ragged limb instead of a circle, and brightening where the
  // limb dips: a valley is a place the photosphere still shines through, so it is brighter there.
  R.additive(() => {
    for (let i = 0; i < 900; i++) {
      const a = (i / 900) * TAU;
      const local = s.limbAt(a);
      const dip = R.clamp((1 - local) / 0.009, 0, 1);
      const rr = s.rm * local * 1.004;
      R.stamp(s.cx + rr * Math.cos(a), s.cy + rr * Math.sin(a), 11, 11, (0.1 + 0.05 * s.dens(a)) * (1 + 1.1 * dip), '#FFFFFF');
    }
  });

  // Baily's beads. Each sits in one of the limb's deepest valleys and flickers on its own whole
  // number of beats per loop, which is the shimmer you actually see round the edge at totality.
  R.additive(() => {
    for (const b of s.beads) {
      const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(TAU * (b.tw + u * b.beats)), 1.7);
      const w = R.clamp(b.depth / 0.011, 0, 1.3);
      const rr = s.rm * s.limbAt(b.a) * 1.008;
      const x = s.cx + rr * Math.cos(b.a), y = s.cy + rr * Math.sin(b.a);
      R.stamp(x, y, 22 + 46 * w * tw, 22 + 46 * w * tw, 0.4 * w * tw, '#FFFFFF');
      R.stamp(x, y, 6 + 7 * w, 6 + 7 * w, 0.85 * tw, '#FFFFFF');
    }
  });

  // Prominences, each pulsing on its own beat.
  R.additive(() => {
    for (const pr of s.proms) {
      const beat = 0.5 + 0.5 * Math.sin(TAU * (u * pr.beats + pr.phase));
      for (let i = 0; i <= 22; i++) {
        const f = i / 22;
        const a = pr.a + (f - 0.5) * pr.span;
        // A loop: out from the limb and back, so it arcs rather than sticking out.
        const rr = s.rm * s.limbAt(a) * 1.012 + Math.sin(f * Math.PI) * pr.h * (0.45 + 0.55 * beat);
        R.stamp(s.cx + rr * Math.cos(a), s.cy + rr * Math.sin(a), 30, 30, 0.05 + 0.05 * beat, R.C.coral, true);
      }
    }
  });

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
    loop: 5,
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
    zoom: 1.12,
    center: [960, 500],
    poster: 2,
    title: 'Valkey cluster gossip',
    desc: 'Six shards at the corners of a hexagon enclosing the white Valkey mark in silhouette, trading messages across a mesh, each arriving message flashing the shard it reaches.',
    setup: gossipSetup,
    draw: gossipDraw,
  },
  {
    name: 'eclipse-corona',
    seed: 60606,
    loop: 5,
    fps: 24,
    space: true,
    zoom: 1.02,
    center: [960, 512],
    poster: 2.1,
    title: 'Valkey eclipse',
    desc: "A total solar eclipse: the moon as a hard black silhouette with a visibly ragged edge and the white Valkey hexagon mark at its centre, a thin brilliant chromosphere tracking that edge and flaring into Baily's beads where the lunar valleys dip, the corona hanging all round in long equatorial lobes and short polar plumes and shimmering in place, with four coral prominences looping off the limb.",
    setup: eclipseSetup,
    draw: eclipseDraw,
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

async function closeSession(sess) {
  if (!sess) return;
  try {
    sess.ws.close();
  } catch {}
  sess.proc.kill();
  // Chrome is still flushing its profile when the signal lands, so removing the scratch
  // directory underneath it fails with ENOTEMPTY. Wait for it to actually be gone.
  await Promise.race([new Promise((r) => sess.proc.once('exit', r)), sleep(5000)]);
}

let launchCount = 0;
async function launch(chrome, dir) {
  const profile = join(dir, `ud-${++launchCount}`);
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] }
  );

  // Chrome writes the port it actually bound to into the profile directory.
  const portFile = join(profile, 'DevToolsActivePort');
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
  const send = (method, params = {}, timeout = 90000) =>
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
// --force ignores the cache for freshness, but the cache is still loaded and carried forward.
// Returning {} here instead dropped the entries for every theme not named in the run, so the
// next full build re-rendered all of them: `motion.mjs one --force` cost eight minutes later.
const cache = (() => {
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

    sess = await launch(chrome, scratch);

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
    await closeSession(sess);
    sess = null;

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
  await closeSession(sess);
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

console.log(`${rendered} rendered, ${skipped} unchanged`);
