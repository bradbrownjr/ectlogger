import { useEffect, useRef } from 'react';

// ========== useVisibilityAwareInterval ==========
// setInterval that only runs while the tab is actually being looked at, and
// catches up the moment it is again.
//
// A plain setInterval keeps firing in a hidden tab (browsers throttle timers,
// they don't stop them), so a browser left open on ECTLogger overnight kept
// polling the backend all night for nobody's benefit -- the navbar badge's 60s
// poll alone is ~1,440 authenticated requests per day, per tab, each one a
// database round trip. Nothing is lost by pausing: net updates arrive over the
// WebSocket regardless, and this refetches immediately on return, so what the
// operator sees when they come back is fresh either way.
//
// The WebSocket itself must never be paused this way -- an NCS with the net in
// a background tab still needs live events.

export function useVisibilityAwareInterval(
  callback: () => void,
  intervalMs: number,
  enabled = true,
): void {
  // Held in a ref so a caller passing an inline arrow function doesn't tear
  // down and rebuild the interval on every render.
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => savedCallback.current(), intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refetch right away rather than waiting out a full interval: the data
        // is however stale the tab was hidden for.
        savedCallback.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}

export default useVisibilityAwareInterval;
