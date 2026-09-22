import { C, mark, n, starfield } from '../lib/core.mjs';
import { globe } from '../lib/shapes.mjs';
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
// Performance: command traffic streaking toward a vanishing point, the same
// gesture as the hero background but without the command names.

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
// below it steps in uneven bites, because COUNT is a hint and not a batch size.

export const themes = [
    { name: 'planet-ring', order: 29, space: true, seed: 51021, zoom: 1.16, center: [960, 540], title: 'Planet Valkey', desc: 'A wireframe globe carrying the white Valkey hexagon mark, encircled by a thick tilted ring broken into even segments that passes behind the globe and in front of it again, against a sparse starfield, representing one Valkey world wearing its whole keyspace as a ring.', art: planetRing, motif: "A wireframe Valkey globe ringed by article cards, one data structure each", use: "Planet Valkey, community blog roundups, the wider ecosystem" },
];
