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
  // horizontal (left/center/right widths), xl-breakpoint only.
  LEFT_PANELS_SPLIT: 'netview_leftPanels_split',
  RIGHT_PANELS_SPLIT: 'netview_rightPanels_split',
  COLUMN_SPLIT: 'netview_columns_split',
} as const;

// Dynamic key builders
export const favoritesKey = (userId: number | string): string =>
  `scheduler-favorites-${userId}`;

export const floatingWindowKey = (storageKey: string): string =>
  `floatingWindow_${storageKey}`;
