import { C, dot, frame, mark, n, starfield } from '../lib/core.mjs';
// --------------------------------------------------------- client libraries
//
// Three takes on one idea: many languages, one protocol, one server. What has to
// read geometrically is that the callers are visibly *different from each other*
// — not the uniform traffic `performance` draws — and that whatever they send
// arrives in the same shape at a single server.

// Ports: six unlike callers reaching in from outside, each ending in the same
// port at the same radius. Outside that circle every spoke is drawn differently;
// inside it every spoke is identical, and it is the same server at the middle.
function clientPorts(r) {
  const cx = 960;
  const cy = 540;
  const PORT = 212;
  const NODE = 450;

  const callers = [
    { deg: 0, color: C.gold, key: 'gold', kind: 'blocks', glyph: 'ring' },
    { deg: 60, color: C.coral, key: 'coral', kind: 'beads', glyph: 'square' },
    { deg: 120, color: C.violet, key: 'violet', kind: 'sawtooth', glyph: 'triangle' },
    { deg: 180, color: C.cyanLt, key: 'cyan', kind: 'ladder', glyph: 'diamond' },
    { deg: 240, color: C.mint, key: 'mint', kind: 'ticks', glyph: 'rings' },
    { deg: 300, color: C.cyan, key: 'cyan', kind: 'chevrons', glyph: 'plus' },
  ];

  const outer = [];
  const nodes = [];
  const ports = [];
  const inner = [];

  for (const c of callers) {
    // The callers sit on an ellipse rather than a circle, so the star fills a
    // 16:9 frame. The ports stay on one true circle: that boundary is the part
    // that has to be identical.
    const a = (c.deg * Math.PI) / 180;
    const dx = NODE * 1.26 * Math.cos(a);
    const dy = NODE * Math.sin(a);
    const dist = Math.hypot(dx, dy);
    const ux = dx / dist;
    const uy = dy / dist;
    const px = -uy; // unit normal, across the spoke
    const py = ux;
    const at = (t, off = 0) => [cx + ux * t + px * off, cy + uy * t + py * off];
    const deg = n((Math.atan2(dy, dx) * 180) / Math.PI);
    const from = PORT + 38;
    const to = dist - 46;

    // Faint spine, so the grammars read as one channel each.
    outer.push(
      `<line x1="${n(at(from - 14)[0])}" y1="${n(at(from - 14)[1])}" x2="${n(at(to + 18)[0])}" y2="${n(at(to + 18)[1])}" ` +
        `stroke="${c.color}" stroke-width="2" opacity="0.14"/>`
    );

    if (c.kind === 'blocks') {
      for (let t = from; t < to; ) {
        const len = 34 + r() * 30;
        if (t + len > to) break;
        const [x, y] = at(t + len / 2);
        outer.push(
          `<rect x="${n(x - len / 2)}" y="${n(y - 13)}" width="${n(len)}" height="26" rx="7" fill="${c.color}" ` +
            `opacity="${n(0.45 + r() * 0.42)}" transform="rotate(${deg} ${n(x)} ${n(y)})"/>`
        );
        t += len + 18 + r() * 12;
      }
    } else if (c.kind === 'beads') {
      for (let t = from; t < to; t += 42 + r() * 10) {
        const [x, y] = at(t);
        outer.push(dot(x, y, 7 + r() * 3.5, c.color, c.key, 0.55 + r() * 0.4, 3));
      }
    } else if (c.kind === 'sawtooth') {
      const zig = [];
      let flip = 1;
      for (let t = from; t <= to; t += 30) {
        zig.push(at(t, 15 * flip));
        flip = -flip;
      }
      outer.push(
        `<path d="${zig.map((q, i) => `${i ? 'L' : 'M'} ${n(q[0])} ${n(q[1])}`).join(' ')}" fill="none" ` +
          `stroke="${c.color}" stroke-width="4" stroke-linejoin="round" opacity="0.8"/>`
      );
    } else if (c.kind === 'ladder') {
      for (const o of [-12, 12]) {
        const [x1, y1] = at(from, o);
        const [x2, y2] = at(to, o);
        outer.push(
          `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c.color}" stroke-width="3.4" opacity="0.7"/>`
        );
      }
      for (let t = from + 8; t < to; t += 38) {
        const [x1, y1] = at(t, -12);
        const [x2, y2] = at(t, 12);
        outer.push(
          `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c.color}" stroke-width="3" ` +
            `opacity="${n(0.4 + r() * 0.35)}"/>`
        );
      }
    } else if (c.kind === 'ticks') {
      const [x1, y1] = at(from);
      const [x2, y2] = at(to);
      outer.push(
        `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c.color}" stroke-width="4.5" opacity="0.65"/>`
      );
      for (let t = from + 6; t < to; t += 26) {
        const [ax, ay] = at(t);
        const [bx, by] = at(t, 16);
        outer.push(
          `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="${c.color}" stroke-width="3" ` +
            `stroke-linecap="round" opacity="${n(0.35 + r() * 0.4)}"/>`
        );
      }
    } else {
      for (let t = from + 10; t < to; t += 40) {
        const [tipx, tipy] = at(t);
        const [lx, ly] = at(t - 20, -18);
        const [rx2, ry2] = at(t - 20, 18);
        outer.push(
          `<path d="M ${n(lx)} ${n(ly)} L ${n(tipx)} ${n(tipy)} L ${n(rx2)} ${n(ry2)}" fill="none" ` +
            `stroke="${c.color}" stroke-width="4" stroke-linejoin="miter" opacity="${n(0.4 + r() * 0.45)}"/>`
        );
      }
    }

    // The caller itself, a different shape for every one of them.
    const [gx, gy] = at(dist);
    nodes.push(`<circle cx="${n(gx)}" cy="${n(gy)}" r="50" fill="url(#h-${c.key})" opacity="0.5"/>`);
    if (c.glyph === 'ring') {
      nodes.push(
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="29" fill="${C.ink}" fill-opacity="0.4" stroke="${c.color}" stroke-width="5"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="8" fill="${c.color}"/>`
      );
    } else if (c.glyph === 'square') {
      nodes.push(
        `<rect x="${n(gx - 26)}" y="${n(gy - 26)}" width="52" height="52" rx="9" fill="${C.ink}" fill-opacity="0.4" ` +
          `stroke="${c.color}" stroke-width="5"/>`,
        `<rect x="${n(gx - 8)}" y="${n(gy - 8)}" width="16" height="16" rx="3" fill="${c.color}"/>`
      );
    } else if (c.glyph === 'triangle') {
      nodes.push(
        `<path d="M ${n(gx)} ${n(gy - 32)} L ${n(gx + 30)} ${n(gy + 21)} L ${n(gx - 30)} ${n(gy + 21)} Z" fill="${C.ink}" ` +
          `fill-opacity="0.4" stroke="${c.color}" stroke-width="5" stroke-linejoin="round"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy + 5)}" r="7" fill="${c.color}"/>`
      );
    } else if (c.glyph === 'diamond') {
      nodes.push(
        `<rect x="${n(gx - 22)}" y="${n(gy - 22)}" width="44" height="44" rx="7" fill="${C.ink}" fill-opacity="0.4" ` +
          `stroke="${c.color}" stroke-width="5" transform="rotate(45 ${n(gx)} ${n(gy)})"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="7" fill="${c.color}"/>`
      );
    } else if (c.glyph === 'rings') {
      nodes.push(
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="30" fill="none" stroke="${c.color}" stroke-width="3" ` +
          `stroke-dasharray="7 8" opacity="0.8"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="17" fill="${C.ink}" fill-opacity="0.4" stroke="${c.color}" stroke-width="5"/>`
      );
    } else {
      nodes.push(
        `<path d="M ${n(gx - 28)} ${n(gy)} L ${n(gx + 28)} ${n(gy)} M ${n(gx)} ${n(gy - 28)} L ${n(gx)} ${n(gy + 28)}" ` +
          `stroke="${c.color}" stroke-width="7" stroke-linecap="round" opacity="0.9"/>`,
        `<circle cx="${n(gx)}" cy="${n(gy)}" r="9" fill="${C.ink}" fill-opacity="0.6" stroke="${c.color}" stroke-width="4"/>`
      );
    }

    // The port. Identical for every caller, at the same radius, so the ring it
    // implies is the protocol rather than anything the server exposes per client.
    const [ox, oy] = at(PORT);
    ports.push(
      `<circle cx="${n(ox)}" cy="${n(oy)}" r="52" fill="url(#h-ice)" opacity="0.45"/>`,
      `<rect x="${n(ox - 15)}" y="${n(oy - 36)}" width="30" height="72" rx="12" fill="${C.ink}" fill-opacity="0.4" ` +
        `stroke="${C.ice}" stroke-width="5" opacity="0.8" transform="rotate(${deg} ${n(ox)} ${n(oy)})"/>`,
      `<rect x="${n(ox - 5)}" y="${n(oy - 22)}" width="10" height="44" rx="5" fill="${C.ice}" opacity="0.95" ` +
        `transform="rotate(${deg} ${n(ox)} ${n(oy)})"/>`
    );

    // Inside the port circle: the same three segments, every spoke.
    for (let t = 118; t + 28 <= PORT - 26; t += 40) {
      const [sx, sy] = at(t + 14);
      inner.push(
        `<rect x="${n(sx - 14)}" y="${n(sy - 9)}" width="28" height="18" rx="9" fill="${C.ice}" opacity="0.9" ` +
          `transform="rotate(${deg} ${n(sx)} ${n(sy)})"/>`
      );
    }
  }

  return [
    starfield(r, 55),
    `  <circle cx="${cx}" cy="${cy}" r="330" fill="url(#h-cyan)" opacity="0.2"/>`,
    `  <g>${outer.join('')}</g>`,
    `  <g filter="url(#blur8)" opacity="0.45">${inner.join('')}</g>`,
    `  <g>${inner.join('')}</g>`,
    `  <g>${ports.join('')}</g>`,
    `  <g>${nodes.join('')}</g>`,
    `  <circle cx="${cx}" cy="${cy}" r="140" fill="url(#scrim)"/>`,
    `  <g filter="url(#blur18)" opacity="0.5">${mark(cx, cy, 196)}</g>`,
    `  <g>${mark(cx, cy, 196)}</g>`,
  ].join('\n');
}


// Workload fan-out: one incoming workload arrives as a single bundled stream,
// and the store decomposes it into the primitives it already has, each landing
// in a differently shaped structure.

export const themes = [
    { name: 'client-ports', order: 14, seed: 34037, zoom: 1, center: [960, 540], title: 'Valkey client protocol', desc: 'Six differently drawn channels reaching in from distinct outer shapes, each meeting an identical port at the same radius, beyond which every spoke becomes the same run of pale segments arriving at the white Valkey hexagon mark, representing different client libraries meeting one protocol at one server.', art: clientPorts, motif: "Six unlike callers docking into identical ports around the mark, uniform inside the port circle", use: "A specific client release, client API design" },
];
