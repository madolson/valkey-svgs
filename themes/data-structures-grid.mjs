import { C, dot, n, starfield } from '../lib/core.mjs';
import { keySizeDistribution } from '../lib/shapes.mjs';
// ------------------------------------------------------- data structure survey
//
// An ordered catalogue of Valkey value types, one per cell on an even grid.
// `data-structures` looks *inside* two of them (hash buckets, a skip list);
// this one is the survey across several, and the point of it is the order.
function dataStructuresGrid(r) {
  const cw = 320;
  const chh = 338;
  const gap = 40;
  const cols = [960 - (cw + gap), 960, 960 + (cw + gap)];
  const rows = [540 - (chh + gap) / 2, 540 + (chh + gap) / 2];

  const glyph = (kind, cx, cy, color, key) => {
    const X = (v) => n(cx + v);
    const Y = (v) => n(cy + v);
    const glow = (x, y, rad, op = 0.9, halo = 3) => dot(cx + x, cy + y, rad, color, key, op, halo);

    // A string: one contiguous run of bytes, spanned as a single value.
    if (kind === 'string') {
      const out = [];
      const cell = 40;
      const g = 8;
      const total = 6 * cell + 5 * g;
      const x0 = -total / 2;
      for (let i = 0; i < 6; i++) {
        out.push(
          `<rect x="${X(x0 + i * (cell + g))}" y="${Y(-10)}" width="${cell}" height="52" rx="7" fill="${color}" ` +
            `fill-opacity="${n(0.4 + r() * 0.28)}" stroke="${color}" stroke-width="2.4" opacity="0.9"/>`
        );
      }
      out.push(
        `<path d="M ${X(x0)} ${Y(-24)} L ${X(x0)} ${Y(-36)} L ${X(x0 + total)} ${Y(-36)} L ${X(x0 + total)} ${Y(-24)}" ` +
          `fill="none" stroke="${color}" stroke-width="2.6" opacity="0.55"/>`
      );
      return out.join('');
    }

    // A list: nodes linked head to tail, in order.
    if (kind === 'list') {
      const out = [];
      const ys = [-105, -35, 35, 105];
      for (let i = 0; i < ys.length - 1; i++) {
        out.push(
          `<line x1="${X(0)}" y1="${Y(ys[i] + 23)}" x2="${X(0)}" y2="${Y(ys[i + 1] - 30)}" stroke="${color}" stroke-width="3" opacity="0.6"/>`,
          `<path d="M ${X(-8)} ${Y(ys[i + 1] - 36)} L ${X(0)} ${Y(ys[i + 1] - 23)} L ${X(8)} ${Y(ys[i + 1] - 36)}" ` +
            `fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`
        );
      }
      for (const y of ys) {
        out.push(
          `<rect x="${X(-62)}" y="${Y(y - 23)}" width="124" height="46" rx="11" fill="${color}" fill-opacity="0.16" ` +
            `stroke="${color}" stroke-width="2.8" opacity="0.9"/>`,
          `<line x1="${X(18)}" y1="${Y(y - 23)}" x2="${X(18)}" y2="${Y(y + 23)}" stroke="${color}" stroke-width="2" opacity="0.5"/>`,
          glow(-22, y, 5.5, 0.9, 3)
        );
      }
      return out.join('');
    }

    // A set: unordered members inside a boundary, no position and no repeats.
    if (kind === 'set') {
      const out = [
        `<circle cx="${X(0)}" cy="${Y(0)}" r="104" fill="${C.ink}" fill-opacity="0.14" stroke="${color}" ` +
          `stroke-width="3" stroke-dasharray="9 12" opacity="0.7"/>`,
      ];
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.pow(r(), 0.5) * 78;
        out.push(glow(Math.cos(a) * d, Math.sin(a) * d, 7, 0.85, 3));
      }
      return out.join('');
    }

    // A hash: field on the left, value on the right, one pair per row.
    if (kind === 'hash') {
      const out = [];
      const len = [70, 110, 84, 120];
      [-66, -22, 22, 66].forEach((y, i) => {
        out.push(
          `<rect x="${X(-90)}" y="${Y(y - 18)}" width="36" height="36" rx="8" fill="${color}" fill-opacity="0.24" ` +
            `stroke="${color}" stroke-width="2.6" opacity="0.9"/>`,
          `<line x1="${X(-48)}" y1="${Y(y)}" x2="${X(-32)}" y2="${Y(y)}" stroke="${color}" stroke-width="2.4" opacity="0.55"/>`,
          `<line x1="${X(-26)}" y1="${Y(y)}" x2="${X(-26 + len[i])}" y2="${Y(y)}" stroke="${color}" stroke-width="7" ` +
            `stroke-linecap="round" opacity="0.7"/>`
        );
      });
      return out.join('');
    }

    // A sorted set: members ranked by score, tallest first.
    if (kind === 'zset') {
      const out = [
        `<line x1="${X(-126)}" y1="${Y(98)}" x2="${X(126)}" y2="${Y(98)}" stroke="${color}" stroke-width="2.4" opacity="0.45"/>`,
      ];
      const h = [190, 158, 128, 98, 70];
      h.forEach((hh, i) => {
        const x = -104 + i * 52;
        out.push(
          `<rect x="${X(x - 17)}" y="${Y(98 - hh)}" width="34" height="${hh}" rx="7" fill="${color}" ` +
            `fill-opacity="${n(0.6 - i * 0.07)}" stroke="${color}" stroke-width="2.2" opacity="0.9"/>`,
          glow(x, 98 - hh, 6, 0.9, 3)
        );
      });
      return out.join('');
    }

    // A bitmap: dense on/off cells.
    const out = [];
    const cell = 24;
    const g = 6;
    const bw = 8 * cell + 7 * g;
    const bh = 6 * cell + 5 * g;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 6; j++) {
        const on = r() < 0.45;
        out.push(
          `<rect x="${X(-bw / 2 + i * (cell + g))}" y="${Y(-bh / 2 + j * (cell + g))}" width="${cell}" height="${cell}" rx="4" ` +
            `fill="${color}" fill-opacity="${on ? 0.82 : 0}" stroke="${color}" stroke-width="1.6" opacity="${on ? 0.95 : 0.26}"/>`
        );
      }
    }
    return out.join('');
  };

  const cells = [
    { kind: 'string', color: C.cyanLt, key: 'cyan' },
    { kind: 'list', color: C.mint, key: 'mint' },
    { kind: 'set', color: C.gold, key: 'gold' },
    { kind: 'hash', color: C.coral, key: 'coral' },
    { kind: 'zset', color: C.violet, key: 'violet' },
    { kind: 'bitmap', color: C.ice, key: 'ice' },
  ].map((c, i) => ({ ...c, cx: cols[i % 3], cy: rows[Math.floor(i / 3)] }));

  const frames = cells
    .map(
      (c) =>
        `<rect x="${n(c.cx - cw / 2)}" y="${n(c.cy - chh / 2)}" width="${cw}" height="${chh}" rx="22" ` +
        `fill="${C.ink}" fill-opacity="0.26" stroke="${C.ice}" stroke-width="2.4" opacity="0.32"/>` +
        // A short coloured tab on the top edge ties the cell to its type.
        `<line x1="${n(c.cx - cw / 2 + 26)}" y1="${n(c.cy - chh / 2)}" x2="${n(c.cx - cw / 2 + 100)}" y2="${n(c.cy - chh / 2)}" ` +
        `stroke="${c.color}" stroke-width="6" stroke-linecap="round" opacity="0.9"/>`
    )
    .join('');

  return [
    starfield(r, 55),
    // Ambient glow behind the grid, never over it.
    `  <ellipse cx="960" cy="540" rx="640" ry="430" fill="url(#h-cyan)" opacity="0.16"/>`,
    ...cells.map((c) => `  <circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="168" fill="url(#h-${c.key})" opacity="0.16"/>`),
    `  <g>${frames}</g>`,
    `  <g>${cells.map((c) => glyph(c.kind, c.cx, c.cy, c.color, c.key)).join('')}</g>`,
  ].join('\n');
}

// Key size distribution in Valkey Admin, beside the shards it is measured across:
// the panel ranks keys by size with the size printed next to each bar, two of them
// far larger than the rest, and each enclosure on the right holds the three servers
// of one shard. Connectors are elbows rather than curves, because a swept curve
// over this distance reads as decoration.
// The Valkey Admin panel: the ranked bars with their sizes printed. Pulled out of
// keySizeDistribution so the card layout can show it on its own; the coordinates are
// the originals, so the parent theme's output is unchanged.

export const themes = [
    { name: 'data-structures-grid', order: 18, seed: 33419, zoom: 1.2, center: [960, 540], title: 'Valkey data types', desc: 'Six Valkey value types laid out one per cell on an even three-by-two grid: a run of bytes, a linked list, unordered members inside a boundary, field and value pairs, members ranked by score, and a dense bitmap, representing the range of structures Valkey stores.', art: dataStructuresGrid, motif: "Six value types, one per cell on an even 3x2 grid: byte run, list, set, hash, sorted set, bitmap", use: "Type overviews, command surveys, what Valkey stores" },
];
