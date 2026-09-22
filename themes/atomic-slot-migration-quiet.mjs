import { C, arcPath, frame, mark, n, weighted } from '../lib/core.mjs';
import { SLOTS, SLOT_STEP } from '../lib/shapes.mjs';
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
function slotMigrationQuiet(r) {
  const cy = 528;
  const src = 500;
  const dst = 1420;
  const R = 196;
  const SEG = 21;
  const FROM = [15, 0, 1, 2]; // contiguous, and facing the target
  const TO = [7, 8, 9, 10]; // the same four, arrived, facing the source

  const x0 = src + R + 16;
  const xEnd = dst - R - 16;

  // Three staggered lanes of slot segments in flight. In-flight data is cyan:
  // mint is reserved for what has arrived, which is the ring's job, and ice for
  // the lens. The opacity ramp toward the target is the only direction cue the
  // stream carries, so the ring stays the one device that states direction.
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
        color: weighted(r, [[C.cyan, 6], [C.cyanLt, 4]]),
        op: 0.42 + ((x - x0) / (xEnd - x0)) * 0.3,
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

  // The lens: half again the radius it had, and the magnification raised so the
  // band resolves into separate slots inside the glass. That resolution is the
  // point of the lens, and it is what the chevron used to compete with.
  // The ring vocabulary, drawn deterministically: neutral slots are cyan at
  // context weight, and the moved range is violet and dashed where it left,
  // mint and solid where it landed, both at full opacity. Dimming the whole ring
  // was the first attempt and it buried the one thing the rings are there to say.
  const ring = (cx, run, color, dashed) => {
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
      const d = arcPath(cx, cy, R, i * SLOT_STEP + 0.05, (i + 1) * SLOT_STEP - 0.05);
      const moved = run.includes(i);
      out.push(
        `<path d="${d}" fill="none" stroke="${moved ? color : C.cyan}" stroke-width="${SEG}" ` +
          `opacity="${moved ? 0.95 : 0.34}"${moved && dashed ? ' stroke-dasharray="5 7"' : ''}/>`
      );
    }
    return out.join('');
  };

  const lx = 960;
  const ly = cy;
  const lr = 186; // leaves the stream visible either side of the glass
  const hand = 0.75;
  const h0 = [lx + Math.cos(hand) * (lr + 4), ly + Math.sin(hand) * (lr + 4)];
  const h1 = [lx + Math.cos(hand) * (lr + 128), ly + Math.sin(hand) * (lr + 128)];

  // One chevron, driving the stream into the destination. It is a second device
  // for direction alongside the ring, which rule 9 argues against, so it is kept
  // at context weight: no halo, no second ghosted copy, and a stroke well under
  // the lens rim's. It says "into that ring" in a way the rings alone cannot.
  const tip = dst - R - 26;
  const chevW = 42;
  const chevron =
    `<path d="M ${n(tip - chevW)} ${n(cy - chevW * 1.18)} L ${tip} ${cy} L ${n(tip - chevW)} ${n(cy + chevW * 1.18)}" ` +
    `fill="none" stroke="${C.mint}" stroke-width="12" stroke-linejoin="miter" opacity="0.6"/>`;

  return [
    `  <clipPath id="lensQuiet"><circle cx="${lx}" cy="${ly}" r="${lr}"/></clipPath>`,
    // Context: the stream, then the two rings at 0.62 so neither competes with
    // the glass. The vacated run is hollow, the arrived run solid, which is what
    // tells you which way the range went.
    `  <g>${drawBlocks()}</g>`,
    `  ${chevron}`,
    `  <g>${ring(src, FROM, C.violet, true)}</g>`,
    `  <g>${ring(dst, TO, C.mint, false)}</g>`,
    // Nothing haloes the marks any more, so they carry at 160 where 112 looked
    // undersized inside a ring this wide.
    `  <g>${mark(src, cy, 160)}</g>`,
    `  <g>${mark(dst, cy, 160)}</g>`,
    // The focal element, and the only halo in the frame.
    `  <g clip-path="url(#lensQuiet)">` +
      `<circle cx="${lx}" cy="${ly}" r="${lr}" fill="${C.ink}" opacity="0.62"/>` +
      `<g transform="translate(${lx} ${ly}) scale(2) translate(${-lx} ${-ly})">${drawBlocks(0.35)}</g>` +
      `</g>`,
    `  <line x1="${n(h0[0])}" y1="${n(h0[1])}" x2="${n(h1[0])}" y2="${n(h1[1])}" stroke="${C.ice}" ` +
      `stroke-width="26" stroke-linecap="round" opacity="0.3" filter="url(#blur8)"/>`,
    `  <line x1="${n(h0[0])}" y1="${n(h0[1])}" x2="${n(h1[0])}" y2="${n(h1[1])}" stroke="${C.ice}" ` +
      `stroke-width="20" stroke-linecap="round" opacity="0.95"/>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${C.ice}" stroke-width="22" opacity="0.3" filter="url(#blur8)"/>`,
    `  <circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${C.ice}" stroke-width="13" opacity="0.95"/>`,
  ].join('\n');
}

export const themes = [
    { name: 'atomic-slot-migration-quiet', order: 37, seed: 46011, zoom: 1.22, center: [960, 528], title: 'Valkey atomic slot migration', desc: 'Two shard slot rings each centred on the white Valkey hexagon mark, the left one showing four contiguous slots vacated in dashed purple and the right one the same four arrived in solid green, a quiet stream of slot segments running between them, a green chevron driving that stream into the destination, and a large magnifier over the middle of the stream resolving the band into separate slots, representing watching one contiguous range migrate atomically.', art: slotMigrationQuiet, motif: "The same two rings and lens, with the lens given the frame", use: "Slot migration when the point is watching it happen" },
];
