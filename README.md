# valkey-svgs

Themed banner artwork for Valkey blog posts, talks, and docs, generated from code.

Every image shares one visual system: the deep navy-to-purple gradient from the valkey.io
hero, a vignette, film grain, and accents drawn only from the Valkey brand palette. Each one
then layers a motif on top. The background is the same on every banner, with no per-theme
glow and no starfield except on the space themes (`blackhole-*`, `planet-ring`), because a
purple gradient with stars scattered over it was the most generic thing in the set. The point is that a contributor writing about
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
| `release` | Valkey chevrons driving into a golden burst | Release and general announcements |
| `release-version` | The same burst with a caption you set | A specific release. See [Captions](#captions) |
| `security-shield-clean` | A radiant shield woven from one even lattice, the mark at its centre | Security in general, CVEs, hardening, ACLs, advisories |
| `benchmarks` | Throughput bars climbing under flat P50/P99 latency | Benchmark results, observability, metrics |
| `data-structures` | Hash buckets chaining out beside a skip list | Internals: hash tables, skip lists, new types, modules |
| `how-to` | Step track with the current step lit | Tutorials, guides, getting started |
| `large-key` | A field of identical key tiles with one scaled up until it dwarfs them | Large keys, hot keys, uneven key sizes |
| `key-prefix-groups` | Sampled keys funnelling into prefix rows with count bars | Key naming, prefixes, keyspace browsing and clients |
| `bloom-bit-array` | Hash nodes fanning out of the mark, lighting a handful of cells in a bit array | Bloom filters, valkey-bloom, probabilistic data structures |
| `search-vector-nearest` | Query at the centre of an indexed field, its nearest matches lit inside a search radius | Vector similarity search, KNN queries, embeddings |
| `search-field-index` | Records giving up one field each to a sorted index, a query bracketing the matched run | Secondary indexing on hashes and JSON, FT.CREATE, filters |
| `client-ports` | Six unlike callers docking into identical ports around the mark, uniform inside the port circle | A specific client release, client API design |
| `workload-fanout` | One inbound stream splitting at the mark into five differently shaped structures | AI workloads mapped onto Valkey primitives |
| `conn-storm-spike` | Flat run of connection attempts spiking into a wall that overshoots the accept ceiling | Connection storms, accept backlog, reconnect surges |
| `bundle-crate` | One bracketed package sealed with the mark, holding the bundle's four modules: bit array, nested document, magnifier, padlock | valkey-bundle, module distributions, batteries-included packaging |
| `data-structures-grid` | Six value types, one per cell on an even 3x2 grid: byte run, list, set, hash, sorted set, bitmap | Type overviews, command surveys, what Valkey stores |
| `k8s-spec-fanout` | A declared spec panel fanning out along rails into a grid of identical instances | Helm charts, operators, declarative deployment |
| `key-size-distribution` | Ranked key-size bars with two big outliers, fanning into a grid of servers | Key size skew, heavy hitters, hot keys across a fleet |
| `blackhole-gargantua` | Edge-on relativistic disk, one thin ring closing right round the shadow, even on both sides | Talks, keynotes, anything that wants one striking abstract image |
| `blackhole-halo` | The same model tilted, the ring opened into a broad white-to-red halo | Same |
| `blackhole-beamed` | The same model with Doppler beaming left in, so one side blazes | Same, when the physics is the point |
| `planet-ring` | A wireframe Valkey globe ringed by article cards, one data structure each | Planet Valkey, community blog roundups, the wider ecosystem |
| `key-size-card-a` | The key-size ranking and shards centred and scaled to clear the corner lockup, title overlapping the panel | The big-keys post; the reference card layout |
| `key-size-card-flat` | The same card with the artwork short and wide, sitting clear of the title rather than under it | The big-keys post, when the title should not cross the chart |
| `k8s-desired-count` | Six declared slots, four filled, one rising into place, one still empty | Replica counts, scaling to a desired state, reconciliation |
| `limits-gauge-pinned` | A gauge sweeping into gold and stopping short of a red end zone | Running right up to a limit, headroom, saturation |
| `prometheus-scrape-wall` | Six flat dashboard panels and one big one whose trace climbs away in red | Dashboards, Grafana, finding the one metric that moved |
| `llm-kv-cache-new-tail` | One prompt as a run of chunks, most of it loaded from the store below, only the tail fed by the processor above | KV caching for LLM inference, prefix reuse, skipping prefill |
| `exporter-two-views-many-and-one` | A deck of per-node readout cards beside one cluster-wide card with per-slot counters | Per-pod series versus per-slot series, exporter choice |
| `keyspace-gui-safe-refusal` | Read lanes crossing the server's boundary, one write turned back at it | ACL users, read-only access, NOPERM, server-side authorisation |
| `keyspace-gui-safe-readout` | A client window of four read-only panels, each fed by one read from the server | GUI clients, INFO, CLIENT LIST, SLOWLOG, monitoring views |
| `commands-replace-lua-round-trips` | Four thin messages crossing between caller and server, one thick call below them carrying the condition | Command options that collapse an exchange into one call |
| `commands-replace-lua-one-line` | A quiet block of script lines giving way to one long command bar with a condition on its end | New command options that replace a Lua script |
| `ai-advisory-surge-sieve` | A flood of reports narrowing onto a toothed screen, three getting through in red | Report volume, triage load, what counts as a vulnerability |
| `ai-advisory-surge-reproducer` | Five candidate bugs, four struck out, the survivor dropping into its reproducer | Adversarial audits, LLM-found bugs, verification before a human |
| `ai-advisory-surge-backport-rails` | Five version rails with one fix node aligned on every one of them | Backports, patch releases, shipping a fix to every supported version |
| `fbtree-wide-root` | One wide root node of child slots over four linked leaves of packed members | fbtree, B+ trees, the ordered index behind a sorted set |
| `fbtree-tower-and-tree` | A row of members each under its own tower of pointers, above the same members in one wide node over linked leaves | Replacing the skiplist with fbtree, a change of shape |
| `big-value-latency-copy-block` | One thread's timeline with a large value sitting on it, and the waits hanging underneath deepening into a wedge exactly across its span | Tail latency, head-of-line blocking, p99.9, one slow operation on a shared thread |
| `big-value-latency-stalled-queue` | A large value standing across all three lanes out of the server, the small requests packed nose to tail behind it | Noisy neighbours, large values, one path out of the server |
| `client-compression-packed-run` | One value's eight fields filling a row, then the same eight taking a fifth of it on the way to the server | Client-side compression, when the point is how much smaller the value gets |
| `client-compression-twin-sends` | The same six-field value on two wires of equal length, filling a quarter of one and most of the other | The same, when the point is how much of the network the value stops using |
| `test-double-empty-rack` | An unlit host with three open, empty bays, and the server standing lit beside it | Test doubles, fakes, testing with no server, port or container |
| `scan-cursor-pages` | Five stacked pages of keys tiling a keyspace, exactly one of them lit | `SCAN`, cursors, iterating a keyspace without holding it all at once |
| `agent-context-lit-transcript` | A two-lane chat transcript with the newest three turns and two isolated older ones lit | Agent memory, chat history, context windows, selective recall |
| `agent-context-recall-arc` | A dim column of turns with the newest lit, and one thick band carrying an older turn back up into them | Agent memory, recall, fetching an older turn back into the context window |
| `built-on-primitives-one-brick` | Three unlike structures on one baseline, all built out of copies of the same block | Server primitives, what gets built on them, extensibility |

Rasters are in [`images/`](images/) at 1920x1080 WebP. Every one also gets a chrome-free
copy in [`images/plain/`](images/plain/), the same art with no corner lockup and no title
blocks, for setting your own type over. The gallery has a button that swaps between them.
And every one gets an unfurl copy in [`images/og/`](images/og/) at 1200x630, the 1.91:1 that `og:image` consumers
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

## Design principles

[DESIGN.md](DESIGN.md) is the review rubric for every banner here: what the working ones have in
common, the faults that got others deleted, and the blind read that decides. Read it before adding
a theme and again before committing one.

## Regenerating

```sh
node generate.mjs                        # all themes, skipping any that are unchanged
node generate.mjs performance release    # just these
node generate.mjs --force                # ignore the cache and redraw everything
```

Rendering is the whole cost of a run: two Chrome screenshots and two Pillow encodes per
theme, so a full rebuild from cold is about five and a half minutes. An SVG fully
determines its raster, so its hash is used as a cache key in `.render-cache.json`
(gitignored). A theme is redrawn when its markup differs from the hash on record or when
one of its outputs is missing; otherwise it is skipped, and a no-op rebuild takes under a
second. Nothing about correctness rests on it: delete the file and the next run redraws
everything.

Requirements:

- **A Chrome-based browser** (Chrome, Chromium, or Edge) to rasterize the SVG. Rendering
  happens at 2x and is downsampled, so thin strokes antialias properly.
- **Python with Pillow** to downsample and encode the WebP: `pip3 install Pillow`.

No npm dependencies. Nothing to install beyond those two.

Every theme seeds its own PRNG and `Math.random()` is never called, so regenerating
produces byte-identical files. A rebuild should show no diff unless you changed the code.

Every banner carries text now, so all of them depend on a font resolving at render time:
they reproduce identically on a given machine but can shift a pixel across machines with
different font stacks.

## Captions

The caption is on by default, so one theme is one file. There used to be a derived
`<name>-caption` twin of every theme, which meant 95 files for 51 pictures; the plain
uncaptioned copy is the rarer thing to want, so it is the flag now.

```sh
node generate.mjs security-shield-clean                                  # the theme's title
node generate.mjs security-shield-clean --caption "CVE-2026-1234 explained" --out my-post
node generate.mjs security-shield-clean --no-caption                     # no text at all
```

Four things worth knowing:

- The slot is fixed: bottom left, one solid light block per line, at most two lines of up
  to 32 characters. Fixed on purpose, so a composition can be drawn to leave that corner
  alone. 32 is the smallest limit that fits the longest title in the set into two lines,
  and it puts the widest block at 1038 of the 1920. A title needing a third line throws
  rather than silently losing its tail.
- Each block carries a drop shadow, three passes of it, so it reads as sitting above the
  artwork rather than punched into it. Three because the ground is already dark, so a
  single shadow that would be obvious on white barely registers here.
- The stickers sit **on top of** the motif, which is drawn at full size. Nothing is scaled
  down and nothing is pushed aside. A theme whose motif runs through that corner will have
  art behind the blocks; the blocks are opaque, so the text stays legible either way.
- The blocks and the corner lockup are painted above the vignette. They are chrome rather
  than art, and the vignette was visibly darkening the outer end of every block.
- The 200px-tall mobile crop keeps only the middle 70% of the width and cuts the caption.
  That crop takes width; the wide crops and the unfurls take height only and keep it.
  `benchmarks` and `release-version` have no sticker, because they draw their own text.

## Card layout

`key-size-card-*` are the candidates for the card shape, after the Neon blog covers: the
lockup in the upper left, the title on blocks in the lower left, the subject on the right.
The lockup comes from `stamp()` and the title from the caption slot, both of which every
other banner already uses, so a card theme only places the subject.

There is no frame around the subject. A thin rectangle was tried and looked wrong either way
round: closed, its far edge showed straight through the translucent artwork; open on one
side, it read as a stray bracket.

Three fixed things set where the subject goes, all in the framed box x 198..1722,
y 111..969: the corner lockup at x 262..469, y 158..228; the caption blocks at x 274..838,
y 682..904; and the motif's own box at x 440..1480, y 210..870 before scaling.

`key-size-distribution` sits centred, which puts the panel's top left corner just inside the
lockup. Scaling to 0.88 pulls it clear and keeps the left and right margins even at 304 a
side, so nothing runs off an edge. The caption still crosses the panel's lower left, which is
what ties the title to the artwork; clearing it completely leaves a dead gap between them.

## The release number

`release-version` takes a big drawn number, so one theme can produce a banner per release
without drawing anything:

```sh
node generate.mjs release-version --text "9.0" --out release-9-0
```

That writes `images/release-9-0.webp`. Both `--text=9.0` and `--text 9.0` work. `--out`
takes exactly one theme, and `--text` only applies to `release-version`, which has to be
named explicitly. Keep it short: the number is centred at 118px and starts running out of
room past roughly 25 characters.

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

## Motion

Four animated banners, generated by [`motion.mjs`](motion.mjs). They share the static set's
atmosphere exactly: same sky gradient, same vignette, same film grain, same corner lockup and
caption blocks in the same slots, so a motion banner and a static one can sit on the same page
or cross-fade into each other.

They are canvas, not SVG, and the reason is additive compositing. A glow stamped with
`globalCompositeOperation = 'lighter'` *sums* with what is under it, so overlapping glows get
brighter. An SVG halo is `feGaussianBlur` plus `feMerge`, which composites *over*, so a dense
field of them saturates into flat even haze no matter how the filter is tuned. That is the
difference between the accretion disk in `blackhole-particles` and the one in
`blackhole-gargantua`, and it is not a knob on the SVG side: the format has no additive blend
mode. Canvas also draws a hundred thousand primitives a frame without a hundred thousand DOM
nodes, which is what makes the particle counts here possible at all. `eclipse-corona` is the
clearest case: there is no static eclipse in the set because a corona is a veil that has to sum
from thousands of overlapping glows and taper into nothing, and SVG cannot build one.

| Image | Motif | Use it for |
| --- | --- | --- |
| `client-streams` | Clients docked on a hexagon of ports around the mark, glowing dots pouring outward down every connection | Serving traffic, connections, clients, throughput on a page hero |
| `blackhole-particles` | The accretion disk as thousands of orbiting points of light, the lensed ring closing all the way round the shadow | Talks, keynotes, anything that wants one striking abstract image |
| `cluster-gossip` | Six shards at the corners of a hexagon trading messages across a mesh, enclosing the mark in silhouette | Cluster mode, gossip, replication, membership |
| `eclipse-corona` | The moon's ragged edge over the sun, Baily's beads flickering in its valleys, the corona hanging in equatorial lobes and shimmering in place | Talks, keynotes, launches, anything wanting one striking abstract image |

Each one produces three files:

- `motion/<name>.webp`, animated WebP at 1280x720, seamless, `loop=0`. Drop it in an `<img>`;
  nothing else is needed and there is no player to configure.
- `motion/<name>-poster.webp`, one still at 1920x1080, for `poster=`, for an `og:image`, or
  for anywhere motion is unwelcome.
- `html/<name>.html`, the source. Self-contained, no build step: open it in a browser and it
  loops live off the wall clock. `?t=2.5` renders exactly that instant and stops, which is how
  every captured frame is taken.

[`motion.json`](motion.json) is the machine-readable index, separate from `themes.json` so
nothing that already reads `themes.json` has to change.

```sh
node motion.mjs                          # all of them, skipping any that are unchanged
node motion.mjs cluster-gossip           # just this one
node motion.mjs --force                  # ignore the cache
node motion.mjs --fps 8                  # rough and fast, for iterating on the art
node motion.mjs --width 960 --quality 68 # smaller files
```

A full rebuild is about eight minutes, nearly all of it in `blackhole-particles`, which stamps
roughly a hundred thousand sprites per frame. Frames come out of Chrome over the DevTools protocol
rather than one `--screenshot` per frame; a hundred Chrome launches is two minutes of process
spawning and nothing else. Node 22 has a WebSocket client built in, so this still needs no npm
dependency, and the same Chrome and Pillow the static set needs.

One Chrome per theme, not one per run. Sharing a renderer across several hundred heavy canvas
frames eventually gets `Page.captureScreenshot` to stop answering: two themes rendered fine and the
third died on a timeout. A launch costs about a second, which is nothing against minutes of
rendering, and it bounds whatever is accumulating.

### The rule: every frame is a pure function of time

Nothing integrates state between frames. A dot's position, size and opacity are closed-form in
its age, and its age is taken modulo the loop period. That is what makes the loop *exactly*
seamless rather than nearly seamless, and it is checkable: screenshot
`html/<name>.html?t=0`, `?t=<loop>` and `?t=<3 * loop>` and the three PNGs are byte-identical.
They have to be, because they are the same expression evaluated at the same wrapped time. A
side effect worth having: a dropped frame cannot drift the render, and `?t=` seeks exactly.

Two techniques get you there.

**Streams.** A stream emits N dots per loop at fixed phases `n / N`. A dot's age is
`(t - n * T / N) mod T`, and it is drawn only while `age < lifetime`. Because the age wraps and
the lifetime is shorter than the period, the set of visible dots at `t` and at `t + T` is the
same set in the same places. `client-streams` is this.

**Orbits.** A ring of `m` particles evenly spaced in angle is unchanged by a rotation of
`2 * pi / m`, so a band may rotate any whole number of slots per loop: `omega = 2 * pi * j / (m * T)`.
With `m` in the hundreds the quantum is a fraction of a percent of a revolution, fine enough
that Keplerian shear reads as continuous. The catch: particles within a band must be
*identical*, because rotating by one slot carries a particle's own jitter with it. So
appearance varies by **screen position**, never by particle identity. That costs nothing.
Any function of position is invariant under the band's rotation, which leaves lensing, Doppler
beaming, radial colour and edge-on brightening all still available. `blackhole-particles` is
this.

### Adding a motion theme

Two functions. `setup(R)` runs once and returns the static layout; it is the only place a PRNG
is allowed, so the layout cannot drift between frames. `draw(g, t, u, s, R)` runs per frame
with `g` already transformed into framed coordinates on the same 1920x1080 grid the static set
uses, `t` in seconds within the loop, `u` the phase in `[0, 1)`.

```js
{
  name: 'my-motion',
  seed: 4242,
  loop: 4,                  // seconds; every harmonic in the theme must divide it
  fps: 24,
  poster: 1.6,              // the instant the still is taken from
  zoom: 1.2, center: [960, 512],
  title: 'Short title',
  desc: 'One sentence, written as alt text.',
  setup: mySetup, draw: myDraw,
}
```

Helpers on `R`: `stamp(x, y, w, h, alpha, tint, soft)`, `additive(fn)`, `bloom`, `scrim`,
`mark`, `rand(seed)`, `hash(i)`, `lerp`, `clamp`, `smooth`.

### Four things that will bite you

**Theme functions are serialised with `toString()` and embedded in the page.** They cannot
close over anything in `motion.mjs`. Only the runtime's globals and whatever `setup` returned.

**`RUNTIME` is one template literal, so nothing inside it may contain a backtick or a `${`,
not even in a comment.** A backtick in a comment closes the string and Node reports a syntax
error dozens of lines away from the cause.

**Stamp spacing has to beat stamp size, or a field reads as a lattice.** A band of particles at
fixed count gets sparser as its radius grows; scale the count with the radius. Every "dotted
grid" bug here was angular under-sampling, not too few particles overall.

**A white-cored sprite added a few hundred times over the purple ground goes lavender, not
gold.** The tint never gets a say. Pass `soft` for anything drawn as a dense low-alpha field:
it drops the white core, the accumulation is the tint's own colour, and only saturation drives
it to white, which is what a glowing gas does anyway. Keep the core for discrete dots, where it
reads as heat.

**Grain must be static.** It is generated once and re-drawn identically every frame. Animated
grain flickers, and worse, it makes every frame differ everywhere and destroys the encoder's
interframe compression.

**Model the cause, not the effect.** The eclipse edge sparkles because the moon is not a circle:
peaks and crater rims let the photosphere through in the valleys between them. So the limb is a
radius profile rather than an `arc`, Baily's beads are read off that profile's deepest local
minima, and each bead's brightness is how deep its valley is. Scattering bright dots round a
circle would have been a tenth of the code and would not have looked like anything.

Two things that profile taught. It is a sum of sinusoids on **integer** frequencies, which is what
makes it close on itself; the same trick as the orbits. And the frequencies have to start high:
including n = 3 through 8 gave the moon big smooth lobes and it came out as a potato, because the
real limb is a circle to within a rounding error with fine notches cut into it. Two slow envelopes
then scale the deviation round the limb, or the notching is a uniform scallop and reads as a cog.

**Not all motion is translation.** The eclipse's corona originally emitted particles at the limb
and flung them outward. It looped correctly and it was wrong: it read as an ejection, and a corona
hangs there and shimmers. Positions are fixed now and only brightness moves, as a sum of travelling
waves round the limb plus a per-particle twinkle, every term an integer harmonic of the loop.
Moving something is the obvious way to animate it and often the wrong one.

**Where the falloff lives changes what you have to compensate.** When the corona's taper moved out
of the brightness and into where the particles are sampled, the far ones became as bright as the
near ones and it came out as a starburst. Density and brightness are separate knobs; changing one
does not cover for the other.

**A smooth field wants to be evaluated, not assembled.** The eclipse veil went through three
constructions. Concentric shells of stamps banded into visible rings. One radial gradient per
one-degree wedge fixed the rings and left 360 seams instead: adjacent additive fills either
double-count where they overlap, giving bright spokes, or leave an antialiased hairline where
they do not, giving dark ones. Computing the field per pixel into an offscreen canvas once has
neither problem and costs one `drawImage` a frame. Reach for it whenever a layer is smooth and
does not move.

**Window anything that fades exponentially.** An exponential still has a percent left where you
stop evaluating it, and a percent of light against a dark ground is a visible circular edge.
Multiply the last quarter down to zero.

**If a layout has a shape, make it the hexagon.** `cluster-gossip` first put its shards on a
tilted ellipse. It worked and it was wrong: the mark at the centre is a hexagon, so the ring
around it should be too, taken from the mark's own width-to-height ratio rather than from
`cos(30)` so the two stay in step if the logo ever moves.

## Rejected

Candidates that were built, rendered and dropped. Read this before shortlisting: several
obvious-looking ideas are already on it.

```
security-shield / tall (470x660)        — narrow and upright, reads as a crest rather than a shield
security-shield / broad (700x520)       — low and wide, the glow reaches the narrow crop's edges
security-shield / hex (536x620)         — hexagon silhouette, says Valkey twice with the mark inside it
security-shield / high (mark up 86)     — empties the lower chamber, the weave becomes the subject
security-shield / hex-high              — both faults at once
prometheus-scrape-tick / matrix         — readings as bare columns of value cells read as a tiled grid, not as readings taken at instants; framing each column as a card fixed it
large-object-tail / jam (lane plug)     — big value in a lane with a queue behind it, blind-read as `large-key`
llm-kv-cache-head-start / outline       — the recompute drawn as a dashed empty box read as nothing at all
```

All five lost to `security-shield-clean` on the same judgement: the shipped proportions are
better than any of them, and the shield's silhouette is not a knob worth turning.

```
exporter-two-views-twin-scopes / mount bar  — the two glasses joined centre to centre read as
                                              two unrelated bubbles on a rod; a callout wedge
                                              off one node says which node is being detailed
```

```
keyspace-gui-safe-refusal / slotted   — boundary cut open where each read crosses, reads as a dashed rule
keyspace-gui-safe-refusal / banded    — the same openings capped across the thickness, reads as stacked boxes
```

Both were attempts to show permitted commands passing *through* a gap. At banner size a
broken vertical line stops being a boundary at all. The shipped version leaves the bar
unbroken and draws the lanes over it, which reads as crossing and keeps the boundary solid
where the write meets it.

```
fake-in-process-parity / two rows       — replies in two horizontal rows: the gap between them is dead space and the dashed ties between pairs disappear at crop size
```

Shipped as two columns side by side instead. The caption owns the lower left, so a comparison
has more height to work with standing up than lying down.

```
fbtree-leaf-run / bars (16 tall cells)  — one leaf filled with tall two-tone bars, blind-read as a bar chart
fbtree-leaf-run / slots (10 two-field)  — the score-over-member split read as arbitrary, and the leaf border, which is the node and therefore the whole point, read as decoration (principle 2)
```

Both were the inside of a single leaf. The problem is structural: at leaf scale the only
things in frame are a box and a row of identical cells, so the box has to be furniture and
the subject at once. `fbtree-wide-root` already draws packed leaves inside a picture that
also says which structure they belong to, so this one had nothing left to add (principle 1).

```
big-value-latency-off-thread / stem      — payload on its own track under the timeline, one narrow
                                           green reference standing in the row: blind-read as
                                           "a big value stalls the thread", the opposite sentence
big-value-latency-off-thread / channel   — the same payload under a two-railed channel: read as a
                                           latency bar hanging off a baseline, inverted again
big-value-latency-off-thread / diverted  — no rails, payload offset sideways, one green diagonal
                                           arrow into it: read as "a stream interrupted by an
                                           outlier that is being diverted somewhere else"
```

Three drawings of the 9.0 fix, all dropped at the blind read. A large coral mass in the same frame
as a row of small requests is read as blocking them however it is arranged: the row alone cannot
say "this used to be worse", so the only thing left to read is the big object next to it. Anything
that carries copy avoidance needs the two paths drawn as two paths, with the payload's own route
going somewhere, and that is a different banner from the two shipped here.

```
client-compression / round-trip         — the value shrinking on the way out and coming back whole on the way in: two payload pairs, so the focal element was a pair and not one object, and the blind read called the glow and the right-hand gap decoration
```

It also said the same thing as `client-compression-packed-run` with a return leg added, which
makes it the second banner for one sentence rather than a second idea.

```
test-double-inside-run                  — the test run drawn as corner brackets around the mark with a stack of code lines beside it, blind-read as a logo under inspection: the brackets, the lines and the port pill all read as decoration (principle 3)
test-double-hop-gone                    — the hop that is no longer there, drawn three ways: two rows one hop apart, then the near row touching, then a hollow node and a broken line beside the server in its process box. Every version blind-read as a client talking to a server, and the dashed line read as the connection rather than as its absence (principle 2)
```

The absence of a network hop cannot be drawn with a line: a line is a connection, whatever is
done to it. What survived instead draws the machine that is not running and leaves the server
standing outside it.

```
scan-cursor / round-trips   — the keyspace with pages lifted out of it on legs: two pages of the
                              same shape can only differ by colour, and the blind read said so
                              ("nothing distinguishes the teal group from the yellow one except
                              color"), which is principle 10; the field under them kept reading
                              as wall texture rather than as the thing being walked
scan-cursor / full-turn     — the pages closed into a ring, one arc lit: the circumference caps
                              a key at about 57x28 framed units, so the keys can only be dashes,
                              and the blind read called it "a generic loading spinner"
```

Both were attempts at the half of the sentence `scan-cursor-pages` carries only implicitly: that
each call returns one bounded reply, and that the walk terminates. `round-trips` needed two pages
to say "again" and had no legal way to tell them apart. `full-turn` had the closure but the ring
costs the keys their size, and the keys are the thing that has to read as content.

```
agent-context / working-set              — the transcript beside the turns picked out of it, blind-read as filtering candidates down to a selection: no conversation left in it, and it duplicated `ai-advisory-surge-reproducer`
agent-context / recall-field             — turns as an even grid with a few cells lit, blind-read as sparse retrieval from a store; the lit run read as a header row and the lone cells as arbitrary positions
```

Both lost the word the subject turns on. A conversation is a sequence of turns between two
sides, and neither a second column of selected items nor a grid of cells carries that. The two
shipped versions keep one column of turns and change only which of them are lit.

```
built-on-primitives / alphabet          — three runs spelled out of a three-glyph alphabet: a run of
                                          three to seven glyphs caps each glyph at about 120px, which
                                          is too small to give a square, a circle and a chevron any
                                          identity, so the primitives read as decoration (principle 4)
```

The blind read got the sentence but said the three glyphs were interchangeable. Giving them
identity needs internal detail, detail needs about 48px of feature, and there is no run length
that affords both.

Deleted on review, 2026-09-16. Principle numbers refer to [DESIGN.md](DESIGN.md).

```
slot-migration-lens                    — lens is the biggest brightest object and the bars inside it mean nothing (P2)
keyspace-scan                          — scattered dots read as a starfield, the cursor window was the faintest edge (P5, P4)
ai-agent-memory                        — three competing regions joined by hairline dashed curves (P2, P4)
bundle-one-install                     — four modules in four accents, so colour said "four things" and nothing else (P10)
tooling-stack                          — four levels, two ambient glows, meaning carried by 12px pills (P3, P4)
limits-tight-envelope                  — the mark sits on top of the packed content it was meant to be packed with (P2)
large-object-tail-wake                 — big value near some long bars, causation left to adjacency (P8)
large-object-tail-shared-gate          — same, and four things happening in one rectangle (P8, P3)
large-object-tail-bypass               — same, and the lane carrying the point sat on the frame edge (P8, P12)
glide-compress-press                   — drew the machinery of compression rather than the thing getting smaller (P9)
glide-compress-fold                    — same fault, and the folded stack read as a decorative serpentine (P9, P3)
glide-compress-funnel                  — same fault, three focal candidates competing (P9, P2)
fbtree-fanout-slab                     — abstracted a structure that has a well-known picture (P9)
fbtree-fanout-tiers                    — same, and the violet tree read as the subject rather than the fbtree (P9, P2)
fbtree-fanout-leafwalk                 — same (P9)
fake-in-process-enclosure              — a process wall as the focal element; a wall is furniture (P2)
fake-in-process-parity                 — read as two lists of bars, not as two implementations agreeing (P2)
fake-in-process-dropin                 — socket-and-pins metaphor did not survive the blind read (P9)
prometheus-scrape-tick                 — read as a grid of tiles, not as readings taken at instants (P6)
prometheus-scrape-every-node           — generic fan-in, and it collided with exporter-two-views (P1)
llm-kv-cache-shared-tier               — the wide tier bled off both edges and the caption sat on it (P12)
llm-kv-cache-head-start                — read as a generic two-bar benchmark (P1)
exporter-two-views-probes              — the per-node readings were sub-6px dots (P4)
exporter-two-views-twin-scopes         — two lenses; a lens is furniture, and many-and-one says it better (P2, P1)
keyspace-gui-safe-grant                — the struck-through commands carrying the point were the thinnest marks (P4)
commands-replace-lua-condition-gate    — read as "a decision" and nothing more specific (P1)
```

## Licence

Code and generated artwork are Apache-2.0. See [LICENSE](LICENSE).

The Valkey name and hexagon mark are trademarks of the Linux Foundation and are **not**
relicensed by this repository. Apache-2.0 grants no trademark rights. Use of the mark is
governed by the [Linux Foundation trademark policy](https://www.linuxfoundation.org/legal/trademark-usage)
and the Valkey project's own guidance. In practice: these banners are intended for Valkey
project and community use, and you should not use them to imply endorsement of something
that is not part of the project.
