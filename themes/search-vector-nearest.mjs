import { C, dot, mark, n, starfield, weighted } from '../lib/core.mjs';
// ----------------------------------------------------------- valkey-search
//
// Two readings of one claim: a query lands in an indexed field, and only a
// small part of that field has to be looked at. What separates them is where the
// narrowing happens — around the query (`searchNearest`), or inside one indexed
// field (`searchFieldIndex`).

// Vector similarity: the query sits at the centre of an indexed field and only
// the handful of vectors inside its search radius light up. Everything past the
// radius stays dark, because nothing out there was scanned.
function searchNearest(r) {
  const cx = 960;
  const cy = 540;
  const RING = 336; // the search radius: the furthest kept neighbour sits on it

  // The indexed field. Nothing is allowed inside the radius: whatever falls in
  // the ring is a match, so a stray dim dot in there would contradict the one
  // thing this image says.
  const pts = [];
  let guard = 0;
  while (pts.length < 116 && guard++ < 40000) {
    const x = 150 + r() * 1620;
    const y = 188 + r() * 706;
    if (Math.hypot(x - cx, y - cy) < RING + 34) continue;
    if (pts.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 54 ** 2)) pts.push({ x, y });
  }

  // Short links between close pairs, kept faint: the field is an index, not a
  // spray of dots. Bright enough to read as structure and no brighter, or it
  // turns into the `community` constellation.
  const links = [];
  pts.forEach((p, i) => {
    pts
      .map((q, j) => ({ q, j, d: Math.hypot(p.x - q.x, p.y - q.y) }))
      .filter((c) => c.j > i && c.d < 172)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .forEach((c) => links.push(`<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(c.q.x)}" y2="${n(c.q.y)}"/>`));
  });

  const field = pts
    .map((p) => {
      const key = weighted(r, [['cyan', 7], ['violet', 2], ['ice', 1]]);
      const color = { cyan: C.cyanLt, violet: C.violet, ice: C.ice }[key];
      return dot(p.x, p.y, 3.4 + r() * 2.8, color, key, 0.34 + r() * 0.3, 3);
    })
    .join('');

  // The kept neighbours are placed rather than sampled, spread evenly around the
  // query so the neighbourhood reads as one at banner size. The first is pinned
  // to the radius, which is what makes the ring mean anything.
  const K = 6;
  const hits = [];
  for (let i = 0; i < K; i++) {
    const a = -Math.PI / 2 + (i / K) * Math.PI * 2 + (r() - 0.5) * 0.74;
    const d = i === 0 ? RING - 12 : 200 + r() * (RING - 214);
    hits.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
  }

  const spokes = hits
    .map((h) => `<line x1="${cx}" y1="${cy}" x2="${n(h.x)}" y2="${n(h.y)}"/>`)
    .join('');
  const lit = hits
    .map(
      (h) =>
        dot(h.x, h.y, 13, C.mint, 'mint', 1, 4) +
        `<circle cx="${n(h.x)}" cy="${n(h.y)}" r="29" fill="none" stroke="${C.ice}" stroke-width="2.2" opacity="0.55"/>`
    )
    .join('');

  return [
    starfield(r, 55),
    `  <circle cx="${cx}" cy="${cy}" r="470" fill="url(#h-cyan)" opacity="0.16"/>`,
    `  <g stroke="${C.cyanLt}" stroke-width="1.2" opacity="0.16">${links.join('')}</g>`,
    `  <g>${field}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${RING}" fill="none" stroke="${C.ice}" stroke-width="14" opacity="0.16" filter="url(#blur18)"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${RING}" fill="none" stroke="${C.ice}" stroke-width="2.4" stroke-dasharray="10 14" opacity="0.5"/>`,
    `  <g stroke="${C.mint}" stroke-width="9" opacity="0.3" filter="url(#blur8)">${spokes}</g>`,
    `  <g stroke="${C.mint}" stroke-width="2.6" opacity="0.8">${spokes}</g>`,
    `  <g>${lit}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="128" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(cx, cy, 176)}</g>`,
    `  <g>${mark(cx, cy, 176)}</g>`,
  ].join('\n');
}

// Secondary indexing: hash and JSON records give up one field each, that field
// is what the sorted index is built from, and a query brackets a short run of it
// instead of walking the records.

export const themes = [
    { name: 'search-vector-nearest', order: 12, seed: 32011, zoom: 1.2, center: [960, 540], title: 'Valkey vector search', desc: 'A dark field of indexed vectors with the white Valkey hexagon mark at the centre as the query, spokes reaching out to six bright green nearest matches inside a dashed search radius, representing vector similarity search.', art: searchNearest, motif: "Query at the centre of an indexed field, its nearest matches lit inside a search radius", use: "Vector similarity search, KNN queries, embeddings" },
];
