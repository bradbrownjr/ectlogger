// ========== ADMIN MODE (pure helpers) ==========
// Backend app/admin_mode.py holds the rule; these only describe it to the user.

// Matches app.admin_mode.ADMIN_MODE_IDLE_MINUTES. Shown in the code prompt.
export const ADMIN_MODE_IDLE_MINUTES = 15;

/** Whole minutes left before admin mode closes, rounded up, never below 0. */
export function adminMinutesLeft(closesAt: Date | null, now: Date = new Date()): number {
  if (!closesAt) return 0;
  return Math.max(0, Math.ceil((closesAt.getTime() - now.getTime()) / 60000));
}
