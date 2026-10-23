import { describe, expect, it } from 'vitest';
import { actionLabel, describeChanges, describeDetails } from './activityLog';

describe('activity log wording', () => {
  it('names a known action and falls back to the code for an unknown one', () => {
    expect(actionLabel('net.deleted')).toBe('Net deleted');
    expect(actionLabel('net.someday')).toBe('net.someday');
  });

  it('reads changes as before and after, with empty values marked', () => {
    expect(describeChanges({ changes: { name: [null, 'Owen'], callsigns: [['KC1A'], []] } })).toEqual([
      'name: (empty) → Owen',
      'callsigns: KC1A → (empty)',
    ]);
  });

  it('lists the other details and leaves the changes to describeChanges', () => {
    expect(describeDetails({ changes: { a: [1, 2] }, method: 'password', locked_out: true })).toEqual([
      'method: password',
      'locked out: true',
    ]);
    expect(describeDetails(null)).toEqual([]);
  });
});
