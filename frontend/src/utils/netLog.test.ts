import { describe, expect, it } from 'vitest';
import { canArchiveNet, chatGraceMinutes, isLogHeld, isLogOpen } from './netLog';

const held = { status: 'closed', log_held_since: '2026-10-24T18:00:00', chat_grace_period_minutes: 30 };
const sent = { status: 'closed', log_held_since: null, chat_grace_period_minutes: 30 };

describe('netLog', () => {
  it('treats a closed net with a held log as still open to net control', () => {
    expect(isLogHeld(held)).toBe(true);
    expect(isLogOpen(held)).toBe(true);
    expect(isLogOpen(sent)).toBe(false);
    expect(isLogOpen({ status: 'active' })).toBe(true);
    expect(isLogOpen({ status: 'archived' })).toBe(false);
  });

  it('holds archive until the log is sent', () => {
    expect(canArchiveNet(held)).toBe(false);
    expect(canArchiveNet(sent)).toBe(true);
    expect(canArchiveNet({ status: 'active' })).toBe(false);
  });

  it('gives a held net no chat grace window', () => {
    expect(chatGraceMinutes(held)).toBeUndefined();
    expect(chatGraceMinutes(sent)).toBe(30);
  });
});
