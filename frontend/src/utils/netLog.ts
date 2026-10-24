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
