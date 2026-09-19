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

// A ws:// endpoint, not http://. Given an http:// URL, Playwright first fetches
// /json/version and then connects to whatever webSocketDebuggerUrl it finds
// there, and this deployment reports ws://0.0.0.0:3000/ — the address it binds
// on inside its own container, which is not reachable from here. Handing it the
// WebSocket URL directly skips that lookup.
const BROWSERLESS_URL = process.env.BROWSERLESS_URL
  || 'ws://10.6.26.2:3000?token=nosi2QszI5M9eN';

// Browserless pins its own 800x600 viewport on every page it serves, and that
// pin beats the viewport Playwright asks for per context. The size therefore
// has to travel in the connection's launch payload (see main), and the check
// after each navigation exists because when this goes wrong the app quietly
// renders its narrow layout and the capture still succeeds.

// The seeded demo instance. Deliberately not defaulted to anything that could
// be beta or production: those hold real operators' names and addresses.
const DEMO_BASE = process.env.DEMO_BASE_URL || 'http://10.6.26.3:3100';
const DEMO_API = process.env.DEMO_API_URL || 'http://10.6.26.3:8100/api';

const FORBIDDEN = ['app.ectlogger.us', 'ectbeta.lynwood.us'];

// How many shots one Browserless session takes before it is replaced. See the
// comment at the reconnect in main() for what happens without this.
const SHOTS_PER_SESSION = 8;

// The shapes Playwright reports when the far end of the CDP connection has
// gone, as opposed to anything wrong with the shot itself.
const SESSION_GONE = /has been closed|Target closed|Target page, context or browser|WebSocket|Protocol error/i;

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
      // Unique per section, not globally: the output path is
      // docs/img/<section>/<id>.png, so two paths can each ask for a figure
      // called "check-in-legend" without clobbering each other. They are
      // separate captures of the same thing, which is mild waste but far
      // better than two paths having to negotiate a shared namespace.
      if (shots.some((s) => s.id === shot.id && s.section === shot.section)) {
        throw new Error(
          `Duplicate shot id "${shot.id}" in section "${shot.section}" (requests/${file})`,
        );
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
    const secret = user.mfa_secret
      || seed.mfa_secrets?.[callsign]
      || (seed.admin_mfa?.callsign === callsign ? seed.admin_mfa.secret : null);
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
      const net = seed.nets.find((n) => n.key === key)
        || seed.nets.find((n) => n.status?.toLowerCase() === key.toLowerCase())
        || seed.nets.find((n) => n.name.toLowerCase().includes(key.toLowerCase()));
      if (!net) throw new Error(`No seeded net for ${whole}`);
      return String(net.id);
    }
    if (kind === 'template') {
      const t = seed.templates.find((x) => x.key === key)
        || seed.templates.find((x) => String(x.id) === key)
        || seed.templates.find((x) => x.name.toLowerCase().includes(key.toLowerCase()));
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
  const drawn = [];
  for (const a of annotations) {
    // Resolved through Playwright, not querySelector in the page: that way an
    // annotation may use the same selector vocabulary as everything else in
    // the manifest, including Playwright's own :has-text() and visible=true,
    // instead of being quietly restricted to plain CSS.
    const locator = page.locator(visible(a.selector)).first();
    let rect;
    try {
      rect = await locator.boundingBox({ timeout: 10000 });
    } catch (err) {
      rect = null;
    }
    if (!rect) {
      throw new Error(`Annotation target not found or not visible: ${a.selector}`);
    }

    const box = await page.evaluate(({ rect: r, style, label, pad, labelPosition }) => {
      const p = pad == null ? 4 : pad;
      const top = r.y + window.scrollY - p;
      const left = r.x + window.scrollX - p;
      const width = r.width + p * 2;
      const height = r.height + p * 2;

      // NetView.tsx sets document.body.style.zoom (0.8 on a viewport under
      // 700px tall, 0.9 under 800) so the logging panel fits without
      // scrolling. Everything above is in the painted coordinates Playwright
      // measures and clips in, but an element appended to that body is laid
      // out in pre-zoom pixels and then painted at zoom x -- so a box written
      // at a painted coordinate lands at 0.9 of it, which is 136px adrift by
      // the right-hand edge of a 1440px window. Divide the written position
      // back out, exactly as App.tsx already does for MUI's Poppers, and for
      // the same reason.
      const zoom = parseFloat(document.body.style.zoom) || 1;
      const px = (v) => `${v / zoom}px`;

      const el = document.createElement('div');
      el.className = `ectdoc-annotation ${style}`;
      if (style === 'underline') {
        el.style.top = px(top + height - 2);
        el.style.left = px(left);
        el.style.width = px(width);
        el.style.height = px(4);
      } else {
        el.style.top = px(top);
        el.style.left = px(left);
        el.style.width = px(width);
        el.style.height = px(height);
      }
      document.body.appendChild(el);

      // Document coordinates, so a clipped capture can be widened to contain
      // the annotation. A red box outside the crop is worse than no box: the
      // figure looks finished and points at nothing.
      const bounds = {
        left, top, right: left + width, bottom: top + height,
      };

      if (label) {
        const tag = document.createElement('div');
        tag.className = 'ectdoc-annotation-label';
        tag.textContent = label;
        // Above the box by default, below it when the target sits so near the
        // top of the document that the label would be cut off.
        tag.style.top = px(top > 34 ? top - 30 : top + height + 8);
        tag.style.left = px(left);
        if (labelPosition === 'right') {
          tag.style.top = px(top + Math.max(0, height / 2 - 12));
          tag.style.left = px(left + width + 10);
        }
        document.body.appendChild(tag);

        // Measured rather than estimated. A label is as wide as its own text,
        // which nothing here knows in advance -- the Security tab's "Rolling
        // renewal" tag sat on a switch near the right edge of its card and ran
        // off the side of the clip, because the union was widened by a fixed
        // guess that only applied to labelPosition: right.
        const r = tag.getBoundingClientRect();
        bounds.left = Math.min(bounds.left, r.left + window.scrollX);
        bounds.top = Math.min(bounds.top, r.top + window.scrollY);
        bounds.right = Math.max(bounds.right, r.right + window.scrollX);
        bounds.bottom = Math.max(bounds.bottom, r.bottom + window.scrollY);
      }

      return {
        x: bounds.left,
        y: bounds.top,
        width: bounds.right - bounds.left,
        height: bounds.bottom - bounds.top,
      };
    }, { rect, style: a.style, label: a.label, pad: a.pad, labelPosition: a.labelPosition });

    drawn.push(box);
  }
  return drawn;
}

// ========== STEPS ==========

// Every selector in a step resolves to the visible match, for the same reason
// annotations do: the app mounts more than one copy of most controls, and
// clicking the hidden one times out with a message that blames the selector.
function visible(selector) {
  return `${expand(selector)} >> visible=true`;
}

async function runSteps(page, steps) {
  for (const step of steps) {
    const [action] = Object.keys(step);
    const value = step[action];
    switch (action) {
      case 'click':
        await page.locator(visible(value)).first().click({ timeout: 15000 });
        break;
      case 'hover':
        await page.locator(visible(value)).first().hover({ timeout: 15000 });
        break;
      case 'fill': {
        // "text" is the documented key; "value" is accepted because it is the
        // obvious guess and failing on it wastes a whole capture run.
        const text = value.text ?? value.value;
        if (text === undefined) {
          throw new Error('A fill step needs "text" (or "value")');
        }
        await page.locator(visible(value.selector)).first().fill(String(text), { timeout: 15000 });
        break;
      }
      case 'press':
        await page.keyboard.press(value);
        break;
      case 'wait_for':
        await page.waitForSelector(visible(value), { timeout: 20000 });
        break;
      case 'wait':
        await page.waitForTimeout(value);
        break;
      case 'scroll_to':
        await page.locator(visible(value)).first().scrollIntoViewIfNeeded();
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

// The screen geometry a shot needs. Browserless pins its own default viewport
// on every page it hands out, and that pin beats Playwright's per-context
// viewport, so this has to be settled at connection time rather than per page.
function geometryOf(shot) {
  const viewport = shot.viewport || defaults.viewport || { width: 1440, height: 1000 };
  return {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: shot.scale || defaults.scale || 2,
    isMobile: !!shot.mobile,
    hasTouch: !!shot.mobile,
  };
}

function geometryKey(g) {
  return `${g.width}x${g.height}@${g.deviceScaleFactor}${g.isMobile ? ' mobile' : ''}`;
}

// Browserless hands back a browser whose first tab is still settling when the
// connection opens, and it navigates that tab to about:blank a moment later.
// If our own goto lands in that window Chrome cancels ours, not its. Only the
// first shot in a group can hit it, and a second attempt always wins.
async function gotoWithRetry(page, url) {
  const options = { waitUntil: 'networkidle', timeout: 45000 };
  try {
    await page.goto(url, options);
  } catch (err) {
    if (!/interrupted by another navigation/.test(err.message)) throw err;
    await page.waitForTimeout(500);
    await page.goto(url, options);
  }
}

// Opens the same net as another operator and leaves the session connected.
//
// Some of the interface only exists when somebody else is actually there. The
// @mention autocomplete is the clear case: its roster is the intersection of
// this net's check-ins with ConnectionManager's live WebSocket presence
// (nets_core.py's online_user_ids), so in a browser session with nobody else
// signed in the list is empty and the menu never opens. A figure of it needs a
// real second session, not a fixture.
//
// These run before the shot's own page loads, because the roster arrives with
// the one GET /nets/{id}/stats the page makes on mount.
async function openCompanions(browser, callsigns, route, viewport) {
  const contexts = [];
  for (const callsign of callsigns) {
    const context = await browser.newContext({ viewport, colorScheme: 'light' });
    contexts.push(context);
    const token = await tokenFor(callsign);
    await context.addInitScript((t) => {
      try { window.localStorage.setItem('token', t); } catch (e) { /* private mode */ }
    }, token);
    const page = await context.newPage();
    await gotoWithRetry(page, DEMO_BASE + expand(route));
    // The socket opens after the net loads, and presence is only recorded once
    // it is established.
    await page.waitForTimeout(1500);
  }
  return contexts;
}

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

  let companions = [];

  try {
    if (shot.with_online?.length) {
      companions = await openCompanions(browser, shot.with_online, shot.route, viewport);
    }

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

    await gotoWithRetry(page, DEMO_BASE + expand(shot.route));

    // Re-assert and then verify. A figure captured at the wrong width is a
    // figure of a layout the reader will never see.
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    const actual = await page.evaluate(() => window.innerWidth);
    if (Math.abs(actual - viewport.width) > 2) {
      throw new Error(
        `Viewport is ${actual}px wide, asked for ${viewport.width}px. `
        + 'The app would have rendered its narrow layout.',
      );
    }

    await page.addStyleTag({ content: STABILIZE_CSS });

    if (shot.wait_for) {
      await page.waitForSelector(visible(shot.wait_for), { timeout: 30000 });
    }
    if (shot.steps) await runSteps(page, shot.steps);

    // A short settle after the last interaction: MUI dialogs and popovers mount
    // in a portal and measure themselves before they land in their final spot.
    await page.waitForTimeout(shot.settle ?? defaults.settle ?? 400);

    const hideSelectors = [...(defaults.hide || []), ...(shot.hide || [])];
    if (hideSelectors.length) {
      await page.addStyleTag({
        content: hideSelectors.map((s) => `${s} { visibility: hidden !important; }`).join('\n'),
      });
    }

    // A control inside a panel that scrolls on its own sits at a y the document
    // itself never reaches: the Edit Net form is taller than its container, so
    // the two lobby switches measure at y=1100 on a page whose scrollHeight is
    // the viewport's 1000, and the clip comes out with a negative height. Bring
    // the requested elements into view before anything is measured. Last first,
    // then first, so that a pair of elements spanning more than one screenful
    // settles with the earlier one at the top rather than the later one at the
    // bottom. It is a no-op for an element that was already fully visible.
    if (shot.element) {
      const list = Array.isArray(shot.element) ? shot.element : [shot.element];
      for (const selector of [list[list.length - 1], list[0]]) {
        await page.locator(`${expand(selector)} >> visible=true`).first()
          .scrollIntoViewIfNeeded()
          .catch(() => { /* measured for real below, which reports it properly */ });
      }
      await page.waitForTimeout(200);
    }

    const annotationBoxes = shot.annotate ? await annotate(page, shot.annotate) : [];

    const outPath = join(REPO, 'docs', 'img', shot.section, `${shot.id}.png`);
    mkdirSync(dirname(outPath), { recursive: true });

    const options = { path: outPath, animations: 'disabled', scale: 'device' };

    if (shot.element) {
      // Clip rather than element.screenshot(), so a partial capture can carry
      // padding and still include an annotation drawn outside the element.
      const pad = shot.pad ?? 12;
      // A list of selectors is allowed, and the clip is their union. A menu or
      // an autocomplete is portaled to the end of the body rather than nested
      // inside the control that opened it, so a figure of a control together
      // with what it opened cannot be described by one element.
      //
      // ">> visible=true" for the same reason annotations filter for visibility:
      // the app mounts desktop and mobile copies of whole toolbars, and the
      // hidden copy is frequently first in document order.
      const selectors = Array.isArray(shot.element) ? shot.element : [shot.element];
      const boxes = [];
      for (const selector of selectors) {
        const box = await page
          .locator(`${expand(selector)} >> visible=true`)
          .first()
          .boundingBox();
        if (!box) throw new Error(`Element not visible: ${selector}`);
        boxes.push(box);
      }
      const dims = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      // Union of every requested element and everything annotated on them.
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const a of [...boxes, ...annotationBoxes]) {
        left = Math.min(left, a.x - pad);
        top = Math.min(top, a.y - pad);
        right = Math.max(right, a.x + a.width + pad);
        bottom = Math.max(bottom, a.y + a.height + pad);
      }
      left = Math.max(0, left);
      top = Math.max(0, top);
      options.clip = {
        x: left,
        y: top,
        width: Math.min(right - left, dims.w - left),
        height: Math.min(bottom - top, dims.h - top),
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
    if (!keepOpen) {
      await context.close();
      for (const c of companions) await c.close();
    }
  }
}

// ========== MAIN ==========

async function main() {
  console.log(`Demo instance: ${DEMO_BASE}`);
  console.log(`Browserless:   ${BROWSERLESS_URL.replace(/token=[^&]*/, 'token=***')}`);
  console.log(`Shots:         ${shots.length}\n`);

  // Shots are grouped by the screen geometry they need, and each group gets its
  // own connection, because the geometry is fixed at connect time.
  const groups = new Map();
  for (const shot of shots) {
    const g = geometryOf(shot);
    const key = geometryKey(g);
    if (!groups.has(key)) groups.set(key, { geometry: g, shots: [] });
    groups.get(key).shots.push(shot);
  }

  const figures = {};
  const failures = [];

  for (const [key, group] of groups) {
    console.log(`[${key}]`);

    // connectOverCDP, not connect: this Browserless deployment speaks the raw
    // Chrome DevTools Protocol, and playwright.connect() expects a Playwright
    // server on the other end. defaultViewport in the launch payload is the
    // part that actually decides the page size here.
    const launch = encodeURIComponent(JSON.stringify({
      args: ['--hide-scrollbars'],
      defaultViewport: group.geometry,
    }));
    const endpoint = `${BROWSERLESS_URL}${BROWSERLESS_URL.includes('?') ? '&' : '?'}launch=${launch}`;
    const connect = () => chromium.connectOverCDP(endpoint, { timeout: 30000 });

    let browser = null;
    let sinceConnect = Infinity;

    try {
      for (const shot of group.shots) {
        // Browserless ends a session that has been held open long enough, and
        // the biggest geometry group is long enough: two full runs died partway
        // through with "Target page, context or browser has been closed" and
        // took every remaining shot in the group down with them, which reads as
        // fifteen unrelated failures rather than one. Reconnecting every so
        // often keeps each session comfortably inside that limit, and the retry
        // below covers a session that goes away sooner anyway.
        if (sinceConnect >= SHOTS_PER_SESSION) {
          if (browser) await browser.close().catch(() => {});
          browser = await connect();
          sinceConnect = 0;
        }
        sinceConnect += 1;

        process.stdout.write(`  ${shot.id} ... `);
        try {
          let path;
          try {
            path = await capture(browser, shot);
          } catch (err) {
            if (!SESSION_GONE.test(err.message)) throw err;
            await browser.close().catch(() => {});
            browser = await connect();
            sinceConnect = 1;
            path = await capture(browser, shot);
          }
          const rel = path.slice(REPO.length + 1);
          figures[`${shot.section}/${shot.id}`] = {
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
      if (browser) await browser.close().catch(() => {});
    }
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
