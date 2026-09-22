import { C, clamp, mark, n, starfield, weighted } from '../lib/core.mjs';
// ------------------------------------------------------------- AI workloads
//
// Three candidate themes, one idea each. Kept deliberately apart: `ai-agent-memory`
// is about recency, `ai-workload-fanout` is about decomposition, `ai-vector-recall`
// is about addressing by distance instead of by key.

// Agent memory: a conversation runs left to right. The most recent turns stay
// hot inside a lit window; everything older is parked in the archive below and
// pulled back into the window only when it is needed.
function aiAgentMemory(r) {
  const tapeY = 292;
  const cardH = 96;
  const left = 120;
  const right = 1400;
  const turns = 18;
  const hotFrom = 12;
  const step = (right - left) / turns;
  const cardW = step - 18;

  // Cold turns are outlines, hot turns are solid: the same turn, held two ways.
  const cold = [];
  const hot = [];
  for (let i = 0; i < turns; i++) {
    const x = left + i * step;
    const t = i / (turns - 1);
    if (i >= hotFrom) {
      hot.push(
        `<rect x="${n(x)}" y="${n(tapeY - cardH / 2)}" width="${n(cardW)}" height="${cardH}" rx="10" ` +
          `fill="${weighted(r, [[C.mint, 5], [C.ice, 4], [C.cyanLt, 2]])}" opacity="${n(0.78 + r() * 0.2)}"/>`
      );
    } else {
      const h = cardH - 22 - r() * 22;
      cold.push(
        `<rect x="${n(x)}" y="${n(tapeY - h / 2)}" width="${n(cardW)}" height="${n(h)}" rx="8" fill="none" ` +
          `stroke="${C.cyanLt}" stroke-width="2" opacity="${n(clamp(0.16 + t * 0.26 + (r() - 0.5) * 0.1, 0.12, 0.5))}"/>`
      );
    }
  }

  const fx0 = left + hotFrom * step - 16;
  const fx1 = left + (turns - 1) * step + cardW + 16;
  const fy0 = tapeY - cardH / 2 - 18;
  const fh = cardH + 36;

  // The archive: dim cells either side of the store, older turns at rest.
  const rows = [742, 794, 846];
  const cellW = 40;
  const cellH = 24;
  const cstep = 52;
  const cells = [];
  for (const cx0 of [300, 1112]) {
    for (let c = 0; c < 10; c++) {
      for (let j = 0; j < rows.length; j++) {
        if (r() < 0.12) continue;
        cells.push(
          `<rect x="${n(cx0 + c * cstep)}" y="${n(rows[j] - cellH / 2)}" width="${cellW}" height="${cellH}" rx="4" ` +
            `fill="${weighted(r, [[C.cyanLt, 6], [C.violet, 3], [C.ice, 2]])}" opacity="${n(0.14 + r() * 0.2)}"/>`
        );
      }
    }
  }

  // Two turns recalled on demand: lit in the archive, arced back into the window.
  const recalls = [
    { sx: 300 + 5 * cstep + cellW / 2, sy: rows[0], tx: 1040 },
    { sx: 1112 + 3 * cstep + cellW / 2, sy: rows[2], tx: 1246 },
  ];
  const ty = fy0 + fh + 8;
  const pulled = [];
  for (const { sx, sy, tx } of recalls) {
    pulled.push(
      `<rect x="${n(sx - cellW / 2)}" y="${n(sy - cellH / 2)}" width="${cellW}" height="${cellH}" rx="4" fill="${C.mint}" opacity="0.9"/>`,
      `<circle cx="${n(sx)}" cy="${n(sy)}" r="46" fill="url(#h-mint)" opacity="0.8"/>`,
      `<path d="M ${n(sx)} ${n(sy - cellH / 2 - 6)} C ${n(sx + 130)} ${n(sy - 190)} ${n(tx - 170)} ${n(ty + 170)} ${n(tx)} ${n(ty)}" ` +
        `fill="none" stroke="${C.mint}" stroke-width="3.4" stroke-dasharray="14 13" stroke-linecap="round" opacity="0.75"/>`,
      `<path d="M ${n(tx - 17)} ${n(ty + 22)} L ${n(tx)} ${n(ty)} L ${n(tx + 17)} ${n(ty + 22)}" fill="none" ` +
        `stroke="${C.mint}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
    );
  }

  // The counter-motion: the oldest end of the tape draining into the archive.
  const evict =
    `<path d="M 360 ${n(tapeY + 36)} C 302 ${n(tapeY + 190)} 288 600 306 ${n(rows[0] - 20)}" fill="none" stroke="${C.cyanLt}" ` +
    `stroke-width="2.6" stroke-dasharray="9 14" stroke-linecap="round" opacity="0.32"/>`;

  return [
    starfield(r, 55),
    // Ambient glow behind the motif: the window is the warm end of the image.
    `  <ellipse cx="1180" cy="${tapeY}" rx="310" ry="160" fill="url(#h-mint)" opacity="0.32"/>`,
    `  <circle cx="960" cy="800" r="430" fill="url(#h-cyan)" opacity="0.16"/>`,
    `  <g>${cold.join('')}</g>`,
    `  <g>${cells.join('')}</g>`,
    `  ${evict}`,
    `  <g>${pulled.join('')}</g>`,
    `  <g filter="url(#blur18)" opacity="0.45">${hot.join('')}</g>`,
    `  <g>${hot.join('')}</g>`,
    `  <rect x="${n(fx0)}" y="${n(fy0)}" width="${n(fx1 - fx0)}" height="${fh}" rx="26" fill="${C.mint}" fill-opacity="0.06" ` +
      `stroke="${C.ice}" stroke-width="3.6" opacity="0.85"/>`,
    `  <circle cx="960" cy="790" r="152" fill="url(#scrim)"/>`,
    `  <g>${mark(960, 790, 178)}</g>`,
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

export const themes = [
    { name: 'ai-agent-memory', order: 31, seed: 35011, zoom: 1.29, center: [960, 540], title: 'Valkey AI agent memory', desc: 'A row of conversation turns with the most recent ones lit inside a bright window, older turns dimmed and parked in an archive below the white Valkey hexagon mark, and two of them arcing back up into the window, representing agent memory with hot recent context and older context recalled on demand.', art: aiAgentMemory, motif: "Conversation turns on a tape, recent ones lit in a window, older ones archived below and arcing back", use: "Agent memory, chat history, context windows, mem0" },
];
