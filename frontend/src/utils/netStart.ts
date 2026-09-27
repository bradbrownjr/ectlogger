// ========== OPEN LOBBY / START NET ==========
// Which of the two pre-start buttons a draft or scheduled net offers, shared by
// the net toolbar (NetViewHeader.tsx) and the Dashboard card and list views.
//
// Until 2026-09-27 there was one "Start net" button, and the server decided
// from the clock whether it opened the lobby or started the net. Now each
// button does exactly what it says, and these rules decide when Open lobby is
// worth offering and when Start net is early enough to double-check.

interface StartTiming {
  scheduled_start_time?: string | null;
  auto_lobby_minutes?: number | null;
}

// Backend times are UTC without a 'Z' suffix.
const scheduledMs = (net: StartTiming): number | null => {
  const s = net.scheduled_start_time;
  if (!s) return null;
  return new Date(s.endsWith('Z') ? s : s + 'Z').getTime();
};

/** Start net would begin the net before its scheduled start time. */
export const isBeforeScheduledStart = (net: StartTiming, now: number = Date.now()): boolean => {
  const start = scheduledMs(net);
  return start !== null && now < start;
};

/**
 * Offer Open lobby: before the scheduled start time, or, for a net with no
 * start time (Ad-Hoc, or a one-time net left without one), when its lobby
 * setting is on.
 */
export const canOpenLobby = (net: StartTiming, now: number = Date.now()): boolean =>
  scheduledMs(net) === null ? net.auto_lobby_minutes != null : isBeforeScheduledStart(net, now);
