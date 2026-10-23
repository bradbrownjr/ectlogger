import { describe, it, expect, vi, beforeEach } from 'vitest';

// The api module is mocked wholesale: getCheckInActions is a plain factory
// (not a hook), so the handlers can be exercised directly with injected deps.
vi.mock('../../services/api', () => ({
  default: { delete: vi.fn(), post: vi.fn(), get: vi.fn() },
  checkInApi: { update: vi.fn(), create: vi.fn(), delete: vi.fn(), toggleHand: vi.fn(), list: vi.fn() },
  netApi: { setActiveFrequency: vi.fn() },
  netBlockApi: { block: vi.fn(), list: vi.fn(), unblock: vi.fn() },
  netRoleApi: { claimFrequency: vi.fn() },
  callsignRoleApi: { assign: vi.fn(), remove: vi.fn(), list: vi.fn() },
  userApi: { lookupByCallsign: vi.fn() },
}));

import { getCheckInActions } from './checkInActions';
import { callsignRoleApi, checkInApi, netBlockApi, userApi } from '../../services/api';

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
    lookupFilledRef: { current: {} },
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
    askDelete: vi.fn(async () => 'delete'),
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

  it('credits a station without an account by callsign', async () => {
    (callsignRoleApi.assign as any).mockResolvedValue({ data: {} });
    (checkInApi.update as any).mockResolvedValue({ data: { ...ROW } });
    const h = harness([{ ...ROW, user_id: null }]);
    await h.actions.handleStatusChange(7, 'ncs');

    expect(callsignRoleApi.assign).toHaveBeenCalledWith(1, 'N1KWG', 'NCS');
    expect(checkInApi.update).toHaveBeenCalledWith(7, { status: 'checked_in' });
    expect(h.toasts).toEqual([]);
  });

  it("never treats one guest's callsign role as another guest's", async () => {
    (checkInApi.update as any).mockResolvedValue({ data: { ...ROW, status: 'away' } });
    const otherGuestsRole = { id: 3, role: 'NCS', callsign: 'W1OTHER', callsign_only: true, user_id: null, assigned_at: '' };
    const h = harness([{ ...ROW, user_id: null }], {
      netRoles: [otherGuestsRole],
      net: { status: 'active', frequencies: [], actions: { manage_roles: true } },
    });
    await h.actions.handleStatusChange(7, 'away');

    expect(callsignRoleApi.remove).not.toHaveBeenCalled();
  });

  it("removes a guest's own callsign role when staff pick a plain status", async () => {
    (checkInApi.update as any).mockResolvedValue({ data: { ...ROW, status: 'away' } });
    const ownRole = { id: 4, role: 'NCS', callsign: 'N1KWG', callsign_only: true, user_id: null, assigned_at: '' };
    const h = harness([{ ...ROW, user_id: null }], {
      netRoles: [ownRole],
      net: { status: 'active', frequencies: [], actions: { manage_roles: true } },
    });
    await h.actions.handleStatusChange(7, 'away');

    expect(callsignRoleApi.remove).toHaveBeenCalledWith(1, 4);
  });
});


// ========== CALLSIGN LOOKUP ==========
// Drives handleCallsignLookup against a form held here, the way NetView's
// setCheckInForm updater would, to check what the NCS ends up looking at.
describe('handleCallsignLookup', () => {
  const SHOWN = { name: { enabled: true }, location: { enabled: true }, skywarn_number: { enabled: false } };

  function lookupHarness(initialForm: any) {
    let form = initialForm;
    const lookupFilledRef = { current: {} };
    const { actions } = harness([], {
      net: { status: 'active', frequencies: [], field_config: SHOWN },
      lookupFilledRef,
      setCheckInForm: (updater: any) => { form = typeof updater === 'function' ? updater(form) : updater; },
    });
    return { actions, formNow: () => form, setForm: (f: any) => { form = f; } };
  }

  const found = (data: any) => (userApi.lookupByCallsign as any).mockResolvedValueOnce({ data });

  beforeEach(() => { vi.clearAllMocks(); });

  it('never fills a field the net does not show', async () => {
    const h = lookupHarness({ callsign: 'NB9D', name: '', location: '', skywarn_number: '' });
    found({ name: 'Neil', location: 'NH', skywarn_number: 'YOUTUBE.COM/@NB9D' });
    await h.actions.handleCallsignLookup('NB9D');
    expect(h.formNow()).toMatchObject({ name: 'Neil', location: 'NH', skywarn_number: '' });
  });

  it("replaces the previous station's filled-in values when the callsign changes", async () => {
    const h = lookupHarness({ callsign: 'N1AAA', name: '', location: '', skywarn_number: '' });
    found({ name: 'Bob', location: 'Gray, ME' });
    await h.actions.handleCallsignLookup('N1AAA');
    found({ name: 'Carol', location: 'Windham, ME' });
    await h.actions.handleCallsignLookup('N1BBB');
    expect(h.formNow()).toMatchObject({ name: 'Carol', location: 'Windham, ME' });
  });

  it('clears them when the corrected callsign has no profile', async () => {
    const h = lookupHarness({ callsign: 'N1AAA', name: '', location: '', skywarn_number: '' });
    found({ name: 'Bob', location: 'Gray, ME' });
    await h.actions.handleCallsignLookup('N1AAA');
    found({});
    await h.actions.handleCallsignLookup('N1BBB');
    expect(h.formNow()).toMatchObject({ name: '', location: '' });
  });

  it('keeps anything net control typed by hand', async () => {
    const h = lookupHarness({ callsign: 'N1AAA', name: '', location: '', skywarn_number: '' });
    found({ name: 'Bob', location: 'Gray, ME' });
    await h.actions.handleCallsignLookup('N1AAA');
    h.setForm({ ...h.formNow(), location: 'Mobile on Route 302' });
    found({ name: 'Carol', location: 'Windham, ME' });
    await h.actions.handleCallsignLookup('N1BBB');
    expect(h.formNow()).toMatchObject({ name: 'Carol', location: 'Mobile on Route 302' });
  });
});

// ========== INLINE SITE CORRECTION ==========
// The Site cell saves with the rest of the row, but only when the place
// changed: an ordinary edit (a misheard name) must never rewrite the site.
describe('handleSaveInlineEdit — Site', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const AT_SHELTER = { id: 7, callsign: 'KC1HILL', status: 'checked_in', coverage_site_id: 2, operating_position: 'Naples Shelter', location: 'Naples Shelter, Naples, ME' };
  const editing = (values: any) => harness([{ ...AT_SHELTER }], {
    inlineEditingId: 7,
    inlineEditValues: { callsign: 'KC1HILL', name: '', location: AT_SHELTER.location, coverage_site_id: 2, operating_position: 'Naples Shelter', status: 'checked_in', ...values },
  });

  it('sends a corrected site', async () => {
    (checkInApi.update as any).mockResolvedValue({ data: { ...AT_SHELTER, coverage_site_id: 1 } });
    await editing({ coverage_site_id: 1, operating_position: 'Windham EMA' }).actions.handleSaveInlineEdit();
    expect((checkInApi.update as any).mock.calls[0][1]).toMatchObject({ coverage_site_id: 1, operating_position: 'Windham EMA' });
    expect((checkInApi.update as any).mock.calls[0][1]).not.toHaveProperty('status');
  });

  it('leaves the site alone on an ordinary edit', async () => {
    (checkInApi.update as any).mockResolvedValue({ data: AT_SHELTER });
    await editing({ name: 'Priya' }).actions.handleSaveInlineEdit();
    const sent = (checkInApi.update as any).mock.calls[0][1];
    expect(sent).not.toHaveProperty('coverage_site_id');
    expect(sent).not.toHaveProperty('operating_position');
  });

  it('Traveling sends the Mobile status with it', async () => {
    (checkInApi.update as any).mockResolvedValue({ data: { ...AT_SHELTER, status: 'mobile' } });
    await editing({ coverage_site_id: null, operating_position: '', status: 'mobile' }).actions.handleSaveInlineEdit();
    expect((checkInApi.update as any).mock.calls[0][1]).toMatchObject({ status: 'mobile', coverage_site_id: null });
  });
});

// ========== Delete, and Remove and block ==========
// The prompt's answer decides: nothing, one row deleted, or every row under
// the callsign removed and the station blocked.
describe('handleDeleteCheckIn', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const ROWS = [
    { id: 1, callsign: 'NB9D', status: 'checked_out' },
    { id: 2, callsign: 'nb9d', status: 'checked_in' },
    { id: 3, callsign: 'KC1HILL', status: 'checked_in' },
  ];

  it('does nothing when cancelled', async () => {
    const h = harness(ROWS, { askDelete: vi.fn(async () => null) });
    await h.actions.handleDeleteCheckIn(2);
    expect(checkInApi.delete).not.toHaveBeenCalled();
    expect(h.rowsNow()).toHaveLength(3);
  });

  it('deletes only that row', async () => {
    (checkInApi.delete as any).mockResolvedValue({});
    const h = harness(ROWS, { askDelete: vi.fn(async () => 'delete') });
    await h.actions.handleDeleteCheckIn(2);
    expect(h.rowsNow().map((r: any) => r.id)).toEqual([1, 3]);
  });

  it('remove and block drops every row under the callsign', async () => {
    (netBlockApi.block as any).mockResolvedValue({ data: {} });
    const h = harness(ROWS, { askDelete: vi.fn(async () => 'block') });
    await h.actions.handleDeleteCheckIn(2);
    expect(netBlockApi.block).toHaveBeenCalledWith(1, 2);
    expect(h.rowsNow().map((r: any) => r.id)).toEqual([3]);
    expect(checkInApi.delete).not.toHaveBeenCalled();
  });
});
