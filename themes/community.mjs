import { BAND_BOTTOM, BAND_TOP, C, W, dot, frame, mark, n, stamp, starfield, weighted } from '../lib/core.mjs';
// ------------------------------------------------------------------- themes

// Community: a constellation graph. Peers of every size, wired to their
// neighbours, with a handful of bright hubs.
function community(r) {
  const pts = [];
  let guard = 0;
  while (pts.length < 52 && guard++ < 20000) {
    const x = 70 + r() * (W - 140);
    const y = BAND_TOP + r() * (BAND_BOTTOM - BAND_TOP);
    if (pts.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 108 ** 2)) pts.push({ x, y, deg: 0 });
  }

  const edges = new Map();
  pts.forEach((p, i) => {
    const near = pts
      .map((q, j) => ({ j, d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 }))
      .filter((c) => c.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + (r() < 0.35 ? 1 : 0));
    for (const c of near) {
      const key = i < c.j ? `${i}-${c.j}` : `${c.j}-${i}`;
      if (!edges.has(key)) edges.set(key, [pts[i], pts[c.j]]);
      pts[i].deg++;
      pts[c.j].deg++;
    }
  });

  const lines = [...edges.values()]
    .map(([a, b]) => `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`)
    .join('');

  const hubs = [...pts].sort((a, b) => b.deg - a.deg).slice(0, 12);

  // The best-connected peers are drawn as the Valkey mark instead of a dot, at
  // descending sizes so the set doesn't read as a repeated stamp. Only hubs well
  // inside the frame qualify: the narrow-viewport crop is horizontal, and a
  // half-sliced logo reads as a mistake rather than as bleed.
  const MARK_SIZES = [86, 76, 68, 60, 54];
  const marked = new Map(
    hubs.filter((p) => p.x > 470 && p.x < 1450).slice(0, MARK_SIZES.length).map((p, i) => [p, MARK_SIZES[i]])
  );

  const dots = pts
    .filter((p) => !marked.has(p))
    .map((p) => {
      const hub = hubs.includes(p);
      const key = hub
        ? weighted(r, [['mint', 3], ['coral', 2], ['ice', 3]])
        : weighted(r, [['cyan', 6], ['mint', 2], ['violet', 1]]);
      const color = { cyan: C.cyanLt, mint: C.mint, coral: C.coral, violet: C.violet, ice: C.ice }[key];
      const rad = hub ? 9 + r() * 5 : 3 + r() * 3.5;
      return dot(p.x, p.y, rad, color, key, hub ? 1 : 0.55 + r() * 0.35);
    })
    .join('');

  const logos = [...marked]
    .map(
      ([p, size]) =>
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(size * 1.25)}" fill="url(#h-ice)" opacity="0.7"/>` +
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(size * 0.62)}" fill="url(#scrim)"/>` +
        `<g filter="url(#blur8)" opacity="0.45">${mark(p.x, p.y, size)}</g>` +
        `<g>${mark(p.x, p.y, size)}</g>`
    )
    .join('');

  return [
    starfield(r, 70),
    `  <g stroke="${C.cyan}" stroke-width="6" opacity="0.12" filter="url(#blur8)">${lines}</g>`,
    `  <g stroke="${C.cyanLt}" stroke-width="1.3" opacity="0.38">${lines}</g>`,
    `  <g>${dots}</g>`,
    `  <g>${logos}</g>`,
  ].join('\n');
}


// Memory efficiency: one keyspace, drawn twice over. Sparse and pitted on the
// left, compacted into a dense block on the right.

export const themes = [
    { name: 'community', order: 0, seed: 1041, zoom: 1.32, center: [960, 540], title: 'Valkey community', desc: 'An abstract constellation of connected nodes, the best-connected of them drawn as the white Valkey hexagon mark, representing the Valkey community.', art: community, motif: "Constellation graph, best-connected peers drawn as the Valkey mark", use: "Community highlights, contributor spotlights, roundups, governance" },
];
