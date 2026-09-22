import { C, frame, mark, n, starfield } from '../lib/core.mjs';
// Keyspace scan: a cursor holding one bounded window of a large keyspace, with
// the keys behind it already visited and the rest still ahead. The hop track
// Slot migration under a lens: the same two-instance migration as
// `atomic-slot-migration`, recomposed so the lens is unambiguously the subject.
// The instances and the stream are context, drawn quiet; the only place anything
// is bright or varied is inside the glass, where the migrating objects differ in
// length and colour. Solid background, because a starfield and a spotlight are
// two more textures competing with the thing you are meant to look at.
function slotMigrationLens() {
  const cx = 960;
  const cy = 520;
  const R = 268; // the glass
  const src = 516;
  const dst = 1404;
  const ringR = 92;

  // The two instances: a plain ring and the mark, at context weight.
  const instance = (x) =>
    `<circle cx="${x}" cy="${cy}" r="${ringR}" fill="none" stroke="${C.ice}" stroke-width="3" opacity="0.4"/>` +
    `<g opacity="0.9">${mark(x, cy, 86)}</g>`;

  // The stream between them, and one small arrowhead so the direction is not
  // ambiguous. It runs behind the glass rather than around it.
  const stream =
    `<line x1="${src + ringR + 16}" y1="${cy}" x2="${dst - ringR - 34}" y2="${cy}" stroke="${C.cyanLt}" ` +
      `stroke-width="3" opacity="0.4"/>` +
    `<path d="M ${dst - ringR - 54} ${cy - 16} L ${dst - ringR - 18} ${cy} L ${dst - ringR - 54} ${cy + 16}" ` +
      `fill="none" stroke="${C.cyanLt}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`;

  // What the glass is for: the objects in transit are not alike. Left-aligned on a
  // common edge so the differing lengths read as differing sizes.
  const left = 775;
  const rowsIn = [
    [-152, 300, C.cyanLt],
    [-76, 400, C.mint],
    [0, 250, C.gold],
    [76, 380, C.ice],
    [152, 330, C.coral],
  ];
  const contents = rowsIn
    .map(
      ([dy, len, color]) =>
        `<rect x="${left}" y="${n(cy + dy - 22)}" width="${len}" height="44" rx="22" fill="${color}" opacity="0.95"/>`
    )
    .join('');

  // The handle points away from the stream, so it does not read as part of it.
  const hx = cx - R * 0.72;
  const hy = cy + R * 0.72;

  return [
    `  <clipPath id="lensGlass"><circle cx="${cx}" cy="${cy}" r="${n(R - 14)}"/></clipPath>`,
    `  <g>${instance(src)}${instance(dst)}</g>`,
    `  <g>${stream}</g>`,
    `  <line x1="${n(hx)}" y1="${n(hy)}" x2="${n(hx - 148)}" y2="${n(hy + 148)}" stroke="${C.mint}" ` +
      `stroke-width="34" stroke-linecap="round" opacity="0.95"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(R - 14)}" fill="${C.ink}" fill-opacity="0.42"/>`,
    `  <g clip-path="url(#lensGlass)">${contents}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.mint}" stroke-width="18" opacity="0.95"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${n(R - 24)}" fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.5"/>`,
  ].join('\n');
}
// Atomic slot migration, with the lens given the frame. Same composition as
// `atomic-slot-migration`, which is left alone: two shards, a stream of slot
// segments between them, a magnifier on the stream. What changes is the
// hierarchy, not the drawing.
//
// Idea: one contiguous range of slots leaves one shard and lands on another, and
// you can watch it move.
// Focal: the magnifier. It is the largest object, the brightest, and the only
// thing carrying a halo. The rings, the stream and the chevron sit under it as
// context.

export const themes = [
    { name: 'slot-migration-lens', order: 36, seed: 45011, zoom: 1.26, center: [960, 540], title: 'Valkey slot migration under inspection', desc: 'Two Valkey instances drawn as quiet rings around the white hexagon mark with a thin stream running between them, and a large teal magnifying glass over the middle of that stream showing the objects in transit as bars of different lengths and colours, on a flat purple field, representing observability for slot migration.', art: slotMigrationLens, motif: "A big lens over the migration stream, instances and stream quiet", use: "Observability for migration, inspecting data in transit" },
];
