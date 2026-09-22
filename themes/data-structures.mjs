import { C, dot, n, starfield, weighted } from '../lib/core.mjs';
// Data structures: hash buckets chaining out, with a skiplist underneath.
function dataStructures(r) {
  const bucketX = 330;
  const buckets = 12;
  const bucketStep = 48;
  const y0 = 540 - ((buckets - 1) * bucketStep) / 2;

  // A hash fan on the far left feeding the bucket array.
  const fan = [];
  for (let i = 0; i < buckets; i++) {
    const y = y0 + i * bucketStep;
    fan.push(
      `<line x1="252" y1="540" x2="${bucketX - 34}" y2="${n(y)}" stroke="${C.violet}" stroke-width="1.3" opacity="0.22"/>`
    );
  }

  // Bucket array with separate chaining.
  const chains = [];
  for (let i = 0; i < buckets; i++) {
    const y = y0 + i * bucketStep;
    chains.push(
      `<rect x="${bucketX - 32}" y="${n(y - 15)}" width="64" height="30" rx="5" fill="${C.cyan}" fill-opacity="0.12" stroke="${C.cyanLt}" stroke-width="1.8" opacity="0.6"/>`
    );
    const links = 1 + Math.floor(r() * 5);
    let x = bucketX + 32;
    for (let j = 0; j < links; j++) {
      const nx = x + 62 + r() * 26;
      chains.push(
        `<line x1="${n(x)}" y1="${n(y)}" x2="${n(nx - 24)}" y2="${n(y)}" stroke="${C.cyanLt}" stroke-width="1.6" opacity="0.45"/>`,
        `<rect x="${n(nx - 24)}" y="${n(y - 12)}" width="48" height="24" rx="4" fill="${weighted(r, [[C.cyan, 6], [C.mint, 3], [C.violet, 2]])}" opacity="${n(0.45 + r() * 0.4)}"/>`
      );
      x = nx + 24;
    }
  }

  // Skip list: five express lanes over a shared base row.
  const sx = 1030;
  const sw = 700;
  const cells = 17;
  const skip = [];
  for (let lvl = 0; lvl < 5; lvl++) {
    const y = 540 + ((4 - lvl) - 2) * 62;
    const stride = 1 << lvl;
    const lane = [];
    for (let i = 0; i < cells; i += stride) lane.push(sx + (i * sw) / (cells - 1));
    skip.push(
      `<path d="${lane.map((x, i) => `${i ? 'L' : 'M'} ${n(x)} ${n(y)}`).join(' ')}" fill="none" stroke="${C.mint}" stroke-width="${n(1.4 + lvl * 0.5)}" opacity="${n(0.26 + lvl * 0.13)}"/>`,
      lane.map((x) => dot(x, y, 4 + lvl, C.mint, 'mint', 0.5 + lvl * 0.11, 3.2)).join('')
    );
  }

  // Vertical drop lines tie the express lanes back to the base row.
  const drops = [];
  for (let i = 0; i < cells; i += 2) {
    const x = sx + (i * sw) / (cells - 1);
    drops.push(`<line x1="${n(x)}" y1="${n(540 - 124)}" x2="${n(x)}" y2="${n(540 + 124)}" stroke="${C.mint}" stroke-width="1.1" opacity="0.14"/>`);
  }

  return [
    starfield(r, 55),
    // Ambient glow goes behind the motif. Drawn on top it veils the whole thing
    // and the chains read as smudged.
    `  <circle cx="${bucketX}" cy="540" r="420" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <circle cx="${n(sx + sw / 2)}" cy="540" r="470" fill="url(#h-mint)" opacity="0.15"/>`,
    `  <g>${fan.join('')}</g>`,
    `  <g>${chains.join('')}</g>`,
    `  <g>${drops.join('')}</g>`,
    `  <g>${skip.join('')}</g>`,
    dot(252, 540, 9, C.violet, 'violet'),
  ].join('\n');
}

// How-to: a track of steps with the current one lit.

export const themes = [
    { name: 'data-structures', order: 8, seed: 8849, zoom: 1.22, center: [960, 540], title: 'Valkey data structures', desc: 'Abstract hash table buckets chaining outward beside a skip list of express lanes, representing Valkey data structures and internals.', art: dataStructures, motif: "Hash buckets chaining out beside a skip list", use: "Internals: hash tables, skip lists, new types, modules" },
];
