import { BAND_BOTTOM, BAND_TOP, C, clamp, n, starfield, weighted } from '../lib/core.mjs';
// Memory efficiency: one keyspace, drawn twice over. Sparse and pitted on the
// left, compacted into a dense block on the right.
function memoryEfficiency(r) {
  const rows = 13;
  const cols = 30;
  const cellW = 15;
  const rowStep = 43;
  const y0 = 540 - ((rows - 1) * rowStep) / 2;

  const xs = [];
  let x = 300;
  for (let i = 0; i < cols; i++) {
    xs.push(x);
    x += 56 - 33 * (i / (cols - 1));
  }
  const right = xs[cols - 1] + cellW;

  const cells = [];
  xs.forEach((cx, i) => {
    const t = i / (cols - 1);
    for (let j = 0; j < rows; j++) {
      if (r() < 0.34 * (1 - t) ** 1.3) continue; // fragmentation holes
      const color = weighted(r, [
        [C.cyanLt, 60],
        [C.mint, 22 + t * 24],
        [C.ice, 10],
        [C.coral, 8 * (1 - t)],
      ]);
      const op = clamp(0.26 + t * 0.62 + (r() - 0.5) * 0.16, 0.15, 0.95);
      cells.push(
        `<rect x="${n(cx)}" y="${n(y0 + j * rowStep - 11)}" width="${cellW}" height="22" rx="3" fill="${color}" opacity="${n(op)}"/>`
      );
    }
  });

  // Motion: the compaction sweep, left to right.
  const sweep = [];
  for (let i = 0; i < 34; i++) {
    const y = BAND_TOP - 40 + r() * (BAND_BOTTOM - BAND_TOP + 80);
    const x1 = 120 + r() * 400;
    const x2 = x1 + 200 + r() * 700;
    sweep.push(
      `<line x1="${n(x1)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y)}" stroke="${C.cyanLt}" stroke-width="${n(0.8 + r() * 1.4)}" opacity="${n(0.05 + r() * 0.12)}" stroke-linecap="round"/>`
    );
  }

  return [
    starfield(r, 50),
    `  <g>${sweep.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.3">${cells.join('')}</g>`,
    `  <g>${cells.join('')}</g>`,
    `  <ellipse cx="${n(right + 6)}" cy="540" rx="90" ry="330" fill="url(#h-mint)" opacity="0.55"/>`,
    `  <line x1="${n(right + 8)}" y1="${n(y0 - 30)}" x2="${n(right + 8)}" y2="${n(y0 + (rows - 1) * rowStep + 30)}" stroke="${C.ice}" stroke-width="3" opacity="0.75"/>`,
  ].join('\n');
}

// Clustering and scale: the slot ring, a meshed core, and rings of headroom
// with new shards latching on.

export const themes = [
    { name: 'memory-efficiency', order: 1, seed: 3313, zoom: 1.3, center: [885, 540], title: 'Valkey memory efficiency', desc: 'An abstract grid of cells that grows denser from left to right, representing the same data stored in less memory.', art: memoryEfficiency, motif: "Cell grid, pitted on the left, compacted dense on the right", use: "Memory footprint, encodings, defragmentation" },
];
