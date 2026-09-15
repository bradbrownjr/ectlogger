// Shared check-in list ordering, used by both NetView.tsx (attached/detached/
// floating tables) and NetPaneWindow.tsx (popped-out window) so the two
// copies can't drift the way the old inline staffedUserIds Set did -- that
// version treated NCS/Logger/Relay as equally "staffed" and let ties fall
// through to checked_in_at, so a Logger who checked in first displayed above
// the NCS.

const STAFF_ROLE_RANK: Record<string, number> = {
  NCS: 0,
  LOGGER: 1,
  Relay: 2,
};

const UNSTAFFED_RANK = 3;

// Lowest rank wins ties within a role (e.g. if a user somehow holds two
// active role rows), so a station's best role always determines its rank.
export function buildStaffRoleRankByUserId(netRoles: any[]): Map<number, number> {
  const rankByUserId = new Map<number, number>();
  for (const role of netRoles) {
    if (role.is_active === false) continue;
    const rank = STAFF_ROLE_RANK[role.role];
    if (rank === undefined) continue;
    const existing = rankByUserId.get(role.user_id);
    if (existing === undefined || rank < existing) {
      rankByUserId.set(role.user_id, rank);
    }
  }
  return rankByUserId;
}

interface SortableCheckIn {
  user_id?: number;
  status?: string;
  checked_in_at: string;
}

// Sort order: NCS -> Logger -> Relay -> (optional mobile priority) -> everyone
// else, then checked_in_at ascending within each group.
export function compareCheckInsByRole(
  a: SortableCheckIn,
  b: SortableCheckIn,
  staffRoleRankByUserId: Map<number, number>,
  mobilePrioritySort: boolean
): number {
  const aRank = (a.user_id !== undefined ? staffRoleRankByUserId.get(a.user_id) : undefined) ?? UNSTAFFED_RANK;
  const bRank = (b.user_id !== undefined ? staffRoleRankByUserId.get(b.user_id) : undefined) ?? UNSTAFFED_RANK;
  if (aRank !== bRank) return aRank - bRank;

  if (mobilePrioritySort) {
    const aIsMobile = a.status === 'mobile';
    const bIsMobile = b.status === 'mobile';
    if (aIsMobile !== bIsMobile) return aIsMobile ? -1 : 1;
  }

  return new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime();
}
