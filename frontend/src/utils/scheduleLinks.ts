// A schedule's shareable links. One definition, so the routes in App.tsx, the
// pages' own sign-in return paths, and the links staff copy can never point at
// different places.

// The schedule's home page: its details, the net on the air, staff, past nets.
export const scheduleHomePath = (scheduleId: number | string): string => `/scheduler/${scheduleId}`;

// Goes straight to the schedule's running net when exactly one is on the air,
// otherwise to the home page. Meant for a club's own website.
export const scheduleLivePath = (scheduleId: number | string): string => `/scheduler/${scheduleId}/live`;

// The home page with its Subscribe button highlighted. Opening it never
// subscribes anyone; that is always a click on the page.
export const scheduleSubscribeTarget = (scheduleId: number | string): string =>
  `${scheduleHomePath(scheduleId)}?subscribe=1`;

// The short subscribe link staff share. Redirects to scheduleSubscribeTarget,
// and stays so links already sent out keep working.
export const subscribePath = (scheduleId: number | string): string => `/subscribe/${scheduleId}`;

export const absoluteLink = (path: string): string => `${window.location.origin}${path}`;

export const subscribeLink = (scheduleId: number | string): string => absoluteLink(subscribePath(scheduleId));
