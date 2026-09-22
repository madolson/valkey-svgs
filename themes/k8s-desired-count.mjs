import { C, dot, mark, n, starfield } from '../lib/core.mjs';
// The declared replica count and the instances converging on it: six slots
// bracketed in gold because that is what was asked for, four of them filled, one
// instance still on its way up and one slot still empty.
function k8sDesiredCount(r) {
  const xs = [560, 720, 880, 1040, 1200, 1360];
  const slotY = 312;
  const padY = 828;
  const box = 122;
  const top = 226;
  const FILLED = 4;
  const RISING = 4;

  const bx0 = xs[0] - box / 2 - 16;
  const bx1 = xs[xs.length - 1] + box / 2 + 16;

  // The declared count: a span with one gold pip per instance asked for.
  const bracket =
    `<path d="M ${n(bx0)} ${n(top + 28)} L ${n(bx0)} ${n(top)} L ${n(bx1)} ${n(top)} L ${n(bx1)} ${n(top + 28)}" ` +
      `fill="none" stroke="${C.gold}" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>` +
    xs.map((x) => `<circle cx="${n(x)}" cy="${n(top)}" r="7" fill="${C.gold}" opacity="0.95"/>`).join('');

  const trackTop = slotY + box / 2 + 18;
  const slots = [];
  const tracks = [];
  const pads = [];

  xs.forEach((x, i) => {
    const filled = i < FILLED;
    const rising = i === RISING;

    pads.push(
      `<rect x="${n(x - 44)}" y="${n(padY)}" width="88" height="12" rx="6" ` +
        `fill="${filled || rising ? C.mint : C.cyanLt}" opacity="${filled || rising ? 0.8 : 0.3}"/>`
    );

    if (filled) {
      tracks.push(
        `<line x1="${n(x)}" y1="${n(padY - 6)}" x2="${n(x)}" y2="${n(trackTop)}" stroke="${C.mint}" ` +
          `stroke-width="3.2" opacity="0.75"/>`,
        [0.3, 0.56, 0.82]
          .map((t) => dot(x, padY - 6 - t * (padY - 6 - trackTop), 4.5, C.mint, 'mint', 0.7, 3))
          .join('')
      );
    } else if (rising) {
      const py = 600;
      tracks.push(
        `<line x1="${n(x)}" y1="${n(padY - 6)}" x2="${n(x)}" y2="${n(py + 54)}" stroke="${C.mint}" ` +
          `stroke-width="3.2" opacity="0.75"/>`,
        `<line x1="${n(x)}" y1="${n(py - 54)}" x2="${n(x)}" y2="${n(trackTop)}" stroke="${C.mint}" ` +
          `stroke-width="2.4" stroke-dasharray="8 12" opacity="0.45"/>`,
        `<circle cx="${n(x)}" cy="${n(py)}" r="82" fill="url(#h-mint)" opacity="0.45"/>`,
        `<rect x="${n(x - 46)}" y="${n(py - 46)}" width="92" height="92" rx="20" fill="${C.mint}" ` +
          `fill-opacity="0.16" stroke="${C.mint}" stroke-width="2.4" opacity="0.85"/>`,
        `<g opacity="0.8">${mark(x, py, 52)}</g>`
      );
    } else {
      tracks.push(
        `<line x1="${n(x)}" y1="${n(padY - 6)}" x2="${n(x)}" y2="${n(trackTop)}" stroke="${C.cyanLt}" ` +
          `stroke-width="2.2" stroke-dasharray="8 14" opacity="0.3"/>`
      );
    }

    if (filled) {
      slots.push(
        `<circle cx="${n(x)}" cy="${n(slotY)}" r="92" fill="url(#h-cyan)" opacity="0.24"/>`,
        `<rect x="${n(x - box / 2)}" y="${n(slotY - box / 2)}" width="${box}" height="${box}" rx="24" ` +
          `fill="${C.cyan}" fill-opacity="0.2" stroke="${C.cyanLt}" stroke-width="2.6" opacity="0.92"/>`,
        `<circle cx="${n(x)}" cy="${n(slotY)}" r="50" fill="url(#scrim)"/>`,
        mark(x, slotY, 66),
        dot(x + box / 2 - 22, slotY - box / 2 + 22, 5, C.mint, 'mint', 0.9, 3)
      );
    } else {
      // Declared but not yet running: the slot is drawn, the instance is a ghost.
      slots.push(
        `<rect x="${n(x - box / 2)}" y="${n(slotY - box / 2)}" width="${box}" height="${box}" rx="24" ` +
          `fill="none" stroke="${C.ice}" stroke-width="2.2" stroke-dasharray="10 12" opacity="0.5"/>`,
        `<g opacity="0.22">${mark(x, slotY, 66, C.cyanLt)}</g>`
      );
    }
  });

  return [
    starfield(r, 55),
    `  <circle cx="960" cy="${slotY}" r="560" fill="url(#h-cyan)" opacity="0.13"/>`,
    `  <line x1="${n(bx0)}" y1="${n(padY + 6)}" x2="${n(bx1)}" y2="${n(padY + 6)}" stroke="${C.ice}" ` +
      `stroke-width="2" opacity="0.35"/>`,
    `  <g>${tracks.join('')}</g>`,
    `  <g>${pads.join('')}</g>`,
    `  <g>${slots.join('')}</g>`,
    `  <g>${bracket}</g>`,
  ].join('\n');
}

// ------------------------------------------------- a very small resource envelope
//
// `limits-tight-envelope` is the space itself: a whole server inside a boundary
// several steps smaller than the room it usually gets, packed to all four walls.
// `limits-gauge-pinned` is the reading off the same situation: filled to the last
// few percent of the scale, with a sliver left before the stop.


// Utilisation run right up to the stop: the scale is filled into its redline and
// the pointer sits a sliver short of full.

export const themes = [
    { name: 'k8s-desired-count', order: 20, seed: 42021, zoom: 1.34, center: [960, 540], title: 'Valkey replicas reaching the declared count', desc: 'Six declared slots under a gold span, four filled with instances drawn as the white Valkey hexagon mark, one instance rising into place and one slot still empty, representing a declared replica count and the running instances converging on it.', art: k8sDesiredCount, motif: "Six declared slots, four filled, one rising into place, one still empty", use: "Replica counts, scaling to a desired state, reconciliation" },
];
