// ========== SCROLLABLE TABS ==========
// The one tab row used across the app. Tabs stay on a single line, and when
// they don't fit the window the row scrolls, by whatever the user has:
//   - arrows at each end (MUI scrollButtons="auto": shown only when the row
//     overflows, and hidden below the `sm` breakpoint, where a finger swipe
//     scrolls the row natively),
//   - click and drag with a mouse,
//   - the plain mouse wheel while the pointer is over the row (Shift+wheel and
//     trackpad sideways swipes already work natively).
// See docs/DESIGN.md "Tabs". Never use a bare MUI <Tabs> on a page.

import { forwardRef, useEffect, useRef } from 'react';
import { Tabs, TabsProps } from '@mui/material';
import { useForkRef } from '@mui/material/utils';
import { isDrag, wheelToTabScroll } from '../../utils/tabScroll';

export type ScrollableTabsProps = Omit<TabsProps, 'variant' | 'scrollButtons'>;

const ScrollableTabs = forwardRef<HTMLDivElement, ScrollableTabsProps>(function ScrollableTabs(
  props,
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useForkRef(rootRef, ref);

  useEffect(() => {
    const scroller = rootRef.current?.querySelector<HTMLElement>('.MuiTabs-scroller');
    if (!scroller) return;

    // ---------- Mouse wheel ----------
    // Not passive: preventDefault stops the page scrolling while the row moves.
    const onWheel = (e: WheelEvent) => {
      const delta = wheelToTabScroll(e, scroller);
      if (delta === null) return;
      e.preventDefault();
      scroller.scrollLeft += delta;
    };

    // ---------- Click and drag (mouse only; touch scrolls natively) ----------
    let pointerId: number | null = null;
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    // Set when a drag ends, so the click the browser fires on release does
    // not switch to whichever tab the pointer happened to land on.
    let swallowClick = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startScroll = scroller.scrollLeft;
      dragging = false;
      swallowClick = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      if (!dragging) {
        if (!isDrag(startX, e.clientX)) return;
        dragging = true;
        // Keep following the mouse after it leaves the row.
        scroller.setPointerCapture(e.pointerId);
        scroller.style.cursor = 'grabbing';
      }
      scroller.scrollLeft = startScroll - (e.clientX - startX);
    };

    const endDrag = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (!dragging) return;
      dragging = false;
      scroller.style.cursor = '';
      if (scroller.hasPointerCapture(e.pointerId)) scroller.releasePointerCapture(e.pointerId);
      swallowClick = true;
      // The release click arrives before this timer; clear the flag after it
      // so a later keyboard Enter on a tab is never swallowed.
      window.setTimeout(() => { swallowClick = false; }, 0);
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    // Stop a drag from selecting tab labels as text.
    const onSelectStart = (e: Event) => {
      if (dragging) e.preventDefault();
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', endDrag);
    scroller.addEventListener('pointercancel', endDrag);
    scroller.addEventListener('click', onClickCapture, true);
    scroller.addEventListener('selectstart', onSelectStart);
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', endDrag);
      scroller.removeEventListener('pointercancel', endDrag);
      scroller.removeEventListener('click', onClickCapture, true);
      scroller.removeEventListener('selectstart', onSelectStart);
      scroller.style.cursor = '';
    };
  }, []);

  return <Tabs ref={handleRef} {...props} variant="scrollable" scrollButtons="auto" />;
});

export default ScrollableTabs;
