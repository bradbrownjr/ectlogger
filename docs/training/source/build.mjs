// Renders the ECTLogger video kit to PNG.
// Needs Node 18+ and Playwright (npm i playwright && npx playwright install chromium).
// Usage: node build.mjs [outDir]   (default: ../)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './content.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] || path.join(HERE, '..'));
const TMP = path.join(HERE, '.render');
fs.mkdirSync(TMP, { recursive: true });

const url = (p) => 'file://' + path.join(HERE, p);
const mark = fs.readFileSync(path.join(HERE, 'brand/logo.svg'), 'utf8').replace(/<!--.*?-->/s, '');
const markSized = (px) => mark.replace(/width="256" height="256"/, `width="${px}" height="${px}"`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const INK = '#1f2a30', SLATE = '#3b4750', MUTED = '#5b6b76', CREAM = '#f6f8f4',
  DEEP = '#1d5e2a', GREEN = '#34913f', RING = '#2f7a3c', PALE = '#cfe9d2';

const base = (w, h, body, { transparent = false } = {}) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:BSC;font-weight:500;src:url(${url('fonts/barlow-semi-condensed-latin-500-normal.woff2')})}
@font-face{font-family:BSC;font-weight:600;src:url(${url('fonts/barlow-semi-condensed-latin-600-normal.woff2')})}
@font-face{font-family:BSC;font-weight:700;src:url(${url('fonts/barlow-semi-condensed-latin-700-normal.woff2')})}
@font-face{font-family:Barlow;font-weight:500;src:url(${url('fonts/barlow-latin-500-normal.woff2')})}
@font-face{font-family:Barlow;font-weight:600;src:url(${url('fonts/barlow-latin-600-normal.woff2')})}
html,body{margin:0;background:${transparent ? 'transparent' : CREAM}}
*{box-sizing:border-box}
.f{position:relative;width:${w}px;height:${h}px;overflow:hidden;font-family:Barlow,sans-serif;color:${INK}}
.h{font-family:BSC,sans-serif}
.chip{display:inline-flex;align-items:center;gap:12px;color:#fff;font-family:BSC;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.card{position:absolute;background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(15,38,22,.22),0 2px 6px rgba(15,38,22,.12)}
.dark{position:absolute;background:${DEEP};color:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.28)}
.call{display:inline-block;background:${CREAM};color:${DEEP};font-family:BSC;font-weight:700;letter-spacing:.06em;border-radius:10px}
</style></head><body><div class="f">${body}</div></body></html>`;

// Big faint radar behind full-frame cards.
function radar(w, h, cx, cy, scale = 1) {
  const r = [180, 360, 540, 720, 900].map((x) => x * scale);
  const R = r[r.length - 1];
  const a = (deg) => [cx + R * Math.sin(deg * Math.PI / 180), cy - R * Math.cos(deg * Math.PI / 180)];
  const [x1, y1] = a(0), [x2, y2] = a(60);
  const blips = [[0.42, 30], [0.7, 48], [0.55, 130], [0.82, 205], [0.3, 290]]
    .map(([f, d]) => { const rr = R * f; return [cx + rr * Math.sin(d * Math.PI / 180), cy - rr * Math.cos(d * Math.PI / 180)]; });
  return `<svg width="${w}" height="${h}" style="position:absolute;inset:0">
${r.map((x) => `<circle cx="${cx}" cy="${cy}" r="${x}" fill="none" stroke="#dbe8d8" stroke-width="${3 * scale}"/>`).join('')}
<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#dbe8d8" stroke-width="${3 * scale}"/>
<line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="#dbe8d8" stroke-width="${3 * scale}"/>
<path d="M${cx} ${cy} L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} Z" fill="${GREEN}" fill-opacity=".07"/>
<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${GREEN}" stroke-opacity=".35" stroke-width="${4 * scale}"/>
${blips.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${(i < 2 ? 14 : 9) * scale}" fill="${GREEN}" fill-opacity="${i < 2 ? .45 : .22}"/>`).join('')}
</svg>`;
}

const lockup = (h) => `<img src="${url('brand/lockup-light.svg')}" style="height:${h}px">`;
const trackChip = (t, code, size = 30) => {
  const tr = C.tracks[t];
  return `<span class="chip" style="background:${tr.color};font-size:${size}px;padding:${size * .3}px ${size * .6}px;border-radius:${size * .3}px">${code ? `<span>${esc(code)}</span><span style="opacity:.6">·</span>` : ''}<span>${esc(tr.name)}</span></span>`;
};

// ---------- templates ----------
const T = {};

const centerMark = `<div style="position:absolute;left:${1560 - 190}px;top:${560 - 190}px">${markSized(380)}</div>`;
T.title = (v) => base(1920, 1080, `${radar(1920, 1080, 1560, 560)}${centerMark}
<div style="position:absolute;left:120px;top:96px">${lockup(64)}</div>
<div style="position:absolute;left:120px;top:330px;width:1180px">
  ${trackChip(v.track, v.code)}
  <div class="h" style="font-size:118px;font-weight:700;line-height:1.02;margin-top:34px;letter-spacing:-.5px">${esc(v.title)}</div>
  <div style="font-size:40px;font-weight:500;color:${SLATE};margin-top:30px;line-height:1.3">${esc(v.sub)}</div>
</div>
<div style="position:absolute;left:120px;bottom:84px;font-size:30px;font-weight:600;color:${MUTED}">ectlogger.us/docs</div>`);

T.end = (v) => base(1920, 1080, `${radar(1920, 1080, 1560, 560)}
<div style="position:absolute;left:120px;top:96px">${lockup(64)}</div>
<div style="position:absolute;left:120px;top:300px;width:1000px">
  <div style="font-size:34px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:.08em">Step-by-step guide</div>
  <div class="h" style="font-size:40px;font-weight:600;color:${SLATE};margin-top:18px">ectlogger.us/docs/</div>
  <div class="h" style="font-size:76px;font-weight:700;color:${DEEP};line-height:1.05;margin-top:4px;word-break:break-word">${esc(v.pages[0])}</div>
  ${v.pages.length > 1 ? `<div style="font-size:30px;font-weight:500;color:${MUTED};margin-top:28px;line-height:1.5">Also: ${v.pages.slice(1).map(esc).join('<br>')}</div>` : ''}
  ${v.next ? `<div style="margin-top:64px;display:flex;align-items:center;gap:20px">
     <span style="font-size:30px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:.08em">Up next</span>
     ${trackChip(v.next.track, v.next.code, 26)}
     <span class="h" style="font-size:44px;font-weight:700">${esc(v.next.title)}</span></div>` : ''}
</div>`);

T.thumb = (v) => base(1280, 720, `${radar(1280, 720, 1060, 500, .62)}
<div style="position:absolute;right:70px;bottom:70px">${markSized(300)}</div>
<div style="position:absolute;left:64px;top:60px">${trackChip(v.track, v.code, 34)}</div>
<div class="h" style="position:absolute;left:64px;top:150px;width:${v.thumbW || 840}px;font-size:${v.thumbSize || 96}px;font-weight:700;line-height:.98;letter-spacing:-.5px">${esc(v.title).replace(/-/g, '\u2011')}</div>
<div style="position:absolute;left:64px;bottom:56px">${lockup(48)}</div>`);

// Lower third: a band from the left edge to about 2/3 of the frame, ending in a curve or a point.
const BAND_H = 170, BAND_Y = 1080 - 96 - BAND_H;
function bandShape(w, end) {
  const h = BAND_H, m = h / 2;
  const tip = (x) => end === 'point'
    ? `H${x - 70} L${x} ${m} L${x - 70} ${h}`
    : `H${x - 64} A64 ${m} 0 0 1 ${x - 64} ${h}`;
  return `<svg width="${w + 60}" height="${h}" style="position:absolute;left:0;top:${BAND_Y}px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.25))">
<path d="M0 0 ${tip(w + 44)} H0 Z" fill="${GREEN}"/>
<path d="M0 0 ${tip(w)} H0 Z" fill="${DEEP}"/></svg>`;
}
const band = (end, inner) => base(1920, 1080, `${bandShape(1240, end)}
<div style="position:absolute;left:64px;top:${BAND_Y}px;height:${BAND_H}px;width:1120px;display:flex;align-items:center;gap:34px;color:#fff">
  <div style="flex:none">${markSized(118)}</div><div>${inner}</div></div>`, { transparent: true });

T.lower = (p, end) => band(end, `<div style="display:flex;align-items:center;gap:22px">
      <span class="h" style="font-size:62px;font-weight:700;line-height:1">${esc(p.name)}</span>
      <span class="call" style="font-size:36px;padding:6px 14px">${esc(p.call)}</span></div>
    <div style="font-size:32px;font-weight:500;color:${PALE};margin-top:12px">${esc(p.role)}</div>`);

T.station = (s, end) => band(end, `<div style="display:flex;align-items:center;gap:22px">
      <span class="h" style="font-size:62px;font-weight:700;line-height:1">${esc(s.name)}</span>
      <span class="call" style="font-size:36px;padding:6px 14px">${esc(s.call)}</span></div>
    <div style="font-size:32px;font-weight:500;color:${PALE};margin-top:14px">${esc(s.role)} <span style="opacity:.7">· demo station</span></div>`);

T.tag = (s) => base(1920, 1080, `<div class="dark" style="right:48px;bottom:48px;padding:16px 24px;display:flex;align-items:center;gap:16px;border-radius:14px">
  <span style="font-size:24px;font-weight:600;color:${PALE};text-transform:uppercase;letter-spacing:.06em">Signed in as</span>
  <span class="call" style="font-size:30px;padding:3px 12px">${esc(s.call)}</span>
  <span style="font-size:26px;font-weight:600">${esc(s.short)}</span></div>`, { transparent: true });

T.chapter = (c) => base(1920, 1080, `<div class="dark" style="left:48px;top:48px;display:flex;align-items:center;gap:0;overflow:hidden;border-radius:14px">
  <div style="background:${C.tracks[c.track].color};padding:16px 22px;font-family:BSC;font-weight:700;font-size:32px">${esc(c.code)}</div>
  <div style="padding:12px 28px 12px 22px">
    <div style="font-size:20px;font-weight:600;color:${PALE};text-transform:uppercase;letter-spacing:.08em">Step ${c.n} of ${c.of}</div>
    <div class="h" style="font-size:36px;font-weight:700;line-height:1.05">${esc(c.label)}</div>
  </div></div>`, { transparent: true });

const cursor = `<svg width="40" height="40" viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.6L10 19z" fill="${INK}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
T.button = (b) => base(1920, 1080, `<div class="card" style="right:48px;top:48px;padding:18px 26px;display:flex;align-items:center;gap:18px">
  ${cursor}<span style="font-size:28px;font-weight:600;color:${MUTED}">Click</span>
  <span style="font-size:36px;font-weight:600;color:#0d47a1;background:#e3eefb;border:2px solid #1976d2;border-radius:10px;padding:6px 18px">${esc(b)}</span></div>`, { transparent: true });

const key = (k) => `<span style="font-size:32px;font-weight:600;color:${INK};background:#fff;border:2px solid #b8c4cc;border-bottom-width:5px;border-radius:10px;padding:4px 16px">${k}</span>`;
T.keys = () => base(1920, 1080, `<div class="card" style="right:48px;top:48px;padding:18px 26px;display:flex;align-items:center;gap:14px">
  ${key('Shift')}<span style="font-size:32px;font-weight:600;color:${MUTED}">+</span>${cursor}
  <span style="font-size:30px;font-weight:600;color:${SLATE}">click the mute icon · mutes it for everyone</span></div>`, { transparent: true });

T.note = (n) => {
  const col = n.kind === 'warn' ? '#b45309' : '#1565c0';
  const icon = n.kind === 'warn' ? '!' : 'i';
  return base(1920, 1080, `<div class="card" style="right:48px;top:48px;width:760px;padding:24px 30px;display:flex;gap:22px">
  <div style="flex:none;width:52px;height:52px;border-radius:50%;background:${col};color:#fff;font-family:BSC;font-weight:700;font-size:34px;display:flex;align-items:center;justify-content:center">${icon}</div>
  <div><div class="h" style="font-size:36px;font-weight:700;color:${col}">${esc(n.head)}</div>
  <div style="font-size:29px;font-weight:500;line-height:1.35;margin-top:6px;color:${INK}">${esc(n.body)}</div>
  ${n.link ? `<div style="font-size:24px;font-weight:600;color:${MUTED};margin-top:12px">ectlogger.us/docs/${esc(n.link)}</div>` : ''}</div></div>`, { transparent: true });
};

T.practice = () => base(1920, 1080, `<div class="card" style="left:50%;transform:translateX(-50%);top:36px;padding:12px 26px;display:flex;align-items:center;gap:14px;border-radius:999px">
  <span style="width:14px;height:14px;border-radius:50%;background:${GREEN}"></span>
  <span style="font-size:28px;font-weight:600;color:${SLATE}">Practice copy · every station here is made up</span></div>`, { transparent: true });

T.banner = () => base(2560, 1440, `${radar(2560, 1440, 1280, 720, 1.1)}
<div style="position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px">
  ${lockup(120)}
  <div style="font-size:40px;font-weight:500;color:${SLATE};text-align:center;width:1300px;line-height:1.3">${esc(C.siteDescription)}</div>
</div>`);

// ---------- job list ----------
const jobs = [];
const add = (dir, name, html, w, h, transparent) => jobs.push({ file: path.join(OUT, dir, name + '.png'), html, w, h, transparent });

jobs.push({ file: path.join(OUT, 'titles', '00-series.png'), w: 1920, h: 1080,
  html: base(1920, 1080, `${radar(1920, 1080, 1560, 560)}${centerMark}
<div style="position:absolute;left:120px;top:250px;width:1200px">${lockup(150)}
<div class="h" style="font-size:88px;font-weight:700;margin-top:60px">Training videos</div>
<div style="font-size:40px;font-weight:500;color:${SLATE};margin-top:24px;line-height:1.3">${esc(C.siteDescription)}</div></div>
<div style="position:absolute;left:120px;bottom:84px;font-size:30px;font-weight:600;color:${MUTED}">ectlogger.us/docs</div>`) });

C.videos.forEach((v, i) => {
  const id = `${v.code}-${slug(v.title)}`;
  add('titles', id, T.title({ ...v, sub: `For: ${v.audience}` }), 1920, 1080);
  add('end-cards', id, T.end({ ...v, next: C.videos[i + 1] }), 1920, 1080);
  add('thumbnails', id, T.thumb(v), 1280, 720);
  v.beats.forEach((b, j) => add('chapters', `${v.code}-${j + 1}-${slug(b)}`,
    T.chapter({ code: v.code, track: v.track, n: j + 1, of: v.beats.length, label: b }), 1920, 1080, true));
});
C.clips.forEach((c) => {
  const v = { ...c, track: 'clip', code: null };
  add('titles', `clip-${c.slug}`, T.title({ ...v, sub: c.shows }), 1920, 1080);
  add('end-cards', `clip-${c.slug}`, T.end(v), 1920, 1080);
  add('thumbnails', `clip-${c.slug}`, T.thumb({ ...v, thumbSize: c.title.length > 26 ? 84 : 104 }), 1280, 720);
});
{
  const end = C.lowerThirdEnd || 'point';
  C.presenter.forEach((p) => add('lower-thirds', p.file, T.lower(p, end), 1920, 1080, true));
  C.stations.forEach((s) => add('lower-thirds', `station-${s.call}`, T.station(s, end), 1920, 1080, true));
}
C.stations.forEach((s) => {
  add('station-tags', `signed-in-${s.call}`, T.tag({ ...s, short: s.role.split(' · ')[0] }), 1920, 1080, true);
});
C.buttons.forEach((b) => add('callouts', `click-${slug(b)}`, T.button(b), 1920, 1080, true));
add('callouts', 'shift-click-mute', T.keys(), 1920, 1080, true);
C.notes.forEach((n) => add('notes', n.file, T.note(n), 1920, 1080, true));
add('notes', 'practice-copy', T.practice(), 1920, 1080, true);
add('.', 'channel-banner', T.banner(), 2560, 1440);

// ---------- render ----------
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [i, j] of jobs.entries()) {
  fs.mkdirSync(path.dirname(j.file), { recursive: true });
  const f = path.join(TMP, `${i}.html`);
  fs.writeFileSync(f, j.html);
  await page.setViewportSize({ width: j.w, height: j.h });
  await page.goto('file://' + f);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: j.file, omitBackground: !!j.transparent, clip: { x: 0, y: 0, width: j.w, height: j.h } });
}
await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`Rendered ${jobs.length} images to ${OUT}`);
