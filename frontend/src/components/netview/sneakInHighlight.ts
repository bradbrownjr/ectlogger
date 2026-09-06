import { keyframes } from '@mui/system';
import { useEffect, useRef, useState } from 'react';

// ========== SNEAK-IN HIGHLIGHT ==========
// Draws a brief attention flash on a check-in row that a station added to the
// net *itself* through the web app -- as opposed to NCS/Logger typing them in
// by voice -- so staff running the net can notice a new arrival even if they
// weren't watching the table. Requested after the ME Dirigo Net's NCS
// (Brian Wall, 2026-09-06) asked for a way to catch stations who "sneak in"
// on their own while the net is being run largely by voice.
//
// "Self check-in" reuses the exact signal the backend already uses to gate
// NCS/Logger self-grant eligibility (check_ins.py, `current_user.id ==
// linked_user_id`): a CheckInResponse row where `user_id` is set and equals
// `checked_in_by_id`. A staff-entered check-in (NCS/Logger logging a station
// in themselves) always has `checked_in_by_id` pointing at the staff member
// instead, so it's naturally excluded without any extra flag. The viewer's
// own check-in is also excluded -- there's no point flashing "you checked
// in" back at the person who just did it.

export const SNEAK_IN_HIGHLIGHT_MS = 2500;

// Single-shot fade (transparent -> peak -> transparent), not a looping
// shimmer -- the row should settle back to its normal styling once the flash
// has had its moment, matching the "fades in and back out" request. Reuses
// the same yellow accent NetViewHeader.tsx already uses for "needs
// attention" (shimmerYellow), so the hue reads consistently across the app.
export const sneakInFade = keyframes`
  0% { background-color: transparent; }
  15% { background-color: rgba(255, 193, 7, 0.55); }
  100% { background-color: transparent; }
`;

const isSneakInCheckIn = (checkIn: any, viewerUserId: number | undefined) =>
  checkIn.user_id != null &&
  checkIn.user_id === checkIn.checked_in_by_id &&
  checkIn.user_id !== viewerUserId;

// Returns the set of check-in ids currently mid-flash. Diffs each new
// `checkIns` array against the previously-seen id set to find rows that are
// both brand new and a sneak-in; each id auto-clears itself after
// SNEAK_IN_HIGHLIGHT_MS. The very first population of `checkIns` (page load,
// reconnect, or a net switch) is deliberately never flashed -- otherwise
// every already-checked-in station would flash at once on every reload,
// which is exactly the noisy, un-"inobtrusive" behavior this feature is
// supposed to avoid.
export function useSneakInHighlight(checkIns: any[], viewerUserId: number | undefined): Set<number> {
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const knownIds = useRef<Set<number>>(new Set());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const previouslyKnown = knownIds.current;
    const hadBaseline = previouslyKnown.size > 0;
    const nextKnown = new Set<number>();
    const newlyArrived: number[] = [];

    for (const checkIn of checkIns) {
      nextKnown.add(checkIn.id);
      if (hadBaseline && !previouslyKnown.has(checkIn.id) && isSneakInCheckIn(checkIn, viewerUserId)) {
        newlyArrived.push(checkIn.id);
      }
    }
    knownIds.current = nextKnown;

    if (newlyArrived.length === 0) return;

    setHighlightedIds((prev) => {
      const next = new Set(prev);
      newlyArrived.forEach((id) => next.add(id));
      return next;
    });

    newlyArrived.forEach((id) => {
      const existingTimer = timers.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        setHighlightedIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        timers.current.delete(id);
      }, SNEAK_IN_HIGHLIGHT_MS);
      timers.current.set(id, timer);
    });
  }, [checkIns, viewerUserId]);

  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return highlightedIds;
}

// Shared by every check-in table's off-screen "new arrival below the fold"
// arrow: given the table's scroll container and the DOM node for a row that
// just started flashing, true when that row isn't (fully) within the
// container's visible bounds.
export function isRowOutsideView(container: HTMLElement, row: HTMLElement): boolean {
  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  return rowRect.bottom > containerRect.bottom || rowRect.top < containerRect.top;
}
