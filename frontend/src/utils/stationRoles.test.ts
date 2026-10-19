import { describe, expect, it } from 'vitest';
import { activeNcsRoles, findCheckInRole, mergeStationRoles } from './stationRoles';

describe('stationRoles', () => {
  const roles = mergeStationRoles(
    [
      { id: 1, user_id: 5, role: 'LOGGER', is_active: true, assigned_at: '2026-01-01T00:02:00Z' },
      { id: 2, user_id: 6, role: 'NCS', is_active: false, assigned_at: '2026-01-01T00:00:00Z' },
    ],
    [{ id: 3, callsign: 'kb1jcx', role: 'NCS', assigned_at: '2026-01-01T00:01:00Z' }],
  );

  it('gives a callsign role only to the guest with that callsign', () => {
    expect(findCheckInRole(roles, { user_id: null, callsign: 'KB1JCX' })?.id).toBe(3);
    expect(findCheckInRole(roles, { user_id: null, callsign: 'W1OTHER' })).toBeUndefined();
  });

  it('never gives a callsign role to an account check-in with the same callsign', () => {
    expect(findCheckInRole(roles, { user_id: 9, callsign: 'KB1JCX' })).toBeUndefined();
  });

  it('matches account roles by user id and skips stepped-down ones', () => {
    expect(findCheckInRole(roles, { user_id: 5, callsign: 'W1A' })?.role).toBe('LOGGER');
    expect(findCheckInRole(roles, { user_id: 6, callsign: 'W1B' })).toBeUndefined();
  });

  it('orders active NCS by assignment, both kinds together', () => {
    expect(activeNcsRoles(roles).map(r => r.id)).toEqual([3]);
  });
});
