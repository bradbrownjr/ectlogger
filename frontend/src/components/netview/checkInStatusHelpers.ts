// ========== CHECK-IN STATUS DISPLAY HELPERS ==========
// Pure display helpers that turn a check-in's status/role into the emoji icon,
// short label, and tooltip text shown in the check-in tables. Extracted from
// NetView so all three tables (desktop, mobile, detached) share one
// implementation. Each returns a string (emoji and/or text) — never JSX.
//
// The helpers close over per-render net state, so `getCheckInStatusHelpers`
// is a factory: call it once in render with the current context and destructure
// the four functions. Behavior is identical to the previous inline definitions.

interface StatusHelperContext {
  net: any;
  netRoles: any[];
  checkIns: any[];
  // NCS roles sorted by assigned_at (for primary vs secondary crown logic).
  ncsRoles: any[];
}

export interface CheckInStatusHelpers {
  getStatusIcon: (status: string, checkIn?: any) => string;
  getStatusTooltip: (status: string, checkIn?: any) => string;
  getStatusLabel: (status: string) => string;
  getNcsIcon: (checkIn: any) => string;
}

export function getCheckInStatusHelpers({
  net,
  netRoles,
  checkIns,
  ncsRoles,
}: StatusHelperContext): CheckInStatusHelpers {
  // A role badge (crown / 2nd crown / clipboard) describes the standing role
  // a station holds, not what it is doing right now, so it only takes over
  // the status column while that station is in the default checked-in state.
  // Once an explicit operational status is set (away, mobile, has traffic,
  // ...) that status wins, for staff exactly as for everyone else -- both
  // because an NCS who has stepped away or gone mobile is precisely what the
  // rest of the net needs to see, and because otherwise setting a status on
  // a station holding a role changes nothing visible and reads as broken.
  const roleBadgeApplies = (status: string) => status === 'checked_in';

  const getStatusIcon = (status: string, checkIn?: any) => {
    // Show role icons for users with active roles
    if (checkIn && roleBadgeApplies(status)) {
      // Owner always gets the primary crown
      if (net?.owner_id === checkIn.user_id) return '👑';

      const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id && r.is_active !== false);
      if (userRole?.role?.toUpperCase() === 'NCS') {
        // Check if owner is checked in - if so, this NCS is secondary
        const ownerCheckedIn = net?.owner_id && checkIns.some(c => c.user_id === net.owner_id && c.status !== 'checked_out');
        if (ownerCheckedIn) {
          // Owner is present - all other NCS are secondary
          return '🤴';
        }

        // Owner not present - check if this is first NCS in the list (acting primary)
        const ncsIndex = ncsRoles.findIndex((r: any) => r.user_id === checkIn.user_id && r.is_active !== false);
        if (ncsIndex > 0) {
          // This is a secondary NCS - check if primary NCS is checked in
          const primaryNCS = ncsRoles[0];
          const primaryCheckedIn = checkIns.some(c => c.user_id === primaryNCS.user_id && c.status !== 'checked_out');
          if (primaryCheckedIn) {
            // Primary NCS is present - show 2nd crown for secondary
            return '🤴';
          }
        }
        // Primary NCS or acting primary (primary not present)
        return '👑';
      }
      if (userRole?.role?.toUpperCase() === 'LOGGER') return '📋';
      if (userRole?.role?.toUpperCase() === 'RELAY') return '📡';

      // Show recheck icon for rechecked stations (replaces standard check-in)
      if (checkIn.is_recheck && status === 'checked_in') return '🔄';
    }

    // Show standard status icons
    switch (status) {
      case 'checked_in': return '✅'; // Standard
      case 'listening': return '👂'; // Just listening
      case 'relay': return '📡'; // Relay station
      case 'away': return '⏸️'; // Short term
      case 'has_traffic': return '🚨'; // Has traffic
      case 'announcements': return '📢'; // Has announcements
      case 'mobile': return '🚗'; // Mobile station
      case 'checked_out': return '👋'; // Checked out
      default: return '✅';
    }
  };

  const getStatusTooltip = (status: string, checkIn?: any) => {
    // Check for role-based tooltips first -- gated on the same rule as the
    // icon above, so the tooltip never describes a station's role while the
    // icon beside it is showing that station's current status.
    if (checkIn && roleBadgeApplies(status)) {
      if (net?.owner_id === checkIn.user_id) return 'Net Control Station - manages the net';
      const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id && r.is_active !== false);
      if (userRole?.role?.toUpperCase() === 'NCS') {
        // Check if owner is checked in - if so, this NCS is secondary
        const ownerCheckedIn = net?.owner_id && checkIns.some(c => c.user_id === net.owner_id && c.status !== 'checked_out');
        if (ownerCheckedIn) {
          return '2nd NCS - assists primary Net Control Station';
        }

        // Check if this is a secondary NCS (not first in the list)
        const ncsIndex = ncsRoles.findIndex((r: any) => r.user_id === checkIn.user_id && r.is_active !== false);
        if (ncsIndex > 0) {
          const primaryNCS = ncsRoles[0];
          const primaryCheckedIn = checkIns.some(c => c.user_id === primaryNCS.user_id && c.status !== 'checked_out');
          if (primaryCheckedIn) {
            return '2nd NCS - assists primary Net Control Station';
          }
        }
        return 'Net Control Station - manages the net';
      }
      if (userRole?.role?.toUpperCase() === 'LOGGER') return 'Logger - assists NCS with logging';
      if (userRole?.role?.toUpperCase() === 'RELAY') return 'Relay - checks in stations on behalf of NCS';
      if (checkIn.is_recheck && status === 'checked_in') return 'Re-checked into the net';
    }

    switch (status) {
      case 'checked_in': return 'Checked in and available';
      case 'listening': return 'Monitoring only, not transmitting';
      case 'relay': return 'Relay station - can relay stations NCS cannot hear';
      case 'away': return 'Temporarily away, will return';
      case 'has_traffic': return 'Has traffic or emergency to report';
      case 'announcements': return 'Has announcements to share';
      case 'mobile': return 'Mobile - may only be available briefly';
      case 'checked_out': return 'Checked out of net';
      default: return 'Checked in and available';
    }
  };

  // Short text label for the status select dropdown options. Pairs with the
  // emoji icon so new NCS users don't have to memorize the icon legend
  // (e.g., bullhorn 📢 vs ear 👂 — both look "loud" at a glance).
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'ncs': return 'NCS';
      case 'logger': return 'Logger';
      case 'checked_in': return 'Checked in';
      case 'listening': return 'Listening only';
      case 'relay': return 'Relay';
      case 'away': return 'Away';
      case 'has_traffic': return 'Has traffic';
      case 'announcements': return 'Announcements';
      case 'mobile': return 'Mobile';
      case 'checked_out': return 'Checked out';
      default: return status;
    }
  };

  // Helper to get the NCS icon for a specific check-in (primary crown or secondary prince)
  const getNcsIcon = (checkIn: any) => {
    // Owner is always primary
    if (net?.owner_id === checkIn.user_id) return '👑';

    // Check if owner is checked in - if so, all other NCS are secondary
    const ownerCheckedIn = net?.owner_id && checkIns.some(c => c.user_id === net.owner_id && c.status !== 'checked_out');
    if (ownerCheckedIn) return '🤴';

    // Owner not present - check if this is first NCS in the list
    const ncsIndex = ncsRoles.findIndex((r: any) => r.user_id === checkIn.user_id && r.is_active !== false);
    if (ncsIndex > 0) {
      const primaryNCS = ncsRoles[0];
      const primaryCheckedIn = checkIns.some(c => c.user_id === primaryNCS.user_id && c.status !== 'checked_out');
      if (primaryCheckedIn) return '🤴';
    }

    return '👑';
  };

  return { getStatusIcon, getStatusTooltip, getStatusLabel, getNcsIcon };
}
