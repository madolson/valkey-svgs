#!/usr/bin/env node
// Banner generator. This file is the pipeline only: it loads the themes, renders each to
// SVG, rasterises with Chrome, encodes with Pillow, and writes themes.json.
//
// Three artifacts per theme, and which is which matters:
//   images/<t>.webp        1920x1080, lockup + title blocks -> standalone / page hero
//   images/og/<t>.webp     1200x630,  lockup + title        -> blog OG, WITH title
//   images/plain/<t>.webp  1920x1080, no chrome at all      -> featured image, NO title
//
// The drawing lives in lib/ and themes/. One file per theme, discovered by globbing
// themes/*.mjs and sorted by filename so the order is deterministic. That means adding a
// theme touches exactly one new file: no shared array, no README row, nothing two parallel
// authors can conflict over. The previous single 4600-line file made git interleave two
// function bodies into broken JS on a merge, and was too large for an agent to read.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { H, ROOT, W, esc, n, rng, setSpace, stamp, wrap } from './lib/core.mjs';

const SVG_DIR = join(ROOT, 'svg');
const OUT_DIR = join(ROOT, 'images');
const OG_DIR = join(ROOT, 'images', 'og');
const PLAIN_DIR = join(ROOT, 'images', 'plain');
const CACHE_FILE = join(ROOT, '.render-cache.json');

// Themes are discovered, not listed. Sorted by filename, so themes.json order is stable.
const THEME_DIR = join(ROOT, 'themes');
const BASE_THEMES = (
  await Promise.all(
    readdirSync(THEME_DIR)
      .filter((f) => f.endsWith('.mjs'))
      .sort()
      .map((f) => import(pathToFileURL(join(THEME_DIR, f)).href))
  )
).flatMap((m) => m.themes);

// Files are globbed, so the curated order the gallery displays in has to live in the
// theme files themselves. `order` is that: it keeps the sequence without reintroducing a
// shared array two authors could conflict over.
BASE_THEMES.sort((a, b) => a.order - b.order);

// The caption is on by default, because a banner with no words on it is the rarer case.
// Excluded: themes that draw their own text, and the captioned theme whose caption is the
// whole point.
// Whether a theme draws its own text is a property of that theme, so it is declared in
// the theme's file. The pipeline used to hold the list, which meant adding a
// self-captioning theme required editing this file.
const THEMES = BASE_THEMES.map((t) =>
  t.noCaption
    ? t
    : {
        ...t,
        caption: t.title.replace(/^Valkey /, '').replace(/^./, (c) => c.toUpperCase()),
        desc: `${t.desc} The title "${t.title}" is set on solid light blocks in the lower left.`,
      }
);

// -------------------------------------------------------------------- render

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`No Chrome-based browser found. Looked in:\n  ${candidates.join('\n  ')}`);
  return found;
}

// Downsamples the 2x screenshot and encodes it as WebP.
const ENCODE = `
import sys
from PIL import Image
src, dst, width, height, quality, og = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
im = Image.open(src).convert("RGB")
im.resize((width, height), Image.LANCZOS).save(dst, "WEBP", quality=quality, method=6)
# The unfurl copy: 1200x630, the 1.91:1 that og:image consumers expect. Centre
# crop the height rather than squash, so nothing is distorted, then downsample.
ow, oh = 1200, 630
keep = round(im.width / (ow / oh))
top = (im.height - keep) // 2
im.crop((0, top, im.width, top + keep)).resize((ow, oh), Image.LANCZOS).save(og, "WEBP", quality=quality, method=6)
`;

// The plain copy needs the master size only: link previews use the captioned one.
const ENCODE_ONE = `
import sys
from PIL import Image
src, dst, width, height, quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
Image.open(src).convert("RGB").resize((width, height), Image.LANCZOS).save(dst, "WEBP", quality=quality, method=6)
`;

function checkPillow() {
  try {
    execFileSync('python3', ['-c', 'from PIL import features; assert features.check("webp")'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    throw new Error('python3 with Pillow (WebP support) is required. Install it with: pip3 install Pillow');
  }
}

// Positional args select themes. --text sets the big drawn number on release-version,
// --caption replaces a sticker's text, --no-caption drops it, --out renames the file.
const flags = {};
const wanted = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const flag = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
  if (!flag) {
    wanted.push(argv[i]);
    continue;
  }
  // Accepts both `--text=9.0` and `--text 9.0`.
  const next = argv[i + 1];
  flags[flag[1]] = flag[2] ?? (next && !next.startsWith('--') ? argv[++i] : true);
}

const themes = wanted.length ? THEMES.filter((t) => wanted.includes(t.name)) : THEMES;
if (!themes.length) {
  console.error(`Unknown theme(s). Available: ${THEMES.map((t) => t.name).join(', ')}`);
  process.exit(1);
}
if (flags.out && themes.length > 1) {
  console.error('--out names a single output file, so pass exactly one theme with it.');
  process.exit(1);
}
// Guard against `--text foo` with no theme named, which would otherwise rebuild
// everything and quietly stamp the caption onto the captioned theme.
if (flags.text !== undefined && !(wanted.length && themes.every((t) => t.text !== undefined))) {
  const captioned = THEMES.filter((t) => t.text !== undefined).map((t) => t.name);
  console.error(`--text needs a captioned theme named explicitly. Captioned themes: ${captioned.join(', ')}`);
  process.exit(1);
}

if (flags.caption !== undefined && !wanted.length) {
  console.error('--caption changes one banner\'s sticker text, so name the theme explicitly.');
  process.exit(1);
}

mkdirSync(SVG_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(OG_DIR, { recursive: true });
mkdirSync(PLAIN_DIR, { recursive: true });

// themes.json: the machine-readable index of the set, so consumers do not have to
// parse this file or the README. madelynolson.com/valkey-banners reads it through
// a submodule. Written on every run and always covering every theme, even when
// only a subset was asked for, so it cannot drift from THEMES.
{
  const missing = THEMES.filter((t) => !t.motif || !t.use).map((t) => t.name);
  if (missing.length) throw new Error(`Theme missing motif/use: ${missing.join(', ')}`);
  const manifest = {
    generatedBy: 'generate.mjs',
    count: THEMES.length,
    themes: THEMES.map((t) => ({
      name: t.name,
      title: t.title,
      desc: t.desc,
      motif: t.motif,
      useFor: t.use,
      image: `images/${t.name}.webp`,
      plain: `images/plain/${t.name}.webp`,
      svg: `svg/${t.name}.svg`,
      captioned: t.text !== undefined,
      caption: t.caption ?? null,
      space: t.space === true,
      experimental: t.experimental === true,
    })),
  };
  writeFileSync(join(ROOT, 'themes.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

// Rendering is the whole cost of a run: two Chrome screenshots and two Pillow encodes per
// theme, about six seconds each, so a full rebuild is four minutes and almost all of it is
// spent redrawing files that did not change. The SVG fully determines the raster, so its
// hash is the cache key. A theme is re-rendered when its markup differs from the hash on
// record or when any of its outputs is missing; otherwise it is skipped. --force ignores
// the cache. Nothing about correctness rests on this: delete .render-cache.json and the
// next run rebuilds everything.
const sha = (v) => createHash('sha256').update(v).digest('hex').slice(0, 16);
const cache = (() => {
  if (flags.force) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
})();

const chrome = findChrome();
checkPillow();
const scratch = mkdtempSync(join(tmpdir(), 'valkey-headers-'));
let rendered = 0;
let skipped = 0;

try {
  for (const theme of themes) {
    const text = flags.text ?? theme.text;
    const slug = flags.out ?? theme.name;
    const svgPath = join(SVG_DIR, `${slug}.svg`);
    // --caption replaces the sticker text, --no-caption drops the sticker entirely.
    const withCaption = flags['no-caption']
      ? { ...theme, caption: undefined }
      : flags.caption
        ? { ...theme, caption: String(flags.caption) }
        : theme;
    setSpace(theme.space === true);
    const captioned =
      theme.text !== undefined
        ? { ...withCaption, desc: `${withCaption.desc} The caption reads "${esc(text)}".` }
        : withCaption;
    const art = theme.art(rng(theme.seed), { text }, captioned);
    const svgText = wrap(captioned, art);
    const plainText = wrap(captioned, art, { chrome: false });
    writeFileSync(svgPath, svgText);

    const webpPath = join(OUT_DIR, `${slug}.webp`);
    const ogPath = join(OG_DIR, `${slug}.webp`);
    const plainPath = join(PLAIN_DIR, `${slug}.webp`);
    const key = `${sha(svgText)}-${sha(plainText)}`;
    const fresh =
      !flags.out &&
      cache[slug] === key &&
      [webpPath, ogPath, plainPath].every((f) => existsSync(f));
    if (fresh) {
      skipped++;
      continue;
    }

    // Render at 2x and downsample, so thin strokes get proper antialiasing.
    const pngPath = join(scratch, `${slug}.png`);
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=2',
        `--window-size=${W},${H}`,
        `--screenshot=${pngPath}`,
        `file://${svgPath}`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    );

    execFileSync('python3', ['-c', ENCODE, pngPath, webpPath, String(W), String(H), '92', ogPath], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    // The plain copy. Its SVG is not committed: it is the same art with two elements
    // left off, so keeping it would be a second file to notice drifting.
    const plainSvg = join(scratch, `${slug}-plain.svg`);
    const plainPng = join(scratch, `${slug}-plain.png`);
    writeFileSync(plainSvg, plainText);
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=2',
        `--window-size=${W},${H}`,
        `--screenshot=${plainPng}`,
        `file://${plainSvg}`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    );
    execFileSync('python3', ['-c', ENCODE_ONE, plainPng, plainPath, String(W), String(H), '92'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    if (!flags.out) cache[slug] = key;
    rendered++;
    console.log(`${theme.name.padEnd(22)} svg/${slug}.svg -> images/${slug}.webp + og + plain`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

console.log(`${rendered} rendered, ${skipped} unchanged`);
