import { C, n, starfield, weighted } from '../lib/core.mjs';
// How-to: a track of steps with the current one lit.
function howTo(r) {
  const y = 540;
  const left = 300;
  const right = 1620;
  const count = 5;
  const active = 3;

  const out = [
    `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.cyanLt}" stroke-width="2" stroke-dasharray="10 14" opacity="0.3"/>`,
  ];
  for (let i = 0; i < count; i++) {
    const x = left + (i * (right - left)) / (count - 1);
    const done = i < active;
    const isActive = i === active;
    if (done && i > 0) {
      out.push(
        `<line x1="${n(x - (right - left) / (count - 1))}" y1="${y}" x2="${n(x)}" y2="${y}" stroke="${C.mint}" stroke-width="3" opacity="0.6"/>`
      );
    }
    const color = done ? C.mint : isActive ? C.ice : C.cyanLt;
    const key = done ? 'mint' : isActive ? 'ice' : 'cyan';
    out.push(
      `<circle cx="${n(x)}" cy="${y}" r="${isActive ? 52 : 40}" fill="url(#h-${key})" opacity="${isActive ? 0.9 : 0.4}"/>`,
      `<circle cx="${n(x)}" cy="${y}" r="${isActive ? 44 : 34}" fill="${C.ink}" fill-opacity="0.45" stroke="${color}" stroke-width="${isActive ? 3.4 : 2.2}" opacity="${done || isActive ? 0.95 : 0.5}"/>`
    );
    if (done) {
      out.push(
        `<path d="M ${n(x - 13)} ${y} L ${n(x - 3)} ${y + 11} L ${n(x + 14)} ${y - 11}" fill="none" stroke="${C.mint}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
      );
    } else if (isActive) {
      out.push(
        `<path d="M ${n(x - 10)} ${y - 15} L ${n(x + 9)} ${y} L ${n(x - 10)} ${y + 15}" fill="none" stroke="${C.ice}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    } else {
      out.push(`<circle cx="${n(x)}" cy="${y}" r="6" fill="${C.cyanLt}" opacity="0.5"/>`);
    }
  }

  // Instruction text, suggested rather than written.
  const bars = [];
  for (const [ymin, ymax] of [[280, 420], [660, 800]]) {
    let cy = ymin;
    while (cy < ymax) {
      let x = 260 + r() * 200;
      while (x < 1660) {
        const w = 40 + r() * 190;
        if (x + w > 1660) break;
        bars.push(
          `<rect x="${n(x)}" y="${n(cy)}" width="${n(w)}" height="8" rx="4" fill="${weighted(r, [[C.ice, 7], [C.cyanLt, 3], [C.mint, 1]])}" opacity="${n(0.08 + r() * 0.16)}"/>`
        );
        x += w + 18 + r() * 60;
      }
      cy += 30;
    }
  }

  return [starfield(r, 50), `  <g>${bars.join('')}</g>`, `  <g>${out.join('')}</g>`].join('\n');
}

// ---------------------------------------------------- atomic slot migration
//
// The emphasis is on *atomic*: one contiguous range of slots moves as a single
// indivisible unit, with a clean before and after rather than a trickle. That is
// what separates this from `clustering`, which is about the slot ring existing at
// all rather than about anything moving.

export const themes = [
    { name: 'how-to', order: 9, seed: 9953, zoom: 1.22, center: [960, 540], title: 'Valkey how-to', desc: 'An abstract track of numbered steps with the current step lit, representing a step-by-step guide.', art: howTo, motif: "Step track with the current step lit", use: "Tutorials, guides, getting started" },
];
