// The page a schedule's subscribe link opens, and the full link to share.
// One definition, so the route in App.tsx, the page's own sign-in return
// path, and the link staff copy can never point at different places.
export const subscribePath = (scheduleId: number | string): string => `/subscribe/${scheduleId}`;

export const subscribeLink = (scheduleId: number | string): string =>
  `${window.location.origin}${subscribePath(scheduleId)}`;
