import { describe, it, expect } from 'vitest';
import {
  getCheckInMarkerColor,
  getMarkerRoleIds,
  buildMarkerLegend,
  STATION_STATUS_MARKER_COLORS,
  NET_ROLE_MARKER_COLORS,
} from './checkInMarkers';

describe('getMarkerRoleIds', () => {
  it('matches the uppercase role names the API actually returns', () => {
    const roles = getMarkerRoleIds([
      { user_id: 1, role: 'NCS', is_active: true },
      { user_id: 2, role: 'LOGGER', is_active: true },
      // Regression: the hand-rolled copy in NetView tested `=== 'Relay'`, so a
      // relay station was never colored and its legend entry never appeared.
      { user_id: 3, role: 'RELAY', is_active: true },
    ]);
    expect(roles).toEqual({ ncsUserIds: [1], loggerUserIds: [2], relayUserIds: [3] });
  });

  it('drops a role someone has stepped down from', () => {
    const roles = getMarkerRoleIds([
      { user_id: 1, role: 'NCS', is_active: false },
      { user_id: 2, role: 'NCS', is_active: true },
    ]);
    expect(roles.ncsUserIds).toEqual([2]);
  });
});

describe('getCheckInMarkerColor', () => {
  it('colors by status in either casing', () => {
    // The API serializes lowercase; the database stores the uppercase names.
    expect(getCheckInMarkerColor({ status: 'listening' }))
      .toBe(STATION_STATUS_MARKER_COLORS.listening);
    expect(getCheckInMarkerColor({ status: 'LISTENING' }))
      .toBe(STATION_STATUS_MARKER_COLORS.listening);
  });

  it('gives a checked-out station its own color, not the checked-in one', () => {
    expect(getCheckInMarkerColor({ status: 'checked_out' }))
      .not.toBe(STATION_STATUS_MARKER_COLORS.checked_in);
  });

  it('lets a role outrank status', () => {
    const roles = getMarkerRoleIds([{ user_id: 7, role: 'NCS', is_active: true }]);
    expect(getCheckInMarkerColor({ status: 'checked_in', user_id: 7 }, roles))
      .toBe(NET_ROLE_MARKER_COLORS.NCS);
  });

  it('ignores roles when the caller supplies none (report/statistics guests)', () => {
    expect(getCheckInMarkerColor({ status: 'checked_in', user_id: 7 }))
      .toBe(STATION_STATUS_MARKER_COLORS.checked_in);
  });
});

describe('buildMarkerLegend', () => {
  const label = (s: string) => s;

  it('lists only what is on the map', () => {
    const entries = buildMarkerLegend(
      [{ status: 'checked_in' }, { status: 'checked_out' }, { status: 'checked_in' }],
      undefined,
      label
    );
    expect(entries.map(e => e.label)).toEqual(['checked_in', 'checked_out']);
  });

  it('lists a role once its holder is actually checked in, and not their status', () => {
    const roles = getMarkerRoleIds([{ user_id: 7, role: 'NCS', is_active: true }]);
    const entries = buildMarkerLegend(
      [{ status: 'checked_in', user_id: 7 }, { status: 'listening' }],
      roles,
      label
    );
    expect(entries.map(e => e.label)).toEqual(['NCS', 'listening']);
  });

  it('omits a role nobody on this map holds', () => {
    const roles = getMarkerRoleIds([{ user_id: 99, role: 'LOGGER', is_active: true }]);
    const entries = buildMarkerLegend([{ status: 'checked_in', user_id: 7 }], roles, label);
    expect(entries.map(e => e.label)).toEqual(['checked_in']);
  });
});
