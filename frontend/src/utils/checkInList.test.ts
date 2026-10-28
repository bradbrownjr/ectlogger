import { describe, expect, it } from 'vitest';
import { withCheckIn } from './checkInList';

describe('withCheckIn', () => {
  it('appends a new check-in', () => {
    expect(withCheckIn([{ id: 1 }], { id: 2 }).map((c) => c.id)).toEqual([1, 2]);
  });

  it('never lists a check-in twice when the re-read got there first', () => {
    const list = [{ id: 1, callsign: 'W1AW' }, { id: 2, callsign: 'N1KWG' }];
    const result = withCheckIn(list, { id: 2, callsign: 'N1KWG' });
    expect(result.map((c) => c.id)).toEqual([1, 2]);
  });
});
