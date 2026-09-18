#!/usr/bin/env node
/*
 * Regenerates every screenshot on the documentation site.
 *
 * The screenshots on ectlogger.us went eight months stale because refreshing
 * them was a manual job nobody owned. The fix is not new screenshots, it is
 * this: one command, one manifest, and no step that requires a human to open
 * an image editor. Annotations are drawn here, at capture time, from selectors
 * in the manifest, so a red box follows its control when the layout moves
 * instead of pointing at empty space.
 *
 * Usage:
 *   node capture.mjs                     capture everything in shots.yml
 *   node capture.mjs --only checking-in  capture shots whose id contains that
 *   node capture.mjs --section operators capture one section
 *   node capture.mjs --list              print the manifest and exit
 *   node capture.mjs --keep-open         leave the browser context open on error
 *
 * Requires:
 *   - the seeded demo instance running (see README.md in this directory)
 *   - the Browserless container reachable at BROWSERLESS_URL
 *
 * It must NEVER be pointed at beta or production. Beta holds a copy of
 * production's database, real names and email addresses included.
 */

import { chromium } from 'playwright-core';
import yaml from 'js-yaml';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// ========== CONFIGURATION ==========

const BROWSERLESS_URL = process.env.BROWSERLESS_URL
  || 'http://10.6.26.2:3000?token=nosi2QszI5M9eN';

// The seeded demo instance. Deliberately not defaulted to anything that could
// be beta or production: those hold real operators' names and addresses.
const DEMO_BASE = process.env.DEMO_BASE_URL || 'http://10.6.26.3:3100';
const DEMO_API = process.env.DEMO_API_URL || 'http://10.6.26.3:8100/api';

const FORBIDDEN = ['app.ectlogger.us', 'ectbeta.lynwood.us'];

// ========== ARGUMENTS ==========

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
}

const onlyFilter = flag('only');
const sectionFilter = flag('section');
const listOnly = flag('list');
const keepOpen = flag('keep-open');

// ========== MANIFEST ==========

const manifestPath = resolve(HERE, 'shots.yml');
const manifest = yaml.load(readFileSync(manifestPath, 'utf8'));
const defaults = manifest.defaults || {};
let shots = manifest.shots || [];

// Each documentation path keeps its figure requests in its own file under
// requests/, so the people writing a path declare the figures they need
// without everyone editing one manifest and colliding.
const requestsDir = resolve(HERE, 'requests');
if (existsSync(requestsDir)) {
  for (const file of readdirSync(requestsDir).filter((f) => f.endsWith('.yml')).sort()) {
    const loaded = yaml.load(readFileSync(resolve(requestsDir, file), 'utf8')) || {};
    for (const shot of loaded.shots || []) {
      if (shots.some((s) => s.id === shot.id)) {
        throw new Error(`Duplicate shot id "${shot.id}" in requests/${file}`);
      }
      shots.push(shot);
    }
  }
}

for (const shot of shots) {
  for (const field of ['id', 'section', 'route', 'alt']) {
    if (!shot[field]) {
      throw new Error(`Shot ${shot.id || '(no id)'} is missing required field "${field}"`);
    }
  }
}

if (sectionFilter && sectionFilter !== true) {
  shots = shots.filter((s) => s.section === sectionFilter);
}
if (onlyFilter && onlyFilter !== true) {
  shots = shots.filter((s) => s.id.includes(onlyFilter));
}

if (listOnly) {
  for (const s of shots) {
    console.log(`${s.section.padEnd(14)} ${s.id.padEnd(34)} ${s.route}`);
  }
  console.log(`\n${shots.length} shot(s).`);
  process.exit(0);
}

// The seed manifest tells us who exists and what the nets are called, so a
// route can be written as /nets/{{net:active}} instead of a hardcoded id that
// changes every time the database is rebuilt.
const seedPath = resolve(REPO, 'backend', 'demo-seed.json');
if (!existsSync(seedPath)) {
  console.error(`No seed manifest at ${seedPath}.`);
  console.error('Run: python backend/scripts/seed_demo_data.py --db backend/demo.db');
  process.exit(1);
}
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));

// ========== SAFETY ==========

for (const url of [DEMO_BASE, DEMO_API]) {
  for (const host of FORBIDDEN) {
    if (url.includes(host)) {
      console.error(`Refusing to run: ${url} points at ${host}.`);
      console.error('Screenshots are only ever taken against the seeded demo instance.');
      process.exit(1);
    }
  }
}

// ========== TOTP ==========
// Admins cannot reach the admin panel without MFA (app/dependencies.py checks
// mfa_enabled, not just the role), so the seeded admin has a real TOTP secret
// and we compute a live code for it rather than disabling the requirement.

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of input.replace(/=+$/, '').toUpperCase()) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, step = 30, digits = 6) {
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16
    | hmac[offset + 2] << 8 | hmac[offset + 3]) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

// ========== AUTH ==========

const tokenCache = new Map();

async function tokenFor(callsign) {
  if (tokenCache.has(callsign)) return tokenCache.get(callsign);

  const user = seed.users.find((u) => u.callsign === callsign);
  if (!user) throw new Error(`No seeded user ${callsign}. Check backend/demo-seed.json.`);

  async function attempt(totpCode) {
    const res = await fetch(`${DEMO_API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: callsign,
        password: seed.password,
        ...(totpCode ? { totp_code: totpCode } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Login failed for ${callsign}: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  let result = await attempt();
  if (result.login_status === 'mfa_required') {
    const secret = user.mfa_secret || seed.mfa_secrets?.[callsign];
    if (!secret) {
      throw new Error(`${callsign} needs a TOTP code but the seed manifest has no secret for it.`);
    }
    result = await attempt(totp(secret));
  }
  if (result.login_status === 'mfa_setup_required') {
    throw new Error(
      `${callsign} is an admin with no MFA enrolled, so its token cannot reach the admin panel. `
      + 'Re-seed with MFA enabled for that account.',
    );
  }
  if (!result.access_token) {
    throw new Error(`No token for ${callsign}: ${JSON.stringify(result)}`);
  }
  tokenCache.set(callsign, result.access_token);
  return result.access_token;
}

// ========== PLACEHOLDERS ==========
// Routes and selectors can refer to seeded records by name rather than by an
// id that changes on every re-seed.

function expand(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+):([\w-]+)\}\}/g, (whole, kind, key) => {
    if (kind === 'net') {
      const net = seed.nets.find((n) => n.key === key || n.status?.toLowerCase() === key);
      if (!net) throw new Error(`No seeded net for ${whole}`);
      return String(net.id);
    }
    if (kind === 'template') {
      const t = seed.templates.find((x) => x.key === key);
      if (!t) throw new Error(`No seeded template for ${whole}`);
      return String(t.id);
    }
    throw new Error(`Unknown placeholder ${whole}`);
  });
}

// ========== STABILIZATION ==========
// Everything that would make two runs of the same shot differ.

const STABILIZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  /* The blinking "live" indicators and skeleton shimmers never sit still. */
  .MuiSkeleton-root { animation: none !important; }
`;

const ANNOTATION_CSS = `
  .ectdoc-annotation {
    position: absolute;
    pointer-events: none;
    z-index: 2147483000;
    box-sizing: border-box;
  }
  .ectdoc-annotation.box {
    border: 3px solid #e53935;
    border-radius: 6px;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85);
  }
  .ectdoc-annotation.underline {
    border-bottom: 4px solid #e53935;
    border-radius: 0;
  }
  .ectdoc-annotation-label {
    position: absolute;
    z-index: 2147483001;
    background: #e53935;
    color: #ffffff;
    font: 700 13px/1 Roboto, Arial, sans-serif;
    letter-spacing: 0.02em;
    padding: 5px 9px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  }
`;

// ========== ANNOTATION ==========

async function annotate(page, annotations) {
  await page.addStyleTag({ content: ANNOTATION_CSS });
  for (const a of annotations) {
    const ok = await page.evaluate(({ selector, style, label, pad, labelPosition }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const p = pad == null ? 4 : pad;
      const top = r.top + window.scrollY - p;
      const left = r.left + window.scrollX - p;
      const width = r.width + p * 2;
      const height = r.height + p * 2;

      const box = document.createElement('div');
      box.className = `ectdoc-annotation ${style}`;
      if (style === 'underline') {
        box.style.top = `${top + height - 2}px`;
        box.style.left = `${left}px`;
        box.style.width = `${width}px`;
        box.style.height = '4px';
      } else {
        box.style.top = `${top}px`;
        box.style.left = `${left}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
      }
      document.body.appendChild(box);

      if (label) {
        const tag = document.createElement('div');
        tag.className = 'ectdoc-annotation-label';
        tag.textContent = label;
        // Above the box by default, below it when the box is near the top of
        // the document and the label would be cut off.
        const above = top > 34;
        tag.style.top = above ? `${top - 30}px` : `${top + height + 8}px`;
        tag.style.left = `${left}px`;
        if (labelPosition === 'right') {
          tag.style.top = `${top + Math.max(0, height / 2 - 12)}px`;
          tag.style.left = `${left + width + 10}px`;
        }
        document.body.appendChild(tag);
      }
      return true;
    }, a);
    if (!ok) {
      throw new Error(`Annotation target not found or not visible: ${a.selector}`);
    }
  }
}

// ========== STEPS ==========

async function runSteps(page, steps) {
  for (const step of steps) {
    const [action] = Object.keys(step);
    const value = step[action];
    switch (action) {
      case 'click':
        await page.click(expand(value), { timeout: 15000 });
        break;
      case 'hover':
        await page.hover(expand(value), { timeout: 15000 });
        break;
      case 'fill':
        await page.fill(expand(value.selector), expand(value.text), { timeout: 15000 });
        break;
      case 'press':
        await page.keyboard.press(value);
        break;
      case 'wait_for':
        await page.waitForSelector(expand(value), { timeout: 20000 });
        break;
      case 'wait':
        await page.waitForTimeout(value);
        break;
      case 'scroll_to':
        await page.locator(expand(value)).scrollIntoViewIfNeeded();
        break;
      case 'evaluate':
        await page.evaluate(value);
        break;
      default:
        throw new Error(`Unknown step "${action}"`);
    }
  }
}

// ========== CAPTURE ==========

async function capture(browser, shot) {
  const viewport = shot.viewport || defaults.viewport || { width: 1440, height: 1000 };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: shot.scale || defaults.scale || 2,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    timezoneId: defaults.timezone || 'America/New_York',
    locale: 'en-US',
    isMobile: !!shot.mobile,
    hasTouch: !!shot.mobile,
  });

  try {
    // Everything the app stores per browser, set before any script runs: the
    // session token, the theme, and the dismissal keys for the banners and
    // dialogs that would otherwise cover a third of every screenshot.
    const storage = { ...(defaults.local_storage || {}), ...(shot.local_storage || {}) };
    if (shot.as) storage.token = await tokenFor(shot.as);
    storage.theme = shot.theme || 'light';

    await context.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) {
        try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ }
      }
    }, storage);

    const page = await context.newPage();
    page.on('pageerror', (e) => console.warn(`    page error: ${e.message}`));

    const url = DEMO_BASE + expand(shot.route);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    await page.addStyleTag({ content: STABILIZE_CSS });

    if (shot.wait_for) {
      await page.waitForSelector(expand(shot.wait_for), { timeout: 30000 });
    }
    if (shot.steps) await runSteps(page, shot.steps);

    // A short settle after the last interaction: MUI dialogs and popovers mount
    // in a portal and measure themselves before they land in their final spot.
    await page.waitForTimeout(shot.settle ?? defaults.settle ?? 400);

    if (shot.hide) {
      await page.addStyleTag({
        content: shot.hide.map((s) => `${s} { visibility: hidden !important; }`).join('\n'),
      });
    }

    if (shot.annotate) await annotate(page, shot.annotate);

    const outPath = join(REPO, 'docs', 'img', shot.section, `${shot.id}.png`);
    mkdirSync(dirname(outPath), { recursive: true });

    const options = { path: outPath, animations: 'disabled', scale: 'device' };

    if (shot.element) {
      // Clip rather than element.screenshot(), so a partial capture can carry
      // padding and still include an annotation drawn outside the element.
      const pad = shot.pad ?? 12;
      const box = await page.locator(expand(shot.element)).first().boundingBox();
      if (!box) throw new Error(`Element not visible: ${shot.element}`);
      const dims = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      options.clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(box.width + pad * 2, dims.w - Math.max(0, box.x - pad)),
        height: Math.min(box.height + pad * 2, dims.h - Math.max(0, box.y - pad)),
      };
    } else if (shot.full_page) {
      // Only for pages that actually scroll. The application shell sets
      // overflow: hidden on its root, which silently truncates a full-page
      // capture to one screen; those shots use a tall viewport instead.
      options.fullPage = true;
    }

    await page.screenshot(options);
    return outPath;
  } finally {
    if (!keepOpen) await context.close();
  }
}

// ========== MAIN ==========

async function main() {
  console.log(`Demo instance: ${DEMO_BASE}`);
  console.log(`Browserless:   ${BROWSERLESS_URL.replace(/token=[^&]*/, 'token=***')}`);
  console.log(`Shots:         ${shots.length}\n`);

  // connectOverCDP, not connect: this Browserless deployment speaks the raw
  // Chrome DevTools Protocol, and playwright.connect() expects a Playwright
  // server on the other end.
  const browser = await chromium.connectOverCDP(BROWSERLESS_URL, { timeout: 30000 });

  const figures = {};
  const failures = [];

  try {
    for (const shot of shots) {
      process.stdout.write(`  ${shot.id} ... `);
      try {
        const path = await capture(browser, shot);
        const rel = path.slice(REPO.length + 1);
        figures[shot.id] = {
          path: `/${rel}`,
          alt: shot.alt,
          caption: shot.caption || null,
          page: shot.page || null,
        };
        console.log('ok');
      } catch (err) {
        console.log('FAILED');
        console.log(`      ${err.message}`);
        failures.push({ id: shot.id, error: err.message });
      }
    }
  } finally {
    await browser.close();
  }

  // An index of every figure with its alt text, so a page author pastes the
  // right markup and a link check can verify that no figure is missing one.
  const indexPath = join(REPO, 'docs', 'img', 'figures.json');
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, `${JSON.stringify(figures, null, 2)}\n`);

  console.log(`\n${Object.keys(figures).length} captured, ${failures.length} failed.`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${err.stack || err.message}`);
  process.exit(1);
});
