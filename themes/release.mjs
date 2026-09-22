import { C, mark, n, starfield, weighted } from '../lib/core.mjs';
// Releases and announcements: the Valkey chevron driving forward into a burst.
function release(r) {
  const cy = 540;
  const apex = 1530;

  // Nested chevrons, the same mark as the site's chevron artwork, aimed at the
  // burst rather than overlapping it.
  const chevrons = [
    { x: 620, w: 74, op: 0.1 },
    { x: 900, w: 74, op: 0.19 },
    { x: 1180, w: 74, op: 0.32 },
  ]
    .map(
      ({ x, w, op }) =>
        `<path d="M ${x - 250} 290 L ${x} ${cy} L ${x - 250} 790" fill="none" stroke="${C.cyanLt}" ` +
        `stroke-width="${w}" stroke-linejoin="miter" opacity="${op}"/>`
    )
    .join('');

  // Rays firing out of the apex.
  const rays = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + 0.06;
    const r0 = 152 + r() * 44; // clear of the mark, or they hide behind it
    const len = 34 + Math.pow(r(), 2) * 250;
    rays.push(
      `<line x1="${n(apex + Math.cos(a) * r0)}" y1="${n(cy + Math.sin(a) * r0)}" ` +
        `x2="${n(apex + Math.cos(a) * (r0 + len))}" y2="${n(cy + Math.sin(a) * (r0 + len))}" ` +
        `stroke="${weighted(r, [[C.gold, 6], [C.ice, 4], [C.mint, 2]])}" stroke-width="${n(1 + r() * 2)}" ` +
        `stroke-linecap="round" opacity="${n(0.12 + r() * 0.4)}"/>`
    );
  }

  const rings = [100, 160, 235, 320, 415]
    .map(
      (rad, i) =>
        `<circle cx="${apex}" cy="${cy}" r="${rad}" fill="none" stroke="${i < 2 ? C.gold : C.cyanLt}" ` +
        `stroke-width="${n(2.4 - i * 0.35)}" opacity="${n(0.4 - i * 0.06)}"/>`
    )
    .join('');

  const sparks = [];
  for (let i = 0; i < 44; i++) {
    const a = r() * Math.PI * 2;
    const d = 80 + Math.pow(r(), 0.7) * 420;
    sparks.push(
      `<circle cx="${n(apex + Math.cos(a) * d)}" cy="${n(cy + Math.sin(a) * d)}" r="${n(1.2 + r() * 3)}" ` +
        `fill="${weighted(r, [[C.gold, 5], [C.ice, 4], [C.mint, 2]])}" opacity="${n(0.25 + r() * 0.6)}"/>`
    );
  }

  return [
    starfield(r, 60),
    `  <g>${chevrons}</g>`,
    `  <g>${rays.join('')}</g>`,
    `  <g>${rings}</g>`,
    `  <g>${sparks.join('')}</g>`,
    `  <circle cx="${apex}" cy="${cy}" r="290" fill="url(#h-gold)" opacity="0.9"/>`,
    `  <circle cx="${apex}" cy="${cy}" r="164" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.6">${mark(apex, cy, 288)}</g>`,
    `  <g>${mark(apex, cy, 288)}</g>`,
  ].join('\n');
}

// Release, with a caption. Same nova, but centred and symmetric so the text has
// somewhere to sit: pass any short string (a version, "GA", an event name).
//
//   node generate.mjs release-version --text "9.0" --out release-9-0
//

export const themes = [
    { name: 'release', order: 3, seed: 5527, zoom: 1.2, center: [1130, 540], title: 'Valkey release', desc: 'Valkey chevrons driving into a golden burst centred on the white Valkey hexagon mark, representing a new Valkey release.', art: release, motif: "Valkey chevrons driving into a golden burst", use: "Release and general announcements" },
];
