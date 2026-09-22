import { C, frame, mark, n, starfield, weighted } from '../lib/core.mjs';
// Secondary indexing: hash and JSON records give up one field each, that field
// is what the sorted index is built from, and a query brackets a short run of it
// instead of walking the records.
function searchFieldIndex(r) {
  const laneY = 650;
  const cardTop = 170;
  const cardW = 196;
  const cardH = 178;
  const step = 262;
  const cardX = [0, 1, 2, 3].map((i) => 469 + i * step);

  // Records. One field per record is the indexed one, drawn mint; the rest are
  // along for the ride. It is the bottom field so its drop line leaves the card
  // without crossing the others, which otherwise reads as a smudge.
  const KEYED = 3;
  const cards = [];
  const keyed = [];
  cardX.forEach((x, ci) => {
    cards.push(
      `<rect x="${x}" y="${cardTop}" width="${cardW}" height="${cardH}" rx="12" ` +
        `fill="${C.cyan}" fill-opacity="0.1" stroke="${C.cyanLt}" stroke-width="2.2" opacity="0.75"/>`
    );
    for (let f = 0; f < 4; f++) {
      const y = cardTop + 30 + f * 38;
      const w = f === KEYED ? cardW - 48 : 62 + r() * (cardW - 130);
      if (f === KEYED) {
        keyed.push({ x: x + cardW / 2, y: y + 7, ci });
        cards.push(
          `<rect x="${x + 24}" y="${n(y)}" width="${n(w)}" height="15" rx="7" fill="${C.mint}" opacity="0.9"/>`,
          `<rect x="${x + 24}" y="${n(y)}" width="${n(w)}" height="15" rx="7" fill="${C.mint}" opacity="0.4" filter="url(#blur8)"/>`
        );
      } else {
        cards.push(
          `<rect x="${x + 24}" y="${n(y)}" width="${n(w)}" height="11" rx="5" fill="${C.ice}" opacity="${n(0.24 + r() * 0.14)}"/>`
        );
      }
    }
  });

  // The sorted index. Entry heights rise and fall so it reads as ordered values
  // rather than as a barcode.
  const n0 = 250;
  const n1 = 1680;
  const count = 52;
  const HIT = [24, 25, 26]; // the matched run, centred in the frame
  const entries = [];
  const at = (i) => n0 + (i * (n1 - n0)) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = at(i);
    if (HIT.includes(i)) continue;
    const h = 16 + Math.abs(Math.sin(i * 0.41)) * 44 + r() * 12;
    entries.push(
      `<rect x="${n(x - 5)}" y="${n(laneY - h)}" width="10" height="${n(h)}" rx="4" ` +
        `fill="${weighted(r, [[C.cyanLt, 7], [C.violet, 2], [C.ice, 1]])}" opacity="${n(0.3 + r() * 0.3)}"/>`
    );
  }
  const hits = HIT.map((i) => {
    const x = at(i);
    const h = 78;
    return (
      `<rect x="${n(x - 7)}" y="${n(laneY - h)}" width="14" height="${h}" rx="6" fill="${C.mint}" opacity="0.4" filter="url(#blur8)"/>` +
      `<rect x="${n(x - 7)}" y="${n(laneY - h)}" width="14" height="${h}" rx="6" fill="${C.mint}" opacity="0.95"/>`
    );
  }).join('');

  // Drop lines: each record's indexed field value takes its place in the order.
  // One of them lands inside the matched run, which is the whole point.
  const lands = [39, 25, 12, 45];
  const drops = keyed
    .map(
      (k, i) =>
        `<path d="M ${n(k.x)} ${n(k.y)} L ${n(k.x)} ${n(k.y + 58)} L ${n(at(lands[i]))} ${n(laneY - 96)} L ${n(at(lands[i]))} ${n(laneY - 74)}" ` +
        `fill="none" stroke="${C.mint}" stroke-width="1.6" stroke-dasharray="7 9" opacity="${lands[i] === HIT[1] ? 0.62 : 0.3}"/>`
    )
    .join('');

  // The query: a caliper under the lane holding exactly the matched run.
  const bl = at(HIT[0]) - 26;
  const br = at(HIT[HIT.length - 1]) + 26;
  const by = laneY + 42;
  const caliper =
    `<path d="M ${n(bl)} ${n(by - 26)} L ${n(bl)} ${n(by)} L ${n(br)} ${n(by)} L ${n(br)} ${n(by - 26)}" ` +
    `fill="none" stroke="${C.ice}" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>` +
    `<line x1="${n((bl + br) / 2)}" y1="${n(by)}" x2="${n((bl + br) / 2)}" y2="${n(by + 44)}" stroke="${C.ice}" stroke-width="3.4" opacity="0.9"/>`;

  const mx = (bl + br) / 2;
  const my = 832;

  return [
    starfield(r, 55),
    `  <circle cx="960" cy="${cardTop + cardH / 2}" r="520" fill="url(#h-cyan)" opacity="0.12"/>`,
    `  <circle cx="${n(mx)}" cy="${n(laneY + 40)}" r="330" fill="url(#h-mint)" opacity="0.24"/>`,
    `  <g>${cards.join('')}</g>`,
    `  <g>${drops}</g>`,
    `  <line x1="${n0 - 40}" y1="${laneY}" x2="${n1 + 40}" y2="${laneY}" stroke="${C.ice}" stroke-width="10" opacity="0.2" filter="url(#blur8)"/>`,
    `  <line x1="${n0 - 40}" y1="${laneY}" x2="${n1 + 40}" y2="${laneY}" stroke="${C.ice}" stroke-width="2.6" opacity="0.7"/>`,
    `  <g>${entries.join('')}</g>`,
    `  <g>${hits}</g>`,
    `  ${caliper}`,
    `  <circle cx="${n(mx)}" cy="${my}" r="118" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(mx, my, 162)}</g>`,
    `  <g>${mark(mx, my, 162)}</g>`,
  ].join('\n');
}

// --------------------------------------------------------- client libraries
//
// Three takes on one idea: many languages, one protocol, one server. What has to
// read geometrically is that the callers are visibly *different from each other*
// — not the uniform traffic `performance` draws — and that whatever they send
// arrives in the same shape at a single server.

// Ports: six unlike callers reaching in from outside, each ending in the same
// port at the same radius. Outside that circle every spoke is drawn differently;
// inside it every spoke is identical, and it is the same server at the middle.

export const themes = [
    { name: 'search-field-index', order: 13, seed: 32047, zoom: 1.1, center: [960, 540], title: 'Valkey secondary indexing', desc: 'Four record cards each contributing one highlighted green field to a sorted index lane below, with a query caliper bracketing three matched entries above the white Valkey hexagon mark, representing secondary indexing on hashes and JSON.', art: searchFieldIndex, motif: "Records giving up one field each to a sorted index, a query bracketing the matched run", use: "Secondary indexing on hashes and JSON, FT.CREATE, filters" },
];
