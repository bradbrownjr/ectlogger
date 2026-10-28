// ========== FINISHING A NET'S LOG ==========
// A net can close without its log being sent ("finish the log later",
// POST /nets/{id}/close with hold_log). Until net control sends it
// (POST /nets/{id}/send-log) the server keeps log_held_since set: net control
// can still add and fix check-ins, chat is closed, the report is a draft and
// the net can't be archived. These rules are the app's copy of that.

interface NetLogState {
  status?: string;
  log_held_since?: string | null;
}

/** Closed, with its log still waiting to be sent. */
export const isLogHeld = (net: NetLogState | null | undefined): boolean =>
  net?.status === 'closed' && !!net?.log_held_since;

/**
 * Net control can still work on the log: the net is running, or it closed to
 * finish its log. Gates the check-in form, Bulk add and coverage entry.
 */
export const isLogOpen = (net: NetLogState | null | undefined): boolean =>
  net?.status === 'active' || net?.status === 'lobby' || isLogHeld(net);

/** Archive is offered on a closed net whose log has gone out. */
export const canArchiveNet = (net: NetLogState | null | undefined): boolean =>
  net?.status === 'closed' && !net?.log_held_since;

/** The "Keep chat open after closing" window, which a held log doesn't get. */
export const chatGraceMinutes = (
  net: (NetLogState & { chat_grace_period_minutes?: number | null }) | null | undefined,
): number | undefined => (isLogHeld(net) ? undefined : net?.chat_grace_period_minutes ?? undefined);

/** The note on a held net's page, report and statistics, after "Draft copy". */
export const DRAFT_LOG_NOTICE =
  "This net's log may change before net control approves and sends it.";

// ========== WHO RAN THE NET ==========
// The server credits an NCS on an ended net only if they took part
// (backend services/ncs_attribution.py), and closing or sending a held log
// asks who ran it when that leaves nobody (GET /nets/{id}/ncs-needed).

/** The server's refusal when a close or send needs to say who ran the net. */
export const NCS_NEEDED_DETAIL = 'Choose who ran this net before closing it or sending its log.';

/** What an ended net with no credited NCS shows, as the ICS-309 and email do. */
export const NCS_NOT_RECORDED = 'Not recorded';

/**
 * The NCS line for a net's report: its credited callsigns, "Not recorded"
 * once it has ended without one, and null while it hasn't.
 */
export const ncsCreditLine = (
  net: (NetLogState & { ncs_callsign?: string | null }) | null | undefined,
): string | null => {
  if (net?.ncs_callsign) return net.ncs_callsign;
  return net?.status === 'closed' || net?.status === 'archived' ? NCS_NOT_RECORDED : null;
};

/** One choice per station in the check-in list, for "Who ran this net?". */
export const whoRanChoices = <T extends { id: number; callsign: string; name?: string | null }>(
  checkIns: T[],
): T[] => {
  const seen = new Set<string>();
  return checkIns.filter((c) => {
    const key = (c.callsign || '').toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
