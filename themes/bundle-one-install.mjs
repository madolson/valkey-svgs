import { C, dot, mark, n, starfield } from '../lib/core.mjs';
import { BUNDLE_MODULES, moduleGlyph } from '../lib/shapes.mjs';
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
const GLYPH_HALF_W = { bloom: 172, json: 156, search: 121, ldap: 82 };

// Each glyph is drawn around its own origin, but its ink is not symmetric about
// that origin: bloom hangs the hash ticks above the cell run. These offsets pull
// the drawn bounds back onto (cx, cy) so four glyphs on a grid look centred, and
// so a line aimed at (cx, cy) arrives at the middle of the glyph.

// Delivery: one install, and the four modules it puts on the server. The port is
// what you install into; the fan is what you get.
function bundleOneInstall(r) {
  const px = 700;
  const cy = 540;
  const s = 0.92;

  // json and ldap are the tallest glyphs, so they take the two ends of the fan
  // and the whole thing stays vertically centred on the port.
  const order = ['json', 'bloom', 'search', 'ldap'];
  const mods = order.map((kind, i) => ({
    ...BUNDLE_MODULES.find((m) => m.kind === kind),
    x: 1310,
    y: 275 + i * 178.7,
  }));

  // Four branches out of the port, each stopping at its module's edge.
  const sx = 812;
  const harness = mods
    .map((m) => {
      const ex = m.x - (GLYPH_HALF_W[m.kind] + 26) * s;
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
    // Ambient glow behind everything that follows.
    `  <circle cx="${px}" cy="${cy}" r="330" fill="url(#h-cyan)" opacity="0.18"/>`,
    ...mods.map((m) => `  <circle cx="${n(m.x)}" cy="${n(m.y)}" r="150" fill="url(#h-${m.key})" opacity="0.22"/>`),
    `  <g>${harness}</g>`,
    `  <circle cx="${px}" cy="${cy}" r="150" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(px, cy, 208)}</g>`,
    `  <g>${mark(px, cy, 208)}</g>`,
    `  <g>${mods.map((m) => moduleGlyph(m.kind, m.x, m.y, s, m.color, m.key)).join('')}</g>`,
  ].join('\n');
}
// Key prefix groups: a scattered sample of keys on the left resolving into a
// short list of prefix groups with counts on the right.

export const themes = [
    { name: 'bundle-one-install', order: 33, seed: 33207, zoom: 1.2, center: [975, 540], title: 'Valkey bundle, one install', desc: 'A port marked with the white Valkey hexagon fanning out into four module diagrams: a nested document in brackets, a bit array, a magnifier over a scatter of points, and a padlock, representing one install that delivers all four bundled modules.', art: bundleOneInstall, motif: "A single strap arriving at the mark and branching into the same four modules", use: "valkey-bundle, one install that delivers several capabilities" },
];
