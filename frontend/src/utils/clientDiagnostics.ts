// ========== CLIENT DIAGNOSTICS ==========
// Collects a small, non-identifying snapshot of the browser environment, plus
// any self-check problems the app noticed about itself, so an operator can
// copy it into a support email.
//
// Why this exists: a reported bug ("no available actions in the drop-down
// menu") turned out to depend entirely on the reporter's viewport being under
// 800px tall, which is where NetView applies a CSS zoom. Nothing in the report,
// and nothing in the browser console, said so -- the menus were rendering
// perfectly, just ~1e23px offscreen. Several days of back-and-forth would have
// been one line of this snapshot. Viewport size and applied zoom are the two
// highest-value fields here for exactly that reason.
//
// PRIVACY: this is environment only, never content. No callsign, name, email,
// location, chat, check-in or traffic data is collected, and nothing is
// transmitted anywhere -- the operator reads it, then chooses to paste it. Keep
// it that way: if a field would identify a person or reveal net activity, it
// does not belong here.

import changelog from '../changelog.json';

export type DiagnosticIssue = {
  /** Short machine-ish label, e.g. 'popover-offscreen'. */
  kind: string;
  /** Human-readable one-liner. Must not contain user content. */
  detail: string;
  at: string;
};

// Keep only the most recent few: this is a support aid, not a log, and an
// unbounded array on a page that stays open for weeks is a leak.
const MAX_ISSUES = 10;
const issues: DiagnosticIssue[] = [];

/**
 * Records a problem the app detected about its own rendering. Deliberately
 * cheap and non-throwing -- diagnostics must never be able to break the page
 * they are diagnosing.
 */
export function recordDiagnosticIssue(kind: string, detail: string): void {
  try {
    // Collapse repeats: a mispositioned menu can re-report on every scroll,
    // and ten copies of one problem is less useful than ten distinct ones.
    const existing = issues.find((i) => i.kind === kind && i.detail === detail);
    if (existing) {
      existing.at = new Date().toISOString();
      return;
    }
    issues.push({ kind, detail, at: new Date().toISOString() });
    if (issues.length > MAX_ISSUES) issues.shift();
    // Still surface it in the console for anyone who has DevTools open.
    console.warn(`[ECTLogger self-check] ${kind}: ${detail}`);
  } catch {
    /* never let diagnostics throw */
  }
}

export function getDiagnosticIssues(): DiagnosticIssue[] {
  return [...issues];
}

/** Exported for testing. Clears the recorded issues. */
export function resetDiagnosticIssues(): void {
  issues.length = 0;
}

/**
 * Browser/user-agent summary. Prefers User-Agent Client Hints (structured
 * brand + version) and falls back to the raw UA string, which is noisier but
 * universally available.
 */
/**
 * Reads one value, substituting a fallback if it isn't available. Every field
 * below is optional by nature (Client Hints, `screen`, Intl) and a diagnostics
 * panel that throws while describing the environment is worse than useless, so
 * nothing here is allowed to fail.
 */
function safe(read: () => string | undefined | null, fallback = 'unknown'): string {
  try {
    const value = read();
    return value == null || value === '' ? fallback : String(value);
  } catch {
    return fallback;
  }
}

function describeBrowser(): string {
  const uaData = (navigator as any).userAgentData;
  if (uaData?.brands?.length) {
    const brands = uaData.brands
      // "Not)A;Brand" and friends are deliberate padding entries, not browsers.
      .filter((b: any) => !/not.a.brand/i.test(b.brand))
      .map((b: any) => `${b.brand} ${b.version}`)
      .join(', ');
    return `${brands || 'unknown'} on ${uaData.platform || 'unknown platform'}`;
  }
  return navigator.userAgent;
}

/** The CSS zoom NetView applies on short viewports, or 'none'. */
function describeZoom(): string {
  const zoom = (document.body.style as any).zoom;
  return zoom && zoom !== '1' ? zoom : 'none';
}

export type DiagnosticsSnapshot = Record<string, string>;

/**
 * Gathers the snapshot as ordered key/value pairs. Values are all strings so
 * the caller can render or serialize them without further formatting.
 */
export function collectDiagnostics(): DiagnosticsSnapshot {
  const snapshot: DiagnosticsSnapshot = {
    'App version': safe(() => (changelog as any)?.version),
    'Page': safe(() => window.location.pathname),
    'Viewport': safe(() => `${window.innerWidth} x ${window.innerHeight} px`),
    'Screen': safe(() => `${window.screen.width} x ${window.screen.height} px`),
    'Device pixel ratio': safe(() => String(window.devicePixelRatio)),
    'Applied page zoom': safe(describeZoom),
    'Browser': safe(describeBrowser),
    'Language': safe(() => navigator.language),
    'Time zone': safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    'Online': safe(() => (navigator.onLine ? 'yes' : 'no')),
  };

  const recorded = getDiagnosticIssues();
  snapshot['Self-check'] = recorded.length
    ? recorded.map((i) => `${i.kind} (${i.detail})`).join('; ')
    : 'no problems detected';

  return snapshot;
}

/** The snapshot as the plain text block an operator pastes into an email. */
export function formatDiagnostics(snapshot = collectDiagnostics()): string {
  return Object.entries(snapshot)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}
