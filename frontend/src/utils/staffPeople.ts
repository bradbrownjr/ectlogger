// ========== PEOPLE ON A SCHEDULE: ACCOUNTS AND CALLSIGN-ONLY OPERATORS ==========
// A schedule's staff list, rotation, swaps and 5th-week pick can name an
// operator who has no account yet, by callsign alone (the backend's
// services/callsign_people.py). Those rows have `user_id: null`, so any code
// that matches two rows by user_id alone would treat every callsign-only
// operator as the same person. Everything that compares, lists or sends a
// person goes through here instead.

export interface SchedulePerson {
  /** Stable identity: "u:<user id>" for an account, "c:<callsign>" otherwise. */
  key: string;
  user_id: number | null;
  callsign: string;
  name: string | null;
  has_account: boolean;
}

interface PersonRow {
  user_id: number | null;
  user_callsign?: string | null;
  callsign?: string | null;
  user_name?: string | null;
  name?: string | null;
}

export function personKey(userId: number | null | undefined, callsign: string | null | undefined): string {
  return userId != null ? `u:${userId}` : `c:${(callsign || '').toUpperCase()}`;
}

/** A staff, rotation or schedule row as a SchedulePerson. */
export function toPerson(row: PersonRow): SchedulePerson {
  const callsign = (row.user_callsign ?? row.callsign ?? '').toUpperCase();
  return {
    key: personKey(row.user_id, callsign),
    user_id: row.user_id,
    callsign,
    name: row.user_name ?? row.name ?? null,
    has_account: row.user_id != null,
  };
}

/** A user from the directory (always an account) as a SchedulePerson. */
export function userToPerson(user: { id: number; callsign: string; name?: string | null }): SchedulePerson {
  return toPerson({ user_id: user.id, callsign: user.callsign, name: user.name ?? null });
}

/** Whether two rows name the same operator (account by id, else callsign). */
export function samePerson(a: PersonRow, b: PersonRow): boolean {
  return personKey(a.user_id, a.user_callsign ?? a.callsign) === personKey(b.user_id, b.user_callsign ?? b.callsign);
}

/** The request body fields that name this person: `{user_id}` or `{callsign}`. */
export function personPayload(person: SchedulePerson): { user_id: number } | { callsign: string } {
  return person.user_id != null ? { user_id: person.user_id } : { callsign: person.callsign };
}

/** De-duplicated by key, first occurrence wins. */
export function uniquePeople(people: SchedulePerson[]): SchedulePerson[] {
  const seen = new Set<string>();
  return people.filter(p => (seen.has(p.key) ? false : (seen.add(p.key), true)));
}

export function personLabel(person: SchedulePerson): string {
  const base = person.name ? `${person.callsign} (${person.name})` : person.callsign;
  return person.has_account ? base : `${base} - no account yet`;
}

/**
 * Same rule as the backend's normalize_callsign: letters, digits and slashes,
 * 3-20 characters, at least one letter and one digit, no leading or trailing
 * slash. Returns the upper-cased callsign, or null when it isn't one.
 */
export function asCallsign(text: string | null | undefined): string | null {
  const callsign = (text || '').trim().toUpperCase();
  if (!/^[A-Z0-9/]{3,20}$/.test(callsign)) return null;
  if (!/[A-Z]/.test(callsign) || !/\d/.test(callsign)) return null;
  if (callsign.startsWith('/') || callsign.endsWith('/')) return null;
  return callsign;
}
