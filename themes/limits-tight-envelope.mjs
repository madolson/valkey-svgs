import { C, mark, n, starfield, weighted } from '../lib/core.mjs';
// ------------------------------------------------- a very small resource envelope
//
// `limits-tight-envelope` is the space itself: a whole server inside a boundary
// several steps smaller than the room it usually gets, packed to all four walls.
// `limits-gauge-pinned` is the reading off the same situation: filled to the last
// few percent of the scale, with a sliver left before the stop.

function limitsTightEnvelope(r) {
  const cx = 960;
  const cy = 540;
  const bw = 580;
  const bh = 420;
  const x0 = cx - bw / 2;
  const x1 = cx + bw / 2;
  const y0 = cy - bh / 2;
  const y1 = cy + bh / 2;

  // The room a server usually gets, stepping down to the envelope it has here.
  const ghosts = [[980, 820], [780, 620]]
    .map(
      ([w, h], i) =>
        `<rect x="${n(cx - w / 2)}" y="${n(cy - h / 2)}" width="${w}" height="${h}" rx="${28 - i * 6}" ` +
        `fill="none" stroke="${C.ice}" stroke-width="2.2" stroke-dasharray="14 20" opacity="${n(0.5 - i * 0.06)}"/>`
    )
    .join('');

  // The workload, filling the box out to both walls with almost nothing spare.
  const packed = [];
  for (let y = y0 + 15; y <= y1 - 13; y += 20) {
    let x = x0 + 11;
    while (x < x1 - 16) {
      const len = Math.min(36 + r() * 116, x1 - 11 - x);
      packed.push(
        `<rect x="${n(x)}" y="${n(y - 6)}" width="${n(len)}" height="12" rx="6" ` +
          `fill="${weighted(r, [[C.cyanLt, 6], [C.mint, 3], [C.ice, 2]])}" opacity="${n(0.4 + r() * 0.45)}"/>`
      );
      x += len + 6 + r() * 9;
    }
  }

  // Hard corners, so the boundary reads as a limit rather than as a container.
  const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]
    .map(
      ([x, y, dx, dy]) =>
        `<path d="M ${n(x + dx * 54)} ${n(y)} L ${n(x)} ${n(y)} L ${n(x)} ${n(y + dy * 54)}" fill="none" ` +
        `stroke="${C.ice}" stroke-width="8" stroke-linecap="round" opacity="0.95"/>`
    )
    .join('');

  // The workload pushing outward on every wall.
  const push = [];
  for (const t of [-0.56, 0, 0.56]) {
    const px = cx + t * (bw / 2 - 66);
    const py = cy + t * (bh / 2 - 56);
    const chev = (a, b, c, d, e, f) =>
      `<path d="M ${n(a)} ${n(b)} L ${n(c)} ${n(d)} L ${n(e)} ${n(f)}" fill="none" stroke="${C.gold}" ` +
      `stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
    push.push(
      chev(px - 20, y0 + 21, px, y0 + 3, px + 20, y0 + 21),
      chev(px - 20, y1 - 21, px, y1 - 3, px + 20, y1 - 21),
      chev(x0 + 21, py - 20, x0 + 3, py, x0 + 21, py + 20),
      chev(x1 - 21, py - 20, x1 - 3, py, x1 - 21, py + 20)
    );
  }

  return [
    starfield(r, 50),
    `  <circle cx="${cx}" cy="${cy}" r="420" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <g>${ghosts}</g>`,
    `  <rect x="${n(x0)}" y="${n(y0)}" width="${bw}" height="${bh}" rx="16" fill="none" stroke="${C.ice}" ` +
      `stroke-width="15" opacity="0.28" filter="url(#blur8)"/>`,
    `  <rect x="${n(x0)}" y="${n(y0)}" width="${bw}" height="${bh}" rx="16" fill="${C.ink}" fill-opacity="0.35"/>`,
    `  <g>${packed.join('')}</g>`,
    `  <rect x="${n(x0)}" y="${n(y0)}" width="${bw}" height="${bh}" rx="16" fill="none" stroke="${C.ice}" ` +
      `stroke-width="4" opacity="0.95"/>`,
    `  <g>${corners}</g>`,
    `  <g>${push.join('')}</g>`,
    `  <ellipse cx="${cx}" cy="${cy}" rx="200" ry="215" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.45">${mark(cx, cy, 340)}</g>`,
    `  <g>${mark(cx, cy, 340)}</g>`,
  ].join('\n');
}
// Keyspace scan: a cursor holding one bounded window of a large keyspace, with
// the keys behind it already visited and the rest still ahead. The hop track
// Slot migration under a lens: the same two-instance migration as
// `atomic-slot-migration`, recomposed so the lens is unambiguously the subject.
// The instances and the stream are context, drawn quiet; the only place anything
// is bright or varied is inside the glass, where the migrating objects differ in
// length and colour. Solid background, because a starfield and a spotlight are
// two more textures competing with the thing you are meant to look at.

export const themes = [
    { name: 'limits-tight-envelope', order: 35, seed: 42031, zoom: 1.03, center: [960, 540], title: 'Valkey in a tight resource envelope', desc: 'A small bright box packed edge to edge with work around the white Valkey hexagon mark, pushing outward on all four walls, set inside two much larger dashed outlines, representing a full server running in far less space than usual.', art: limitsTightEnvelope, motif: "A small box packed edge to edge, pushing out, inside far larger outlines", use: "Constrained hardware, small instances, resource ceilings" },
];
