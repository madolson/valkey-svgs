import { C, arcPath, dot, mark, n, starfield, weighted } from '../lib/core.mjs';
// Clustering and scale: the slot ring, a meshed core, and rings of headroom
// with new shards latching on.
function clustering(r) {
  const cx = 960;
  const cy = 540;
  const R = 292;
  const slots = 16;
  const step = (Math.PI * 2) / slots;

  const arcs = [];
  for (let i = 0; i < slots; i++) {
    const a0 = i * step + 0.045;
    const a1 = (i + 1) * step - 0.045;
    const color = weighted(r, [
      [C.cyan, 44],
      [C.cyanLt, 26],
      [C.mint, 18],
      [C.coral, 6],
      [C.violet, 6],
    ]);
    arcs.push(
      `<path d="${arcPath(cx, cy, R, a0, a1)}" fill="none" stroke="${color}" stroke-width="24" stroke-linecap="butt" opacity="${n(0.5 + r() * 0.45)}"/>`
    );
  }

  const ticks = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const inner = R + 26;
    const outer = inner + (i % 6 === 0 ? 18 : 8);
    ticks.push(
      `<line x1="${n(cx + inner * Math.cos(a))}" y1="${n(cy + inner * Math.sin(a))}" x2="${n(cx + outer * Math.cos(a))}" y2="${n(cy + outer * Math.sin(a))}" stroke="${C.cyanLt}" stroke-width="1.6" opacity="${i % 6 === 0 ? 0.4 : 0.18}"/>`
    );
  }

  // Meshed core: six shards, all-to-all.
  const core = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    core.push({ x: cx + 132 * Math.cos(a), y: cy + 132 * Math.sin(a) });
  }
  const mesh = [];
  for (let i = 0; i < core.length; i++) {
    for (let j = i + 1; j < core.length; j++) {
      mesh.push(
        `<line x1="${n(core[i].x)}" y1="${n(core[i].y)}" x2="${n(core[j].x)}" y2="${n(core[j].y)}" stroke="${C.cyanLt}" stroke-width="1.4" opacity="0.3"/>`
      );
    }
  }

  // Shards joining from the outer ring.
  const joining = [];
  for (const a of [-1.05, 0.55, 2.5]) {
    const jx = cx + 396 * Math.cos(a);
    const jy = cy + 396 * Math.sin(a);
    joining.push(
      `<line x1="${n(cx + (R + 22) * Math.cos(a))}" y1="${n(cy + (R + 22) * Math.sin(a))}" x2="${n(jx)}" y2="${n(jy)}" stroke="${C.mint}" stroke-width="1.8" stroke-dasharray="9 11" opacity="0.55"/>`,
      dot(jx, jy, 11, C.mint, 'mint')
    );
  }

  return [
    starfield(r, 60),
    `  <circle cx="${cx}" cy="${cy}" r="396" fill="none" stroke="${C.cyanLt}" stroke-width="1.6" stroke-dasharray="4 16" opacity="0.22"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="500" fill="none" stroke="${C.violet}" stroke-width="1.6" stroke-dasharray="4 22" opacity="0.16"/>`,
    `  <g>${ticks.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.4">${arcs.join('')}</g>`,
    `  <g>${arcs.join('')}</g>`,
    `  <g>${mesh.join('')}</g>`,
    `  <g>${core.map((p) => dot(p.x, p.y, 10, C.cyanLt, 'cyan')).join('')}</g>`,
    `  <g>${joining.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="120" fill="url(#h-violet)" opacity="0.5"/>`,
    // A scrim keeps the mesh diagonals from reading through the mark.
    `  <circle cx="${cx}" cy="${cy}" r="138" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.45">${mark(cx, cy, 198)}</g>`,
    `  <g>${mark(cx, cy, 198)}</g>`,
  ].join('\n');
}

// Releases and announcements: the Valkey chevron driving forward into a burst.

export const themes = [
    { name: 'clustering', order: 2, seed: 4421, zoom: 1.34, center: [960, 540], title: 'Valkey clustering and scale', desc: 'An abstract ring of slot segments around a meshed core centred on the white Valkey hexagon mark, with shards joining from outside, representing cluster mode and horizontal scale.', art: clustering, motif: "Slot ring around a meshed core, shards joining from outside", use: "Cluster mode, replication, scaling out" },
];
