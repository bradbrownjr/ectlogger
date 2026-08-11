import { describe, it, expect, vi, beforeEach } from 'vitest';

// The api module is mocked wholesale: getCheckInActions is a plain factory
// (not a hook), so the handlers can be exercised directly with injected deps.
vi.mock('../../services/api', () => ({
  default: { delete: vi.fn(), post: vi.fn(), get: vi.fn() },
  checkInApi: { update: vi.fn(), create: vi.fn(), delete: vi.fn(), toggleHand: vi.fn(), list: vi.fn() },
  netApi: { setActiveFrequency: vi.fn() },
  netRoleApi: { claimFrequency: vi.fn() },
  userApi: { lookupByCallsign: vi.fn() },
}));

import { getCheckInActions } from './checkInActions';
import { checkInApi } from '../../services/api';

// ========== TEST HARNESS ==========
// Mirrors NetView's state wiring closely enough to observe what the operator
// would see: `rows` is the rendered check-in list, and setCheckIns applies
// updaters to it exactly as React would.
function harness(initialRows: any[], overrides: any = {}) {
  let rows = initialRows;
  const toasts: string[] = [];

  const actions = getCheckInActions({
    netId: '1',
    net: { status: 'active', frequencies: [] },
    get checkIns() { return rows; },
    netRoles: [],
    user: { id: 99 },
    isOwner: false,
    isAdmin: false,
    owner: null,
    canManageCheckIns: true,
    userNetRole: null,
    ws: null,
    checkInForm: {},
    inlineEditingId: null,
    inlineEditValues: {},
    activeSpeakerId: null,
    inlineEditRowRef: { current: null },
    setCheckInForm: vi.fn(),
    setToastMessage: (m: string) => { toasts.push(m); },
    setInlineEditingId: vi.fn(),
    setInlineEditFocusField: vi.fn(),
    setInlineEditValues: vi.fn(),
    setCheckIns: (updater: any) => { rows = updater(rows); },
    setActiveSpeakerId: vi.fn(),
    setNet: vi.fn(),
    setFilteredFrequencyIds: vi.fn(),
    fetchCheckIns: vi.fn(async () => {}),
    fetchNetRoles: vi.fn(async () => {}),
    fetchPollResponses: vi.fn(async () => {}),
    ...overrides,
  } as any);

  return { actions, toasts, statusOf: (id: number) => rows.find((r: any) => r.id === id)?.status, rowsNow: () => rows };
}

const ROW = { id: 7, callsign: 'N1KWG', status: 'checked_in', user_id: null };

describe('handleStatusChange — optimistic update', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('paints the new status before the server responds', async () => {
    // A deferred response lets us inspect the row mid-flight, which is exactly
    // the window the operator used to spend staring at the old icon.
    let resolveUpdate: (v: any) => void = () => {};
    (checkInApi.update as any).mockReturnValue(new Promise(res => { resolveUpdate = res; }));

    const h = harness([{ ...ROW }]);
    const pending = h.actions.handleStatusChange(7, 'away');

    expect(h.statusOf(7)).toBe('away'); // visible immediately, no await

    resolveUpdate({ data: { ...ROW, status: 'away' } });
    await pending;
    expect(h.statusOf(7)).toBe('away');
  });

  it('replaces the row with the server\'s authoritative response on success', async () => {
    (checkInApi.update as any).mockResolvedValue({
      data: { ...ROW, status: 'away', notes: 'set by server' },
    });

    const h = harness([{ ...ROW }]);
    await h.actions.handleStatusChange(7, 'away');

    expect(h.rowsNow()[0].notes).toBe('set by server');
    // One write, and no full-list re-read.
    expect(checkInApi.update).toHaveBeenCalledTimes(1);
    expect(checkInApi.list).not.toHaveBeenCalled();
  });

  it('rolls back to the previous status when the write fails', async () => {
    (checkInApi.update as any).mockRejectedValue({ response: { data: { detail: 'Permission denied' } } });

    const h = harness([{ ...ROW, status: 'checked_in' }]);
    await h.actions.handleStatusChange(7, 'away');

    expect(h.statusOf(7)).toBe('checked_in');
    expect(h.toasts.join(' ')).toContain('Permission denied');
  });

  it('leaves other rows untouched while one row changes', async () => {
    (checkInApi.update as any).mockResolvedValue({ data: { ...ROW, status: 'away' } });

    const other = { id: 8, callsign: 'KC1JMH', status: 'listening', user_id: 99 };
    const h = harness([{ ...ROW }, other]);
    await h.actions.handleStatusChange(7, 'away');

    expect(h.statusOf(8)).toBe('listening');
    expect(h.rowsNow().map((r: any) => r.id)).toEqual([7, 8]); // order preserved
  });

  it('does not optimistically update a role assignment', async () => {
    // Role changes mutate netRoles too, so they intentionally keep the
    // server-confirmed path -- nothing should change before the write lands.
    let resolveUpdate: (v: any) => void = () => {};
    (checkInApi.update as any).mockReturnValue(new Promise(res => { resolveUpdate = res; }));

    const h = harness([{ ...ROW, user_id: 42 }]);
    const pending = h.actions.handleStatusChange(7, 'ncs');

    expect(h.statusOf(7)).toBe('checked_in'); // unchanged mid-flight

    resolveUpdate({ data: { ...ROW, user_id: 42, status: 'checked_in' } });
    await pending;
  });

  it('reports that a station without an account cannot take a role', async () => {
    const h = harness([{ ...ROW, user_id: null }]);
    await h.actions.handleStatusChange(7, 'ncs');

    expect(checkInApi.update).not.toHaveBeenCalled();
    expect(h.toasts.join(' ')).toContain('without user accounts');
  });
});
