import { C, arcPath, mark, n, starfield, weighted } from '../lib/core.mjs';
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

export const themes = [
    { name: 'limits-gauge-pinned', order: 21, seed: 42041, zoom: 1.34, center: [960, 540], title: 'Valkey pinned near its limit', desc: 'A large gauge around the white Valkey hexagon mark, filled from blue through green into gold and stopping just short of a red end zone, representing a small resource envelope run right up to its limit.', art: limitsGaugePinned, motif: "A gauge sweeping into gold and stopping short of a red end zone", use: "Running right up to a limit, headroom, saturation" },
];
