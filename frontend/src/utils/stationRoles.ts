// ========== NET ROLES FOR EVERY STATION, WITH OR WITHOUT AN ACCOUNT ==========
// A net's roles come from two lists: GET /nets/{id}/roles (NetRole, an
// account; these are what grant net controls) and GET /nets/{id}/callsign-roles
// (NetCallsignRole, a station with no account, credited by callsign and never
// granting anything; see backend services/callsign_people.py).
//
// The check-in list shows both the same way, so display code works on the
// merged list from mergeStationRoles and matches a role to a check-in with
// roleMatchesCheckIn. Never match a role to a check-in on user_id alone: a
// guest check-in and a callsign-only role both have user_id null, so that
// would hand every guest the role. Permission code (what the signed-in user
// may do) keeps using the account list only.

export interface CallsignRole {
  id: number;
  callsign: string;
  role: string;
  assigned_at: string;
  auto_assigned?: boolean;
}

export interface StationRole {
  id: number;
  role: string;
  assigned_at: string;
  is_active?: boolean;
  user_id: number | null;
  /** Set on a callsign-only role; an account role is matched by user_id. */
  callsign_only?: boolean;
  callsign?: string;
  [extra: string]: any;
}

interface CheckInLike {
  user_id?: number | null;
  callsign?: string | null;
}

/** Identity of the station behind a check-in: its account, else its callsign. */
export function checkInStationKey(checkIn: CheckInLike): string {
  return checkIn.user_id != null ? `u:${checkIn.user_id}` : `c:${(checkIn.callsign || '').trim().toUpperCase()}`;
}

/** Identity of the station a role belongs to, comparable with checkInStationKey. */
export function roleStationKey(role: StationRole): string {
  return role.callsign_only ? `c:${(role.callsign || '').toUpperCase()}` : `u:${role.user_id}`;
}

/** Account roles plus callsign-only roles, as one list of NetRole-shaped rows. */
export function mergeStationRoles(netRoles: any[], callsignRoles: CallsignRole[]): StationRole[] {
  return [
    ...netRoles,
    ...callsignRoles.map((r) => ({
      ...r,
      user_id: null,
      is_active: true,
      callsign_only: true,
      callsign: r.callsign.toUpperCase(),
    })),
  ];
}

export function roleMatchesCheckIn(role: StationRole, checkIn: CheckInLike): boolean {
  return roleStationKey(role) === checkInStationKey(checkIn);
}

/** The station's active role on this net, if it holds one. */
export function findCheckInRole(roles: StationRole[], checkIn: CheckInLike): StationRole | undefined {
  return roles.find((r) => r.is_active !== false && roleMatchesCheckIn(r, checkIn));
}

/** Active NCS roles, first assigned first (the primary NCS leads). */
export function activeNcsRoles(roles: StationRole[]): StationRole[] {
  return roles
    .filter((r) => r.role === 'NCS' && r.is_active !== false)
    .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime());
}
