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
