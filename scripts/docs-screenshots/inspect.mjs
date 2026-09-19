#!/usr/bin/env node
/*
 * Prints the selectors that actually exist on a page of the demo instance.
 *
 * Writing a figure request means naming a control by selector, and guessing one
 * from the source is how you get a capture that fails at 2am or, worse, a red
 * box drawn around the wrong thing. This loads a route the same way capture.mjs
 * does and dumps what is really there and really visible.
 *
 *   node inspect.mjs /nets/1 --as W1PINE
 *   node inspect.mjs /nets/1 --as W1PINE --click 'button[aria-label="Check In"]'
 */

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const seed = JSON.parse(readFileSync(resolve(REPO, 'backend', 'demo-seed.json'), 'utf8'));

const BROWSERLESS = process.env.BROWSERLESS_URL || 'ws://10.6.26.2:3000?token=nosi2QszI5M9eN';
const BASE = process.env.DEMO_BASE_URL || 'http://10.6.26.3:3100';
const API = process.env.DEMO_API_URL || 'http://10.6.26.3:8100/api';

const argv = process.argv.slice(2);
const route = argv[0] || '/';
function flag(n) {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? null : argv[i + 1];
}
const as = flag('as');
const click = flag('click');
const waitFor = flag('wait-for');
// Walks up from a control to find the container worth capturing. A figure that
// shows one button in isolation is usually less useful than one showing it in
// the row it lives in, and this is how you find that row's selector.
const ancestorsOf = flag('ancestors');

async function tokenFor(callsign) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: callsign, password: seed.password }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`No token for ${callsign}: ${JSON.stringify(body)}`);
  return body.access_token;
}

// defaultViewport, not --window-size: Browserless pins its own 800x600 viewport
// on every page otherwise, and that pin beats Playwright's per-context viewport.
const launch = encodeURIComponent(JSON.stringify({
  args: ['--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
}));
const browser = await chromium.connectOverCDP(
  `${BROWSERLESS}${BROWSERLESS.includes('?') ? '&' : '?'}launch=${launch}`,
  { timeout: 30000 },
);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
});

const storage = { theme: 'light' };
if (as) storage.token = await tokenFor(as);
await context.addInitScript((entries) => {
  for (const [k, v] of Object.entries(entries)) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ }
  }
}, storage);

const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log(`  console error: ${m.text()}`); });
await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.waitForTimeout(300);
console.log(`viewport: ${await page.evaluate(() => window.innerWidth)}px wide`);
if (waitFor) await page.waitForSelector(waitFor, { timeout: 20000 });
await page.waitForTimeout(1500);
if (click) {
  await page.click(click, { timeout: 15000 });
  await page.waitForTimeout(1200);
}

if (ancestorsOf) {
  const chain = await page.evaluate((sel) => {
    // First *visible* match, matching how capture.mjs resolves an annotation
    // target. The app mounts desktop and mobile copies of several controls and
    // MUI parks hidden measuring elements at -9999px, so the first match in
    // document order is routinely not the one on screen.
    const el = [...document.querySelectorAll(sel)].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0;
    });
    if (!el) return null;
    const out = [];
    let n = el;
    for (let i = 0; i < 10 && n; i += 1, n = n.parentElement) {
      const r = n.getBoundingClientRect();
      const cls = (n.className || '').toString();
      out.push({
        depth: i,
        tag: n.tagName.toLowerCase(),
        box: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`,
        cls: cls.slice(0, 130),
        id: n.id || null,
      });
    }
    return out;
  }, ancestorsOf);
  if (!chain) {
    console.log(`\nancestors: no element matched ${ancestorsOf}`);
  } else {
    console.log(`\nANCESTORS of ${ancestorsOf}`);
    for (const a of chain) {
      console.log(`  ${String(a.depth).padStart(2)} <${a.tag}> ${a.box.padEnd(22)} ${a.id ? `#${a.id} ` : ''}${a.cls}`);
    }
  }
}

const report = await page.evaluate(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const describe = (el) => {
    const r = el.getBoundingClientRect();
    return {
      label: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 44),
      tag: el.tagName.toLowerCase(),
      box: `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.left)},${Math.round(r.top)}`,
      testid: el.getAttribute('data-testid') || null,
    };
  };
  const out = { title: document.title, url: location.href };

  out.ariaLabelled = [...document.querySelectorAll('[aria-label]')]
    .filter(visible)
    .map((el) => ({ selector: `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label')}"]`, ...describe(el) }));

  out.buttons = [...document.querySelectorAll('button')]
    .filter(visible)
    .map(describe);

  out.tables = [...document.querySelectorAll('table')].map((t, i) => ({
    index: i,
    visible: visible(t),
    rows: t.querySelectorAll('tbody tr').length,
    headers: [...t.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim()),
    containerClasses: t.closest('[class*="Mui"]')?.className?.slice(0, 120) || null,
    box: describe(t).box,
  }));

  out.dialogs = [...document.querySelectorAll('.MuiDialog-root')].map((d) => ({
    visible: visible(d),
    heading: (d.querySelector('.MuiDialogTitle-root')?.textContent || '').trim(),
  }));

  out.headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(visible)
    .map((h) => `${h.tagName}: ${(h.textContent || '').trim().slice(0, 70)}`);

  out.testids = [...document.querySelectorAll('[data-testid]')]
    .filter(visible)
    .map((el) => el.getAttribute('data-testid'));

  return out;
});

console.log(`\n${report.url}   "${report.title}"\n`);
console.log('TABLES');
for (const t in report.tables ? report.tables : []) { /* noop */ }
for (const t of report.tables) {
  console.log(`  [${t.index}] visible=${t.visible} rows=${t.rows} ${t.box}`);
  if (t.headers.length) console.log(`       headers: ${t.headers.join(' | ')}`);
}
console.log('\nVISIBLE aria-label ELEMENTS');
for (const a of report.ariaLabelled) console.log(`  ${a.box.padEnd(20)} ${a.selector}`);
console.log('\nVISIBLE BUTTONS (label / size)');
for (const b of report.buttons) console.log(`  ${b.box.padEnd(20)} ${JSON.stringify(b.label)}`);
console.log('\nHEADINGS');
for (const h of report.headings) console.log(`  ${h}`);
if (report.dialogs.length) {
  console.log('\nDIALOGS');
  for (const d of report.dialogs) console.log(`  visible=${d.visible} ${JSON.stringify(d.heading)}`);
}
if (report.testids.length) console.log(`\ndata-testid: ${[...new Set(report.testids)].join(', ')}`);

await context.close();
await browser.close();
