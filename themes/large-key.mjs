import { C, n, starfield } from '../lib/core.mjs';
// Large key: an even field of ordinary keys, and one key of exactly the same
// shape standing where a whole block of them used to be. The grid it displaces is
// removed cell by cell so the field stays aligned around it, rather than leaving
// ragged holes where a wide tile happened to overlap.
function largeKey(r) {
  const pitchX = 140;
  const pitchY = 40;
  const tileH = 22;
  const tileMaxW = 110; // never wider than the pitch, or tiles cross columns
  const x0 = 205;
  const y0 = 240;
  const cols = 12;
  const rows = 16;
  // The block of ordinary keys the big one stands in place of.
  const BLOCK = { c0: 3, c1: 7, r0: 5, r1: 10 };
  const big = {
    x: x0 + BLOCK.c0 * pitchX,
    y: y0 + BLOCK.r0 * pitchY,
    w: (BLOCK.c1 - BLOCK.c0) * pitchX + tileMaxW,
    h: (BLOCK.r1 - BLOCK.r0) * pitchY + tileH,
  };

  const tiles = [];
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < rows; i++) {
      if (c >= BLOCK.c0 && c <= BLOCK.c1 && i >= BLOCK.r0 && i <= BLOCK.r1) continue;
      const x = x0 + c * pitchX;
      const y = y0 + i * pitchY;
      const w = 70 + r() * (tileMaxW - 70);
      tiles.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${tileH}" rx="11" fill="${C.ice}" opacity="${n(0.1 + r() * 0.09)}"/>`
      );
    }
  }

  return [
    starfield(r, 50),
    `  <ellipse cx="${n(big.x + big.w / 2)}" cy="${n(big.y + big.h / 2)}" rx="500" ry="420" fill="url(#h-coral)" opacity="0.18"/>`,
    `  <g>${tiles.join('')}</g>`,
    `  <rect x="${n(big.x)}" y="${n(big.y)}" width="${n(big.w)}" height="${n(big.h)}" rx="${n(big.h / 2)}" fill="${C.coral}" opacity="0.32"/>`,
    `  <rect x="${n(big.x)}" y="${n(big.y)}" width="${n(big.w)}" height="${n(big.h)}" rx="${n(big.h / 2)}" fill="none" stroke="${C.coral}" stroke-width="18" opacity="0.3" filter="url(#blur18)"/>`,
    `  <rect x="${n(big.x)}" y="${n(big.y)}" width="${n(big.w)}" height="${n(big.h)}" rx="${n(big.h / 2)}" fill="none" stroke="${C.coral}" stroke-width="4" opacity="0.95"/>`,
  ].join('\n');
}

// ------------------------------------------------------------- bloom filters
//
// Two halves of one feature, drawn as two themes rather than one crowded image.
// `bloom-bit-array` is the write side: several hash functions turn one item into
// a handful of set bits. `bloom-verdict` is the read side, and the honest half:
// a clear bit proves absence, every bit set is only a probability.

// Bloom filter, write side. One item at the top, k hash nodes fanning out of it,
// k cells lit in the array below. The array already carries bits from earlier
// items, so this item's five read as its own signature over a populated field.

export const themes = [
    { name: 'large-key', order: 10, seed: 21193, zoom: 1.4, center: [960, 548], title: 'Valkey large key', desc: 'An even field of small identical key tiles with one key of the same shape scaled up until it dwarfs them all, outlined in red, representing a single key far larger than everything else in the keyspace.', art: largeKey, motif: "A field of identical key tiles with one scaled up until it dwarfs them", use: "Large keys, hot keys, uneven key sizes" },
];
