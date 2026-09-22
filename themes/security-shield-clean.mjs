import { C, mark, n } from '../lib/core.mjs';
// A heraldic shield centred on (cx, cy): flat top, straight sides, curved point.
// Shared by the shield themes so they are one silhouette under four treatments.
function shieldPath(cx, cy, w, h, shoulder = 0.56) {
  const hw = w / 2;
  const top = cy - h / 2;
  const sy = top + h * shoulder;
  const bottom = top + h;
  return (
    `M ${n(cx - hw)} ${n(top)} L ${n(cx + hw)} ${n(top)} L ${n(cx + hw)} ${n(sy)} ` +
    `C ${n(cx + hw)} ${n(sy + h * 0.24)} ${n(cx + hw * 0.47)} ${n(bottom - h * 0.075)} ${n(cx)} ${n(bottom)} ` +
    `C ${n(cx - hw * 0.47)} ${n(bottom - h * 0.075)} ${n(cx - hw)} ${n(sy + h * 0.24)} ${n(cx - hw)} ${n(sy)} Z`
  );
}

// Security, woven: the same shield as `security` with the speckle taken out, so
// the only thing inside it is the lattice it is made of.
//
// The proportions are not parameters. Five variations on them were built and all five
// lost to this one; see Rejected in the README before trying a sixth.

// Security, woven: the same shield as `security` with the speckle taken out, so
// the only thing inside it is the lattice it is made of.
//
// The proportions are not parameters. Five variations on them were built and all five
// lost to this one; see Rejected in the README before trying a sixth.
function securityShieldClean() {
  const cx = 960;
  const cy = 545;
  const path = shieldPath(cx, cy, 570, 580);

  const lattice = [];
  for (let k = -30; k <= 30; k++) {
    const off = cx + k * 46;
    lattice.push(
      `<line x1="${n(off - 300)}" y1="245" x2="${n(off + 300)}" y2="845" stroke="${C.cyanLt}" stroke-width="2"/>`,
      `<line x1="${n(off + 300)}" y1="245" x2="${n(off - 300)}" y2="845" stroke="${C.cyanLt}" stroke-width="2"/>`
    );
  }
  const weave = lattice.join('');

  return [
    `  <clipPath id="shieldClean"><path d="${path}"/></clipPath>`,
    `  <linearGradient id="shieldCleanFill" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${C.cyan}" stop-opacity="0.3"/>` +
      `<stop offset="1" stop-color="${C.violet}" stop-opacity="0.12"/></linearGradient>`,
    `  <g clip-path="url(#shieldClean)">` +
      `<path d="${path}" fill="url(#shieldCleanFill)"/>` +
      `<g opacity="0.5">${weave}</g></g>`,
    // Radiance, the way the retired `security` theme did it: a wide blurred pass on
    // the outline, a mint halo behind the mark, and a blurred copy of the mark under
    // the sharp one. Three passes, all behind or under the thing they light.
    `  <path d="${path}" fill="none" stroke="${C.cyanLt}" stroke-width="34" opacity="0.3" filter="url(#blur40)"/>`,
    `  <path d="${path}" fill="none" stroke="${C.cyanLt}" stroke-width="16" opacity="0.45" filter="url(#blur18)"/>`,
    `  <path d="${path}" fill="none" stroke="${C.ice}" stroke-width="4" opacity="0.95"/>`,
    `  <circle cx="${cx}" cy="${n(cy - 10)}" r="250" fill="url(#h-mint)" opacity="0.45"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(cx, cy - 10, 300)}</g>`,
    `  <g>${mark(cx, cy - 10, 300)}</g>`,
  ].join('\n');
}

// ------------------------------------------------- security reporting in 2026
//
// Three readings of one post: reports arrive faster than they can be judged
// (`security-queue-depth`), most findings do not survive an adversarial second
// look (`security-triage-funnel`), and a fix that removed one instance left the
// same defect standing in a second implementation (`security-same-bug-twice`).

// Benchmarks: throughput bars climbing, latency percentiles holding flat above
// them. The two motifs are stacked rather than overlaid so neither muddies the
// other: bars own everything below y=560, the series sit above it.

export const themes = [
    { name: 'security-shield-clean', order: 6, seed: 44011, zoom: 1.38, center: [960, 545], title: 'Valkey security', desc: 'A shield woven from a single even lattice with the white Valkey hexagon mark at its centre and nothing else inside it, representing security and hardening.', art: securityShieldClean, motif: "A radiant shield woven from one even lattice, the mark at its centre", use: "Security in general, CVEs, hardening, ACLs, advisories" },
];
