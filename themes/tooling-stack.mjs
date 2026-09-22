import { C, mark, n, starfield } from '../lib/core.mjs';
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
function toolingStack(r) {
  const baseY = 880;
  const bx0 = 524;
  const bx1 = 1396;
  const count = 11;
  const step = (bx1 - bx0) / (count - 1);
  const prim = Array.from({ length: count }, (_, i) => bx0 + i * step);

  const chips = prim
    .map(
      (x) =>
        `<rect x="${n(x - 22)}" y="${n(baseY - 15)}" width="44" height="30" rx="7" fill="${C.cyan}" fill-opacity="0.2" ` +
        `stroke="${C.cyanLt}" stroke-width="2" opacity="0.85"/>` +
        `<circle cx="${n(x)}" cy="${baseY}" r="3.4" fill="${C.cyanLt}" opacity="0.8"/>`
    )
    .join('');

  // Level one: four tools, each standing on a run of primitives and each drawn
  // with a different inner detail so they do not read as one block repeated.
  const l1y = 718;
  const l1 = [
    { members: [0, 1, 2], glyph: 'dots', h: 62 },
    { members: [3, 4], glyph: 'chevron', h: 50 },
    { members: [5, 6, 7], glyph: 'wave', h: 66 },
    { members: [8, 9, 10], glyph: 'ring', h: 56 },
  ].map((t) => {
    const left = prim[t.members[0]] - 28;
    const right = prim[t.members[t.members.length - 1]] + 28;
    return { ...t, left, right, cx: (left + right) / 2, y: l1y };
  });

  // Level two: two composites, each spanning two of the tools below.
  const l2y = 552;
  const l2 = [[0, 1], [2, 3]].map((pair) => {
    const left = l1[pair[0]].left + 14;
    const right = l1[pair[1]].right - 14;
    return { left, right, cx: (left + right) / 2, y: l2y };
  });

  const inner = (t) => {
    if (t.glyph === 'dots') {
      return [-1, 0, 1].map((i) => `<circle cx="${n(t.cx + i * 26)}" cy="${t.y}" r="6" fill="${C.mint}" opacity="0.9"/>`).join('');
    }
    if (t.glyph === 'chevron') {
      return (
        `<path d="M ${n(t.cx - 13)} ${t.y - 15} L ${n(t.cx + 8)} ${t.y} L ${n(t.cx - 13)} ${t.y + 15}" ` +
        `fill="none" stroke="${C.mint}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
      );
    }
    if (t.glyph === 'wave') {
      const w = (t.right - t.left) * 0.5;
      return (
        `<path d="M ${n(t.cx - w / 2)} ${t.y + 9} L ${n(t.cx - w / 6)} ${t.y - 11} L ${n(t.cx + w / 6)} ${t.y + 6} L ${n(t.cx + w / 2)} ${t.y - 13}" ` +
        `fill="none" stroke="${C.mint}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
      );
    }
    return (
      `<circle cx="${n(t.cx)}" cy="${t.y}" r="15" fill="none" stroke="${C.mint}" stroke-width="4" opacity="0.9"/>` +
      `<circle cx="${n(t.cx)}" cy="${t.y}" r="4.5" fill="${C.mint}" opacity="0.9"/>`
    );
  };

  const l1Boxes = l1
    .map(
      (t) =>
        `<rect x="${n(t.left)}" y="${n(t.y - t.h / 2)}" width="${n(t.right - t.left)}" height="${n(t.h)}" rx="14" ` +
        `fill="${C.mint}" fill-opacity="0.1" stroke="${C.mint}" stroke-width="2.8" opacity="0.85"/>` +
        inner(t)
    )
    .join('');

  const l2Boxes = l2
    .map(
      (t) =>
        `<rect x="${n(t.left)}" y="${n(t.y - 37)}" width="${n(t.right - t.left)}" height="74" rx="18" ` +
        `fill="${C.gold}" fill-opacity="0.1" stroke="${C.gold}" stroke-width="3" opacity="0.85"/>` +
        [-2, -1, 0, 1, 2]
          .map((i) => `<rect x="${n(t.cx + i * 34 - 8)}" y="${n(t.y - 13)}" width="16" height="26" rx="5" fill="${C.gold}" opacity="${n(0.4 + r() * 0.45)}"/>`)
          .join('')
    )
    .join('');

  // What rests on what.
  const legs = [];
  for (const t of l1) {
    for (const m of t.members) {
      legs.push(
        `<line x1="${n(prim[m])}" y1="${n(baseY - 15)}" x2="${n(prim[m])}" y2="${n(t.y + t.h / 2)}" stroke="${C.cyanLt}" stroke-width="2.2" opacity="0.45"/>`
      );
    }
  }
  l2.forEach((c, i) => {
    for (const t of [l1[i * 2], l1[i * 2 + 1]]) {
      legs.push(
        `<line x1="${n(t.cx)}" y1="${n(t.y - t.h / 2)}" x2="${n(t.cx)}" y2="${n(c.y + 37)}" stroke="${C.mint}" stroke-width="2.4" opacity="0.5"/>`
      );
    }
  });
  const markY = 300;
  for (const c of l2) {
    legs.push(
      `<line x1="${n(c.cx)}" y1="${n(c.y - 37)}" x2="960" y2="${n(markY + 76)}" stroke="${C.gold}" stroke-width="2.4" stroke-dasharray="12 10" opacity="0.5"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <ellipse cx="960" cy="560" rx="540" ry="360" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <circle cx="960" cy="${markY}" r="230" fill="url(#h-gold)" opacity="0.4"/>`,
    `  <line x1="${n(bx0 - 34)}" y1="${baseY}" x2="${n(bx1 + 34)}" y2="${baseY}" stroke="${C.cyanLt}" stroke-width="2" stroke-dasharray="8 12" opacity="0.35"/>`,
    `  <g>${legs.join('')}</g>`,
    `  <g>${chips}</g>`,
    `  <g>${l1Boxes}</g>`,
    `  <g>${l2Boxes}</g>`,
    `  <circle cx="960" cy="${markY}" r="112" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(960, markY, 152)}</g>`,
    `  <g>${mark(960, markY, 152)}</g>`,
  ].join('\n');
}
// Delivery: one install, and the four modules it puts on the server. The port is
// what you install into; the fan is what you get.

export const themes = [
    { name: 'tooling-stack', order: 32, seed: 33311, zoom: 1.25, center: [960, 540], title: 'Valkey primitives and tools', desc: 'A base course of identical small primitives with four differently detailed tools resting on runs of them, two larger composites above those, and the white Valkey hexagon mark at the top, representing tools built out of server primitives.', art: toolingStack, motif: "Identical primitives at the base, differently detailed tools resting on them, the mark on top", use: "Server primitives, what gets built on them, extensibility" },
];
