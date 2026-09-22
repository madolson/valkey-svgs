import { C, FONT, clamp, dot, n, starfield } from '../lib/core.mjs';
// ------------------------------------------------- security reporting in 2026
//
// Three readings of one post: reports arrive faster than they can be judged
// (`security-queue-depth`), most findings do not survive an adversarial second
// look (`security-triage-funnel`), and a fix that removed one instance left the
// same defect standing in a second implementation (`security-same-bug-twice`).

// Benchmarks: throughput bars climbing, latency percentiles holding flat above
// them. The two motifs are stacked rather than overlaid so neither muddies the
// other: bars own everything below y=560, the series sit above it.
function observability(r) {
  const left = 260;
  const right = 1330; // labels sit outside this, still inside the mobile crop

  const grid = [];
  for (let i = 0; i <= 7; i++) {
    const y = 300 + i * 76;
    grid.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.cyanLt}" stroke-width="1.1" opacity="${i === 7 ? 0.3 : 0.1}"/>`);
  }
  for (let i = 0; i <= 12; i++) {
    const x = left + (i * (right - left)) / 12;
    grid.push(`<line x1="${n(x)}" y1="300" x2="${n(x)}" y2="836" stroke="${C.cyanLt}" stroke-width="1.1" opacity="0.07"/>`);
  }

  // Throughput bars. Built from positive increments then scaled to hit the top,
  // so the run is uneven but never dips: every bar is at least as tall as the
  // one before it.
  const bins = 40;
  const bw = (right - left) / bins;
  const BAR_MIN = 26;
  const BAR_MAX = 268; // tops out at y=568, clear of the flat series above
  const steps = Array.from({ length: bins - 1 }, () => 0.25 + r() * 1.5);
  const perStep = (BAR_MAX - BAR_MIN) / steps.reduce((a, b) => a + b, 0);
  const heights = [BAR_MIN];
  for (const step of steps) heights.push(heights[heights.length - 1] + step * perStep);

  const hist = heights.flatMap((h, i) => {
    const x = left + i * bw + 3;
    const w = bw - 6;
    const lift = (h - BAR_MIN) / (BAR_MAX - BAR_MIN); // brighter as it grows
    return [
      `<rect x="${n(x)}" y="${n(836 - h)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${C.cyan}" opacity="${n(0.22 + lift * 0.44)}"/>`,
      `<line x1="${n(x)}" y1="${n(836 - h)}" x2="${n(x + w)}" y2="${n(836 - h)}" stroke="${C.cyanLt}" stroke-width="2" opacity="${n(0.32 + lift * 0.5)}"/>`,
    ];
  });

  // Latency percentiles: flat, bouncing around their own level. P99 rides above
  // P50 throughout, so the pair never crosses.
  const series = [
    { label: 'P99', color: C.mint, key: 'mint', level: 372, amp: 46 },
    { label: 'P50', color: C.coral, key: 'coral', level: 486, amp: 34 },
  ].map(({ label, color, key, level, amp }) => {
    const pts = [];
    let v = level;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      // Pulled back toward the level every step, so it wanders without drifting.
      v += (level - v) * 0.45 + (r() - 0.5) * amp;
      pts.push({ x: left + t * (right - left), y: clamp(v, 320, 540) });
    }
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${n(p.x)} ${n(p.y)}`).join(' ');
    const end = pts[pts.length - 1];
    return (
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="9" opacity="0.3" filter="url(#blur8)"/>` +
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.6" opacity="0.9"/>` +
      pts.filter((_, i) => i % 3 === 0).map((p) => dot(p.x, p.y, 5, color, key, 0.9)).join('') +
      `<text x="${n(right + 30)}" y="${n(end.y + 15)}" fill="${color}" opacity="0.95" ` +
      `font-family="${FONT}" font-size="44" font-weight="700" letter-spacing="1">${label}</text>`
    );
  });

  return [
    starfield(r, 55),
    `  <g>${grid.join('')}</g>`,
    `  <g>${hist.join('')}</g>`,
    `  <g>${series.join('')}</g>`,
  ].join('\n');
}

// Data structures: hash buckets chaining out, with a skiplist underneath.

export const themes = [
    { name: 'benchmarks', order: 7, seed: 7741, zoom: 1.12, center: [900, 568], title: 'Valkey benchmarks', desc: 'A bar chart of throughput climbing left to right, beneath two flat latency series labelled P99 in green and P50 in red, representing benchmarking and observability.', art: observability, motif: "Throughput bars climbing under flat P50/P99 latency", use: "Benchmark results, observability, metrics" },
];
