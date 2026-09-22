import { C, arcPath, frame, mark, n, starfield, weighted } from '../lib/core.mjs';
import { SLOTS, SLOT_STEP } from '../lib/shapes.mjs';
// One shard's slot ring. `vacated` slots are drawn as dashed holes, `arrived`
// slots bright mint; everything else is a normal owned slot.
function slotRing(r, cx, cy, rad, { vacated = [], arrived = [], width = 22 } = {}) {
  const out = [];
  for (let i = 0; i < SLOTS; i++) {
    const a0 = i * SLOT_STEP + 0.05;
    const a1 = (i + 1) * SLOT_STEP - 0.05;
    const d = arcPath(cx, cy, rad, a0, a1);
    if (vacated.includes(i)) {
      out.push(
        `<path d="${d}" fill="none" stroke="${C.cyanLt}" stroke-width="${width}" opacity="0.32" stroke-dasharray="6 8"/>`
      );
    } else if (arrived.includes(i)) {
      out.push(
        `<path d="${d}" fill="none" stroke="${C.mint}" stroke-width="${width + 4}" opacity="0.35" filter="url(#blur8)"/>`,
        `<path d="${d}" fill="none" stroke="${C.mint}" stroke-width="${width}" opacity="0.95"/>`
      );
    } else {
      out.push(
        `<path d="${d}" fill="none" stroke="${weighted(r, [[C.cyan, 6], [C.cyanLt, 3], [C.violet, 1]])}" ` +
          `stroke-width="${width}" opacity="${n(0.45 + r() * 0.35)}"/>`
      );
    }
  }
  return out.join('');
}

// Two shards side by side, with a chevron arrow driving a stream of slots from
// the old owner to the new one. The stream is built from the same segments the
// rings are, so what is moving is visibly the same thing the rings are made of.
// A magnifier picks out a few of them mid-flight.

// Two shards side by side, with a chevron arrow driving a stream of slots from
// the old owner to the new one. The stream is built from the same segments the
// rings are, so what is moving is visibly the same thing the rings are made of.
// A magnifier picks out a few of them mid-flight.
function slotMigrationRings(r) {
  const cy = 528;
  const src = 520;
  const dst = 1400;
  const R = 180;
  const SEG = 21; // matches the ring segment stroke width
  const FROM = [15, 0, 1, 2]; // faces right, toward the target
  const TO = [7, 8, 9, 10]; // faces left, toward the source

  const x0 = src + R + 16;
  const xEnd = 1168;
  const tip = dst - R - 30;

  // Three staggered lanes of slot segments in flight.
  const blocks = [];
  for (const ly of [cy - 34, cy, cy + 34]) {
    let x = x0 + r() * 46;
    while (x < xEnd) {
      const len = 42 + r() * 36;
      if (x + len > xEnd) break;
      blocks.push({
        x,
        y: ly,
        len,
        color: weighted(r, [[C.mint, 6], [C.ice, 3], [C.cyanLt, 2]]),
        op: 0.5 + ((x - x0) / (xEnd - x0)) * 0.45,
      });
      x += len + 9 + r() * 15;
    }
  }
  const drawBlocks = (boost = 0) =>
    blocks
      .map(
        (b) =>
          `<rect x="${n(b.x)}" y="${n(b.y - SEG / 2)}" width="${n(b.len)}" height="${SEG}" rx="${SEG / 2}" ` +
          `fill="${b.color}" opacity="${n(Math.min(1, b.op + boost))}"/>`
      )
      .join('');

  // Magnifier over the stream. Inside the lens the same segments are redrawn
  // larger, over a scrim so they replace rather than double up on the originals.
  const lx = 940;
  const ly = cy;
  const lr = 118;
  const hand = 0.75; // radians, down and to the right, clear of the arrow
  const h0 = [lx + Math.cos(hand) * (lr + 4), ly + Math.sin(hand) * (lr + 4)];
  const h1 = [lx + Math.cos(hand) * (lr + 96), ly + Math.sin(hand) * (lr + 96)];

  // Chevron arrowhead, the same mark the site uses for forward motion.
  const chev = (x, w, sw, op) =>
    `<path d="M ${n(x - w)} ${n(cy - w * 1.18)} L ${n(x)} ${n(cy)} L ${n(x - w)} ${n(cy + w * 1.18)}" ` +
    `fill="none" stroke="${C.mint}" stroke-width="${sw}" stroke-linejoin="miter" opacity="${op}"/>`;

  return [
    starfield(r, 55),
    `  <circle cx="${src}" cy="${cy}" r="320" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <circle cx="${dst}" cy="${cy}" r="320" fill="url(#h-mint)" opacity="0.22"/>`,
    `  <clipPath id="lens"><circle cx="${lx}" cy="${ly}" r="${lr}"/></clipPath>`,
    `  <g opacity="0.35" filter="url(#blur18)">${drawBlocks()}</g>`,
    `  <g>${drawBlocks()}</g>`,
    `  ${chev(tip - 62, 34, 12, 0.32)}`,
    `  <g filter="url(#blur18)" opacity="0.6">${chev(tip, 52, 20, 1)}</g>`,
    `  ${chev(tip, 52, 17, 0.98)}`,
    `  <g clip-path="url(#lens)">` +
      `<circle cx="${lx}" cy="${ly}" r="${lr}" fill="${C.ink}" opacity="0.55"/>` +
      `<g transform="translate(${lx} ${ly}) scale(1.75) translate(${-lx} ${-ly})">${drawBlocks(0.25)}</g>` +
      `</g>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="${C.ice}" opacity="0.05"/>`,
    `  <line x1="${n(h0[0])}" y1="${n(h0[1])}" x2="${n(h1[0])}" y2="${n(h1[1])}" stroke="${C.ice}" stroke-width="22" stroke-linecap="round" opacity="0.3" filter="url(#blur8)"/>`,
    `  <line x1="${n(h0[0])}" y1="${n(h0[1])}" x2="${n(h1[0])}" y2="${n(h1[1])}" stroke="${C.ice}" stroke-width="17" stroke-linecap="round" opacity="0.92"/>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${C.ice}" stroke-width="16" opacity="0.3" filter="url(#blur8)"/>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${C.ice}" stroke-width="10.5" opacity="0.95"/>`,
    `  <path d="${arcPath(lx, ly, lr - 22, -2.5, -1.7)}" fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.4" stroke-linecap="round"/>`,
    `  <g>${slotRing(r, src, cy, R, { vacated: FROM, width: SEG })}</g>`,
    `  <g>${slotRing(r, dst, cy, R, { arrived: TO, width: SEG })}</g>`,
    `  <g>${mark(src, cy, 112)}</g>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(dst, cy, 112)}</g>`,
    `  <g>${mark(dst, cy, 112)}</g>`,
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

// Keyspace scan: a cursor holding one bounded window of a large keyspace, with
// the keys behind it already visited and the rest still ahead. The hop track
// Slot migration under a lens: the same two-instance migration as
// `atomic-slot-migration`, recomposed so the lens is unambiguously the subject.
// The instances and the stream are context, drawn quiet; the only place anything
// is bright or varied is inside the glass, where the migrating objects differ in
// length and colour. Solid background, because a starfield and a spotlight are
// two more textures competing with the thing you are meant to look at.



// Large key: an even field of ordinary keys, and one key of exactly the same
// shape standing where a whole block of them used to be. The grid it displaces is
// removed cell by cell so the field stays aligned around it, rather than leaving
// ragged holes where a wide tile happened to overlap.

export const themes = [
    { name: 'atomic-slot-migration', order: 5, seed: 14041, zoom: 1.1, center: [960, 522], title: 'Valkey atomic slot migration', desc: 'Two shard slot rings, each centred on the white Valkey hexagon mark, with a chevron arrow driving a stream of slot segments from one to the other and a magnifier inspecting them mid-flight, representing atomic slot migration.', art: slotMigrationRings, motif: "Two shard rings, a chevron driving slots between them, magnifier on the stream", use: "Slot migration and rebalancing" },
];
