import { C, n } from '../lib/core.mjs';

// Path Hash, as a radix tree walk. Several stored prefixes on the descent all
// cover the key; the deepest one wins, so it alone gets the gold halo. The
// off-path branches earn their place by making the structure a branching tree and
// showing the walk chose one child at each node; they stay quiet per rule 6.
//
// Idea: one walk left to right through a tree of shared prefixes finds the single most specific
// stored prefix that covers this key.
// Focal: the deepest matched prefix node, the only gold element and the only halo.
function pathTreeWalk(r) {
  // Horizontal: depth runs left to right, which is the reading direction and gives the
  // walk the long axis of a 16:9 frame instead of the short one. Lateral wander is small
  // on purpose, so the figure reads as one walk rather than as a zigzag.
  const path = [
    { x: 460, y: 540 }, // root
    { x: 700, y: 418 },
    { x: 940, y: 608 },
    { x: 1180, y: 464 }, // deepest stored prefix: the winner
    { x: 1420, y: 546 }, // the queried key, a leaf
  ];
  const matched = [1, 2, 3]; // stored prefixes that cover the key; last is winner
  const winner = 3;

  const stubEdges = [];
  const stubs = [];
  const off = [
    { from: 0, dx: 132, dy: 186 },
    { from: 1, dx: 128, dy: -170 },
    { from: 1, dx: 164, dy: 118 },
    { from: 2, dx: 128, dy: 184 },
    { from: 2, dx: 104, dy: -196 },
    { from: 3, dx: 126, dy: 158 },
  ];
  for (const o of off) {
    const p = path[o.from];
    const sx = p.x + o.dx;
    const sy = p.y + o.dy + (r() - 0.5) * 24;
    stubEdges.push(
      `<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(sx)}" y2="${n(sy)}" stroke="${C.cyanLt}" stroke-width="3" opacity="0.2"/>`
    );
    stubs.push(`<circle cx="${n(sx)}" cy="${n(sy)}" r="9" fill="${C.cyanLt}" opacity="0.22"/>`);
  }

  // The one walk: an ice polyline down the shared prefixes, with a soft underlay.
  const d = path.map((p, i) => `${i ? 'L' : 'M'} ${n(p.x)} ${n(p.y)}`).join(' ');

  // Shallower matches: cyan, a thin boundary ring, no halo.
  const nodes = matched
    .filter((i) => i !== winner)
    .flatMap((i) => {
      const p = path[i];
      return [
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="26" fill="none" stroke="${C.cyanLt}" stroke-width="3" opacity="0.5"/>`,
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="12" fill="${C.cyanLt}" opacity="0.55"/>`,
      ];
    });

  const w = path[winner];
  const root = path[0];
  const key = path[path.length - 1];

  return [
    `  <g>${stubEdges.join('')}</g>`,
    `  <g>${stubs.join('')}</g>`,
    `  <path d="${d}" fill="none" stroke="${C.ice}" stroke-width="16" opacity="0.22" filter="url(#blur8)"/>`,
    `  <path d="${d}" fill="none" stroke="${C.ice}" stroke-width="6" opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>`,
    `  <circle cx="${n(root.x)}" cy="${n(root.y)}" r="15" fill="none" stroke="${C.cyanLt}" stroke-width="3" opacity="0.5"/>`,
    `  <circle cx="${n(root.x)}" cy="${n(root.y)}" r="9" fill="${C.cyanLt}" opacity="0.55"/>`,
    `  <g>${nodes.join('')}</g>`,
    `  <circle cx="${n(key.x)}" cy="${n(key.y)}" r="12" fill="${C.ice}" opacity="0.9"/>`,
    // The winner: the single gold highlight, and the only element carrying a halo.
    `  <circle cx="${n(w.x)}" cy="${n(w.y)}" r="60" fill="url(#h-gold)" opacity="0.9"/>`,
    `  <circle cx="${n(w.x)}" cy="${n(w.y)}" r="34" fill="none" stroke="${C.gold}" stroke-width="5" opacity="0.95"/>`,
    `  <circle cx="${n(w.x)}" cy="${n(w.y)}" r="15" fill="${C.gold}" opacity="1"/>`,
  ].join('\n');
}


export const themes = [
    { name: 'path-hash', order: 38, seed: 91030, zoom: 1.3, center: [960, 545], title: 'Valkey path hash', desc: 'A branching prefix tree with one bright path walked left to right from the root to a queried key at a leaf, the stored prefixes along that path drawn as blue nodes and the deepest one that still covers the key given a gold halo, the branches the walk did not take left faint, representing longest-prefix match finding the single most specific stored prefix that covers a key.', art: pathTreeWalk, motif: "A walk down a tree of shared prefixes, the deepest matching node lit", use: "Longest-prefix match, routing tables, CIDR and config scopes" },
];
