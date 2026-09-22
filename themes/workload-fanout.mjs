import { C, arcPath, dot, mark, n, starfield, weighted } from '../lib/core.mjs';
// Workload fan-out: one incoming workload arrives as a single bundled stream,
// and the store decomposes it into the primitives it already has, each landing
// in a differently shaped structure.
function workloadFanout(r) {
  const hx = 640;
  const hy = 540;
  const glyphX = 1206;

  // Inbound: one workload arriving as many requests, funnelling into the split.
  // Straight dashed lanes rather than long curves, so it reads as traffic.
  const lanes = [
    { y: 240, color: C.cyanLt, key: 'cyan' },
    { y: 390, color: C.mint, key: 'mint' },
    { y: 540, color: C.ice, key: 'ice' },
    { y: 690, color: C.violet, key: 'violet' },
    { y: 840, color: C.gold, key: 'gold' },
  ];

  // Cubic lanes out of the hub, with packets in flight along each one.
  const bez = (t, p0, p1, p2, p3) => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  };
  const wires = [];
  const packets = [];
  for (const lane of lanes) {
    const x0 = hx + 116;
    const c1 = x0 + 250;
    const c2 = glyphX - 300;
    const d =
      `M ${x0} ${hy} C ${n(c1)} ${hy} ${n(c2)} ${lane.y} ${glyphX - 24} ${lane.y}`;
    wires.push(
      `<path d="${d}" fill="none" stroke="${lane.color}" stroke-width="9" opacity="0.3" filter="url(#blur8)"/>`,
      `<path d="${d}" fill="none" stroke="${lane.color}" stroke-width="3.6" opacity="0.72"/>`
    );
    for (const t of [0.32, 0.58, 0.82]) {
      const px = bez(t, x0, c1, c2, glyphX - 24);
      const py = bez(t, hy, hy, lane.y, lane.y);
      packets.push(dot(px, py, 6.5, lane.color, lane.key, 0.9, 3.2));
    }
  }

  // Five distinct shapes for five distinct primitives.
  const glyphs = [];

  // 1. A ring of slot segments.
  const rc = [glyphX + 80, lanes[0].y];
  const rr = 58;
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2 + 0.07;
    const a1 = ((i + 1) / 10) * Math.PI * 2 - 0.07;
    glyphs.push(
      `<path d="${arcPath(rc[0], rc[1], rr, a0, a1)}" fill="none" stroke="${weighted(r, [[C.cyan, 5], [C.cyanLt, 4], [C.ice, 2]])}" ` +
        `stroke-width="15" opacity="${n(0.55 + r() * 0.4)}"/>`
    );
  }

  // 2. A chain of linked entries.
  for (let i = 0; i < 4; i++) {
    const x = glyphX + i * 62;
    if (i) glyphs.push(`<line x1="${n(x - 14)}" y1="${lanes[1].y}" x2="${n(x)}" y2="${lanes[1].y}" stroke="${C.mint}" stroke-width="2.4" opacity="0.6"/>`);
    glyphs.push(
      `<rect x="${n(x)}" y="${n(lanes[1].y - 21)}" width="48" height="42" rx="7" fill="${C.mint}" ` +
        `opacity="${n(0.42 + r() * 0.42)}"/>`
    );
  }

  // 3. A ranked stack, longest score at the top.
  for (let i = 0; i < 5; i++) {
    glyphs.push(
      `<rect x="${glyphX}" y="${n(lanes[2].y - 58 + i * 29)}" width="${n(228 - i * 34)}" height="19" rx="9.5" fill="${C.ice}" ` +
        `opacity="${n(0.8 - i * 0.11)}"/>`
    );
  }

  // 4. A bit-addressed grid, some bits set.
  for (let c = 0; c < 8; c++) {
    for (let j = 0; j < 4; j++) {
      const x = glyphX + c * 28;
      const y = lanes[3].y - 53 + j * 28;
      const set = r() < 0.5;
      glyphs.push(
        set
          ? `<rect x="${n(x)}" y="${n(y)}" width="22" height="22" rx="4" fill="${C.violet}" opacity="${n(0.6 + r() * 0.35)}"/>`
          : `<rect x="${n(x + 0.9)}" y="${n(y + 0.9)}" width="20.2" height="20.2" rx="4" fill="none" stroke="${C.violet}" stroke-width="1.8" opacity="0.34"/>`
      );
    }
  }

  // 5. An embedding, a run of magnitudes.
  for (let i = 0; i < 11; i++) {
    const h = 22 + r() * 88;
    glyphs.push(
      `<rect x="${n(glyphX + i * 22)}" y="${n(lanes[4].y - h / 2)}" width="14" height="${n(h)}" rx="7" fill="${C.gold}" ` +
        `opacity="${n(0.45 + r() * 0.45)}"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <circle cx="${hx}" cy="${hy}" r="360" fill="url(#h-violet)" opacity="0.3"/>`,
    `  <ellipse cx="${glyphX + 120}" cy="${hy}" rx="300" ry="430" fill="url(#h-cyan)" opacity="0.12"/>`,
    `  <g>${wires.join('')}</g>`,
    `  <g>${packets.join('')}</g>`,
    `  <g>${glyphs.join('')}</g>`,
    `  <circle cx="${hx}" cy="${hy}" r="158" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(hx, hy, 196)}</g>`,
    `  <g>${mark(hx, hy, 196)}</g>`,
  ].join('\n');
}

// -------------------------------------------------------- connection storms
//
// `connStormSpike` is the shape of the storm in time: quiet, a wall of
// simultaneous connection attempts, quiet again, with the part of the wall the
// server cannot accept in one pass stacked above its capacity. It does not draw
// a gate, which is `security-acl`'s job.

// The surge itself, as a timeline of attempts. Every cell is one connection, so
// the spike reads as clients piling up rather than as an abstract bar, and the
// coral above the dashed ceiling is the overshoot.

export const themes = [
    { name: 'workload-fanout', order: 15, seed: 35023, zoom: 1.18, center: [960, 540], title: 'Valkey workload primitives', desc: 'The white Valkey hexagon mark fanning out into five lanes, each ending in a differently shaped structure: a ring of slots, a chain of entries, a ranked stack, a grid of bits and a row of embedding magnitudes, representing a workload decomposing into the primitives Valkey already has.', art: workloadFanout, motif: "One inbound stream splitting at the mark into five differently shaped structures", use: "AI workloads mapped onto Valkey primitives" },
];
