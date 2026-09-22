import { C, mark, n, starfield } from '../lib/core.mjs';
// ------------------------------------------------------------- bloom filters
//
// Two halves of one feature, drawn as two themes rather than one crowded image.
// `bloom-bit-array` is the write side: several hash functions turn one item into
// a handful of set bits. `bloom-verdict` is the read side, and the honest half:
// a clear bit proves absence, every bit set is only a probability.

// Bloom filter, write side. One item at the top, k hash nodes fanning out of it,
// k cells lit in the array below. The array already carries bits from earlier
// items, so this item's five read as its own signature over a populated field.
function bloomBitArray(r) {
  const CELLS = 42;
  const STEP = 32;
  const CW = 20;
  const K = 5;
  const x0 = 290;
  const top = 545;
  const CH = 190;
  const hy = 432; // the row of hash nodes
  const mx = 960;
  const my = 250;
  const bx = (i) => x0 + i * STEP;
  const bc = (i) => bx(i) + CW / 2;

  // Positions spread across the middle of the array, jittered so the run does
  // not look like a ruler, and kept inside the narrow crop's safe width.
  const picks = [];
  for (let k = 0; k < K; k++) picks.push(7 + Math.round(k * 5.8) + Math.floor(r() * 5) - 2);

  const prior = [];
  for (let i = 0; i < CELLS; i++) if (!picks.includes(i) && r() < 0.38) prior.push(i);

  const slots = [];
  for (let i = 0; i < CELLS; i++) {
    slots.push(
      `<rect x="${n(bx(i))}" y="${top}" width="${CW}" height="${CH}" rx="4" fill="${C.cyan}" fill-opacity="0.05" stroke="${C.cyanLt}" stroke-width="1.4" opacity="0.28"/>`
    );
  }
  const already = prior.map(
    (i) =>
      `<rect x="${n(bx(i))}" y="${top}" width="${CW}" height="${CH}" rx="4" fill="${C.cyanLt}" opacity="${n(0.3 + r() * 0.2)}"/>`
  );

  // The fan: mark -> hash node -> the one cell that node sets. Routed as a bus
  // with right angles only. Swept diagonals here read as decoration and fight the
  // vertical drops underneath them.
  const busY = 366;
  const spokes = [];
  const nodes = [];
  const drops = [];
  picks.forEach((i, k) => {
    // Each hash node sits directly above the cell it sets, so its drop can be a
    // plain vertical.
    const hx = bc(i);
    spokes.push(
      `<line x1="${n(hx)}" y1="${busY}" x2="${n(hx)}" y2="${hy - 20}" stroke="${C.violet}" stroke-width="1.8" opacity="0.45"/>`
    );
    nodes.push(
      `<circle cx="${n(hx)}" cy="${hy}" r="30" fill="url(#h-violet)" opacity="0.55"/>`,
      `<circle cx="${n(hx)}" cy="${hy}" r="17" fill="${C.ink}" fill-opacity="0.55" stroke="${C.ice}" stroke-width="2.2" opacity="0.9"/>`,
      `<circle cx="${n(hx)}" cy="${hy}" r="5" fill="${C.ice}" opacity="0.85"/>`
    );
    drops.push(
      // Straight verticals: a hash node sits directly over the cell it sets, so
      // the drop reads as an index rather than as routing.
      `<line x1="${n(bc(i))}" y1="${hy + 18}" x2="${n(bc(i))}" y2="${top - 8}" stroke="${C.mint}" stroke-width="2.4" opacity="0.6"/>`
    );
  });

  // The trunk down from the mark and the bus the hash nodes hang off.
  const bus = [
    `<line x1="${mx}" y1="${my + 72}" x2="${mx}" y2="${busY}" stroke="${C.violet}" stroke-width="1.8" opacity="0.45"/>`,
    `<line x1="${n(bc(picks[0]))}" y1="${busY}" x2="${n(bc(picks[picks.length - 1]))}" y2="${busY}" stroke="${C.violet}" stroke-width="1.8" opacity="0.45"/>`,
  ];

  const lit = picks.flatMap((i) => [
    `<ellipse cx="${n(bc(i))}" cy="${top + CH / 2}" rx="48" ry="${n(CH * 0.8)}" fill="url(#h-mint)" opacity="0.8"/>`,
    `<rect x="${n(bx(i))}" y="${top}" width="${CW}" height="${CH}" rx="4" fill="${C.mint}" opacity="0.95"/>`,
  ]);

  // A baseline under the array, so the strip reads as an indexed row of bits.
  const axisY = top + CH + 22;
  const ticks = [];
  for (let i = 0; i <= CELLS; i += 6) {
    ticks.push(
      `<line x1="${n(bx(i))}" y1="${axisY}" x2="${n(bx(i))}" y2="${axisY + 16}" stroke="${C.ice}" stroke-width="2.4" opacity="0.5"/>`
    );
  }

  return [
    starfield(r, 50),
    // No background wash and no halo on the mark: the only lit things are the hash
    // nodes and the cells they set, which is what the image is about.
    `  <g>${slots.join('')}</g>`,
    `  <g>${already.join('')}</g>`,
    `  <g>${bus.join('')}</g>`,
    `  <g>${spokes.join('')}</g>`,
    `  <g>${drops.join('')}</g>`,
    `  <g>${lit.join('')}</g>`,
    `  <g>${nodes.join('')}</g>`,
    `  <line x1="${n(x0 - 14)}" y1="${axisY}" x2="${n(bx(CELLS - 1) + CW + 14)}" y2="${axisY}" stroke="${C.ice}" stroke-width="3" opacity="0.72"/>`,
    `  <g>${ticks.join('')}</g>`,
    `  <g>${mark(mx, my, 150)}</g>`,
  ].join('\n');
}

// ----------------------------------------------------------- valkey-search
//
// Two readings of one claim: a query lands in an indexed field, and only a
// small part of that field has to be looked at. What separates them is where the
// narrowing happens — around the query (`searchNearest`), or inside one indexed
// field (`searchFieldIndex`).

// Vector similarity: the query sits at the centre of an indexed field and only
// the handful of vectors inside its search radius light up. Everything past the
// radius stays dark, because nothing out there was scanned.

export const themes = [
    { name: 'bloom-bit-array', order: 11, seed: 31013, zoom: 1.4, center: [960, 475], title: 'Valkey Bloom filters', desc: 'The white Valkey hexagon mark above a long row of bit cells, with five hash nodes fanning out of it and the five cells they land on lit in green, representing one item hashed to a handful of positions in a Bloom filter.', art: bloomBitArray, motif: "Hash nodes fanning out of the mark, lighting a handful of cells in a bit array", use: "Bloom filters, valkey-bloom, probabilistic data structures" },
];
