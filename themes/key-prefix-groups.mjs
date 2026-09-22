import { C, dot, n, starfield } from '../lib/core.mjs';
// Key prefix groups: a scattered sample of keys on the left resolving into a
// short list of prefix groups with counts on the right.
function keyPrefixGroups(r) {
  const ROWS = 6;
  const anchorX = 940;
  const rowY = [292, 392, 492, 592, 692, 792];
  const COUNTS = [1, 0.78, 0.55, 0.4, 0.28, 0.16];

  const keys = [];
  let guard = 0;
  while (keys.length < 92 && guard++ < 30000) {
    const x = 400 + r() * 430;
    const y = 250 + r() * 590;
    if (keys.every((k) => (k.x - x) ** 2 + (k.y - y) ** 2 > 42 ** 2)) keys.push({ x, y, g: (r() * ROWS) | 0 });
  }

  const edges = keys
    .map((k) => {
      const ty = rowY[k.g];
      const mx = (k.x + anchorX) / 2 + 60;
      return `<path d="M ${n(k.x)} ${n(k.y)} C ${n(mx)} ${n(k.y)} ${n(mx)} ${n(ty)} ${n(anchorX - 18)} ${n(ty)}" fill="none" opacity="${n(0.1 + r() * 0.16)}"/>`;
    })
    .join('');

  const dots = keys
    .map((k) => dot(k.x, k.y, 3.4 + r() * 2.6, C.cyanLt, 'cyan', 0.4 + r() * 0.35, 2.8))
    .join('');

  const list = [];
  for (let i = 0; i < ROWS; i++) {
    const y = rowY[i];
    const labelW = 118 + r() * 54;
    const barW = 40 + COUNTS[i] * 180;
    list.push(
      dot(anchorX, y, 8, C.mint, 'mint', 0.95, 3.2),
      `<rect x="${anchorX + 26}" y="${n(y - 9)}" width="${n(labelW)}" height="18" rx="9" fill="${C.ice}" opacity="0.55"/>`,
      `<rect x="${n(anchorX + 26 + labelW + 16)}" y="${n(y - 9)}" width="24" height="18" rx="9" fill="${C.ice}" opacity="0.22"/>`,
      `<rect x="${n(anchorX + 250)}" y="${n(y - 7)}" width="${n(barW)}" height="14" rx="7" fill="${C.mint}" opacity="${n(0.4 + 0.4 * COUNTS[i])}"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <ellipse cx="940" cy="540" rx="520" ry="430" fill="url(#h-cyan)" opacity="0.16"/>`,
    `  <rect x="900" y="240" width="550" height="604" rx="30" fill="${C.ink}" opacity="0.3"/>`,
    `  <rect x="900" y="240" width="550" height="604" rx="30" fill="none" stroke="${C.ice}" stroke-width="2" opacity="0.18"/>`,
    `  <g stroke="${C.cyanLt}" stroke-width="1.6">${edges}</g>`,
    `  <g>${dots}</g>`,
    `  <g>${list.join('')}</g>`,
  ].join('\n');
}
// ------------------------------------------------- a very small resource envelope
//
// `limits-tight-envelope` is the space itself: a whole server inside a boundary
// several steps smaller than the room it usually gets, packed to all four walls.
// `limits-gauge-pinned` is the reading off the same situation: filled to the last
// few percent of the scale, with a sliver left before the stop.

export const themes = [
    { name: 'key-prefix-groups', order: 34, seed: 23299, zoom: 1.3, center: [960, 542], title: 'Valkey key prefix groups', desc: 'A scattered cloud of sampled keys on the left funnelling into a short list of prefix rows with count bars on the right, representing a sample of key names grouped into browsable prefixes.', art: keyPrefixGroups, motif: "Sampled keys funnelling into prefix rows with count bars", use: "Key naming, prefixes, keyspace browsing and clients" },
];
