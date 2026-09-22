import { C, W, dot, n, starfield } from '../lib/core.mjs';
// below it steps in uneven bites, because COUNT is a hint and not a batch size.
function keyspaceScan(r) {
  const cx = 960; // where the cursor is
  const half = 168; // half-width of the window it is holding
  const top = 268;
  const bottom = 800;

  const keys = [];
  let guard = 0;
  while (keys.length < 185 && guard++ < 30000) {
    const x = 50 + r() * (W - 100);
    const y = top + r() * (bottom - top);
    if (keys.every((k) => (k.x - x) ** 2 + (k.y - y) ** 2 > 46 ** 2)) keys.push({ x, y });
  }

  const held = [];
  const rest = [];
  for (const k of keys) {
    if (Math.abs(k.x - cx) < half) {
      held.push(dot(k.x, k.y, 6 + r() * 2.5, C.mint, 'mint', 0.95, 3.2));
    } else if (k.x < cx) {
      rest.push(dot(k.x, k.y, 4 + r() * 2.5, C.cyanLt, 'cyan', 0.5, 2.6));
    } else {
      rest.push(dot(k.x, k.y, 3.5 + r() * 2, C.violet, 'violet', 0.44, 2.8));
    }
  }

  // Cursor hops along the bottom, deliberately uneven. Everything up to the
  // current window is done, the rest is still pending.
  const track = 872;
  const hops = [200];
  while (hops[hops.length - 1] < 1720) hops.push(hops[hops.length - 1] + 86 + r() * 178);
  const steps = [];
  for (let i = 0; i < hops.length - 1; i++) {
    const [a, b] = [hops[i], Math.min(hops[i + 1], 1720)];
    const done = b <= cx - half;
    const current = a < cx + half && b > cx - half;
    if (current) {
      steps.push(
        `<line x1="${n(a)}" y1="${track}" x2="${n(b)}" y2="${track}" stroke="${C.ice}" stroke-width="7" stroke-linecap="round" opacity="0.95"/>`
      );
    } else {
      steps.push(
        `<line x1="${n(a)}" y1="${track}" x2="${n(b)}" y2="${track}" stroke="${done ? C.mint : C.cyanLt}" ` +
          `stroke-width="${done ? 5 : 2.4}" stroke-linecap="round" opacity="${done ? 0.7 : 0.25}"/>`
      );
    }
    steps.push(
      `<line x1="${n(a)}" y1="${track - 11}" x2="${n(a)}" y2="${track + 11}" stroke="${C.ice}" stroke-width="2" opacity="${done || current ? 0.45 : 0.16}"/>`
    );
  }

  return [
    starfield(r, 55),
    `  <ellipse cx="${cx}" cy="540" rx="470" ry="400" fill="url(#h-mint)" opacity="0.16"/>`,
    `  <line x1="180" y1="${track}" x2="1740" y2="${track}" stroke="${C.ice}" stroke-width="1.6" stroke-dasharray="9 15" opacity="0.22"/>`,
    `  <rect x="${cx - half}" y="${top - 52}" width="${half * 2}" height="${bottom - top + 104}" rx="26" fill="${C.ice}" opacity="0.07"/>`,
    `  <g stroke="${C.ice}" stroke-width="12" opacity="0.28" filter="url(#blur18)">` +
      `<line x1="${cx - half}" y1="${top - 52}" x2="${cx - half}" y2="${bottom + 52}"/>` +
      `<line x1="${cx + half}" y1="${top - 52}" x2="${cx + half}" y2="${bottom + 52}"/></g>`,
    `  <g>${rest.join('')}</g>`,
    `  <g stroke="${C.ice}" stroke-width="3.4" opacity="0.9">` +
      `<line x1="${cx - half}" y1="${top - 52}" x2="${cx - half}" y2="${bottom + 52}"/>` +
      `<line x1="${cx + half}" y1="${top - 52}" x2="${cx + half}" y2="${bottom + 52}"/></g>`,
    `  <g>${held.join('')}</g>`,
    `  <g>${steps.join('')}</g>`,
    `  <line x1="${cx + half}" y1="${track - 18}" x2="${cx + half}" y2="${track + 18}" stroke="${C.ice}" stroke-width="4" stroke-linecap="round" opacity="0.95"/>`,
    `  <path d="M ${cx + half + 52} ${track - 15} L ${cx + half + 74} ${track} L ${cx + half + 52} ${track + 15}" fill="none" stroke="${C.ice}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>`,
  ].join('\n');
}
// ------------------------------------------------------------- AI workloads
//
// Three candidate themes, one idea each. Kept deliberately apart: `ai-agent-memory`
// is about recency, `ai-workload-fanout` is about decomposition, `ai-vector-recall`
// is about addressing by distance instead of by key.

// Agent memory: a conversation runs left to right. The most recent turns stay
// hot inside a lit window; everything older is parked in the archive below and
// pulled back into the window only when it is needed.

export const themes = [
    { name: 'keyspace-scan', order: 30, seed: 19087, zoom: 1.26, center: [960, 540], title: 'Valkey keyspace scan', desc: 'A wide field of keys with one bounded window lit in green, the keys behind it dimmed and the keys ahead of it unlit, above a track of uneven cursor steps, representing scanning a keyspace a window at a time instead of reading it all at once.', art: keyspaceScan, motif: "Cursor holding one lit window of a key field, uneven hop track below", use: "`SCAN`, cursors, iterating a keyspace without blocking" },
];
