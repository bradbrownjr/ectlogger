// ========== TRAINING SESSION TIMES AND FORM VALUES ==========
// Help > Training (components/TrainingDialog.tsx). Times come from the server
// as UTC, sometimes without a 'Z'; they are shown in the viewer's own zone and
// edited in a datetime-local field, which has no zone of its own.

const pad = (n: number) => String(n).padStart(2, '0');

/** A server time as an instant. */
export const parseUtc = (iso: string): Date =>
  new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);

/** The value for a datetime-local field: the instant on the viewer's clock. */
export const toLocalInput = (iso: string): string => {
  const d = parseUtc(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** The ISO (UTC) string to send for a datetime-local value, read as the viewer's clock. */
export const fromLocalInput = (value: string): string => new Date(value).toISOString();

/** True for a link the server will accept: http or https, no spaces. */
export const isWebUrl = (value: string): boolean => /^https?:\/\/\S+$/i.test(value.trim());

const zoneOf = (d: Date, timeZone?: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone }).formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value || '';

/**
 * "Thu, Nov 5, 2026, 7:00 PM EST to 8:30 PM EST" on the viewer's clock (or the
 * given zone, for tests). An end on another day names its date; no end shows
 * the start alone.
 */
export const formatSessionRange = (startIso: string, endIso?: string | null, timeZone?: string): string => {
  const start = parseUtc(startIso);
  const day = (d: Date) => d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone,
  });
  const time = (d: Date) => `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })} ${zoneOf(d, timeZone)}`;
  const first = `${day(start)}, ${time(start)}`;
  if (!endIso) return first;
  const end = parseUtc(endIso);
  return day(end) === day(start) ? `${first} to ${time(end)}` : `${first} to ${day(end)}, ${time(end)}`;
};

// ========== TRAINING BANNER ==========
// components/TrainingBanner.tsx announces the next session on the main pages.

/**
 * How many days ahead the banner begins announcing a session. It starts at
 * midnight on the viewer's clock that many days before the session's date, not
 * at the session's own time of day: someone who visits only for an evening net
 * a week earlier still has to catch it (Brad, 2026-10-30).
 */
export const TRAINING_BANNER_LEAD_DAYS = 7;

/** When the banner starts announcing a session: local midnight, LEAD_DAYS before its date. */
export const bannerStartsAt = (startIso: string): Date => {
  const d = parseUtc(startIso);
  // Calendar arithmetic rather than subtracting milliseconds, so a daylight
  // saving change inside the week doesn't move it off midnight.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - TRAINING_BANNER_LEAD_DAYS);
};

/**
 * The pages the banner shows on: the top bar's main pages. Never inside a net
 * or anything under one, a form, or the sign-in pages, where the room is needed.
 */
const BANNER_PAGES = ['/', '/dashboard', '/scheduler', '/traffic', '/statistics', '/profile', '/admin/users'];

export const isTrainingBannerPage = (pathname: string): boolean =>
  BANNER_PAGES.includes(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

interface BannerCandidate {
  id: number;
  starts_at: string;
  banner_dismissed: boolean;
}

/**
 * The session to announce: the soonest one whose announcement has begun
 * (bannerStartsAt) that this viewer hasn't closed. The list holds only sessions that are not over,
 * soonest first. guestClosed holds the ids a signed-out browser has closed.
 */
export const pickBannerSession = <T extends BannerCandidate>(
  sessions: T[],
  now: Date,
  guestClosed: ReadonlySet<number> = new Set(),
): T | null => {
  return sessions.find((s) =>
    bannerStartsAt(s.starts_at).getTime() <= now.getTime() && !s.banner_dismissed && !guestClosed.has(s.id),
  ) ?? null;
};

/** "Thu, Nov 12 at 7:00 PM EST" on the viewer's clock (or the given zone, for tests). */
export const formatBannerWhen = (startIso: string, timeZone?: string): string => {
  const d = parseUtc(startIso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  return `${day} at ${time} ${zoneOf(d, timeZone)}`;
};
