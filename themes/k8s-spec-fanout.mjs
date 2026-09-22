import { C, dot, mark, n, starfield, weighted } from '../lib/core.mjs';
// ------------------------------------------------------------- operations
//
// Both ops themes carry the same one idea: at scale you are looking at a fleet,
// not a server. `ops-fleet-triage` says the fleet is uniform and only a handful
// of it needs you; `ops-rolling-wave` says a change crosses that fleet one group
// at a time. Neither reuses the slot ring (`clustering`) or a chart
// (`benchmarks`).

// ------------------------------------------------------------- valkey-bundle
//
// One package that carries several capabilities you would otherwise install
// one at a time. Two readings of that: containment (`bundleCrate`) and delivery
// (`bundleOneInstall`). In both, every module has to be a *different* shape --
// repeated identical blocks say "many of the same" instead of "several
// different capabilities in one package".

// A base course of identical primitives, with progressively fewer and larger
// composites resting on them, ending in one thing.

// One declared spec on the left, the running set it produces on the right.
// Nothing to the right of the fan is authored: every pod is a copy of the panel.
function k8sSpecFanout(r) {
  const sx = 496;
  const sw = 296;
  const sTop = 250;
  const sH = 580;
  const cols = [1012, 1188, 1364];
  const rows = [300, 540, 780];
  const tile = 140;
  const railX0 = 924;
  const railX1 = 1452;

  // The declared values, suggested as indented rows rather than written out. One
  // row is picked out in gold: the replica count, which the right-hand side is a
  // picture of.
  const spec = [];
  let ly = sTop + 96;
  let i = 0;
  while (ly < sTop + sH - 34) {
    const indent = weighted(r, [[0, 3], [1, 5], [2, 3]]) * 24;
    const w = 52 + r() * (sw - 116 - indent);
    const key = i === 3;
    spec.push(
      `<rect x="${n(sx + 30 + indent)}" y="${n(ly)}" width="${n(w)}" height="9" rx="4.5" ` +
        `fill="${key ? C.gold : weighted(r, [[C.ice, 7], [C.cyanLt, 4]])}" ` +
        `opacity="${key ? 0.92 : n(0.24 + r() * 0.32)}"/>`
    );
    ly += 33;
    i++;
  }

  const panel =
    `<rect x="${sx}" y="${sTop}" width="${sw}" height="${sH}" rx="22" fill="${C.ink}" fill-opacity="0.5" ` +
      `stroke="${C.ice}" stroke-width="3" opacity="0.9"/>` +
    `<line x1="${sx + 24}" y1="${sTop + 70}" x2="${sx + sw - 24}" y2="${sTop + 70}" stroke="${C.ice}" ` +
      `stroke-width="1.8" opacity="0.45"/>` +
    `<g opacity="0.92">${mark(sx + 56, sTop + 38, 38)}</g>`;

  // One curve per row of instances, all of them leaving the same spec.
  const fanPaths = rows
    .map((y) => {
      const x0 = sx + sw + 10;
      return `<path d="M ${n(x0)} 540 C ${n(x0 + 130)} 540 ${railX0 - 130} ${n(y)} ${railX0} ${n(y)}"/>`;
    })
    .join('');

  const rails = rows
    .map(
      (y) =>
        `<line x1="${railX0}" y1="${n(y)}" x2="${railX1}" y2="${n(y)}" stroke="${C.cyanLt}" ` +
        `stroke-width="2" opacity="0.32"/>`
    )
    .join('');

  const packets = rows
    .map((y) =>
      [0.1, 0.4, 0.7]
        .map((t) => dot(railX0 + t * (railX1 - railX0), y, 4.5, C.mint, 'mint', 0.75, 3))
        .join('')
    )
    .join('');

  const glows = [];
  const pods = [];
  for (const y of rows) {
    for (const x of cols) {
      glows.push(`<circle cx="${x}" cy="${y}" r="104" fill="url(#h-cyan)" opacity="0.2"/>`);
      pods.push(
        `<rect x="${n(x - tile / 2)}" y="${n(y - tile / 2)}" width="${tile}" height="${tile}" rx="26" ` +
          `fill="${C.cyan}" fill-opacity="0.18" stroke="${C.cyanLt}" stroke-width="2.4" opacity="0.9"/>`,
        `<circle cx="${n(x)}" cy="${n(y)}" r="54" fill="url(#scrim)"/>`,
        mark(x, y, 72),
        dot(x + tile / 2 - 24, y - tile / 2 + 24, 5, C.mint, 'mint', 0.9, 3)
      );
    }
  }

  return [
    starfield(r, 55),
    `  <circle cx="${n(sx + sw / 2)}" cy="540" r="340" fill="url(#h-violet)" opacity="0.32"/>`,
    `  <circle cx="1188" cy="540" r="470" fill="url(#h-cyan)" opacity="0.14"/>`,
    `  <g stroke="${C.cyanLt}" stroke-width="13" fill="none" opacity="0.16" filter="url(#blur8)">${fanPaths}</g>`,
    `  <g stroke="${C.cyanLt}" stroke-width="2.4" fill="none" opacity="0.55">${fanPaths}</g>`,
    `  <g>${rails}</g>`,
    `  <g>${packets}</g>`,
    `  <g>${glows.join('')}</g>`,
    `  <g>${pods.join('')}</g>`,
    `  <g>${panel}</g>`,
    `  <g>${spec.join('')}</g>`,
  ].join('\n');
}

// The declared replica count and the instances converging on it: six slots
// bracketed in gold because that is what was asked for, four of them filled, one
// instance still on its way up and one slot still empty.

export const themes = [
    { name: 'k8s-spec-fanout', order: 19, seed: 42011, zoom: 1.34, center: [960, 540], title: 'Valkey deployed from a chart', desc: 'A declared specification panel on the left fanning out along rails into a grid of nine identical instances, each drawn as the white Valkey hexagon mark, representing deploying Valkey on Kubernetes from a Helm chart.', art: k8sSpecFanout, motif: "A declared spec panel fanning out along rails into a grid of identical instances", use: "Helm charts, operators, declarative deployment" },
];
