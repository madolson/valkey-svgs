---
name: valkey-header-art
description: Create or edit Valkey banner artwork in this repo, and publish it. Use whenever asked for artwork, a header, a hero, an OG image or a featured image for a Valkey topic (a feature, release, talk or blog subject), to restyle or fix an existing banner, to review a candidate, or when a banner looks wrong, clipped, flat, generic, noisy, or like a slide rather than a picture. Covers what a motif is and why it is not a diagram, the file layout, colour roles, the flourish rule, safe areas, the three artifacts every subject needs, the blind read, the traps that have actually cost work here, and how to publish.
---

# Valkey header art

All artwork is generated. There are no hand-authored SVGs: `svg/*.svg` is committed output.
Change the code, regenerate, **look at the render**.

## Draw a motif, not a picture of a mechanism

This is the whole thing, and it is the mistake most worth not repeating.

A **motif** is an abstract figure whose *shape* carries the idea. `dual-cert-tls` is wavy lanes
arriving at one point and sorting themselves between two credentials. `acl-roles` is one
definition fanning out to identical holders. `performance` is streaks converging on a vanishing
point. `search-vector-nearest` is a lit neighbourhood inside a dark indexed field. None of them
explains anything. They are figures you recognise.

A **specific image** is a labelled diagram of how something works: lanes with names, a legend, an
axis caption, printed values. It can be perfectly accurate and still be the wrong artefact.

Fifty-three banners were built for the 9.2 features. Three were motifs; fifty were diagrams, and
they were dropped. They were dropped *after passing* a conformance test in which six of six fresh
readers correctly named the operation and the subject. That is the lesson: a reader naming the
mechanism was never the goal, and a metric with no term for "does this look like the set" drove
straight toward slides. Legibility of the mechanism is not the objective. Recognition is.

Two symptoms that you are drawing a diagram:

- **The name is a clause.** `community`, `clustering`, `performance`, `large-key` are domains.
  `big-value-latency-copy-block`, `commands-replace-lua-round-trips`,
  `exporter-two-views-many-and-one` are sentences. A domain can be one figure. A clause cannot.
- **You are reaching for a label to make it work.** See the text rule below.

## Light is the medium

The ground is a glowing purple gradient, so a flat opaque shape reads as a hole punched in the
picture rather than an object in it. Measured: `search-vector-nearest` spends 7.6% ink across 254
lit marks with 123 halos and looks crisp. The dropped diagrams spent up to 19% ink across a dozen
large flat rects. **It is not ink quantity, it is ink distribution.** Many small lit marks give
depth and figure-ground; a few large flat ones do not.

`memory-efficiency` is the control that proves it is not "flat fills are bad": 660 flat cells and
one halo, and it works, because at that count flatness becomes texture.

## Before you draw anything

Read the existing themes. Pick the closest one and follow its shape. `clustering` and
`atomic-slot-migration` are a good pair, because they use the same slot-ring vocabulary for
different ideas.

Then answer two questions and put both answers in a comment above the theme:

1. **What single idea does this figure carry?** One sentence. `memory-efficiency` says "same data,
   less space". If you cannot say it in a sentence, the image will read as generic tech decoration.
2. **What is the focal element?** The one object a viewer looks at first. Everything else supports
   it and is drawn quieter.

**Reuse metaphors, not just helpers.** A slot ring is a node's keyspace everywhere in this set;
vacated and arrived segments are data leaving and landing; a lens is inspection; lanes are data in
flight. A reader who has seen two banners can then read the third. Invent a new metaphor only when
none of the existing ones carries the idea, and check `## Rejected` in the README first, because
several of your candidates are already on it.

**Work out several metaphors before writing code**, and **deliver 2-3 distinct candidates** unless
told otherwise. Each has to be a different idea, not the same idea at three zoom levels.

## The flourish rule

**Add detail freely. Detail is good. Never let it become the highlight.**

The rule this replaces said to delete anything whose only job was filling space, and that produced
barren, slide-like banners. Texture, depth, ornament and secondary structure all belong here. The
constraint is one measurable thing:

> The focal element stays the largest, the highest opacity, and the only one carrying a full halo.

Supporting structure sits at or below 0.6 opacity or half the focal stroke width. Nothing is
deleted for being decorative; things are *turned down* for being loud.

## Background texture is not detail

Scattered marks over the gradient read as snow. A purple gradient with texture strewn across it is
the single most recognisable signature of generated hero art. Fourteen banners were built with
background fields and every one read as noise.

So: **the default background is the gradient alone.** A populated field is legitimate only when the
population is part of the idea and you can name it in a clause — the indexed space a query searches,
the keyspace a save is crossing. If the honest answer is "it fills the space", drop it.

`starfield` is opt-in for the same reason, and it has a trap; see below.

## Text is a last resort

There is exactly one font, `FONT`. Text goes illegible once cropped and it needs translating, so a
motif carries its idea with shape alone. When a label is genuinely required — a product name, a
unit, a scale — use `FONT` at 600 weight for a title and 500 for a label, 38px or larger, inside
the safe area. Never a second family, never mixed sizes for labels of the same kind.

Reaching for a label usually means the figure is not carrying the idea. Fix the figure.

## Colour roles

Palette is the `C` object only, from `sass/_colors.scss` on the website. Do not introduce a colour.
Each accent means the same thing in every theme, so a reader carries what they learned from one
banner to the next and a reviewer can flag a wrong colour as an error rather than a taste question:

| | |
| --- | --- |
| `mint` | new, arrived, healthy, the destination state |
| `violet` | old, vacated, retired, the source state |
| `cyan` | data at rest, neutral content, the default for lanes and cells |
| `ice` | inspection and instrumentation: lenses, probes, measurement |
| `coral` | the anomaly, the one thing that is different, an error or a hot key |
| `gold` | a highlight the composition deliberately points at, used once if at all |

A theme that needs a colour to mean something else is telling you the metaphor is wrong, not that
the table is.

**When both ends are Valkey, the ends must differ in state.** Migration, replication, failover and
upgrade all put the mark on both sides. Identical rings read as a mirror and the direction is lost.
`slotRing` supports vacated and arrived; use it.

## What encodes what

From Bertin: size is the only genuinely quantitative variable, lightness is ordered, **hue is not
ordered**, shape is nominal and **not selective**.

| encoding | use | never |
| --- | --- | --- |
| a magnitude | length or size | hue, lightness |
| a cardinality you want counted | discrete countable marks | a smooth bar |
| order, progress, before-and-after | position | hue |
| state | hue, from the role table | size |

Four corollaries, each of which cost a wasted candidate here:

- A smooth bar asserts a measured magnitude, so a frequency needs countable marks.
- **A haloed gold group makes its neighbours look idle**, so "everything else is full" has to be
  structural — a row filled to a limit — not bright.
- **Coral beside mint reads as pass/fail**, never as before-and-after. Then-versus-now needs a
  non-colour device.
- **Absence does not read as deletion.** A void reads as "not started". A vacated cell keeps its
  outline and changes hue.

## The file layout

```
generate.mjs        the pipeline: loads themes, renders, writes themes.json
lib/core.mjs        palette, rng, atmosphere, frame, captions, primitives
lib/shapes.mjs      motif vocabulary used by more than one theme
themes/<name>.mjs   one theme per file: its art function, its own helpers, its entry
gallery.mjs         builds gallery.html
```

Themes are discovered by globbing `themes/*.mjs`, so **adding a theme touches exactly one new
file**: no shared array, no README row, nothing two parallel authors can conflict over. A theme
file exports `themes = [ { name, order, seed, zoom, center, title, desc, motif, use, art } ]`.
`order` carries the curated gallery sequence. `motif` and `use` become the README row and the
`themes.json` entry, so a theme cannot be half-registered.

This matters because the single 4600-line file it replaced made git interleave two function bodies
into broken JS on a merge, and was too large for an agent to read in one call.

A helper used by one theme lives in that theme's file. One used by several goes in `lib/shapes.mjs`.

## Safe areas, and both bounds of each

Two crops bind, and both ends of each:

- The **narrow 247x200** crop keeps only the middle **70% of the width**. At zoom 1.35 that is
  x **462 to 1458** on the 1920 grid. Work it out for your zoom:
  `vw = 1920 / zoom; vx = clamp(centerX - vw/2, 0, 1920 - vw); safe = vx + 0.15*vw .. vx + 0.85*vw`
- The **wide 810x400** post-header crop keeps only framed **y 189 to 891** of the 140..940 frame at
  zoom 1.35. This one surprises people; a legend once sat outside the frame entirely because of it.

Anything that must stay whole lives inside both. Streaks, fields, graph edges and strips are fine
bleeding off: a half-sliced logo reads as a bug, a bled-off edge reads as intentional.

**Fill 75-80% of the framed height**, measured as motif height over `1080 / zoom`. Below ~70% the
banner reads as a small motif floating in empty gradient. **Balance the left and right margins**
against the ink centroid, not the bounding box. And `zoom` is the fastest way to break a
composition that was fine: raise it and re-check both crops every time.

## The three artifacts every subject needs

One `node generate.mjs <theme>` writes all three. Which carries the title matters:

| output | size | chrome | use |
| --- | --- | --- | --- |
| `images/<t>.webp` | 1920x1080 | lockup + title blocks | standalone, page hero |
| `images/og/<t>.webp` | 1200x630 | lockup + title, centre-cropped | **blog OG, with title** |
| `images/plain/<t>.webp` | 1920x1080 | none | **featured image, no title** |

Check all three. The og crop takes height and can slice a motif the master showed whole.

## Looking at the set

```sh
node gallery.mjs --open
```

One self-contained page, every theme, all three artifacts side by side, four crop shapes on a
toggle. It reads `themes.json`, so a theme with no rendered file is reported rather than shown as a
broken image. Use the **narrow** toggle before shipping anything.

## The blind read

Before asking anyone for feedback, test whether the figure works at all. Show the **chrome-free
narrow crop** from `images/plain/` to someone who does not know the topic and ask for a one-sentence
caption. Compare it with the sentence in your theme comment.

Use `images/plain/`, never `images/`, or the title sticker is in the crop and the reader simply
quotes it. That mistake voided a whole round of reads here.

If the captions match, the metaphor works and the rest is polish. If not, the metaphor failed:
redraw, do not explain. A banner that needs the post title is decoration.

## Traps that have actually cost work

**`starfield(r, n)` advances the rng even when it draws nothing.** 27 themes call it without
declaring `space`, so the call emits nothing and looks dead. Deleting those calls reshuffles every
later random value in that theme; it silently redrew 27 banners. Do not tidy them away.

**Parallel renders can commit someone else's drawing.** Chrome is invoked with no
`--user-data-dir`, so concurrent agents share the default profile and `--screenshot` can return a
sibling's page. One agent's render came back as a different agent's banner with its own SVG correct
on disk. If several of you are rendering, eyeball every raster after its final render, or render
serially.

**`--force` invalidates every theme's cache, not just the named ones.** The next plain run then
silently re-renders everything, which is how a verified raster gets replaced by an unverified one.

**Never leave a bare `node generate.mjs` running while you keep editing.** It reads the module once
at startup and will write the old drawing over the new one.

**Ambient glow painted over the motif** veils it and reads as smudge. Glow goes behind, first in
the returned array. If a banner looks hazy, check layer order before blaming WebP.

**A dense regular lattice sums visually** even at 0.08 per mark, and reads as graph paper. Spacing
has to beat mark size.

## Workflow

```sh
node generate.mjs my-theme          # render only your own while iterating
node generate.mjs my-theme          # twice: the second run must be a no-op
git diff --stat                      # only your theme's files may appear
```

Inspect both crops as renders, writing to a private path like `/tmp/crop-<name>/`. Parallel agents
have clobbered each other in shared `/tmp/narrow-*.png` and one inspected the wrong theme's render
believing it was its own.

```python
from PIL import Image
def cover(im, bw, bh):
    ia, ba = im.width / im.height, bw / bh
    if ba > ia: w, h = im.width, round(im.width / ba)
    else:       h, w = im.height, round(im.height * ba)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))
im = Image.open('images/plain/my-theme.webp')
cover(im, 810, 400).save('/tmp/crop-mine/wide.png')
cover(im, 247, 200).save('/tmp/crop-mine/narrow.png')   # the strict one
```

If another theme's raster moved, you consumed PRNG draws that belonged to it or edited a shared
helper.

## Rejected candidates

Deleting the losers' code is right; deleting the reason they lost is not. Keep one line per
candidate in the README's `## Rejected` section:

```
memory-efficiency / stacked bars — read as a chart, not as "same data, less space"
lz4 / ghost extent               — limits-tight-envelope's geometry; the emptiness read as unfilled space
```

Over a dozen themes this becomes the taste document no single review thread produces.

## Publishing

```sh
node generate.mjs                    # full rebuild, no args, once you have stopped editing
node gallery.mjs                     # eyeball it
git add -A && git commit -s
git push origin HEAD:main            # madolson/valkey-svgs
```

`themes.json` regenerates every run and the gallery at madelynolson.com/valkey-banners reads it
through a submodule, so a theme is live once it is pushed and the pointer moves. Never push the
`motion-banners` working tree; it carries unrelated uncommitted work.

## Definition of done

- [ ] It is a motif: the shape carries the idea, and no label is doing the carrying.
- [ ] The one-sentence idea and the named focal element are in the theme comment.
- [ ] 2-3 distinct candidates offered, and the losers' reasons are in `## Rejected`.
- [ ] Palette is `C` only, every accent in its role. If both ends are Valkey they differ in state.
- [ ] Detail is present and capped: the focal element is largest, brightest, the only one haloed.
- [ ] Background is the gradient alone, unless a named population earns a field.
- [ ] Nothing meaningful under 6px, under 3% of framed width, or under 0.4 opacity.
- [ ] Motif fills 75-80% of the framed height; margins balanced on the ink centroid.
- [ ] Both crops inspected as renders from a private path; nothing that matters is clipped.
- [ ] All three artifacts checked: standalone, og with title, plain without.
- [ ] Blind read on the plain narrow crop produced a caption matching the stated idea.
- [ ] `node generate.mjs` twice in a row is a no-op; `git diff --stat` touches only your theme.
- [ ] `desc` reads as usable alt text: it is the accessibility surface.
