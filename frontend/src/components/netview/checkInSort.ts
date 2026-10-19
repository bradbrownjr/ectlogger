// Shared check-in list ordering, used by both NetView.tsx (attached/detached/
// floating tables) and NetPaneWindow.tsx (popped-out window) so the two
// copies can't drift the way the old inline staffedUserIds Set did -- that
// version treated NCS/Logger/Relay as equally "staffed" and let ties fall
// through to checked_in_at, so a Logger who checked in first displayed above
// the NCS.
//
// Ranks are keyed by station (utils/stationRoles.ts), not user_id, so a
// station with no account that holds a role sorts with the staff too.

import { checkInStationKey, roleStationKey, StationRole } from '../../utils/stationRoles';

// Role names are upper case, as the API returns them. This read `Relay` until
// 2026-10-19, so a Relay station never sorted above everyone else.
const STAFF_ROLE_RANK: Record<string, number> = {
  NCS: 0,
  LOGGER: 1,
  RELAY: 2,
};

const UNSTAFFED_RANK = 3;

// Lowest rank wins ties within a role (e.g. if a user somehow holds two
// active role rows), so a station's best role always determines its rank.
export function buildStaffRoleRank(roles: StationRole[]): Map<string, number> {
  const rankByStation = new Map<string, number>();
  for (const role of roles) {
    if (role.is_active === false) continue;
    const rank = STAFF_ROLE_RANK[role.role];
    if (rank === undefined) continue;
    const key = roleStationKey(role);
    const existing = rankByStation.get(key);
    if (existing === undefined || rank < existing) {
      rankByStation.set(key, rank);
    }
  }
  return rankByStation;
}

interface SortableCheckIn {
  user_id?: number | null;
  callsign?: string | null;
  status?: string;
  checked_in_at: string;
}

// Sort order: NCS -> Logger -> Relay -> (optional mobile priority) -> everyone
// else, then checked_in_at ascending within each group.
export function compareCheckInsByRole(
  a: SortableCheckIn,
  b: SortableCheckIn,
  staffRoleRank: Map<string, number>,
  mobilePrioritySort: boolean
): number {
  const aRank = staffRoleRank.get(checkInStationKey(a)) ?? UNSTAFFED_RANK;
  const bRank = staffRoleRank.get(checkInStationKey(b)) ?? UNSTAFFED_RANK;
  if (aRank !== bRank) return aRank - bRank;

  if (mobilePrioritySort) {
    const aIsMobile = a.status === 'mobile';
    const bIsMobile = b.status === 'mobile';
    if (aIsMobile !== bIsMobile) return aIsMobile ? -1 : 1;
  }

  return new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime();
}
