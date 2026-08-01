/**
 * Central registry of every localStorage key used in the app.
 * Keeping keys here prevents typos and makes it easy to audit what
 * the app persists. Use these constants everywhere instead of raw strings.
 */
export const STORAGE_KEYS = {
  THEME_MODE: 'themeMode',
  TOKEN: 'token',
  DASHBOARD_VIEW_MODE: 'dashboard-view-mode',
  DASHBOARD_SORT_ORDER: 'dashboard-sort-order',
  SCHEDULER_VIEW_MODE: 'scheduler-view-mode',
  SCHEDULER_SORT_ORDER: 'scheduler-sort-order',
  ADMIN_SIMULATE_USER: 'admin_simulate_user',
  CHECKIN_HIDE_DUPLICATES: 'checkin_hideDuplicates',
  CHANGELOG_LAST_READ_VERSION: 'changelog_last_read_version',
  FLOATING_CHECKIN_LIST: 'floatingWindow_checkInList_detached',
  FLOATING_CHAT: 'floatingWindow_chat_detached',
  FLOATING_ACTIVITY_LOG: 'floatingWindow_activityLog_detached',
  DOCKED_CHAT_MINIMIZED: 'dockedPanel_chat_minimized',
  DOCKED_ACTIVITY_LOG_MINIMIZED: 'dockedPanel_activityLog_minimized',
  MOBILE_ACTIVITY_LOG_MINIMIZED: 'mobilePanel_activityLog_minimized',
  // Ultrawide layout: whether Script/Notes/Schedule Announcements/Map are
  // docked into NetView's grid (left column for the first three, bottom-
  // right for Map) rather than floating, when open. Gated at render time on
  // an xl-width viewport regardless of this stored preference - see
  // NetView.tsx.
  SCRIPT_DOCKED: 'dockedPanel_script_docked',
  ANNOUNCEMENTS_DOCKED: 'dockedPanel_announcements_docked',
  SCHEDULE_ANNOUNCEMENTS_DOCKED: 'dockedPanel_scheduleAnnouncements_docked',
  MAP_DOCKED: 'dockedPanel_map_docked',
  SCRIPT_MINIMIZED: 'dockedPanel_script_minimized',
  ANNOUNCEMENTS_MINIMIZED: 'dockedPanel_announcements_minimized',
  SCHEDULE_ANNOUNCEMENTS_MINIMIZED: 'dockedPanel_scheduleAnnouncements_minimized',
  MAP_MINIMIZED: 'dockedPanel_map_minimized',
  // Resizable split weights (flex-grow ratios) - see useResizableSplit.ts.
  // Left/right panel stacks are vertical splits; the column split is
  // horizontal (left/center/right widths). Each is actually stored with a
  // useLayoutTier() suffix ('_compact'/'_wide'/'_ultrawide') appended at the
  // call site, so a phone, a laptop, and an external ultrawide monitor keep
  // independent sizes even under the same browser profile.
  LEFT_PANELS_SPLIT: 'netview_leftPanels_split',
  RIGHT_PANELS_SPLIT: 'netview_rightPanels_split',
  COLUMN_SPLIT: 'netview_columns_split',
} as const;

// Dynamic key builders
export const favoritesKey = (userId: number | string): string =>
  `scheduler-favorites-${userId}`;

export const floatingWindowKey = (storageKey: string): string =>
  `floatingWindow_${storageKey}`;

// Prefixes covering every localStorage key that records a Net View panel's
// position, size, dock state, minimized state, or resizable split ratio.
// Used by clearNetViewLayoutPrefs() below - keep in sync if a new panel
// persists layout under a different prefix.
const NET_VIEW_LAYOUT_PREFIXES = ['floatingWindow_', 'poppedWindow_', 'dockedPanel_', 'mobilePanel_', 'netview_'];

// Wipes every remembered Net View panel position/size/dock/minimize/split
// preference across all screens (see NetViewLeftPanels.tsx, NetViewSidePanels.tsx,
// useResizableSplit.ts, FloatingWindow.tsx, usePoppedOutWindow.ts). Leaves
// unrelated preferences (theme, dashboard/scheduler view mode, etc.) alone.
export function clearNetViewLayoutPrefs(): void {
  Object.keys(localStorage)
    .filter((key) => NET_VIEW_LAYOUT_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => localStorage.removeItem(key));
}
