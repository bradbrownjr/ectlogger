import { useCallback, useRef, useState } from 'react';

// Opens (or refocuses) a same-origin, named popup window and tracks whether
// it's currently open by polling `.closed` on an interval — there is no
// native cross-window "closed" event to listen for. `noopener`/`noreferrer`
// are intentionally omitted: both force window.open() to return null, which
// would make focus-on-repeat-click and close-detection impossible. That's
// normally the safe default for external links, but this URL is always an
// internal app route we build ourselves, never user-supplied, so the
// reverse-tabnabbing risk those flags guard against doesn't apply here.
export function usePoppedOutWindow(url: string, windowName: string) {
  const windowRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((features = 'width=480,height=650,resizable=yes'): boolean => {
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus();
      return true;
    }

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
      }
    }, 1000);

    return true;
  }, [url, windowName]);

  return { isOpen, open };
}
