// ========== ZOOM-AWARE POPOVER POSITIONING ==========
// Corrects MUI Menu/Select dropdown positioning under NetView's short-
// viewport CSS `zoom` (see pages/NetView.tsx's fit-to-viewport effect, and
// DESIGN.md "Tooltip Positioning" for the identical bug in Tooltip, which
// this is the Popover-family counterpart to).
//
// The bug: Popover computes its Paper's `top`/`left` from
// `anchorEl.getBoundingClientRect()`, which already reports the anchor's
// zoomed/visual screen position. Writing that same number straight onto the
// Paper -- itself another descendant of the zoomed <body>, since Menu/Select
// portal there too -- makes the browser apply the zoom scaling a SECOND time
// on paint, landing the menu far from its anchor (reported: an Export menu
// opening in the middle of the page instead of under its button).
//
// Tooltip's equivalent bug was fixed with a Popper.js modifier (App.tsx),
// because Popper.js exposes a modifier pipeline to hook into. MUI's
// Popover component (which Menu and Select's dropdown both build on) has no
// such extension point -- `Popover.js`'s positioning math is a private,
// unhookable calculation that writes `element.style.top/left` directly --
// so there is nothing to intercept before the wrong value lands in the DOM.
// This instead corrects it immediately after, via MutationObserver, which
// is the only thing that can react to Popover's un-hookable writes -- an
// exception to "extend the theme default, don't patch the DOM" (see
// DESIGN.md "Tooltip Positioning") made because Popover leaves no other way
// in. Applied once per Paper element and re-applied on every subsequent
// reposition (scroll, resize, or a fresh open), matching how the Tooltip
// fix's modifier re-runs on every Popper update rather than once at mount.
//
// Scoped to NetView's own mount lifetime (started/stopped alongside the
// zoom effect that creates the problem) rather than run for the whole app,
// so the MutationObserver's cost is paid only on the one page that can
// actually be zoomed, not the whole session.

function currentZoom(): number {
  return parseFloat(document.body.style.zoom) || 1;
}

/**
 * Starts watching for MUI Popover-family Paper elements (`.MuiPopover-paper`
 * -- Menu and Select's dropdown both use it) anywhere in the document, and
 * keeps each one's position corrected for the current zoom factor for as
 * long as it exists. Returns a cleanup function that stops all watching.
 */
export function watchZoomAwarePopovers(): () => void {
  // Tracks the last value THIS code wrote to each paper, so the mutation
  // that write itself triggers (observed asynchronously) is recognized as
  // an echo and skipped, rather than divided by zoom a second time.
  const lastWritten = new WeakMap<HTMLElement, { top: string; left: string }>();
  const paperObservers = new WeakMap<HTMLElement, MutationObserver>();

  const correct = (paper: HTMLElement) => {
    const zoom = currentZoom();
    if (zoom === 1) return;
    const { top, left } = paper.style;
    if (!top && !left) return;
    const prev = lastWritten.get(paper);
    if (prev && prev.top === top && prev.left === left) return;
    const next = {
      top: top ? `${parseFloat(top) / zoom}px` : top,
      left: left ? `${parseFloat(left) / zoom}px` : left,
    };
    lastWritten.set(paper, next);
    if (next.top) paper.style.top = next.top;
    if (next.left) paper.style.left = next.left;
  };

  const watchPaper = (paper: HTMLElement) => {
    if (paperObservers.has(paper)) return;
    const observer = new MutationObserver(() => correct(paper));
    observer.observe(paper, { attributes: true, attributeFilter: ['style'] });
    paperObservers.set(paper, observer);
    correct(paper);
  };

  const scanForPapers = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains('MuiPopover-paper')) watchPaper(node);
    node.querySelectorAll?.('.MuiPopover-paper').forEach((el) => watchPaper(el as HTMLElement));
  };

  const rootObserver = new MutationObserver((mutations) => {
    mutations.forEach((m) => m.addedNodes.forEach(scanForPapers));
  });
  rootObserver.observe(document.body, { childList: true, subtree: true });

  return () => rootObserver.disconnect();
}
