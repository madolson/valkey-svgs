import { C, mark, n, starfield } from '../lib/core.mjs';
import { BUNDLE_MODULES, moduleGlyph } from '../lib/shapes.mjs';
// Containment: one package boundary with the four modules packed inside it two
// by two, the mark sealing the lid.
function bundleCrate(r) {
  const x0 = 462;
  const x1 = 1458;
  const y0 = 254;
  const y1 = 872;
  const lid = y0 + 76;
  const mid = (lid + y1) / 2;
  const cx = (x0 + x1) / 2;

  const s = 1.02;
  // One slot per quadrant of the crate, each at the exact centre of its quadrant:
  // the quadrants are (x0..960, 960..x1) x (lid..mid, mid..y1).
  const slots = [
    [(x0 + 960) / 2, (lid + mid) / 2],
    [(960 + x1) / 2, (lid + mid) / 2],
    [(x0 + 960) / 2, (mid + y1) / 2],
    [(960 + x1) / 2, (mid + y1) / 2],
  ];
  const modules = BUNDLE_MODULES.map((m, i) => moduleGlyph(m.kind, slots[i][0], slots[i][1], s, m.color, m.key)).join('');

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
    // The only lit things are the four modules: nothing washes the background, and
    // nothing haloes the mark, so the four glyphs are what the eye goes to.
    ...slots.map((p, i) => `  <circle cx="${n(p[0])}" cy="${n(p[1])}" r="150" fill="url(#h-${BUNDLE_MODULES[i].key})" opacity="0.22"/>`),
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="${C.ink}" fill-opacity="0.3"/>`,
    `  <g>${modules}</g>`,
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="none" stroke="${C.ice}" stroke-width="14" opacity="0.28" filter="url(#blur8)"/>`,
    `  <rect x="${x0}" y="${y0}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="26" fill="none" stroke="${C.ice}" stroke-width="3.6" opacity="0.85"/>`,
    `  <line x1="${x0}" y1="${lid}" x2="${x1}" y2="${lid}" stroke="${C.ice}" stroke-width="2" stroke-dasharray="14 12" opacity="0.4"/>`,
    `  <line x1="960" y1="${lid}" x2="960" y2="${y1}" stroke="${C.ice}" stroke-width="2" stroke-dasharray="14 12" opacity="0.22"/>`,
    `  <line x1="${x0}" y1="${n(mid)}" x2="${x1}" y2="${n(mid)}" stroke="${C.ice}" stroke-width="2" stroke-dasharray="14 12" opacity="0.22"/>`,
    `  <g>${brackets}</g>`,
    // The seal: one mark on one lid, unlit.
    `  <g>${mark(cx, y0, 112)}</g>`,
  ].join('\n');
}


// ------------------------------------------------------- data structure survey
//
// An ordered catalogue of Valkey value types, one per cell on an even grid.
// `data-structures` looks *inside* two of them (hash buckets, a skip list);
// this one is the survey across several, and the point of it is the order.

export const themes = [
    { name: 'bundle-crate', order: 17, seed: 33101, zoom: 1.2, center: [960, 540], title: 'Valkey bundle', desc: 'One bracketed package outline sealed with the white Valkey hexagon mark, holding four module diagrams inside it: a bit array, a nested document in brackets, a magnifier over a scatter of points, and a padlock, representing the four modules valkey-bundle ships as one package.', art: bundleCrate, motif: "One bracketed package sealed with the mark, holding the bundle's four modules: bit array, nested document, magnifier, padlock", use: "valkey-bundle, module distributions, batteries-included packaging" },
];
