import { describe, it, expect } from 'vitest';
import { buildStaffRoleRankByUserId, compareCheckInsByRole } from './checkInSort';

describe('checkInSort', () => {
  it('ranks NCS above Logger above Relay above everyone else', () => {
    const netRoles = [
      { user_id: 1, role: 'LOGGER', is_active: true },
      { user_id: 2, role: 'NCS', is_active: true },
      { user_id: 3, role: 'Relay', is_active: true },
    ];
    const rank = buildStaffRoleRankByUserId(netRoles);

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
    const netRoles = [{ user_id: 1, role: 'NCS', is_active: false }];
    const rank = buildStaffRoleRankByUserId(netRoles);

    const checkIns = [
      { user_id: 1, checked_in_at: '2026-01-01T00:05:00Z' },
      { user_id: 2, checked_in_at: '2026-01-01T00:00:00Z' },
    ];

    const sorted = [...checkIns].sort((a, b) => compareCheckInsByRole(a, b, rank, true));

    // No longer staffed, so falls back to checked_in_at ordering.
    expect(sorted.map((c) => c.user_id)).toEqual([2, 1]);
  });

  it('falls back to mobile priority, then checked_in_at, within the same rank', () => {
    const rank = buildStaffRoleRankByUserId([]);
    const checkIns = [
      { user_id: 1, status: 'checked_in', checked_in_at: '2026-01-01T00:00:00Z' },
      { user_id: 2, status: 'mobile', checked_in_at: '2026-01-01T00:05:00Z' },
      { user_id: 3, status: 'checked_in', checked_in_at: '2026-01-01T00:01:00Z' },
    ];

    const sorted = [...checkIns].sort((a, b) => compareCheckInsByRole(a, b, rank, true));

    expect(sorted.map((c) => c.user_id)).toEqual([2, 1, 3]);
  });
});
