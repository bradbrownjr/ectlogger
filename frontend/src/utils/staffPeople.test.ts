import { describe, expect, it } from 'vitest';
import { asCallsign, personKey, personPayload, samePerson, toPerson, uniquePeople, userToPerson } from './staffPeople';

describe('staffPeople', () => {
  it('keys accounts by id and callsign-only operators by callsign', () => {
    expect(personKey(5, 'KC1OWN')).toBe('u:5');
    expect(personKey(null, 'kb1jcx')).toBe('c:KB1JCX');
  });

  it('never treats two callsign-only operators as the same person', () => {
    // The bug this module exists to prevent: user_id null === null.
    const a = { user_id: null, user_callsign: 'KB1AAA' };
    const b = { user_id: null, user_callsign: 'KB1BBB' };
    expect(samePerson(a, b)).toBe(false);
    expect(samePerson(a, { user_id: null, user_callsign: 'kb1aaa' })).toBe(true);
  });

  it('matches an account by id regardless of callsign', () => {
    expect(samePerson({ user_id: 3, user_callsign: 'W1AAA' }, { user_id: 3, user_callsign: 'W1BBB' })).toBe(true);
    expect(samePerson({ user_id: 3, user_callsign: 'W1AAA' }, { user_id: null, user_callsign: 'W1AAA' })).toBe(false);
  });

  it('builds the request body for either kind', () => {
    expect(personPayload(toPerson({ user_id: 7, user_callsign: 'W1A' }))).toEqual({ user_id: 7 });
    expect(personPayload(toPerson({ user_id: null, user_callsign: 'kb1jcx' }))).toEqual({ callsign: 'KB1JCX' });
    expect(personPayload(userToPerson({ id: 9, callsign: 'W1D', name: 'Dee' }))).toEqual({ user_id: 9 });
  });

  it('de-duplicates by identity', () => {
    const people = [
      toPerson({ user_id: 1, user_callsign: 'W1A' }),
      toPerson({ user_id: null, user_callsign: 'KB1X' }),
      toPerson({ user_id: 1, user_callsign: 'W1A' }),
      toPerson({ user_id: null, user_callsign: 'KB1Y' }),
    ];
    expect(uniquePeople(people).map(p => p.key)).toEqual(['u:1', 'c:KB1X', 'c:KB1Y']);
  });

  it('accepts callsigns the backend accepts and nothing else', () => {
    expect(asCallsign(' w1aw/m ')).toBe('W1AW/M');
    expect(asCallsign('VE3/K1ABC')).toBe('VE3/K1ABC');
    expect(asCallsign('wrop123')).toBe('WROP123');
    for (const bad of ['KENG', '12345', '<b>', 'K1 AB', '/K1AB', 'K1AB/', 'K1', '']) {
      expect(asCallsign(bad)).toBeNull();
    }
  });
});
