import { C, mark, n, starfield } from '../lib/core.mjs';
// Idea: Planet Valkey collects what the community writes, and the writing goes
// round the project in a ring.
// Focal: the wireframe globe carrying the mark.
//
// Planet Valkey is an aggregator, so the ring is made of the things it aggregates.
// Each is one article card holding one data structure: a list, a hash, a set, a
// sorted set. Four kinds cycled rather than twelve different ones, so the ring reads
// as one band of content and not as a legend.

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
    // Flat and opaque: the rail and the globe must not show through a card.
    `<g transform="rotate(${n(tilt)} ${n(cx)} ${n(cy)})">` +
    `<rect x="${n(cx - half)}" y="${n(cy - half)}" width="${n(size)}" height="${n(size)}" ` +
      `rx="${n(size * 0.16)}" fill="${C.mid}" stroke="${C.cyanLt}" stroke-width="${n(size * 0.038)}"/>` +
    glyph.join('') +
    `</g>`
  );
}
// Performance: command traffic streaking toward a vanishing point, the same
// gesture as the hero background but without the command names.

// The ring and the globe share one camera: the ring lies in the planet's equatorial plane,
// the camera sits a little above that plane at a finite distance, and the view is rolled by
// TILT. Projecting both through the same transform is what keeps the parallax honest: the
// near side of the ring comes out lower, wider and larger than the far side, the cards scale
// with depth, and the globe's equator follows the ring. Cards are spaced evenly in 3D and none
// are dropped; the opaque globe hides whatever passes behind it. Only the front half of the
// graticule is drawn, so the globe reads as solid rather than as a wire cage.
function planetRing(r) {
  const cx = 960, cy = 540, rad = 300;
  const R = 700;                        // ring radius, in the same units as rad
  const ELEV = (16 * Math.PI) / 180;    // camera height above the ring plane
  const DCAM = 4.2 * R;                 // camera distance: finite, so there is perspective
  const TILT = (-13 * Math.PI) / 180;
  const COUNT = 12, SIZE = 78, MARK_H = 260;
  const ce = Math.cos(ELEV), se = Math.sin(ELEV), ct = Math.cos(TILT), st = Math.sin(TILT);
  // 3D (x right, y up, z toward the viewer) to screen, keeping depth for order and scale.
  const proj = (x, y, z) => {
    const yv = y * ce - z * se, zv = y * se + z * ce;
    const k = DCAM / (DCAM - zv);
    const sx = x * k, sy = -yv * k;
    return { x: cx + sx * ct - sy * st, y: cy + sx * st + sy * ct, z: zv, k };
  };
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'} ${n(p.x)} ${n(p.y)}`).join(' ');
  // Split a sampled curve into the runs that pass `keep`, for front and back drawing.
  const runs = (pts, keep) => {
    const out = [];
    let cur = [];
    for (const p of pts) {
      if (keep(p)) cur.push(p);
      else { if (cur.length > 1) out.push(cur); cur = []; }
    }
    if (cur.length > 1) out.push(cur);
    return out;
  };

  // The rail the articles ride. Thin, because the articles are the content.
  const railPts = [];
  for (let i = 0; i <= 720; i++) {
    const th = (i / 720) * 2 * Math.PI;
    railPts.push(proj(R * Math.cos(th), 0, R * Math.sin(th)));
  }
  // Drawn as short butt-capped pieces whose opacity follows depth, so the rail dims
  // smoothly toward the back instead of stepping where the far and near halves meet, and
  // no two pieces overlap to double up the alpha.
  const zMax = R * ce;
  const rail = (far) => {
    const out = [];
    const STEP = 6;
    for (let i = 0; i < railPts.length - 1; i += STEP) {
      const seg = railPts.slice(i, Math.min(i + STEP, railPts.length - 1) + 1);
      const zMid = seg[seg.length >> 1].z;
      if (far ? zMid >= 0 : zMid < 0) continue;
      const opacity = 0.26 + 0.22 * (0.5 + 0.5 * zMid / zMax);
      out.push(`<path d="${path(seg)}" fill="none" stroke="${C.ice}" stroke-width="3" opacity="${n(opacity)}"/>`);
    }
    return out.join('');
  };

  const cards = [];
  for (let i = 0; i < COUNT; i++) {
    const th = (2 * Math.PI * i) / COUNT + Math.PI / COUNT;
    const p = proj(R * Math.cos(th), 0, R * Math.sin(th));
    cards.push({ z: p.z, svg: articleCard(p.x, p.y, SIZE * p.k, i % 4, (TILT * 180) / Math.PI) });
  }
  cards.sort((a, b) => a.z - b.z);
  const half = (far) => cards.filter((c) => (far ? c.z < 0 : c.z >= 0)).map((c) => c.svg).join('');

  // Three latitudes and four meridians, front halves only.
  const grid = [];
  const stroke = (pts) => `<path d="${path(pts)}" fill="none" stroke="${C.cyanLt}" stroke-width="3.6"/>`;
  const sphere = (lat, lon) => proj(rad * Math.cos(lat) * Math.cos(lon), rad * Math.sin(lat), rad * Math.cos(lat) * Math.sin(lon));
  for (const lat of [-0.5, 0, 0.5]) {
    const pts = [];
    for (let i = 0; i <= 360; i++) pts.push(sphere(lat, (i / 360) * 2 * Math.PI));
    for (const run of runs(pts, (p) => p.z > 0)) grid.push(stroke(run));
  }
  for (let m = 0; m < 4; m++) {
    const lon = (m * Math.PI) / 4 + 0.35;
    const pts = [];
    for (let i = 0; i <= 360; i++) pts.push(sphere((i / 360) * 2 * Math.PI, lon));
    for (const run of runs(pts, (p) => p.z > 0)) grid.push(stroke(run));
  }

  // Lit from the upper left, which is what makes the lines read as a sphere. The opaque
  // backing keeps whatever passes behind the planet from showing through.
  const body =
    `<radialGradient id="p-lit" cx="0.36" cy="0.3" r="0.82">` +
      `<stop offset="0" stop-color="${C.cyan}" stop-opacity="0.3"/>` +
      `<stop offset="0.5" stop-color="${C.mid}" stop-opacity="0.72"/>` +
      `<stop offset="1" stop-color="${C.ink}" stop-opacity="0.96"/>` +
    `</radialGradient>` +
    `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${C.ink}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="url(#p-lit)"/>` +
    `<g opacity="0.55">${grid.join('')}</g>` +
    `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${C.ice}" stroke-width="5" opacity="0.8"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${n(MARK_H * 0.72)}" fill="url(#scrim)"/>` +
    mark(cx, cy, MARK_H);

  return [
    `  <g>${starfield(r, 45)}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(rad * 1.1)}" fill="url(#h-ice)" opacity="0.4"/>`,
    `  <g>${rail(true)}</g>`,
    `  <g>${half(true)}</g>`,
    `  <g>${body}</g>`,
    `  <g>${rail(false)}</g>`,
    `  <g>${half(false)}</g>`,
  ].join('\n');
}
// below it steps in uneven bites, because COUNT is a hint and not a batch size.

export const themes = [
    { name: 'planet-ring', order: 29, space: true, seed: 51021, zoom: 1.16, center: [960, 612], captionScale: 1.25, title: 'Planet Valkey', desc: 'A globe with its front graticule carrying the white Valkey hexagon mark, inside a tilted ring of evenly spaced article cards seen in perspective, passing behind the globe and in front of it again, against a sparse starfield, representing one Valkey world wearing its whole keyspace as a ring.', art: planetRing, motif: "A wireframe Valkey globe ringed by article cards, one data structure each", use: "Planet Valkey, community blog roundups, the wider ecosystem" },
];
