import { describe, expect, it } from 'vitest';
import { checkInTimeText, heldLogTimeToIso, TIME_NOT_RECORDED } from './netLog';

// Net 137, the 2026-10-24 SET: 11:00 to 16:40 UTC.
const set = { started_at: '2026-10-24T11:00:00', closed_at: '2026-10-24T16:40:00' };
// A net running past midnight UTC.
const late = { started_at: '2026-10-24T22:00:00', closed_at: '2026-10-25T01:00:00' };

describe('heldLogTimeToIso', () => {
  it('puts a time on the net\'s own day', () => {
    expect(heldLogTimeToIso('12:15', set, true)).toBe('2026-10-24T12:15:00.000Z');
  });

  it('reads a time across midnight as the right evening or morning', () => {
    expect(heldLogTimeToIso('23:30', late, true)).toBe('2026-10-24T23:30:00.000Z');
    expect(heldLogTimeToIso('00:30', late, true)).toBe('2026-10-25T00:30:00.000Z');
  });

  it('gives nothing for a blank or malformed time', () => {
    expect(heldLogTimeToIso('', set, true)).toBeNull();
    expect(heldLogTimeToIso('25:00', set, true)).toBeNull();
    expect(heldLogTimeToIso('noon', set, true)).toBeNull();
  });

  it('gives nothing for a net that has not closed', () => {
    expect(heldLogTimeToIso('12:15', { started_at: set.started_at }, true)).toBeNull();
  });
});

describe('checkInTimeText', () => {
  it('says Not recorded in place of the time', () => {
    const format = (value: string) => `at ${value}`;
    expect(checkInTimeText({ checked_in_at: 'x', time_not_recorded: true }, format)).toBe(TIME_NOT_RECORDED);
    expect(checkInTimeText({ checked_in_at: 'x' }, format)).toBe('at x');
  });
});
