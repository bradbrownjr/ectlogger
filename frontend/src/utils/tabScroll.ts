// ========== TAB ROW SCROLLING (pure helpers) ==========
// The math behind ScrollableTabs' mouse wheel and drag handling, kept free of
// the DOM so it can be unit tested. See components/shared/ScrollableTabs.tsx.

/** The parts of a scroll container these helpers read. */
export interface ScrollBox {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** The parts of a WheelEvent these helpers read. */
export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

/** Movement (px) before a mouse press on the tab row counts as a drag. */
export const DRAG_THRESHOLD_PX = 5;

// WheelEvent.deltaMode: 0 = pixels, 1 = lines, 2 = pages.
const LINE_PX = 16;

/**
 * How far a vertical mouse wheel turn should move the tab row sideways, or
 * null to leave the event alone (the page scrolls as usual).
 *
 * Null when the row has nothing to scroll, when the gesture is already
 * mostly sideways (a trackpad, or Shift+wheel, which the browser scrolls
 * natively), or when the row is already at the end the wheel points to, so
 * the page takes over scrolling instead of the wheel going dead.
 */
export function wheelToTabScroll(e: WheelLike, box: ScrollBox): number | null {
  const maxScroll = box.scrollWidth - box.clientWidth;
  if (maxScroll <= 1) return null;
  if (e.deltaY === 0 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return null;

  const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? box.clientWidth : 1;
  const delta = e.deltaY * scale;

  // A 1px tolerance: browsers report fractional scroll positions at some zoom levels.
  if (delta < 0 && box.scrollLeft <= 1) return null;
  if (delta > 0 && box.scrollLeft >= maxScroll - 1) return null;
  return delta;
}

/** True once a mouse press has moved far enough to be a drag, not a click. */
export function isDrag(startX: number, currentX: number): boolean {
  return Math.abs(currentX - startX) > DRAG_THRESHOLD_PX;
}
