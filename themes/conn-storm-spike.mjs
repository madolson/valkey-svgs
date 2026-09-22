import { C, n, starfield, weighted } from '../lib/core.mjs';
// -------------------------------------------------------- connection storms
//
// `connStormSpike` is the shape of the storm in time: quiet, a wall of
// simultaneous connection attempts, quiet again, with the part of the wall the
// server cannot accept in one pass stacked above its capacity. It does not draw
// a gate, which is `security-acl`'s job.

// The surge itself, as a timeline of attempts. Every cell is one connection, so
// the spike reads as clients piling up rather than as an abstract bar, and the
// coral above the dashed ceiling is the overshoot.
function connStormSpike(r) {
  const base = 862; // the server, accepting along its baseline
  const left = 150;
  const right = 1770;
  const cols = 88;
  const step = (right - left) / cols;
  const cw = step - 5.5;
  const ch = 15;
  const gap = 3;
  const peakCol = 44; // the wall sits on the centre line
  const ceiling = base - 310; // what can be accepted in one pass

  const cells = [];
  const over = [];
  for (let i = 0; i < cols; i++) {
    const x = left + i * step;
    const d = (i - peakCol) / 4.1;
    const env = Math.exp(-d * d); // sharp: a wall, not a hill
    const quiet = 1 + Math.floor(r() * 2.4);
    const count = Math.max(quiet, Math.round(env * 34 + (r() - 0.5) * env * 6));
    for (let j = 0; j < count; j++) {
      const y = base - (j + 1) * (ch + gap);
      const shed = y < ceiling;
      const lift = Math.min(1, j / 16);
      (shed ? over : cells).push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(cw)}" height="${ch}" rx="3" fill="${
          shed ? C.coral : weighted(r, [[C.cyan, 6], [C.cyanLt, 4], [C.ice, 1]])
        }" opacity="${n(shed ? 0.7 + r() * 0.26 : 0.32 + lift * 0.5 + r() * 0.12)}"/>`
      );
    }
  }

  // A little of the overshoot shaken loose off the top of the wall.
  const spray = [];
  for (let i = 0; i < 9; i++) {
    const x = left + peakCol * step + (r() - 0.5) * 170;
    const y = 214 + r() * 50;
    spray.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(9 + r() * 13)}" height="9" rx="4.5" fill="${C.coral}" opacity="${n(0.16 + r() * 0.34)}"/>`
    );
  }

  const ceilLine =
    `<line x1="${left - 60}" y1="${ceiling}" x2="${right + 60}" y2="${ceiling}" stroke="${C.ice}" ` +
    `stroke-width="2.6" stroke-dasharray="22 16" opacity="0.55"/>`;

  return [
    starfield(r, 55),
    `  <ellipse cx="${n(left + peakCol * step)}" cy="${n(ceiling - 30)}" rx="330" ry="380" fill="url(#h-coral)" opacity="0.2"/>`,
    `  <ellipse cx="960" cy="${n(base - 40)}" rx="820" ry="150" fill="url(#h-cyan)" opacity="0.22"/>`,
    `  <g>${spray.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.35">${cells.join('')}${over.join('')}</g>`,
    `  <g>${cells.join('')}</g>`,
    `  <g>${over.join('')}</g>`,
    `  <g filter="url(#blur8)" opacity="0.4">${ceilLine}</g>`,
    `  ${ceilLine}`,
    `  <line x1="${left - 60}" y1="${base}" x2="${right + 60}" y2="${base}" stroke="${C.ice}" stroke-width="3.4" opacity="0.85"/>`,
  ].join('\n');
}

// ------------------------------------------------------------- operations
//
// Both ops themes carry the same one idea: at scale you are looking at a fleet,
// not a server. `ops-fleet-triage` says the fleet is uniform and only a handful
// of it needs you; `ops-rolling-wave` says a change crosses that fleet one group
// at a time. Neither reuses the slot ring (`clustering`) or a chart
// (`benchmarks`).

// ------------------------------------------------------------- valkey-bundle
//
// One package that carries several capabilities you would otherwise install
// one at a time. Two readings of that: containment (`bundleCrate`) and delivery
// (`bundleOneInstall`). In both, every module has to be a *different* shape --
// repeated identical blocks say "many of the same" instead of "several
// different capabilities in one package".

// A base course of identical primitives, with progressively fewer and larger
// composites resting on them, ending in one thing.

// One declared spec on the left, the running set it produces on the right.
// Nothing to the right of the fan is authored: every pod is a copy of the panel.

export const themes = [
    { name: 'conn-storm-spike', order: 16, seed: 36011, zoom: 1.34, center: [960, 547], title: 'Valkey connection storms', desc: 'A timeline of connection attempts that is quiet, then spikes into a wall of simultaneous reconnects whose top rises in red above a dashed accept-capacity line, then falls quiet again, representing a connection storm.', art: connStormSpike, motif: "Flat run of connection attempts spiking into a wall that overshoots the accept ceiling", use: "Connection storms, accept backlog, reconnect surges" },
];
