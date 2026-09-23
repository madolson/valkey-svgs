import { C, FONT, esc, mark, n, starfield, weighted } from '../lib/core.mjs';
// Release, with a caption. Same nova, but centred and symmetric so the text has
// somewhere to sit: pass any short string (a version, "GA", an event name).
//
//   node generate.mjs release-version --text "9.0" --out release-9-0
//
function releaseVersion(r, { text }) {
  const cx = 960;
  const cy = 402;
  const label = esc(text);

  const rays = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + 0.06;
    const r0 = 162 + r() * 44; // clear of the mark, or they hide behind it
    const len = 34 + Math.pow(r(), 2) * 250;
    rays.push(
      `<line x1="${n(cx + Math.cos(a) * r0)}" y1="${n(cy + Math.sin(a) * r0)}" ` +
        `x2="${n(cx + Math.cos(a) * (r0 + len))}" y2="${n(cy + Math.sin(a) * (r0 + len))}" ` +
        `stroke="${weighted(r, [[C.gold, 6], [C.ice, 4], [C.mint, 2]])}" stroke-width="${n(1 + r() * 2)}" ` +
        `stroke-linecap="round" opacity="${n(0.12 + r() * 0.4)}"/>`
    );
  }

  const rings = [130, 200, 285, 385]
    .map(
      (rad, i) =>
        `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${i < 2 ? C.gold : C.cyanLt}" ` +
        `stroke-width="${n(2.4 - i * 0.35)}" opacity="${n(0.38 - i * 0.07)}"/>`
    )
    .join('');

  const sparks = [];
  for (let i = 0; i < 50; i++) {
    const a = r() * Math.PI * 2;
    const d = 100 + Math.pow(r(), 0.7) * 440;
    sparks.push(
      `<circle cx="${n(cx + Math.cos(a) * d)}" cy="${n(cy + Math.sin(a) * d)}" r="${n(1.2 + r() * 3)}" ` +
        `fill="${weighted(r, [[C.gold, 5], [C.ice, 4], [C.mint, 2]])}" opacity="${n(0.25 + r() * 0.6)}"/>`
    );
  }

  // A blurred dark copy under the caption, so it stays readable wherever the
  // rings and sparks happen to fall behind it.
  const caption = (fill, extra = '') =>
    `<text x="${cx}" y="712" fill="${fill}" text-anchor="middle" font-family="${FONT}" ` +
    `font-size="118" font-weight="700" letter-spacing="2"${extra}>${label}</text>`;

  return [
    starfield(r, 60),
    `  <g>${rays.join('')}</g>`,
    `  <g>${rings}</g>`,
    `  <g>${sparks.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="300" fill="url(#h-gold)" opacity="0.9"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="172" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.6">${mark(cx, cy, 300)}</g>`,
    `  <g>${mark(cx, cy, 300)}</g>`,
    `  <g filter="url(#blur8)">${caption(C.ink, ' opacity="0.85"')}</g>`,
    `  ${caption('#FFFFFF')}`,
  ].join('\n');
}

// A heraldic shield centred on (cx, cy): flat top, straight sides, curved point.
// Shared by the shield themes so they are one silhouette under four treatments.

export const themes = [
    { name: 'release-version', noCaption: true, order: 4, seed: 5528, zoom: 1.3, center: [960, 520], title: 'Valkey release with a caption', text: '9.0', desc: 'A golden burst centred on the white Valkey hexagon mark above a large caption, representing a specific Valkey release.', art: releaseVersion, motif: "The same burst with a caption you set", use: "A specific release. See [Captions](#captions)" },
];
