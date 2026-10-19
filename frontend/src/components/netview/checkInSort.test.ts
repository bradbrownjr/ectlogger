import { describe, it, expect } from 'vitest';
import { buildStaffRoleRank, compareCheckInsByRole } from './checkInSort';
import { mergeStationRoles } from '../../utils/stationRoles';

describe('checkInSort', () => {
  it('ranks NCS above Logger above Relay above everyone else', () => {
    const netRoles: any[] = [
      { user_id: 1, role: 'LOGGER', is_active: true },
      { user_id: 2, role: 'NCS', is_active: true },
      { user_id: 3, role: 'RELAY', is_active: true },
    ];
    const rank = buildStaffRoleRank(netRoles);

    const checkIns = [
      { user_id: 1, checked_in_at: '2026-01-01T00:00:00Z' }, // Logger, checked in first
      { user_id: 2, checked_in_at: '2026-01-01T00:05:00Z' }, // NCS, checked in later
      { user_id: 3, checked_in_at: '2026-01-01T00:02:00Z' }, // Relay
      { user_id: 4, checked_in_at: '2026-01-01T00:01:00Z' }, // unstaffed
    ];

    const sorted = [...checkIns].sort((a, b) => compareCheckInsByRole(a, b, rank, true));

    expect(sorted.map((c) => c.user_id)).toEqual([2, 1, 3, 4]);
  });

  it('ignores an inactive (stepped-down) role row', () => {
    const netRoles: any[] = [{ user_id: 1, role: 'NCS', is_active: false }];
    const rank = buildStaffRoleRank(netRoles);

    const checkIns = [
      { user_id: 1, checked_in_at: '2026-01-01T00:05:00Z' },
      { user_id: 2, checked_in_at: '2026-01-01T00:00:00Z' },
    ];

    const sorted = [...checkIns].sort((a, b) => compareCheckInsByRole(a, b, rank, true));

    // No longer staffed, so falls back to checked_in_at ordering.
    expect(sorted.map((c) => c.user_id)).toEqual([2, 1]);
  });

  it('falls back to mobile priority, then checked_in_at, within the same rank', () => {
    const rank = buildStaffRoleRank([]);
    const checkIns = [
      { user_id: 1, status: 'checked_in', checked_in_at: '2026-01-01T00:00:00Z' },
      { user_id: 2, status: 'mobile', checked_in_at: '2026-01-01T00:05:00Z' },
      { user_id: 3, status: 'checked_in', checked_in_at: '2026-01-01T00:01:00Z' },
    ];

    const sorted = [...checkIns].sort((a, b) => compareCheckInsByRole(a, b, rank, true));

    expect(sorted.map((c) => c.user_id)).toEqual([2, 1, 3]);
  });

  it('ranks a station with no account by its callsign role, never every guest', () => {
    const roles = mergeStationRoles([], [{ id: 9, callsign: 'kb1jcx', role: 'NCS', assigned_at: '2026-01-01T00:00:00Z' }]);
    const rank = buildStaffRoleRank(roles);
    const checkIns = [
      { user_id: null, callsign: 'W1GUEST', checked_in_at: '2026-01-01T00:00:00Z' },
      { user_id: null, callsign: 'KB1JCX', checked_in_at: '2026-01-01T00:05:00Z' },
      { user_id: 4, callsign: 'W1ACCT', checked_in_at: '2026-01-01T00:01:00Z' },
    ];
    const sorted = [...checkIns].sort((a, b) => compareCheckInsByRole(a, b, rank, true));
    expect(sorted.map((c) => c.callsign)).toEqual(['KB1JCX', 'W1GUEST', 'W1ACCT']);
  });
});
