import { C, FONT, dot, esc, frame, lockup, mark, n, stamp } from './core.mjs';
// Motif vocabulary shared by more than one theme. A slot ring is a node's keyspace
// everywhere in this set; reusing these is what makes two banners read as one system.

// ---------------------------------------------------- atomic slot migration
//
// The emphasis is on *atomic*: one contiguous range of slots moves as a single
// indivisible unit, with a clean before and after rather than a trickle. That is
// what separates this from `clustering`, which is about the slot ring existing at
// all rather than about anything moving.

export const SLOTS = 16;

export const SLOT_STEP = (Math.PI * 2) / SLOTS;

// One shard's slot ring. `vacated` slots are drawn as dashed holes, `arrived`
// slots bright mint; everything else is a normal owned slot.

// Each glyph is drawn around its own origin, but its ink is not symmetric about
// that origin: bloom hangs the hash ticks above the cell run. These offsets pull
// the drawn bounds back onto (cx, cy) so four glyphs on a grid look centred, and
// so a line aimed at (cx, cy) arrives at the middle of the glyph.
export const GLYPH_SHIFT = { bloom: 25, json: 0, search: 0, ldap: 0 };

export function moduleGlyph(kind, cx, cy, s, color, key) {
  cy += (GLYPH_SHIFT[kind] ?? 0) * s;
  const X = (v) => n(cx + v * s);
  const Y = (v) => n(cy + v * s);
  const w = (v) => n(v * s);
  const glow = (x, y, rad, op = 0.9, halo = 3) =>
    dot(cx + x * s, cy + y * s, rad * s, color, key, op, halo);

  // valkey-bloom: a miniature bit array, three bits set.
  if (kind === 'bloom') {
    const cell = 40;
    const gap = 9;
    const cols = 7;
    const total = cols * cell + (cols - 1) * gap;
    const x0 = -total / 2;
    const set = [1, 3, 6];
    const out = [];
    for (let i = 0; i < cols; i++) {
      const on = set.includes(i);
      out.push(
        `<rect x="${X(x0 + i * (cell + gap))}" y="${Y(-cell / 2)}" width="${w(cell)}" height="${w(cell)}" rx="${w(7)}" ` +
          `fill="${color}" fill-opacity="${on ? 0.85 : 0}" stroke="${color}" stroke-width="${w(2.6)}" opacity="${on ? 1 : 0.34}"/>`
      );
    }
    // One tick dropping into each bit that got set.
    for (const i of set) {
      const x = x0 + i * (cell + gap) + cell / 2;
      out.push(
        `<line x1="${X(x)}" y1="${Y(-74)}" x2="${X(x)}" y2="${Y(-30)}" stroke="${color}" stroke-width="${w(3)}" stroke-linecap="round" opacity="0.75"/>`,
        glow(x, -82, 6, 0.95, 3.2)
      );
    }
    // A span under the run, so it reads as one array and not seven loose cells.
    out.push(
      `<path d="M ${X(x0)} ${Y(24)} L ${X(x0)} ${Y(38)} L ${X(x0 + total)} ${Y(38)} L ${X(x0 + total)} ${Y(24)}" ` +
        `fill="none" stroke="${color}" stroke-width="${w(2.6)}" opacity="0.5"/>`
    );
    return out.join('');
  }

  // valkey-json: rows at three indent depths, held inside a bracket pair.
  if (kind === 'json') {
    const lvl = [0, 1, 2, 2, 1];
    const len = [78, 104, 74, 92, 62];
    const out = [];
    for (const sgn of [-1, 1]) {
      out.push(
        `<path d="M ${X(sgn * 128)} ${Y(-100)} L ${X(sgn * 150)} ${Y(-100)} L ${X(sgn * 150)} ${Y(100)} L ${X(sgn * 128)} ${Y(100)}" ` +
          `fill="none" stroke="${color}" stroke-width="${w(6)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`
      );
    }
    lvl.forEach((d, i) => {
      const y = -64 + i * 32;
      const x = -104 + d * 30;
      out.push(
        `<line x1="${X(x + 14)}" y1="${Y(y)}" x2="${X(x + 14 + len[i])}" y2="${Y(y)}" stroke="${color}" ` +
          `stroke-width="${w(5)}" stroke-linecap="round" opacity="0.7"/>`,
        glow(x, y, 5.5, 0.9, 3)
      );
    });
    return out.join('');
  }

  // valkey-search: a query. Magnifier over a point set; whatever falls inside
  // the ring is a hit and is tethered to the query point.
  if (kind === 'search') {
    const qx = -16;
    const qy = -19;
    const rad = 68;
    const pts = [[-112, 50], [-60, -52], [-30, 6], [-4, -44], [22, 62], [66, -6], [104, 54], [112, -66]];
    const out = [];
    for (const [px, py] of pts) {
      const hit = Math.hypot(px - qx, py - qy) < rad - 8;
      if (hit) {
        out.push(
          `<line x1="${X(qx)}" y1="${Y(qy)}" x2="${X(px)}" y2="${Y(py)}" stroke="${color}" stroke-width="${w(2.2)}" opacity="0.55"/>`
        );
      }
      out.push(glow(px, py, hit ? 7 : 4.5, hit ? 0.95 : 0.45, 3));
    }
    out.push(
      `<line x1="${X(qx + 48)}" y1="${Y(qy + 48)}" x2="${X(86)}" y2="${Y(83)}" stroke="${color}" ` +
        `stroke-width="${w(14)}" stroke-linecap="round" opacity="0.85"/>`,
      `<circle cx="${X(qx)}" cy="${Y(qy)}" r="${w(rad)}" fill="${C.ink}" fill-opacity="0.16" ` +
        `stroke="${color}" stroke-width="${w(7)}" opacity="0.9"/>`
    );
    return out.join('');
  }

  // valkey-ldap: a padlock. The module is authentication against a directory, so
  // the glyph has to read as auth. A tree of nodes reads as a data structure and
  // sits oddly beside the other three, which are all storage shapes.
  //
  // Every line in it is one weight, and the keyhole is a circle plus a slot of that
  // same weight: mixed stroke widths and a filled tapered slot were what made this
  // read as a cartoon rather than as a drawing.
  const LINE = 6;
  const bodyW = 152;
  const bodyH = 116;
  const bodyTop = -36; // shackle above + body below, so the glyph is centred on cy
  const shackleR = 44;
  const keyCy = bodyTop + 40;
  return [
    // Shackle: a half arc rising out of the top edge of the body.
    `<path d="M ${X(-shackleR)} ${Y(bodyTop)} A ${w(shackleR)} ${w(shackleR)} 0 0 1 ${X(shackleR)} ${Y(bodyTop)}" ` +
      `fill="none" stroke="${color}" stroke-width="${w(LINE)}" opacity="0.9"/>`,
    `<rect x="${X(-bodyW / 2)}" y="${Y(bodyTop)}" width="${w(bodyW)}" height="${w(bodyH)}" rx="${w(20)}" ` +
      `fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="${w(LINE)}" opacity="0.9"/>`,
    // Keyhole: a bored circle and a straight slot, both the same weight.
    `<circle cx="${X(0)}" cy="${Y(keyCy)}" r="${w(14)}" fill="none" stroke="${color}" ` +
      `stroke-width="${w(LINE)}" opacity="0.95"/>`,
    `<line x1="${X(0)}" y1="${Y(keyCy + 14)}" x2="${X(0)}" y2="${Y(keyCy + 50)}" stroke="${color}" ` +
      `stroke-width="${w(LINE)}" stroke-linecap="round" opacity="0.95"/>`,
  ].join('');
}

// The four modules, in a fixed order and a fixed colour each, so bundle-crate
// and bundle-one-install label the same module the same way.

// The four modules, in a fixed order and a fixed colour each, so bundle-crate
// and bundle-one-install label the same module the same way.
export const BUNDLE_MODULES = [
  { kind: 'bloom', color: C.cyanLt, key: 'cyan' },
  { kind: 'json', color: C.mint, key: 'mint' },
  { kind: 'search', color: C.gold, key: 'gold' },
  { kind: 'ldap', color: C.coral, key: 'coral' },
];

// Containment: one package boundary with the four modules packed inside it two
// by two, the mark sealing the lid.

// ---------------------------------------------------------------- planet art
//
// A wireframe globe: the limb, three latitudes, two meridians. Everything is one
// stroke width, because they are all the same kind of line (rule 10), and the set
// is deliberately sparse — a full lattice turns to dirt at the narrow crop.
export function globe(cx, cy, rad, { width = 3.6, opacity = 0.55 } = {}) {
  const line = (body) => `<${body} fill="none" stroke="${C.cyanLt}" stroke-width="${n(width)}"/>`;
  const parts = [];
  // Latitudes. Half-width is the circle's chord at that height; the squash factor
  // is what sets the apparent tilt, and is shared with the meridians below.
  for (const f of [-0.46, 0, 0.46]) {
    const rx = rad * Math.sqrt(1 - f * f);
    parts.push(line(`ellipse cx="${n(cx)}" cy="${n(cy + f * rad)}" rx="${n(rx)}" ry="${n(rx * 0.24)}"`));
  }
  // Meridians: one ellipse is two of them, plus the pole-to-pole line.
  parts.push(line(`ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rad * 0.52)}" ry="${n(rad)}"`));
  parts.push(line(`line x1="${n(cx)}" y1="${n(cy - rad)}" x2="${n(cx)}" y2="${n(cy + rad)}"`));
  return `<g opacity="${opacity}">${parts.join('')}</g>`;
}





// ------------------------------------------- GLIDE transparent compression
//
// Three candidates for one idea: the client library shrinks a value before it
// leaves the application, so the smaller form is what crosses the network and
// what the server holds. All three keep the transformation on the client's side
// of the wire and put the mark at the far end of it, which is what separates
// them from `memory-efficiency` (a static field of cells getting denser, with no
// client and no wire) and from `limits-tight-envelope` (work packed into a box).
// They differ in the device: plates closing on the content, the content folding
// itself, and unlike values leaving the client in one identical form.

// The press: two plates converge on the lanes of content running between them,
// so what enters the client loose leaves it as one dense band on the wire.



// ------------------------------------------------------- prometheus scraping
//
// One post, three readings of the same pipeline: the counters come out of the
// server on a schedule (`prometheus-scrape-tick`), every node's come out into the
// same store (`prometheus-scrape-every-node`), and what you do with them is read
// them all on one screen (`prometheus-scrape-wall`). None of them is a single
// chart, because `benchmarks` is already that.

// The scrape interval: the same handful of counters is read out of the server at a
// fixed cadence, and each reading is kept beside the last, so a number that only
// ever existed as an instant becomes a history.




// The large value: the focal element of all three themes, so it is the only
// thing carrying a halo, drawn the way `large-key` draws its outsized key.

export function keySizeDistribution(r, { spread = 0, colPitch = 144 } = {}) {
  const { sx, sw } = ADMIN_PANEL;
  const { panel, bars } = adminPanel();

  // The narrow crop keeps only the middle 70% of the width, so the whole
  // composition has about 1050px to live in at this zoom. Tiles are therefore
  // 120 with a 24px gap and 26px of enclosure padding: at 134 they filled the
  // budget exactly and ended up edge to edge.
  //
  // `colPitch` is the column spacing, and the tile stays 120 whatever it is, so
  // raising it widens the gap between servers rather than the servers. The enclosure
  // is derived from the outer columns instead of being written out, which is what
  // keeps it hugging them at any pitch.
  const rows = [310, 540, 770];
  const tile = 120;
  const PAD = 26;
  const cols = [0, 1, 2].map((i) => 1106 + i * colPitch + spread);
  const shardX0 = cols[0] - tile / 2 - PAD; // 160px of air between the panel and the shards
  const shardX1 = cols[2] + tile / 2 + PAD;
  const shardH = 200;


  // One curve per shard, leaving the panel at the middle and arriving level with
  // its enclosure. Both control points sit near the middle of the run, so the
  // bend is a rounded corner rather than a swoop across the frame.
  const harness = rows
    .map((y) => {
      const x0 = sx + sw + 10;
      return (
        `<path d="M ${n(x0)} 540 C ${n(x0 + 58)} 540 ${n(shardX0 - 58)} ${n(y)} ${shardX0} ${n(y)}" ` +
        `fill="none" stroke="${C.cyanLt}" stroke-width="2.6" opacity="0.5"/>`
      );
    })
    .join('');

  // A shard is the enclosure: three servers sharing one slot range.
  const shards = rows
    .map(
      (y) =>
        `<rect x="${shardX0}" y="${n(y - shardH / 2)}" width="${n(shardX1 - shardX0)}" height="${shardH}" rx="26" ` +
        `fill="${C.ink}" fill-opacity="0.22" stroke="${C.ice}" stroke-width="2.4" opacity="0.4"/>`
    )
    .join('');

  // Filled first tile, hollow other two: primary and replicas, a convention that
  // reads without a legend and costs no extra shapes. Two of the three primaries
  // carry the coral of the outlier bars, which is how the chart says where those
  // keys actually live: the colour does the routing, so the fan stays as it is.
  const HOT = [0, 2];
  const pods = [];
  rows.forEach((y, row) => {
    cols.forEach((x, col) => {
      const primary = col === 0;
      const hot = primary && HOT.includes(row);
      const stroke = hot ? C.coral : C.cyanLt;
      if (hot) {
        pods.push(
          `<rect x="${n(x - tile / 2)}" y="${n(y - tile / 2)}" width="${tile}" height="${tile}" rx="26" ` +
            `fill="none" stroke="${C.coral}" stroke-width="12" opacity="0.32" filter="url(#blur8)"/>`
        );
      }
      pods.push(
        `<rect x="${n(x - tile / 2)}" y="${n(y - tile / 2)}" width="${tile}" height="${tile}" rx="26" ` +
          `fill="${hot ? C.coral : C.cyan}" fill-opacity="${primary ? (hot ? 0.42 : 0.4) : 0}" ` +
          `stroke="${stroke}" stroke-width="2.6" opacity="0.9"/>`,
        mark(x, y, 72)
      );
    });
  });

  return [
    // No background wash and no speckle: the only thing lit is the pair of outsized
    // keys, which is the one thing the image is pointing at.
    `  <g>${harness}</g>`,
    `  <g>${shards}</g>`,
    `  <g>${pods.join('')}</g>`,
    `  <g>${panel}</g>`,
    `  <g>${bars}</g>`,
  ].join('\n');
}

// Key size distribution in Valkey Admin, beside the shards it is measured across:
// the panel ranks keys by size with the size printed next to each bar, two of them
// far larger than the rest, and each enclosure on the right holds the three servers
// of one shard. Connectors are elbows rather than curves, because a swept curve
// over this distance reads as decoration.
// The Valkey Admin panel: the ranked bars with their sizes printed. Pulled out of
// keySizeDistribution so the card layout can show it on its own; the coordinates are
// the originals, so the parent theme's output is unchanged.
export const ADMIN_PANEL = { sx: 440, sw: 420, sTop: 210, sH: 660 };

export function adminPanel() {
  const { sx, sw, sTop, sH } = ADMIN_PANEL;

  // The header (mark plus title) is centred in the panel, and the chart baseline
  // runs down from the middle of the mark, so both readings hold at once.
  const HEADER_W = 352;
  const headX = sx + (sw - HEADER_W) / 2;
  const axisX = headX + 24;
  const labelX = sx + sw - 28;

  // Ranked keys with their sizes printed. The top two are a different class of
  // object, not the top of a ramp: tens of megabytes against a few.
  const SIZES = [
    ['42 MB', 210],
    ['36 MB', 185],
    ['3.1 MB', 56],
    ['2.7 MB', 48],
    ['2.0 MB', 41],
    ['1.6 MB', 36],
    ['1.2 MB', 29],
    ['860 KB', 22],
  ];

  const bars = [];
  SIZES.forEach(([size, len], i) => {
    const y = 372 + i * 62;
    const outlier = i < 2;
    if (outlier) {
      bars.push(
        `<rect x="${n(axisX)}" y="${n(y - 12)}" width="${n(len)}" height="24" rx="12" fill="none" ` +
          `stroke="${C.coral}" stroke-width="12" opacity="0.32" filter="url(#blur8)"/>`
      );
    }
    bars.push(
      `<rect x="${n(axisX)}" y="${n(y - 12)}" width="${n(len)}" height="24" rx="12" ` +
        `fill="${outlier ? C.coral : C.cyanLt}" opacity="${outlier ? 0.95 : n(0.7 - i * 0.05)}"/>`,
      `<text x="${n(labelX)}" y="${n(y + 14)}" fill="${outlier ? C.coral : C.ice}" text-anchor="end" ` +
        `font-family="${FONT}" font-size="38" font-weight="500" opacity="${outlier ? 0.95 : 0.6}">${esc(size)}</text>`
    );
  });

  const panel =
    `<rect x="${sx}" y="${sTop}" width="${sw}" height="${sH}" rx="22" fill="${C.ink}" fill-opacity="0.5" ` +
      `stroke="${C.ice}" stroke-width="3" opacity="0.9"/>` +
    `<line x1="${n(sx + 28)}" y1="${sTop + 96}" x2="${n(sx + sw - 28)}" y2="${sTop + 96}" stroke="${C.ice}" ` +
      `stroke-width="2" opacity="0.45"/>` +
    `<g opacity="0.95">${mark(axisX, sTop + 52, 48)}</g>` +
    `<text x="${n(headX + 62)}" y="${sTop + 68}" fill="#FFFFFF" font-family="${FONT}" font-size="44" ` +
      `font-weight="600" letter-spacing="0.6">Valkey Admin</text>` +
    `<line x1="${n(axisX)}" y1="${sTop + 126}" x2="${n(axisX)}" y2="816" stroke="${C.ice}" stroke-width="2" opacity="0.4"/>`;

  return { panel, bars: bars.join('') };
}

// `spread` adds air between the panel and the shards, and defaults to 0, so
// key-size-distribution itself is unchanged. The panel's own width is not a parameter:
// the header is centred on it, the axis is offset from that, the bar lengths are
// absolute and the size labels are right-aligned to its far edge, so widening it pulls
// the bars away from their labels and the chart stops reading as one column.

// `spread` adds air between the panel and the shards, and defaults to 0, so
// key-size-distribution itself is unchanged. The panel's own width is not a parameter:
// the header is centred on it, the axis is offset from that, the bar lengths are
// absolute and the size labels are right-aligned to its far edge, so widening it pulls
// the bars away from their labels and the chart stops reading as one column.

// ------------------------------------------------------------------ cards
//
// The card layout, after the Neon blog covers: the lockup in the upper left, the
// title on solid blocks in the lower left, and the subject on the right. The lockup
// comes from stamp() and the title from the caption slot, both of which every other
// banner already uses, so a card theme only places the subject.
//
// There is no frame around the subject any more. A thin rectangle was tried and it
// looked wrong either way round: closed, its far edge showed straight through the
// translucent artwork; open on one side, it read as a stray bracket.
//
// The subject is key-size-distribution's motif, drawn by the same function as the
// parent theme so the two cannot drift. Three fixed things set where it goes, all in
// the framed box x 198..1722, y 111..969:
//
//   the corner lockup   x 262..469,  y 158..228
//   the caption blocks  x 274..838,  y 682..904
//   the motif's own box  x 440..1480, y 210..870 before scaling
//
// Two caption lines rather than three shortened the block stack to 146 units, which
// moved its top edge down from 682 to 758 and left room for the whole chart above it.
// The bottom size label's baseline lands at 735 and the last bar at 723, both clear, so
// nothing in the panel is behind the blocks any more. The panel's rounded bottom still
// runs 20 units under them, which is the overlap that ties the title to the artwork.
//
// The artwork is centred in the frame on both axes, 298 units of margin left and right
// and 145 top and bottom, and those numbers are computed rather than tuned.
//
// The labels do not constrain the horizontal. They are right-aligned at 832 before
// scaling, which once had to clear a three-line caption reaching to 838, but at two lines
// the clearance is vertical instead. Widening the panel was tried and rejected: the header
// is centred on the panel, the axis is offset from that and the bar lengths are absolute,
// so a wider panel pulls the bars away from their labels and the chart stops reading as
// one column.
//
// Centring costs the bottom row of the chart, the 860 KB bar and its label, which the
// block stack crosses. One row, and the same overlap the parent theme has.
//
// Spread came down from 150 to 40 rather than to 0 because the shards have to stay clear
// of the harness curves leaving the panel. At 40, centred, the enclosures end at 1424 and
// the panel starts at 496, both inside the narrow crop's 427..1493, so the whole cluster
// sits in both crops. The
// intermediate values do not work: 26 units of enclosure padding is all that separates the
// third tile's right edge from the enclosure's, so any framing that bleeds the enclosure
// meaningfully also slices a tile, and a half-cut hexagon reads as a bug rather than as
// the cluster continuing.
//
// The placement is computed, not tuned. The motif's drawn box runs from x 440 to the
// right edge of the last shard enclosure, y 210..870; scale it, then centre it in the
// framed box. Every hand-tuned attempt at this drifted, most recently to 352 left against
// 243 right, because the numbers to balance are the scaled box against the frame and
// neither is obvious by eye.
//
// The right edge is derived, not written down, because two arguments move it: `spread`
// slides the shards away from the panel and `colPitch` spaces the columns. It is the last
// column's centre plus half a tile plus the enclosure's 26 units of padding, which comes
// out at 1480 for the defaults.
//
// `clearY` is the one constraint that overrides centring, and only ever upwards. Vertical
// centring knows about the framed box and nothing about the caption, so a variant that has
// to sit clear of the title blocks states the y it must stay above and gets its dy from
// that instead. Without a `clearY` the behaviour is unchanged.
