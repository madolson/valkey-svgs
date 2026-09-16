# Design principles

The review criteria for every banner in this set. A candidate is judged against these before it
is shown to anyone, and again before it is committed. They are derived from what the working
banners have in common and from the specific faults that got banners deleted; the named examples
are the evidence, so do not remove them when editing a rule.

## The gate: the blind read

Show the **narrow crop** — 247x200, which keeps only the middle 70% of the width — to someone or
something that does not know the topic, with the title covered. Ask for a one-sentence caption.

If it does not match the sentence in the theme comment, the banner has failed and no amount of
polish fixes it. Redraw, or drop it. A banner that needs the post title to be understood is
decoration.

Run `~/bin/vblind <theme>` for this, or hand the crop to a fresh context. Self-grading a metaphor
you invented ten minutes ago does not work: you can already see the thing you meant.

Everything below is a way of failing this gate that is worth naming in advance.

## 1. One idea, and no other banner already says it

One sentence, written at the top of the theme. If it needs "and", it is two banners.

Before drawing, read the set and name the closest existing theme. State how the new one differs
in *what it says*, not in how it looks. Two banners about the same sentence is the failure mode
that produces forty near-duplicates and makes the whole set useless for choosing from.

A variation in styling is not a new idea. `blackhole-halo` and `blackhole-beamed` are the same
sentence at two tilts, which is why they are experimental rather than in the set proper.

## 2. The focal element is the sentence, not a container

Name the one object the eye should land on. It is the largest thing in frame, the only one at
full opacity, and the only one with a halo. Everything else is at 0.6 opacity or below, or half
the stroke width, and carries no halo.

**A frame, a lens, a window, a box or a wall is almost never the focal element.** It is furniture
that holds the focal element. `slot-migration-lens` failed exactly here: the lens is the biggest,
brightest thing in the frame and the five bars inside it mean nothing, so the picture's subject is
a magnifying glass. `limits-tight-envelope` failed the mirror image of it: the mark sits on top of
the packed content, occluding the only thing that carried the idea.

Test: cover the focal element. If the sentence survives, you named the wrong element.

## 3. Every element is load-bearing

For each element ask what it says. "It fills the space" means delete it. So does "it makes it look
more technical".

Specifically banned unless the flourish *is* the idea: starfields, scattered sparks, rays, dashed
rings, secondary outlines, ambient glow washes, and a second halo anywhere.

Prefer fewer and larger. Four thick lanes read at banner size; forty do not. `tooling-stack` had
four levels, two ambient glows and a row of 12px pills, and the pills were where the meaning was.

## 4. Nothing that carries meaning is small, thin or dim

In the narrow crop: nothing meaningful under about 6px of stroke, under about 3% of the framed
width, or under 0.4 opacity. Two measured data points from this repo: a label needed 38px to
survive, and a badge that looked right at `r="24"` in code was invisible until `r="54"`.

The corollary is the one that gets broken: **do not delegate meaning to the thinnest marks in the
image.** `ai-agent-memory` connects its three regions with hairline dashed curves, so the only
thing explaining the picture is the first thing the crop destroys.

## 5. Texture is not content

A field of marks the reader is meant to *read* sits at 0.4 opacity or above and on a visible
pitch. Below that it is texture, and whatever it was carrying is gone.

`keyspace-scan` is a scatter of dots under a translucent panel: the dots read as a starfield, so
the picture says "space", and the window that holds the actual idea is the faintest edge in it.

## 6. Order: everything sits on a system

Repeated things share a pitch, a baseline, a radius, a size. Rows line up. Columns line up. A grid
is declared and then obeyed.

This is not tidiness for its own sake — **uniformity is what makes an exception legible.** One
oversized tile in an even field reads instantly; the same tile among randomly placed ones reads as
more noise. Every banner in this set that works is a regular system with one thing different about
it: `memory-efficiency`, `k8s-desired-count`, `ai-advisory-surge-backport-rails`,
`data-structures-grid`.

If you cannot state the pitch and the alignment rule in one line, the composition is arbitrary.

## 7. Accurate where a reader would check it, exaggerated where the point lives

Get the things a reader knows right: a hexagon has six sides, a B+ tree's leaves are linked and
its root is wide, sixteen slots means sixteen, a latency axis increases to the right. Wrong
structure is read as a mistake and costs the image its authority.

Then exaggerate the one quantity the post is about, hard. A 43% memory saving drawn at 43% reads
as "about the same". Drawn at 4x it reads as the point. Exaggerate **one** dimension, the one in
the sentence, and leave everything else honest — a picture where nothing is to scale is not
emphatic, it is just wrong.

## 8. Draw the cause, not the symptom

Adjacency does not mean causation. If the post says one thing makes another thing worse, the
mechanism has to be visible: a shared channel, a queue behind an obstruction, a lane that stops.

`large-object-tail-*` failed on this. All three put a big coral box near some small requests and
some long bars, and left the reader to infer that the first caused the second. Nothing in the
picture connected them, so it read as three things happening in the same rectangle.

## 9. When the subject is a structure, draw the structure

If the post is about a data structure, a protocol shape or a topology, the reader probably knows
what it looks like. Sketch it, at high level, accurately. Do not invent a metaphor for a thing
that already has a picture.

`fbtree-fanout-*` failed on this: they drew pointer towers and packed slabs as an argument about
memory, when the subject is a B+ tree and a high-level sketch of a wide root over linked leaves
would have said it immediately. The same rule cuts the other way for machinery: `glide-compress-*`
drew presses and folding, which is a metaphor for compression rather than compression. The visible
fact about compression is that the thing gets smaller.

## 10. Colour is vocabulary

Palette from `C` only, and every accent means the same thing in every banner:

| | |
| --- | --- |
| `mint` | new, arrived, healthy, the destination state |
| `violet` | old, vacated, retired, the source state |
| `cyan` | data at rest, neutral content, the default |
| `ice` | inspection and instrumentation |
| `coral` | the anomaly: the one different thing, an error, a hot key |
| `gold` | a highlight the composition points at. Once per image, or not at all |

**Never use colour to tell items apart.** `bundle-one-install` gives its four modules four
different accents, so the colours say "these are four things" and stop meaning anything. If items
differ in kind, differ their shape.

A theme that needs an accent to mean something else is telling you the metaphor is wrong.

## 11. One device for direction, one weight per glyph

Flow gets exactly one device: vacated-and-arrived segments on a ring, *or* lanes, *or* one
arrowhead. Not two. If the ring already shows data leaving and landing, streaks and a chevron say
it twice more and bury the focal element.

Within one drawn object, lines meant to read as the same kind of line are the same width, and a
repeated feature is the same size everywhere it appears. Mixed weights inside one glyph is the
most common reason a banner looks amateurish rather than wrong.

## 12. It has to survive both crops

The wide crop (810x400) takes 12% of the height. The narrow crop (247x200) takes the outer 30% of
the **width**, which is the constraint people get wrong. Anything that must stay whole lives
between 15% and 85% of the framed width. Streaks and graph edges may bleed off; a sliced mark
reads as a bug.

The motif fills 75-80% of the framed height, and the left and right margins are within about 3%
of each other. Fix framing with `zoom` and `center`; if the composition is off-centre, move the
drawing, not the crop.

## Review procedure

For a candidate, in this order. Stop at the first failure and fix it before continuing.

1. Render it. Look at both crops. Never judge from the markup.
2. Blind read (`~/bin/vblind`). Compare with the theme's sentence. Fail here and you redraw.
3. Walk 1 through 12 and write the verdict for each. "Pass" is not a verdict; name the element
   that satisfies the rule.
4. Cover the focal element and check the sentence dies.
5. Count elements. Try deleting the one you are least sure about and re-render. If nothing was
   lost, it stays deleted.
6. Re-render twice; the second run must report no change.

Three candidates per subject, built as three *different ideas*. Ship the ones that pass and delete
the ones that do not — shipping a candidate you know is weak is how a gallery becomes unusable.
One good banner beats three options.

## Amending this document

When a review turns up a fault these rules did not catch, add it here with the named example, in
the same shape: the rule, the test, the banner that failed it. A principle with no evidence behind
it is a preference and will be argued with; a principle with a deleted banner behind it will not.
