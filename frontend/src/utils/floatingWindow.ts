// ========== FLOATING WINDOWS (react-rnd) ==========
// Shared rules for every in-page floating window: FloatingWindow (Chat,
// Activity Log, Coverage), MarkdownDocPanel (Script, Announcements, Net
// Notes), CheckInMap, BulkCheckIn and SearchCheckIns. Each of those kept its
// own copy of the sizing math until 2026-10-18, and MarkdownDocPanel had none
// at all: it always opened 500px wide at x=100, so on a phone its title-bar
// buttons sat off the right edge, and in landscape it landed below the page
// and vanished until the phone was turned back.

export interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Pass as `cancel` on every <Rnd>. Inside a drag handle, react-draggable
// calls preventDefault() on touchstart (DraggableCore.handleDragStart, so the
// page doesn't scroll mid-drag), which also stops the browser from turning
// the tap into a click. The button's ripple still shows, but its onClick
// never fires: every title-bar button was dead on touch screens. Elements
// matching this selector are left out of dragging, so they get real taps.
export const FLOATING_DRAG_CANCEL = 'button, a, input, textarea, select, [role="button"]';

// Gap kept between a window and the page edge (16px total, the app's phone
// gutter).
const EDGE = 8;

// The page in the same units the window's x/y/width/height use.
// document.body.offsetWidth/offsetHeight, not window.innerWidth/innerHeight:
// NetView applies a CSS zoom to <body> on short screens, and under it the
// Rnd's coordinates are in body's local pixels while innerWidth/innerHeight
// are visual ones. See FloatingWindow.tsx's `bounds` comment.
export function floatingPageSize(): { width: number; height: number } {
  return { width: document.body.offsetWidth, height: document.body.offsetHeight };
}

// Shrinks the window to fit the page and moves it so it is entirely on it.
// Matches what the Rnd's own bounds="body" enforces while dragging, so a
// window can never end up somewhere the user could not have dragged it.
export function fitFloatingRect(
  rect: FloatingRect,
  page: { width: number; height: number } = floatingPageSize(),
): FloatingRect {
  const width = Math.max(0, Math.min(rect.width, page.width - 2 * EDGE));
  const height = Math.max(0, Math.min(rect.height, page.height - 2 * EDGE));
  return {
    width,
    height,
    x: Math.max(0, Math.min(rect.x, page.width - width - EDGE)),
    y: Math.max(0, Math.min(rect.y, page.height - height - EDGE)),
  };
}
