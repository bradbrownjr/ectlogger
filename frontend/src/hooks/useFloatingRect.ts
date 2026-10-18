import { useEffect, useState } from 'react';
import { FloatingRect, fitFloatingRect } from '../utils/floatingWindow';

// Position and size of a floating window, fitted to the page when it is
// created and again whenever the browser is resized or the phone rotated.
// See utils/floatingWindow.ts.
export function useFloatingRect(initial: FloatingRect | (() => FloatingRect)) {
  const [rect, setRect] = useState<FloatingRect>(() =>
    fitFloatingRect(typeof initial === 'function' ? initial() : initial),
  );

  useEffect(() => {
    // Measure on the next frame, not inside the event. NetView's own resize
    // listener changes the body's zoom and height, and it is registered after
    // this one (a child's effects run before its parent's), so measuring
    // straight away would read the page from before the rotation.
    let frame = 0;
    const handleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(prev => fitFloatingRect(prev)));
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return [rect, setRect] as const;
}
