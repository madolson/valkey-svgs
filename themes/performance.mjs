import { C, clamp, defs, mark, n, weighted } from '../lib/core.mjs';
// Performance: command traffic streaking toward a vanishing point, the same
// gesture as the hero background but without the command names.
function performance(r) {
  const fx = 1530;
  const fy = 505;
  const squash = 0.4;
  // Every streak rides the same spiral, so the field reads as one warp rather
  // than as noise. Twist accumulates with distance from the mark, which means
  // streaks straighten out as they arrive and bend hardest way out in the tail.
  const TWIST = -0.00018;
  const MAX_SWEEP = 0.15; // radians, or long tails curl right round
  const streaks = [];
  const grads = [];

  for (let i = 0; i < 240; i++) {
    const hero = i < 12;
    const angle = Math.PI + (r() * 2 - 1) * 0.62;
    const r0 = 30 + Math.pow(r(), 1.6) * 1600;
    const len = 50 + r0 * (0.2 + r() * 0.55);
    const twist = TWIST * (0.6 + r() * 0.8);
    const bend = -Math.min(Math.abs(twist), MAX_SWEEP / len);

    // Sample the spiral at both ends and the middle, then fit one quadratic
    // through the true midpoint: B(0.5) = (P0 + 2C + P2) / 4.
    const at = (rad) => {
      const a = angle + bend * (rad - r0);
      return [fx + Math.cos(a) * rad, fy + Math.sin(a) * rad * squash];
    };
    const [x1, y1] = at(r0);
    const [mx, my] = at(r0 + len / 2);
    const [x2, y2] = at(r0 + len);
    const qx = 2 * mx - (x1 + x2) / 2;
    const qy = 2 * my - (y1 + y2) / 2;
    if (x2 < -200) continue;

    const width = (hero ? 5 : 1) + (r0 / 700) * (0.5 + r() * 1.4);
    const op = clamp(0.3 + 0.55 * (1 - r0 / 1700) + r() * 0.25, 0.15, 1);
    const color = weighted(r, [
      [C.cyanLt, 46],
      [C.ice, 22],
      [C.mint, 14],
      [C.coral, 9],
      [C.gold, 4],
      [C.violet, 5],
    ]);

    // Taper each streak along its own length: hottest at the leading edge
    // nearest the vanishing point, trailing off into nothing. Hero streaks also
    // cool from ice through their own colour into violet.
    const id = `pf${i}`;
    grads.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">` +
        (hero
          ? `<stop offset="0" stop-color="${C.ice}" stop-opacity="1"/>` +
            `<stop offset="0.3" stop-color="${color}" stop-opacity="0.8"/>` +
            `<stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>`
          : `<stop offset="0" stop-color="${color}" stop-opacity="1"/>` +
            `<stop offset="0.45" stop-color="${color}" stop-opacity="0.55"/>` +
            `<stop offset="1" stop-color="${color}" stop-opacity="0"/>`) +
        `</linearGradient>`
    );

    streaks.push({
      hero,
      s: `<path d="M ${n(x1)} ${n(y1)} Q ${n(qx)} ${n(qy)} ${n(x2)} ${n(y2)}" fill="none" stroke="url(#${id})" stroke-width="${n(width)}" stroke-linecap="round" opacity="${n(op)}"/>`,
    });
  }

  const heroes = streaks.filter((s) => s.hero).map((s) => s.s).join('');
  const rest = streaks.filter((s) => !s.hero).map((s) => s.s).join('');

  return [
    `  <defs>${grads.join('')}</defs>`,
    `  <ellipse cx="${fx}" cy="${fy}" rx="820" ry="150" fill="url(#h-cyan)" opacity="0.35"/>`,
    `  <g opacity="0.45" filter="url(#blur18)">${heroes}</g>`,
    `  <g>${rest}</g>`,
    `  <g>${heroes}</g>`,
    // The mark is the light source the traffic converges on, so the bloom sits
    // outside it rather than behind it: no hot white core to wash it out.
    `  <circle cx="${fx}" cy="${fy}" r="330" fill="url(#h-ice)" opacity="0.5"/>`,
    `  <ellipse cx="${fx}" cy="${fy}" rx="360" ry="10" fill="${C.ice}" opacity="0.35" filter="url(#blur18)"/>`,
    `  <circle cx="${fx}" cy="${fy}" r="132" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.55">${mark(fx, fy, 234)}</g>`,
    `  <g>${mark(fx, fy, 234)}</g>`,
  ].join('\n');
}

export const themes = [
    { name: 'performance', order: 28, seed: 2207, zoom: 1.22, center: [1160, 515], title: 'Valkey performance', desc: 'Abstract streaks of light converging on the white Valkey hexagon mark at a bright vanishing point, representing throughput and low latency.', art: performance, motif: "Command traffic warping into the mark at a vanishing point", use: "Throughput, latency, speed work" },
];
