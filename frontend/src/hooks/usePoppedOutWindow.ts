import { useCallback, useRef, useState } from 'react';

interface WindowGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

function loadGeometry(storageKey: string): WindowGeometry | null {
  try {
    const saved = localStorage.getItem(`poppedWindow_${storageKey}`);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveGeometry(storageKey: string, geometry: WindowGeometry) {
  localStorage.setItem(`poppedWindow_${storageKey}`, JSON.stringify(geometry));
}

// Opens (or refocuses) a same-origin, named popup window and tracks whether
// it's currently open by polling `.closed` on an interval — there is no
// native cross-window "closed" event to listen for. `noopener`/`noreferrer`
// are intentionally omitted: both force window.open() to return null, which
// would make focus-on-repeat-click, close-detection, and geometry tracking
// impossible. That's normally the safe default for external links, but this
// URL is always an internal app route we build ourselves, never
// user-supplied, so the reverse-tabnabbing risk those flags guard against
// doesn't apply here.
//
// Position and size are snapshotted on every poll tick (same pattern
// FloatingWindow.tsx already uses for the in-page overlay, under a
// `floatingWindow_*` key) so the window reopens wherever it was left instead
// of resetting to a fixed default every time — losing that continuity was a
// real complaint about a past floating-window bug (NetScript), so this
// popup window shouldn't repeat it.
export function usePoppedOutWindow(
  url: string,
  windowName: string,
  storageKey: string,
  defaultWidth = 480,
  defaultHeight = 650,
  // Floor a saved size can't go below, regardless of what was remembered
  // from an earlier session (e.g. before a pane's default width changed, or
  // the window was resized down small enough to make its content unusable).
  minWidth = 0,
  minHeight = 0,
) {
  const windowRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((): boolean => {
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus();
      return true;
    }

    const saved = loadGeometry(storageKey);
    const width = Math.max(saved?.width ?? defaultWidth, minWidth);
    const height = Math.max(saved?.height ?? defaultHeight, minHeight);
    const features = saved
      ? `width=${width},height=${height},left=${saved.left},top=${saved.top},resizable=yes`
      : `width=${width},height=${height},resizable=yes`;

    const win = window.open(url, windowName, features);
    if (!win) return false; // blocked by the browser's popup blocker

    windowRef.current = win;
    setIsOpen(true);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (win.closed) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        windowRef.current = null;
        setIsOpen(false);
        return;
      }
      try {
        saveGeometry(storageKey, {
          left: win.screenX,
          top: win.screenY,
          width: win.outerWidth,
          height: win.outerHeight,
        });
      } catch {
        // Ignore — geometry just won't be remembered this tick.
      }
    }, 1000);

    return true;
  }, [url, windowName, storageKey, defaultWidth, defaultHeight, minWidth, minHeight]);

  return { isOpen, open };
}
