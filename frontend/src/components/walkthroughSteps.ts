// ========== WALKTHROUGH STEP DATA ==========
// The cards shown by WalkthroughModal. Kept apart from the component so a test
// can check every "Learn more" target against the docs/ pages. Every label named
// in a card (button names, menu items) must match the app; verify against the
// component that draws it when changing one.
//
// Icons are named, not imported, so this file stays plain TypeScript with no JSX;
// WalkthroughModal maps each name to a Material icon.

export type WalkthroughIconName =
  | 'nets'
  | 'checkIn'
  | 'status'
  | 'chat'
  | 'map'
  | 'schedule'
  | 'traffic'
  | 'profile'
  | 'help'
  | 'create'
  | 'lobby'
  | 'roles'
  | 'desk'
  | 'bulk'
  | 'offNet'
  | 'close'
  | 'staff'
  | 'reports';

export interface WalkthroughStep {
  icon: WalkthroughIconName;
  title: string;
  body: string;
  /** Path of a user guide page, exactly as its front matter permalink gives it. */
  learnMore: string;
  /**
   * Append this instance's account-age and net-count rule for creating a net
   * (Admin > Security). Read from the settings when the card is shown, never
   * written into the body, because each instance sets its own.
   */
  showsCreationLimits?: boolean;
}

export type WalkthroughPath = 'operator' | 'net-control';

export const DOCS_ORIGIN = 'https://ectlogger.us';

export const OPERATOR_STEPS: WalkthroughStep[] = [
  {
    icon: 'nets',
    title: 'Find a net',
    body:
      'Nets lists what is on the air now and what is coming up. Star a schedule to keep it in a Favorites group at the top. ' +
      'The Schedule page has a calendar view of upcoming nets.',
    learnMore: '/docs/operators/finding-a-net/',
  },
  {
    icon: 'checkIn',
    title: 'Check in',
    body:
      'Open the net and press Check in, or use the prompt that appears when you arrive. ' +
      'If you are on the net\'s staff, the prompt also offers Check In as NCS or as Logger.',
    learnMore: '/docs/operators/checking-in/',
  },
  {
    icon: 'status',
    title: 'Your status',
    body:
      'Raise hand to ask for net control\'s attention, Step away for a short break, or Just listening if you are only monitoring. ' +
      'Check out when you are done.',
    learnMore: '/docs/operators/status-and-checking-out/',
  },
  {
    icon: 'chat',
    title: 'Chat',
    body:
      'Chat runs alongside the net. Reply to a message, @mention a checked-in station, or mute someone you do not want to see. ' +
      'Muting only changes your own view.',
    learnMore: '/docs/operators/chat-and-polls/',
  },
  {
    icon: 'map',
    title: 'Your location and the map',
    body:
      'Put a street address, grid square or coordinates in Location when you check in, and Map shows you on the net map. ' +
      'Set a Default Location in your profile to fill it in for you.',
    learnMore: '/docs/operators/location-and-the-map/',
  },
  {
    icon: 'schedule',
    title: 'Schedules and reminders',
    body:
      'Schedule lists every active schedule. Subscribe to one to get an email reminder before each net.',
    learnMore: '/docs/operators/finding-a-net/',
  },
  {
    icon: 'traffic',
    title: 'Filing traffic',
    body:
      'The Traffic page is where you write and file messages, and where you find the ones addressed to you.',
    learnMore: '/docs/operators/filing-traffic/',
  },
  {
    icon: 'profile',
    title: 'Your profile and settings',
    body:
      'Your profile has tabs for Profile, Settings, Security, Notifications and Activity. ' +
      'Add two-factor authentication under Security and choose your emails under Notifications. On a phone, open the menu to find it.',
    learnMore: '/docs/operators/account-and-profile/',
  },
  {
    icon: 'help',
    title: 'Help is one tap away',
    body:
      'The Help menu has the User Guide, Training, Known Issues and Submit Feedback. Start Walkthrough brings these cards back any time.',
    learnMore: '/docs/about/getting-help/',
  },
];

export const NET_CONTROL_STEPS: WalkthroughStep[] = [
  {
    icon: 'create',
    title: 'Create a net',
    body:
      'Press the + button on the Nets page to set up a one-time net: name, frequencies and what to collect at check-in.',
    learnMore: '/docs/net-managers/creating-a-net/',
    showsCreationLimits: true,
  },
  {
    icon: 'lobby',
    title: 'Open the lobby, then start',
    body:
      'Open lobby lets stations gather and check in before the net begins. Start net begins it. They are separate buttons.',
    learnMore: '/docs/net-managers/lobby-and-auto-close/',
  },
  {
    icon: 'roles',
    title: 'Roles and stepping away',
    body:
      'Check in as NCS or Logger to take a role on the net. A net can have several NCS. ' +
      'Step away hands off for a break; the only active NCS gets a warning first.',
    learnMore: '/docs/net-control/roles-and-stepping-away/',
  },
  {
    icon: 'desk',
    title: 'The net control desk',
    body:
      'The toolbar holds the net\'s tools: Map, Traffic, Off-net, Script, Notes, Paperwork and more. ' +
      'Roles assigns NCS and Logger to other operators.',
    learnMore: '/docs/net-control/the-net-control-desk/',
  },
  {
    icon: 'bulk',
    title: 'Log check-ins fast',
    body:
      'Type a callsign and details to log a station. Bulk add takes a whole list at once when several stations check in together.',
    learnMore: '/docs/net-control/speed-entry/',
  },
  {
    icon: 'offNet',
    title: 'Traffic and the off-net log',
    body:
      'Traffic tracks messages handled during the net. Off-net records a contact a station made away from the net, ' +
      'so it lands on the ICS-309.',
    learnMore: '/docs/net-control/handling-traffic/',
  },
  {
    icon: 'close',
    title: 'Close the net',
    body:
      'Close net ends check-ins and chat. Choose Close and send the log to email it now, or Finish the log later to ' +
      'add offline logs first and send it when it is ready.',
    learnMore: '/docs/net-control/closing-the-net/',
  },
  {
    icon: 'staff',
    title: 'Schedules, staff and rotation',
    body:
      'A recurring schedule creates each net for you. Add net staff and an NCS rotation so everyone knows whose week it is.',
    learnMore: '/docs/net-managers/recurring-schedules/',
  },
  {
    icon: 'reports',
    title: 'Reports and ICS-309',
    body:
      "After a net, the toolbar's Reports menu has the net report, the ICS-309, net control's ICS-214 and the check-in spreadsheet. The Stats page shows trends across nets and schedules.",
    learnMore: '/docs/net-managers/reports-and-exports/',
  },
];

// ========== NET CREATION LIMITS ==========
// The anti-spam rule a new account must clear before the + button will create a
// net or a schedule (templates_core.py::check_schedule_creation_eligibility).
// 0 turns either half off. Admins, and accounts given early access, are exempt,
// which the caller decides.
export interface NetCreationLimits {
  minAccountAgeDays: number;
  minNetsCheckedInto: number;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The sentence the Create a net card adds. null limits (a guest, who cannot read
 * the settings) get a general version; limits that are both 0 get ''.
 */
export const netCreationLimitsText = (limits: NetCreationLimits | null): string => {
  if (!limits) {
    return 'A new account may need to be a few days old and to have checked into a net before it can create one.';
  }
  const parts: string[] = [];
  if (limits.minAccountAgeDays > 0) parts.push(`is at least ${plural(limits.minAccountAgeDays, 'day')} old`);
  if (limits.minNetsCheckedInto > 0) parts.push(`has checked into at least ${plural(limits.minNetsCheckedInto, 'net')}`);
  if (parts.length === 0) return '';
  return `A new account can create a net once it ${parts.join(' and ')}. An admin can give you early access.`;
};

export const WALKTHROUGH_STEPS: Record<WalkthroughPath, WalkthroughStep[]> = {
  operator: OPERATOR_STEPS,
  'net-control': NET_CONTROL_STEPS,
};

export const docsUrl = (path: string): string => `${DOCS_ORIGIN}${path}`;
