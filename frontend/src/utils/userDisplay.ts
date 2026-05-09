/**
 * Returns the best available display callsign for a user, falling back through:
 *   amateur callsign → GMRS callsign → display name → email
 *
 * This supports GMRS-only users (no amateur license) who would otherwise
 * show only their name in net logs and the UI.
 */
export function displayCallsign(user?: {
  callsign?: string | null;
  gmrs_callsign?: string | null;
  name?: string | null;
  email?: string;
} | null): string {
  if (!user) return '';
  return user.callsign || user.gmrs_callsign || user.name || user.email || '';
}
