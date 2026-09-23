import { C, dot, mark, n } from '../lib/core.mjs';

// The credential glyph, shared by all three so the pair reads the same way in
// each. `pq` is the post-quantum certificate you are moving to, `legacy` the one
// already deployed. They differ in silhouette as well as in colour, which is what
// keeps them two unlike things in the narrow crop and in greyscale: the new one
// has a clipped upper corner, a doubled border and a ring seal, the old one square
// corners, a single border and a filled seal. No PRNG draw, so a plate cannot
// change shape depending on where in a theme it is drawn.
function certPlate(kind, cx, cy, w, h) {
  const pq = kind === 'pq';
  const color = pq ? C.mint : C.violet;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;
  const SW = 5; // one weight for every stroke in the glyph
  const cut = w * 0.28;
  // Inset outline. For the 45-degree chamfer the offset corner walks 0.414i along
  // each edge, which is what keeps the doubled border parallel to itself.
  const body = (i) => {
    const k = 0.414 * i;
    return pq
      ? `M ${n(x0 + i)} ${n(y0 + i)} L ${n(x1 - cut - k)} ${n(y0 + i)} ` +
          `L ${n(x1 - i)} ${n(y0 + cut + k)} L ${n(x1 - i)} ${n(y1 - i)} ` +
          `L ${n(x0 + i)} ${n(y1 - i)} Z`
      : `M ${n(x0 + i)} ${n(y0 + i)} L ${n(x1 - i)} ${n(y0 + i)} ` +
          `L ${n(x1 - i)} ${n(y1 - i)} L ${n(x0 + i)} ${n(y1 - i)} Z`;
  };
  const bars = [0.6, 0.46, 0.32]
    .map(
      (frac, i) =>
        `<rect x="${n(x0 + w * 0.15)}" y="${n(y0 + h * 0.23 + i * h * 0.125)}" ` +
        `width="${n(w * frac)}" height="${n(h * 0.062)}" rx="${n(h * 0.031)}" ` +
        `fill="${color}" opacity="0.6"/>`
    )
    .join('');
  const sx = x0 + w * 0.31;
  const sy = y1 - h * 0.19;
  const sr = w * 0.135;
  const seal = pq
    ? `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(sr)}" fill="none" stroke="${color}" stroke-width="${SW}"/>` +
      `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(sr * 0.36)}" fill="${color}"/>`
    : `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(sr)}" fill="${color}"/>`;
  return (
    `<path d="${body(0)}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="${SW}"/>` +
    (pq ? `<path d="${body(w * 0.055)}" fill="none" stroke="${color}" stroke-width="${SW}" opacity="0.8"/>` : '') +
    bars +
    seal
  );
}

// A. Idea: one server holds two certificates, and connections arriving mixed sort
// themselves to whichever one they can validate.
// Focal: the pair of certificate plates, the new one above the old one.

// A. Idea: one server holds two certificates, and connections arriving mixed sort
// themselves to whichever one they can validate.
// Focal: the pair of certificate plates, the new one above the old one.
function dualCertSort(r) {
  const nodeX = 680;
  const nodeY = 540;
  const plateX = 1240;
  const PW = 230;
  const PH = 300;
  const pqY = 330;
  const lgY = 750;
  const edge = plateX - PW / 2 - 4;

  // Arrival order is interleaved and the exits are grouped, so two lanes cross at
  // the waist. That crossing is the whole picture: the sort is the choosing.
  const lanes = [
    { y0: 230, waist: -44, y1: pqY - 62, kind: 'pq' },
    { y0: 380, waist: 16, y1: lgY - 62, kind: 'legacy' },
    { y0: 700, waist: -16, y1: pqY + 62, kind: 'pq' },
    { y0: 850, waist: 44, y1: lgY + 62, kind: 'legacy' },
  ];

  const wires = [];
  const ends = [];
  for (const lane of lanes) {
    const color = lane.kind === 'pq' ? C.mint : C.violet;
    const wy = nodeY + lane.waist;
    const d =
      `M 120 ${n(lane.y0)} C ${n(nodeX - 300)} ${n(lane.y0)} ${n(nodeX - 190)} ${n(wy)} ${n(nodeX)} ${n(wy)} ` +
      `C ${n(nodeX + 210)} ${n(wy)} ${n(edge - 250)} ${n(lane.y1)} ${n(edge)} ${n(lane.y1)}`;
    wires.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="13" opacity="0.2" filter="url(#blur8)"/>`,
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="5.5" opacity="0.6"/>`
    );
    ends.push(dot(edge, lane.y1, 7, color, lane.kind === 'pq' ? 'mint' : 'violet', 0.8, 3));
  }

  return [
    `  <g>${wires.join('')}</g>`,
    `  <g>${ends.join('')}</g>`,
    `  <circle cx="${plateX}" cy="${pqY}" r="210" fill="url(#h-mint)" opacity="0.42"/>`,
    `  <circle cx="${plateX}" cy="${lgY}" r="210" fill="url(#h-violet)" opacity="0.42"/>`,
    `  <g>${certPlate('pq', plateX, pqY, PW, PH)}</g>`,
    `  <g>${certPlate('legacy', plateX, lgY, PW, PH)}</g>`,
    `  <circle cx="${nodeX}" cy="${nodeY}" r="130" fill="url(#scrim)"/>`,
    `  <g>${mark(nodeX, nodeY, 150)}</g>`,
  ].join('\n');
}

// B. Idea: the same handshake, run by a client that can validate the new
// certificate and by one that cannot, comes back from the same server with a
// different certificate.
// Focal: the pair of certificate plates on the two return legs.

export const themes = [
    { name: 'dual-cert-tls', order: 40, seed: 91110, zoom: 1.2, center: [960, 540], title: 'Valkey dual TLS certificates', desc: 'Four connection lanes arriving from the left edge, two green and two purple, drawing together at the white Valkey hexagon mark and crossing there so both green lanes leave for a green certificate plate above and both purple lanes for a purple certificate plate below, the green plate drawn with a clipped corner, a doubled border and a ring seal and the purple one with square corners, a single border and a filled seal, representing one server offering two certificates and each connection being served the one it can validate.', art: dualCertSort, motif: "Arriving connections sorting themselves between two credentials", use: "TLS certificates, migration without a flag day, per-connection choice" },
];
