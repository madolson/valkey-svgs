# valkey-svgs

Themed banner artwork for Valkey blog posts, talks, and docs, generated from code.

Every image shares one visual system: the deep navy-to-purple gradient from the valkey.io
hero, a focal glow, a vignette, film grain, and accents drawn only from the Valkey brand
palette. Each one then layers a motif on top. The point is that a contributor writing about
memory efficiency can grab a memory-efficiency banner instead of picking a random abstract
image, and the result still looks like it belongs next to everything else.

The artwork is code, not hand-drawn SVG. That means themes stay consistent, the palette
can't drift, and regenerating is a no-op diff.

| Image | Motif | Use it for |
| --- | --- | --- |
| `community` | Constellation graph, best-connected peers drawn as the Valkey mark | Community highlights, contributor spotlights, roundups, governance |
| `performance` | Command traffic warping into the mark at a vanishing point | Throughput, latency, speed work |
| `memory-efficiency` | Cell grid, pitted on the left, compacted dense on the right | Memory footprint, encodings, defragmentation |
| `clustering` | Slot ring around a meshed core, shards joining from outside | Cluster mode, replication, scaling out |
| `atomic-slot-migration` | Two shard rings, a chevron driving slots between them, magnifier on the stream | Slot migration and rebalancing |
| `atomic-slot-migration-quiet` | The same two rings and lens, with the lens given the frame | Slot migration when the point is watching it happen |
| `slot-migration-lens` | A big lens over the migration stream, instances and stream quiet | Observability for migration, inspecting data in transit |
| `release` | Valkey chevrons driving into a golden burst | Release and general announcements |
| `release-version` | The same burst with a caption you set | A specific release. See [Captions](#captions) |
| `security` | Shield woven from the lattice it protects | Security in general, CVEs, hardening |
| `security-acl` | Commands at a gate, most admitted, some turned away | ACLs, authentication, TLS |
| `security-shield-clean` | The woven shield with the speckle removed, lattice only | Security in general, CVEs, hardening |
| `security-shield-plated` | The shield built from even courses of armour plating | Hardening in layers, defence posture |
| `security-shield-nested` | Three shields of one shape nested inside each other | Defence in depth, layered controls |
| `security-acl-simple` | Four lanes at one centred gate, three through and one refused | ACLs, authentication, TLS |
| `security-queue-depth` | Rows of inbound reports stacked against one review line, three cleared | Security report volume, triage load, advisory policy |
| `security-triage-funnel` | A field of findings narrowing to three confirmed, the rest discarded | Machine-generated findings, adversarial review, audit pipelines |
| `security-same-bug-twice` | Two identical tracks, one cell repaired, the same cell still faulty | Bug classes, incomplete fixes, sweeping for other instances |
| `benchmarks` | Throughput bars climbing under flat P50/P99 latency | Benchmark results, observability, metrics |
| `data-structures` | Hash buckets chaining out beside a skip list | Internals: hash tables, skip lists, new types, modules |
| `how-to` | Step track with the current step lit | Tutorials, guides, getting started |
| `keyspace-scan` | Cursor holding one lit window of a key field, uneven hop track below | `SCAN`, cursors, iterating a keyspace without blocking |
| `large-key` | A field of identical key tiles with one scaled up until it dwarfs them | Large keys, hot keys, uneven key sizes |
| `key-prefix-groups` | Sampled keys funnelling into prefix rows with count bars | Key naming, prefixes, keyspace browsing and clients |
| `blackhole` | A dark sphere with its accretion disk lensed into a ring around it | Talks, keynotes, anything that wants one striking abstract image |
| `bloom-bit-array` | Hash nodes fanning out of the mark, lighting a handful of cells in a bit array | Bloom filters, valkey-bloom, probabilistic data structures |
| `search-vector-nearest` | Query at the centre of an indexed field, its nearest matches lit inside a search radius | Vector similarity search, KNN queries, embeddings |
| `search-field-index` | Records giving up one field each to a sorted index, a query bracketing the matched run | Secondary indexing on hashes and JSON, FT.CREATE, filters |
| `client-ports` | Six unlike callers docking into identical ports around the mark, uniform inside the port circle | A specific client release, client API design |
| `ai-agent-memory` | Conversation turns on a tape, recent ones lit in a window, older ones archived below and arcing back | Agent memory, chat history, context windows, mem0 |
| `workload-fanout` | One inbound stream splitting at the mark into five differently shaped structures | AI workloads mapped onto Valkey primitives |
| `conn-storm-spike` | Flat run of connection attempts spiking into a wall that overshoots the accept ceiling | Connection storms, accept backlog, reconnect surges |
| `bundle-crate` | One bracketed package sealed with the mark, holding the bundle's four modules: bit array, nested document, magnifier, padlock | valkey-bundle, module distributions, batteries-included packaging |
| `bundle-one-install` | A single strap arriving at the mark and branching into the same four modules | valkey-bundle, one install that delivers several capabilities |
| `tooling-stack` | Identical primitives at the base, differently detailed tools resting on them, the mark on top | Server primitives, what gets built on them, extensibility |
| `data-structures-grid` | Six value types, one per cell on an even 3x2 grid: byte run, list, set, hash, sorted set, bitmap | Type overviews, command surveys, what Valkey stores |
| `k8s-spec-fanout` | A declared spec panel fanning out along rails into a grid of identical instances | Helm charts, operators, declarative deployment |
| `key-size-distribution` | Ranked key-size bars with two big outliers, fanning into a grid of servers | Key size skew, heavy hitters, hot keys across a fleet |
| `key-size-distribution-flat` | The same panel and shards on one solid purple field | Same, where the banner should read as flat graphic design |
| `k8s-desired-count` | Six declared slots, four filled, one rising into place, one still empty | Replica counts, scaling to a desired state, reconciliation |
| `limits-tight-envelope` | A small box packed edge to edge, pushing out, inside far larger outlines | Constrained hardware, small instances, resource ceilings |
| `limits-gauge-pinned` | A gauge sweeping into gold and stopping short of a red end zone | Running right up to a limit, headroom, saturation |

Rasters are in [`images/`](images/) at 1920x1080 WebP, and every one of them also gets an
unfurl copy in [`images/og/`](images/og/) at 1200x630, the 1.91:1 that `og:image` consumers
(LinkedIn, Slack, Facebook) expect and that X accepts. Those are centre-cropped from the
master rather than squashed, so nothing is distorted; use them for link previews and the
1920x1080 masters for page heroes. Vector sources are in [`svg/`](svg/), committed so you can
tweak one by hand without running Node.

Every banner carries the Valkey lockup, mark plus wordmark, stamped in the upper left by
`wrap()`. It is placed in framed coordinates, so it lands at the same size and inset whatever
a theme's `zoom` is. The narrow 200px-tall crop keeps only the middle 70% of the width and
cuts it; that is the cost of a corner.

[`themes.json`](themes.json) is the machine-readable index of the table above, regenerated
on every run from `THEMES` and the README rows. Consumers read it instead of parsing this
file; the gallery at [madelynolson.com/valkey-banners](https://madelynolson.com/valkey-banners)
pulls this repo in as a submodule and renders from it.

## Regenerating

```sh
node generate.mjs                        # all themes
node generate.mjs performance release    # just these
```

Requirements:

- **A Chrome-based browser** (Chrome, Chromium, or Edge) to rasterize the SVG. Rendering
  happens at 2x and is downsampled, so thin strokes antialias properly.
- **Python with Pillow** to downsample and encode the WebP: `pip3 install Pillow`.

No npm dependencies. Nothing to install beyond those two.

Every theme seeds its own PRNG and `Math.random()` is never called, so regenerating
produces byte-identical files. A rebuild should show no diff unless you changed the code.

Themes that carry live text (`benchmarks` labels its series, `release-version` has a
caption, `key-size-distribution` prints sizes, and every `-caption` variant) depend on a
font resolving at render time, so they reproduce identically on a given machine but can
shift a pixel across machines with different font stacks. The rest are geometry only and
reproduce anywhere.

## Caption variants

Every theme in the table ships twice. `<name>` is the full-screen version: the motif fills
the frame and there is no text. `<name>-caption` is the same drawing with the bottom left
given over to sticker text, the way a blog card wants it. The variant is derived from the
original in `THEMES` rather than written out, so a theme is drawn once and the two cannot
drift apart.

```sh
node generate.mjs security-caption                                   # the theme's own title
node generate.mjs security-caption --caption "CVE-2026-1234 explained" --out my-post
```

Three things worth knowing:

- The caption slot is fixed: bottom left, one solid light block per line, at most three
  lines. Fixed on purpose, so a composition can be drawn to leave that corner alone.
- To make room, the whole motif is scaled to 78% and anchored to the top right. Nothing in
  a theme function changes, but thin strokes get thinner, so a theme that was already at the
  legibility floor reads weaker captioned than full screen.
- The 200px-tall mobile crop keeps only the middle 70% of the width and cuts the caption.
  Captioned variants are for unfurls and wide heroes, where the crop takes height only.
  `benchmarks`, `release-version` and both `key-size-distribution` variants have no captioned
  version, because they already draw their own text.

## Captions

`release-version` takes a caption, so one theme can produce a banner per release without
drawing anything:

```sh
node generate.mjs release-version --text "9.0" --out release-9-0
```

That writes `images/release-9-0.webp`. Both `--text=9.0` and `--text 9.0` work. `--out`
takes exactly one theme, and `--text` only applies to captioned themes, which have to be
named explicitly. Keep captions short: the text is centred at 118px and starts running out
of room past roughly 25 characters.

## Adding a theme

There is a skill at [`.claude/skills/valkey-header-art/SKILL.md`](.claude/skills/valkey-header-art/SKILL.md)
that walks an agent through this. The short version:

A theme is a function that takes a seeded random source and returns SVG markup. The shared
atmosphere and the reusable halo and blur filters are added by `wrap()`, so a theme only
draws its own motif. Register it in the `THEMES` array:

```js
{
  name: 'my-theme',          // also the output filename
  seed: 24007,               // any unused integer; changing it reshuffles the randomness
  focal: [960, 540],         // where the background glow sits
  zoom: 1.2,                 // crop in on the 1920x1080 grid so the motif fills the frame
  center: [960, 540],        // offset that crop for asymmetric compositions
  title: 'Short title',      // becomes <title> in the SVG
  desc: 'One sentence.',     // becomes <desc>, so write it as alt text
  art: myTheme,
}
```

Helpers worth knowing:

- `mark(cx, cy, height)` draws the Valkey hexagon, white by default. The path is read out of
  `assets/Valkey-logo.svg` at generate time rather than copied, so the artwork tracks the
  logo. Where it lands on a bright glow, put a `url(#scrim)` circle behind it first or the
  white washes out.
- `dot(x, y, r, color, key, opacity, halo)` is a glowing dot. Drop `halo` below its default
  for tightly packed runs, where the bloom otherwise compounds into haze.
- `weighted(r, [[value, weight], ...])` picks from a weighted list.
- `arcPath(cx, cy, r, a0, a1)` builds an arc. It assumes `a1 > a0`; add `2 * Math.PI` to
  `a1` if your angles wrap, or the arc takes the long way round.
- `slotRing(r, cx, cy, r, {vacated, arrived})` is the cluster slot ring.

### Three things that will bite you

**Mind the horizontal safe area, not just the vertical one.** These are consumed as
`object-fit: cover` banners. A wide box crops the height and is forgiving. A narrow box
crops the *width* and keeps only the middle ~70%. Keep anything that must stay whole (the
mark, a label) between 15% and 85% of the framed width. Streaks, chevrons, and graph edges
are fine bleeding off. Every clipping bug in this repo's history was horizontal.

**Frame with `zoom`/`center`, don't rescale the drawing code.** Each theme is drawn on the
full 1920x1080 grid; `zoom` crops in on it. Raising a zoom is the quickest way to push
something out of frame, so re-check both crops afterwards.

**Text is the exception.** Most text is illegible once cropped, and text needs translating.
`benchmarks` and `release-version` carry short labels on purpose; keep anything new at 44px
or larger and inside the safe area.

### Checking your work

Eyeball both crops rather than the full image:

```sh
python3 - <<'EOF'
from PIL import Image
def cover(im, bw, bh):
    ia, ba = im.width / im.height, bw / bh
    if ba > ia: w, h = im.width, round(im.width / ba)
    else:       h, w = im.height, round(im.height * ba)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))
im = Image.open('images/performance.webp')
cover(im, 810, 400).save('/tmp/wide.png')     # crops height
cover(im, 247, 200).save('/tmp/narrow.png')   # crops width, the strict one
EOF
```

Then confirm you did not churn anything else:

```sh
node generate.mjs && git diff --stat    # should be empty except your theme
```

## Licence

Code and generated artwork are Apache-2.0. See [LICENSE](LICENSE).

The Valkey name and hexagon mark are trademarks of the Linux Foundation and are **not**
relicensed by this repository. Apache-2.0 grants no trademark rights. Use of the mark is
governed by the [Linux Foundation trademark policy](https://www.linuxfoundation.org/legal/trademark-usage)
and the Valkey project's own guidance. In practice: these banners are intended for Valkey
project and community use, and you should not use them to imply endorsement of something
that is not part of the project.
