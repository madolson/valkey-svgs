#!/usr/bin/env node
// Builds gallery.html: every banner in the set, every artifact, viewable from file://
// with no server and no dependencies.
//
//   node gallery.mjs                 # write gallery.html
//   node gallery.mjs --open          # write it and open it
//   node gallery.mjs --out /tmp/g.html
//
// It reads themes.json rather than generate.mjs, so it cannot drift from the set: a theme
// that is not in the manifest was not rendered, and the page says so out loud instead of
// showing a broken image.
//
// The crops are done with CSS `object-fit: cover` at the real aspect ratios rather than by
// pre-cutting files, because that is literally what the website does. What you see here is
// what ships. The narrow crop is the one that matters: it keeps only the middle ~70% of the
// width and is where framing bugs show.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const OUT = resolve(opt('out') ?? join(ROOT, 'gallery.html'));

const manifest = JSON.parse(readFileSync(join(ROOT, 'themes.json'), 'utf8'));

// The three artifacts every subject needs. Which one carries the title matters, so the page
// labels it rather than leaving you to guess.
const ARTIFACTS = [
  { key: 'master', dir: 'images', w: 1920, h: 1080, title: 'yes', label: 'standalone' },
  { key: 'og', dir: 'images/og', w: 1200, h: 630, title: 'yes', label: 'blog OG' },
  { key: 'plain', dir: 'images/plain', w: 1920, h: 1080, title: 'no', label: 'featured' },
];

const CROPS = [
  { key: 'hero', w: 810, h: 400, note: 'post header, crops height' },
  { key: 'narrow', w: 247, h: 200, note: 'mobile, crops width to the middle 70% — the strict one' },
  { key: 'og', w: 1200, h: 630, note: 'unfurl' },
  { key: 'full', w: 1920, h: 1080, note: 'uncropped' },
];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Group by what a maintainer actually picks between, not alphabetically.
const groupOf = (t) =>
  t.experimental ? 'Experimental' : /^eng-|^nt-/.test(t.name) ? 'Engine-built' : 'Classic';
const GROUPS = ['Engine-built', 'Classic', 'Experimental'];

const missing = [];
const cards = manifest.themes.map((t) => {
  const have = {};
  for (const a of ARTIFACTS) {
    const rel = `${a.dir}/${t.name}.webp`;
    have[a.key] = existsSync(join(ROOT, rel)) ? rel : null;
    if (!have[a.key]) missing.push(`${t.name} (${a.label})`);
  }
  const svg = existsSync(join(ROOT, `svg/${t.name}.svg`)) ? `svg/${t.name}.svg` : null;
  const tags = [
    t.experimental ? '<span class="t x">experimental</span>' : '',
    t.space ? '<span class="t s">starfield</span>' : '',
    t.captioned ? '<span class="t c">drawn caption</span>' : '',
  ].join('');
  const shots = ARTIFACTS.map((a) => {
    if (!have[a.key]) return `<div class="shot none" data-a="${a.key}"><div class="gap">no ${a.label}</div></div>`;
    return `<div class="shot" data-a="${a.key}">
      <img loading="lazy" src="${have[a.key]}" alt="${esc(t.desc)}">
      <div class="cap">${a.label} &middot; ${a.w}&times;${a.h} &middot; title: ${a.title}</div>
    </div>`;
  }).join('');
  const hay = esc(`${t.name} ${t.title} ${t.motif} ${t.useFor}`).toLowerCase();
  return `<article class="card" data-group="${groupOf(t)}" data-hay="${hay}">
    <header>
      <span class="nm">${esc(t.name)}</span>
      <span class="tags">${tags}</span>
    </header>
    <div class="shots">${shots}</div>
    <div class="meta">
      <b>${esc(t.title)}</b>
      <div class="motif">${esc(t.motif)}</div>
      <div class="use">${esc(t.useFor)}</div>
      <details><summary>alt text</summary><p>${esc(t.desc)}</p></details>
      <div class="links">${svg ? `<a href="${svg}">svg</a>` : ''}${ARTIFACTS.filter((a) => have[a.key])
        .map((a) => `<a href="${have[a.key]}">${a.label}</a>`)
        .join('')}</div>
    </div>
  </article>`;
});

const counts = GROUPS.map((g) => [g, manifest.themes.filter((t) => groupOf(t) === g).length]).filter((x) => x[1]);

const html = `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Valkey banners &mdash; ${manifest.themes.length} themes</title>
<style>
:root{color-scheme:dark;--bg:#0b0818;--panel:#150f2e;--line:#2a2445;--ink:#e8e4f5;--dim:#9c94b8;--faint:#6b6385}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0}
header.top{position:sticky;top:0;z-index:5;background:rgba(11,8,24,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:16px 30px 13px}
h1{font-size:20px;margin:0 0 3px} .lede{color:var(--dim);font-size:13px;margin:0 0 11px;max-width:96ch}
.bar{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
.set{display:flex;gap:5px;align-items:center}
.set>label{color:var(--faint);font-size:11px;text-transform:uppercase;letter-spacing:.07em;margin-right:3px}
button{background:#231a3d;color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit}
button[aria-pressed=true]{background:#2CD5C4;color:#06101a;border-color:#2CD5C4;font-weight:600}
input[type=search]{background:#231a3d;border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:5px 10px;font-size:12.5px;min-width:210px;font-family:inherit}
.note{color:var(--faint);font-size:11.5px}
main{padding:22px 30px 100px}
h2{font-size:16px;margin:30px 0 0;padding-top:18px;border-top:1px solid var(--line);color:var(--ink)}
h2 span{color:var(--faint);font-weight:400;font-size:12.5px;margin-left:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--col,420px),1fr));gap:16px;margin-top:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.card header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid var(--line)}
.nm{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#b9b1d4}
.t{font-size:10px;padding:2px 7px;border-radius:99px;margin-left:4px;background:#2a2445;color:var(--dim)}
.t.x{background:#4a2a42;color:#f0a8c8}.t.s{background:#1f2d52;color:#a8c8f0}.t.c{background:#3b2a52;color:#d6b4fe}
.shots{display:flex;flex-direction:column}
.shot{position:relative;border-bottom:1px solid var(--line)}
.shot img{display:block;width:100%;aspect-ratio:var(--ar,810/400);object-fit:cover;object-position:center;background:#06040e}
.shot .cap{position:absolute;left:0;bottom:0;font-size:10px;color:#cfc8e4;background:rgba(6,4,14,.82);padding:2px 7px;border-top-right-radius:5px}
.shot.none .gap{aspect-ratio:var(--ar,810/400);display:flex;align-items:center;justify-content:center;color:#4a4368;font-size:12px;background:#0f0b20}
.meta{padding:9px 11px 11px;font-size:12px;color:var(--dim);display:flex;flex-direction:column;gap:4px}
.meta b{color:#cfc8e4;font-size:12.5px} .motif{color:var(--dim)} .use{color:var(--faint);font-size:11.5px}
details summary{cursor:pointer;color:var(--faint);font-size:11px} details p{margin:5px 0 0;font-size:11.5px;line-height:1.45}
.links{display:flex;gap:7px;margin-top:3px}
.links a{color:#46BDE9;font-size:11px;text-decoration:none;border:1px solid var(--line);padding:1px 7px;border-radius:5px}
.links a:hover{border-color:#46BDE9}
.warn{background:#3a1520;border:1px solid #6b2438;color:#f0a8c8;border-radius:8px;padding:10px 13px;margin:16px 0 0;font-size:12.5px}
body.one .shot{display:none} body.one .shot.pick{display:block}
</style>
<header class="top">
<h1>Valkey banners <span class="note">&mdash; ${manifest.themes.length} themes, ${counts.map(([g, n]) => `${n} ${g.toLowerCase()}`).join(', ')}</span></h1>
<p class="lede">Crops are done live with <code>object-fit: cover</code> at the real aspect ratios, which is exactly what the website does, so what you see is what ships. The <b>narrow</b> crop keeps only the middle 70% of the width and is where framing bugs show; check that one before shipping anything.</p>
<div class="bar">
<div class="set"><label>crop</label>${CROPS.map(
  (c, i) => `<button data-crop="${c.w}/${c.h}" title="${c.note}" aria-pressed="${i === 0}">${c.key}</button>`
).join('')}</div>
<div class="set"><label>artifact</label><button data-art="all" aria-pressed="true">all three</button>${ARTIFACTS.map(
  (a) => `<button data-art="${a.key}" aria-pressed="false">${a.label}</button>`
).join('')}</div>
<div class="set"><label>size</label>${[320, 420, 560, 780].map(
  (w, i) => `<button data-col="${w}" aria-pressed="${i === 1}">${['s', 'm', 'l', 'xl'][i]}</button>`
).join('')}</div>
<input type="search" id="q" placeholder="filter by name, motif, use&hellip;" autocomplete="off">
<span class="note" id="shown"></span>
</div>
</header>
<main>
${missing.length ? `<div class="warn"><b>${missing.length} artifact(s) missing.</b> A theme in themes.json with no rendered file means the last run did not cover it: <code>node generate.mjs</code>. ${esc(missing.slice(0, 8).join(', '))}${missing.length > 8 ? ` and ${missing.length - 8} more` : ''}</div>` : ''}
${GROUPS.filter((g) => manifest.themes.some((t) => groupOf(t) === g))
  .map((g) => {
    const n = manifest.themes.filter((t) => groupOf(t) === g).length;
    const blurb = {
      'Engine-built': 'composed from components with ports; every coordinate derived',
      Classic: 'hand-drawn motifs',
      Experimental: 'kept because they look good, not because they say anything',
    }[g];
    return `<section data-sec="${g}"><h2>${g}<span>${n} &middot; ${blurb}</span></h2>
<div class="grid">${cards.filter((c) => c.includes(`data-group="${g}"`)).join('\n')}</div></section>`;
  })
  .join('\n')}
</main>
<script>
const $$ = (s) => [...document.querySelectorAll(s)];
function press(group, el) { $$(group).forEach((b) => b.setAttribute('aria-pressed', b === el)); }
$$('[data-crop]').forEach((b) => b.onclick = () => {
  press('[data-crop]', b);
  document.documentElement.style.setProperty('--ar', b.dataset.crop);
  $$('.shot img, .shot .gap').forEach((i) => i.style.setProperty('--ar', b.dataset.crop));
});
$$('[data-art]').forEach((b) => b.onclick = () => {
  press('[data-art]', b);
  const k = b.dataset.art;
  document.body.classList.toggle('one', k !== 'all');
  $$('.shot').forEach((s) => s.classList.toggle('pick', s.dataset.a === k));
});
$$('[data-col]').forEach((b) => b.onclick = () => {
  press('[data-col]', b);
  document.documentElement.style.setProperty('--col', b.dataset.col + 'px');
});
const q = document.getElementById('q'), shown = document.getElementById('shown');
function filter() {
  const v = q.value.trim().toLowerCase();
  let n = 0;
  $$('.card').forEach((c) => {
    const hit = !v || c.dataset.hay.includes(v);
    c.style.display = hit ? '' : 'none';
    if (hit) n++;
  });
  $$('section').forEach((s) => {
    s.style.display = [...s.querySelectorAll('.card')].some((c) => c.style.display !== 'none') ? '' : 'none';
  });
  shown.textContent = v ? n + ' of ' + $$('.card').length + ' shown' : '';
}
q.oninput = filter;
document.documentElement.style.setProperty('--ar', '810/400');
document.documentElement.style.setProperty('--col', '420px');
</script>
</html>
`;

writeFileSync(OUT, html);
const rel = OUT.startsWith(ROOT) ? OUT.slice(ROOT.length + 1) : OUT;
console.log(`${rel}  ${manifest.themes.length} themes, ${ARTIFACTS.length} artifacts each`);
if (missing.length) console.log(`  ${missing.length} artifact(s) missing; run: node generate.mjs`);
if (flag('open')) execFileSync('open', [OUT]);
