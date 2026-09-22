import { frame, frameBox, lockup, mark, n, stamp, weighted } from '../lib/core.mjs';
import { keySizeDistribution } from '../lib/shapes.mjs';
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

export const themes = [
    { name: 'key-size-card-a', order: 26, seed: 43041, zoom: 1.26, center: [960, 540], title: 'Finding big keys in a running Valkey cluster with Valkey Admin', desc: 'A card layout: the Valkey lockup in the upper left, the post title on solid light blocks in the lower left, and a Valkey Admin panel ranking keys by size with the top two at tens of megabytes drawn in red, wired into three shard enclosures of servers drawn as the white Valkey hexagon mark, sitting whole down the height of the frame.', art: keySizeCard({ scale: 0.86, spread: 40 }), motif: "The key-size ranking and shards centred and scaled to clear the corner lockup, title overlapping the panel", use: "The big-keys post; the reference card layout" },
    { name: 'key-size-card-flat', order: 27, seed: 43049, zoom: 1.26, center: [960, 540], title: 'Finding big keys in a running Valkey cluster with Valkey Admin', desc: 'A card layout: the Valkey lockup in the upper left, the post title on solid light blocks in the lower left, and a Valkey Admin panel ranking keys by size with the top two at tens of megabytes drawn in red, wired into three widely spaced shard enclosures of servers drawn as the white Valkey hexagon mark, the whole chart sitting in a shallow band clear above the title blocks.', art: keySizeCard({ scale: 0.8, spread: 62, colPitch: 168, clearY: 748 }), motif: "The same card with the artwork short and wide, sitting clear of the title rather than under it", use: "The big-keys post, when the title should not cross the chart" },
];
