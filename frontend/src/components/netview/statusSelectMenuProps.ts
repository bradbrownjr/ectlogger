// ========== STATUS SELECT MENU POSITIONING ==========
// Shared MenuProps for every check-in status <Select> — the per-row status
// control in the desktop/detached table and the mobile list, plus the status
// field in the check-in entry row. They are the same control to an operator,
// so per DESIGN.md's symmetry rule their menus must open the same way.
//
// Why the explicit origins: MUI's Select centers its menu horizontally on the
// control by default (it writes a transformOrigin of roughly half the menu's
// width), which leaves the menu's left edge hanging ~55px to the left of the
// button it belongs to and reads as misaligned. Anchoring bottom-left to
// top-left opens the menu directly beneath the control with their left edges
// flush.
//
// This also happens to be the cheapest case for the zoom correction in
// utils/zoomAwarePopovers.ts: a 'left'/'top' transform origin makes that
// correction's residual term (transformOrigin * (1 - zoom) / zoom) exactly
// zero, so these menus need only the plain divide-by-zoom, with no mixed-unit
// arithmetic to get wrong.
//
// disableScrollLock keeps the net view from shifting under the operator when a
// menu opens mid-net.
export const STATUS_SELECT_MENU_PROPS = {
  disableScrollLock: true,
  anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
  transformOrigin: { vertical: 'top', horizontal: 'left' },
} as const;
