// Everything the graphics say. Edit here, then run: node build.mjs
// Source: docs/concepts/TRAINING-VIDEOS.md (2026-09-25).

export const presenter = [
  // Change the name line to however you want to be introduced.
  { file: 'presenter-developer', name: 'Bradley', call: 'KC1JMH', role: 'ECTLogger developer' },
  { file: 'presenter-ares', name: 'Bradley', call: 'KC1JMH', role: 'Cumberland County ARES Emergency Coordinator' },
];

// Lower-third band ending: 'point' or 'curve'.
export const lowerThirdEnd = 'point';

export const tracks = {
  A: { name: 'Operator basics', color: '#2f7a3c' },
  B: { name: 'Net control', color: '#1565c0' },
  C: { name: 'Net managers', color: '#8a5300' },
  clip: { name: 'Quick clip', color: '#3b4750' },
};

// Track videos, in playlist order. `pages` are help-site paths under ectlogger.us/docs/.
export const videos = [
  { code: 'A1', track: 'A', title: 'Signing in and finding your net', audience: 'Everyone',
    pages: ['start/first-check-in', 'operators/signing-in', 'operators/finding-a-net'],
    beats: ['What ECTLogger is', 'Signing in', 'The walkthrough', 'The dashboard'] },
  { code: 'A2', track: 'A', title: 'Checking in and taking part', audience: 'Everyone',
    pages: ['operators/checking-in', 'operators/status-and-checking-out', 'operators/chat-and-polls', 'operators/location-and-the-map'],
    beats: ['Checking in', 'Your status', 'Chat', 'Polls and topic of the week', 'The map', 'Checking out'] },
  { code: 'B1', track: 'B', title: 'Running your first net', audience: 'New net control',
    pages: ['start/run-your-first-net', 'net-control/logging-check-ins', 'net-control/closing-the-net'],
    beats: ['Creating a one-time net', 'Starting the net', 'Logging check-ins', 'Bulk add', 'Closing the net'] },
  { code: 'B2', track: 'B', title: 'The net control desk', audience: 'NCS, Logger, Relay',
    pages: ['net-control/the-net-control-desk', 'net-control/roles-and-stepping-away', 'net-control/frequencies-and-multi-ncs'],
    beats: ['The toolbar', 'Reading the table', 'Roles and frequencies', 'Stepping away'] },
  { code: 'B3', track: 'B', title: 'After the net: reports and ICS-309', audience: 'NCS, net managers',
    pages: ['net-control/closing-the-net', 'net-managers/reports-and-exports', 'net-managers/cancelling-and-archiving'],
    beats: ['What closing does', 'Reports, ICS-309 and CSV', 'Archive and delete'] },
  { code: 'C1', track: 'C', title: 'Setting up a recurring schedule', audience: 'Net managers',
    pages: ['start/first-schedule', 'net-managers/recurring-schedules', 'net-managers/net-staff-and-rotation', 'net-managers/lobby-and-auto-close'],
    beats: ['New-account limits', 'Creating a weekly schedule', 'Net staff and rotation', 'Lobby and auto-close', 'Reminder emails', 'Claiming an open net'] },
  { code: 'C2', track: 'C', title: 'Reading your schedule’s statistics', audience: 'Net managers',
    pages: ['net-managers/schedule-statistics'],
    beats: ['Choosing a time range', 'The leaderboards', 'Net history and the report'] },
];

export const clips = [
  { slug: 'speed-entry', title: 'Speed entry', shows: 'Typing a pileup into Bulk add', pages: ['net-control/speed-entry', 'reference/speed-entry-syntax'] },
  { slug: 'backup-ncs', title: 'Stepping up as backup NCS', shows: 'Checking in as NCS or Logger on an unstaffed net', pages: ['net-control/roles-and-stepping-away'] },
  { slug: 'hand-raise', title: 'Hand raise and stepping away', shows: 'Raising a hand, Step away, Just listening, Check out', pages: ['operators/status-and-checking-out'] },
  { slug: 'chat-power-tools', title: 'Chat power tools', shows: 'Reply, @mention, edit, mute, and the net-wide mute', pages: ['operators/chat-and-polls', 'net-control/chat-moderation'] },
  { slug: 'traffic', title: 'Traffic', shows: 'Filing traffic, then handling it at the desk', pages: ['operators/filing-traffic', 'net-control/handling-traffic'] },
  { slug: 'authenticated-nets', title: 'Authenticated nets', shows: 'The padlock, the station’s code, Confirm Match or Reject', pages: ['net-control/authenticated-nets'] },
  { slug: 'multiple-monitors', title: 'Multiple monitors', shows: 'Popping panels out across screens', pages: ['net-control/multiple-monitors'] },
  { slug: 'on-a-phone', title: 'On a phone in the field', shows: 'The phone layout, and what to set up before you leave', pages: ['operators/in-the-field'] },
  { slug: 'scripts', title: 'Scripts, announcements, notes', shows: 'The net script, announcements, and NCS notes', pages: ['net-managers/scripts-and-announcements'] },
  { slug: 'importing', title: 'Importing check-ins', shows: 'Backfilling a net that ran off-app from a CSV', pages: ['net-managers/importing-check-ins'] },
  { slug: 'cancelling', title: 'Cancelling and restoring', shows: 'Cancelling one occurrence, and bringing it back', pages: ['net-managers/cancelling-and-archiving'] },
  { slug: 'feeds', title: 'Feeds and calendars', shows: 'The RSS feeds and where their addresses are', pages: ['reference/feeds'] },
  { slug: 'admin-fields', title: 'Admin: frequencies and custom fields', shows: 'The shared frequency list, and adding a custom field', pages: ['admins/frequencies', 'admins/custom-fields'] },
];

// Seeded demo accounts (all invented).
export const stations = [
  { call: 'W1PINE', name: 'Alex Reed', role: 'Net control and net manager' },
  { call: 'N1DUNE', name: 'Robin Teague', role: 'New operator' },
  { call: 'K1COVE', name: 'Dana Whitfield', role: 'Logger · schedule co-manager' },
  { call: 'W1PORT', name: 'Joan Alderman', role: 'Second net control, on DMR' },
  { call: 'N1LAKE', name: 'Marcus Ellery', role: 'Relay' },
  { call: 'K1CAMP', name: 'Terry Osgood', role: 'Station with traffic · SKYWARN staff' },
  { call: 'W1DEMO', name: 'Sam Whitcomb', role: 'Admin' },
];

// On-screen button labels, exactly as the app shows them.
export const buttons = [
  'Start Walkthrough', 'Start', 'Bulk add', 'Close net', 'Edit net', 'Create Schedule', 'Staff',
  'Add NCS Operator', 'Rotation Order', 'Reset Net View Layout', 'Step away', 'Just listening',
  'Check out', 'Confirm Match', 'Reject', 'Archive', 'Report', 'ICS-309',
];

export const notes = [
  { file: 'new-account-limits', kind: 'info', head: 'New accounts',
    body: 'A brand-new account may have to wait before it can create a schedule.', link: 'net-managers/recurring-schedules' },
  { file: 'demo-no-email', kind: 'info', head: 'Practice copy',
    body: 'This practice copy doesn’t send email. On a real server, it arrives in your inbox.', link: 'reference/emails' },
  { file: 'two-browsers', kind: 'info', head: 'Two browsers',
    body: 'One window is the station, the other is net control, so you can see check-ins arrive live.', link: null },
];

export const siteDescription = 'Real-time net logging for emergency communications teams, SKYWARN spotter nets, and the clubs that run a weekly check-in.';
