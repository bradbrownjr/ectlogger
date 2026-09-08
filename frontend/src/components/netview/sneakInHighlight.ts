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

// Shared by the off-screen arrival indicator below: given the table's scroll
// container and the DOM node for a row, which direction (if any) the reader
// would need to scroll to bring that row into view.
export function getOffscreenDirection(container: HTMLElement, row: HTMLElement): 'above' | 'below' | null {
  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  if (rowRect.top < containerRect.top) return 'above';
  if (rowRect.bottom > containerRect.bottom) return 'below';
  return null;
}

// How long an unacknowledged off-screen arrival stays announced before it
// auto-dismisses on its own. This is a fallback only -- the primary
// dismissal is an IntersectionObserver noticing the row has actually scrolled
// into view (see useOffscreenArrivalIndicator below), which is the real
// "the operator has now seen it" signal. A timer alone would clear the arrow
// on a fixed schedule regardless of whether anyone looked; kept here only so
// a row that's scrolled to some other way (net closes, list re-sorts out from
// under it) doesn't leave the indicator stuck.
const OFFSCREEN_ARRIVAL_TIMEOUT_MS = 8000;

export interface OffscreenArrivalIndicator {
  visible: boolean;
  direction: 'above' | 'below';
  onClick: () => void;
}

// Drives the small floating button that says "a self check-in just landed
// outside the visible area of this table". Deliberately does NOT reuse
// `highlightedCheckInIds`'s own lifetime for the indicator's visibility --
// that set expires each id on its own independent timer (see
// useSneakInHighlight above), and an earlier version that keyed the arrow's
// dismissal timer directly off changes to that set had its timer cancelled
// by React's cleanup every time an id expired, with no replacement
// scheduled, so the arrow never disappeared again for the life of the page.
// This hook tracks its own `pending` arrivals, independent per-id timers,
// and an IntersectionObserver-based dismissal, so shrinking the highlight
// set elsewhere can't cancel an indicator that's still owed a dismissal.
export function useOffscreenArrivalIndicator<T extends HTMLElement>(
  containerRef: React.RefObject<HTMLElement>,
  rowElRefs: React.MutableRefObject<Map<number, T>>,
  highlightedCheckInIds: Set<number> | undefined,
): OffscreenArrivalIndicator {
  const [pending, setPending] = useState<Array<{ id: number; direction: 'above' | 'below' }>>([]);
  const seenRef = useRef<Set<number>>(new Set());
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const dismiss = (id: number) => {
    setPending((prev) => (prev.some((p) => p.id === id) ? prev.filter((p) => p.id !== id) : prev));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    const el = rowElRefs.current.get(id);
    if (el) observerRef.current?.unobserve(el);
  };

  useEffect(() => {
    const container = containerRef.current;
    const current = highlightedCheckInIds ?? new Set<number>();
    const justArrived: number[] = [];
    current.forEach((id) => {
      if (!seenRef.current.has(id)) {
        seenRef.current.add(id);
        justArrived.push(id);
      }
    });
    if (!container || justArrived.length === 0) return;

    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const idAttr = (entry.target as HTMLElement).dataset.arrivalRowId;
            const id = idAttr ? Number(idAttr) : NaN;
            if (!Number.isNaN(id)) dismiss(id);
          });
        },
        { root: container, threshold: 0.95 },
      );
    }

    justArrived.forEach((id) => {
      const rowEl = rowElRefs.current.get(id);
      const direction = rowEl ? getOffscreenDirection(container, rowEl) : 'below';
      if (!direction) return; // already visible -- nothing to announce
      setPending((prev) => [...prev, { id, direction }]);
      if (rowEl) {
        rowEl.dataset.arrivalRowId = String(id);
        observerRef.current!.observe(rowEl);
      }
      const timer = setTimeout(() => dismiss(id), OFFSCREEN_ARRIVAL_TIMEOUT_MS);
      timersRef.current.set(id, timer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedCheckInIds]);

  useEffect(() => {
    const timersMap = timersRef.current;
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer));
      // Read fresh at cleanup time, not captured at mount: the observer is
      // created lazily (on the first off-screen arrival), well after this
      // effect's setup already ran.
      observerRef.current?.disconnect();
    };
  }, []);

  const latest = pending[pending.length - 1];
  return {
    visible: !!latest,
    direction: latest?.direction ?? 'below',
    onClick: () => {
      if (!latest) return;
      rowElRefs.current.get(latest.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      dismiss(latest.id);
    },
  };
}
