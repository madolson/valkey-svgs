import { C, clamp, defs, frame, mark, n, starfield, weighted } from '../lib/core.mjs';
import { globe } from '../lib/shapes.mjs';
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

// Cold to hot across the palette's three warm accents. Nothing outside them: the
// intermediate values are interpolations of C, the same way a gradient's stops are.
const diskColor = (t) =>
  t > 0.62 ? mixHex(C.gold, C.ice, (t - 0.62) / 0.38 * 0.8) : mixHex(C.coral, C.gold, t / 0.62);

// `rings + 1` orbits of `segs + 1` samples each: the grid corners of a mesh, so
// the disk can be tiled with quads that neither overlap nor leave gaps. Overlapping
// translucent strokes were the first attempt and they saturate to a flat blob.

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

export const themes = [
    { name: 'blackhole-gargantua', order: 23, experimental: true, space: true, seed: 52041, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A black hole seen almost edge on: a black circular shadow wrapped by one thin bright ring that closes all the way round it, the accretion disk lensed over the top and its secondary image returning underneath, the flat disk running out to both edges of the frame as a warm band, even in brightness on both sides, with the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 84, outer: 30, scale: 46, markH: 210, beam: 0, rings: 32, segs: 150 }), motif: "Edge-on relativistic disk, one thin ring closing right round the shadow, even on both sides", use: "Talks, keynotes, anything that wants one striking abstract image" },
    { name: 'blackhole-halo', order: 24, experimental: true, space: true, seed: 52051, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A black hole seen at a slight tilt so the lensed ring around its shadow opens into a broad halo, white at the inner edge through gold to red at the rim, even in brightness on both sides, with the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 74, outer: 24, scale: 40, markH: 185, beam: 0, rings: 32, segs: 150 }), motif: "The same model tilted, the ring opened into a broad white-to-red halo", use: "Same" },
    { name: 'blackhole-beamed', order: 25, experimental: true, space: true, seed: 52011, zoom: 1.2, center: [960, 540], title: 'Valkey black hole', desc: 'A relativistic accretion disk seen almost edge on: a dark circular shadow ringed by a thin bright photon ring, the disk lensed up over the top of the shadow and crossing in front of it below, blazing white on the left where the orbiting gas comes towards the viewer and fading to dim red on the right where it recedes, the white Valkey hexagon mark at the centre.', art: blackholeAt({ incDeg: 80, outer: 24, scale: 47.6, markH: 220, beam: 1, rings: 28, segs: 108 }), motif: "The same model with Doppler beaming left in, so one side blazes", use: "Same, when the physics is the point" },
];
