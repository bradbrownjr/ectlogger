import { describe, expect, it } from 'vitest';
import { canOpenLobby, isBeforeScheduledStart } from './netStart';

const NOW = Date.parse('2026-09-27T12:00:00Z');
// Backend sends UTC with no 'Z' suffix.
const inAnHour = '2026-09-27T13:00:00';
const anHourAgo = '2026-09-27T11:00:00';

describe('netStart', () => {
  it('offers Open lobby only before the scheduled start', () => {
    expect(canOpenLobby({ scheduled_start_time: inAnHour }, NOW)).toBe(true);
    expect(canOpenLobby({ scheduled_start_time: anHourAgo }, NOW)).toBe(false);
  });

  it('reads a start time with no Z as UTC', () => {
    expect(isBeforeScheduledStart({ scheduled_start_time: '2026-09-27T12:30:00' }, NOW)).toBe(true);
  });

  it('with no start time, follows the lobby setting', () => {
    expect(canOpenLobby({ auto_lobby_minutes: 0 }, NOW)).toBe(true);
    expect(canOpenLobby({ auto_lobby_minutes: null }, NOW)).toBe(false);
    expect(canOpenLobby({}, NOW)).toBe(false);
  });

  it('never calls a net with no start time early', () => {
    expect(isBeforeScheduledStart({ auto_lobby_minutes: 0 }, NOW)).toBe(false);
  });
});
