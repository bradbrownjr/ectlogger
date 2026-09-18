/**
 * Check-in Markers
 *
 * The one palette every check-in map draws from: the live map
 * (components/CheckInMap.tsx), the net report (pages/NetReport.tsx) and the
 * net statistics page (pages/NetStatistics.tsx). A station is the same color
 * on all three, and each map's legend is built from this same source rather
 * than hand-listed per page.
 *
 * Before 2026-09-18 each surface had its own idea of the palette: the live map
 * used these hex values, the report used theme palette colors, and the
 * statistics map had no status coloring at all (every station drew the same
 * green). Both color functions were also keyed to statuses that do not exist
 * in StationStatus (backend/app/models.py) -- the report colored 'TACTICAL',
 * 'MONITORING' and 'CHECKING_OUT' and so sent the real 'away', 'mobile',
 * 'announcements', 'relay' and 'checked_out' values to a default grey, while
 * the live map colored 'tactical' and 'priority' and sent 'checked_out' to the
 * default green, drawing a station that had left the net exactly like one that
 * was still on frequency. The keys below are the full StationStatus
 * vocabulary, and nothing else.
 *
 * Fixed hex values, not theme palette entries: these are also the legend
 * swatches and are drawn over map tiles, which are always light in the report
 * (it is a print document), so a marker must not change color with the app
 * theme or a net's record would look different depending on who opened it.
 */

// Status colors, keyed to StationStatus (backend/app/models.py).
export const STATION_STATUS_MARKER_COLORS: Record<string, string> = {
  checked_in: '#4caf50',    // green - on frequency
  has_traffic: '#f44336',   // red - holding traffic
  listening: '#9c27b0',     // purple - monitoring only
  relay: '#00695c',         // teal - relaying, same color as the Relay role
  away: '#ff9800',          // orange - temporarily away
  announcements: '#00bcd4', // cyan - has announcements
  mobile: '#607d8b',        // blue-gray - mobile station
  checked_out: '#9e9e9e',   // grey - left the net
};

// Role colors, which outrank status: an NCS who is also "checked in" draws as
// NCS, because on a map the question is who is running the net.
export const NET_ROLE_MARKER_COLORS = {
  NCS: '#1565c0',    // dark blue
  LOGGER: '#6a1b9a', // deep purple
  RELAY: '#00695c',  // teal
};

const DEFAULT_MARKER_COLOR = STATION_STATUS_MARKER_COLORS.checked_in;

export interface MarkerRoleIds {
  ncsUserIds: number[];
  loggerUserIds: number[];
  relayUserIds: number[];
}

export const NO_MARKER_ROLES: MarkerRoleIds = {
  ncsUserIds: [],
  loggerUserIds: [],
  relayUserIds: [],
};

interface RoleRecord {
  user_id?: number;
  role?: string;
  is_active?: boolean;
}

/**
 * Split a net's role list into the three user-id arrays the map colors by.
 *
 * Two rules that used to be gotten wrong by the one hand-rolled copy of this
 * (NetView.tsx): roles come back from the API UPPERCASE ('NCS', 'LOGGER',
 * 'RELAY'), so a comparison against 'Relay' silently matched nothing and no
 * relay station was ever colored; and a role row is kept after someone steps
 * down, with is_active flipped to false, so an un-filtered list keeps coloring
 * a station as NCS after it handed net control over.
 */
export function getMarkerRoleIds(netRoles: RoleRecord[]): MarkerRoleIds {
  const idsForRole = (role: string) =>
    netRoles
      .filter(r => r.is_active !== false && (r.role || '').toUpperCase() === role)
      .map(r => r.user_id)
      .filter((id): id is number => id != null);

  return {
    ncsUserIds: idsForRole('NCS'),
    loggerUserIds: idsForRole('LOGGER'),
    relayUserIds: idsForRole('RELAY'),
  };
}

interface ColorableCheckIn {
  status?: string;
  user_id?: number;
}

/**
 * The color one station's marker draws in. Status matching is
 * case-insensitive: the API serializes StationStatus in lowercase but the
 * database stores the uppercase member names, and a comparison written for one
 * casing silently falls through to the default for the other (exactly how the
 * report's checked-out filter went unnoticed for months - see
 * hooks/useMappedCheckIns.ts).
 */
export function getCheckInMarkerColor(
  checkIn: ColorableCheckIn,
  roles: MarkerRoleIds = NO_MARKER_ROLES
): string {
  const userId = checkIn.user_id;
  if (userId != null) {
    if (roles.ncsUserIds.includes(userId)) return NET_ROLE_MARKER_COLORS.NCS;
    if (roles.loggerUserIds.includes(userId)) return NET_ROLE_MARKER_COLORS.LOGGER;
    if (roles.relayUserIds.includes(userId)) return NET_ROLE_MARKER_COLORS.RELAY;
  }

  const status = (checkIn.status || '').toLowerCase();
  return STATION_STATUS_MARKER_COLORS[status] ?? DEFAULT_MARKER_COLOR;
}

export interface MarkerLegendEntry {
  color: string;
  label: string;
}

/**
 * The legend for a given set of check-ins: only what is actually on that map.
 * A fixed list is worse in both directions - it names statuses nobody used,
 * and (as the report's three hand-written entries did) omits the colors a
 * reader is actually looking at.
 */
export function buildMarkerLegend(
  checkIns: ColorableCheckIn[],
  roles: MarkerRoleIds = NO_MARKER_ROLES,
  statusLabel: (status: string) => string = s => s
): MarkerLegendEntry[] {
  const entries: MarkerLegendEntry[] = [];
  const withRole = new Set<number>();

  const addRole = (userIds: number[], color: string, label: string) => {
    const present = checkIns.some(c => c.user_id != null && userIds.includes(c.user_id));
    if (!present) return;
    userIds.forEach(id => withRole.add(id));
    entries.push({ color, label });
  };

  addRole(roles.ncsUserIds, NET_ROLE_MARKER_COLORS.NCS, 'NCS');
  addRole(roles.loggerUserIds, NET_ROLE_MARKER_COLORS.LOGGER, 'Logger');
  addRole(roles.relayUserIds, NET_ROLE_MARKER_COLORS.RELAY, 'Relay');

  // Status entries in palette order, so the legend's order is stable rather
  // than following whatever order stations happened to check in.
  for (const [status, color] of Object.entries(STATION_STATUS_MARKER_COLORS)) {
    const present = checkIns.some(
      c => (c.status || '').toLowerCase() === status && !(c.user_id != null && withRole.has(c.user_id))
    );
    if (present) entries.push({ color, label: statusLabel(status) });
  }

  return entries;
}
