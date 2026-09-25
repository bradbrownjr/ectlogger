// ========== NET ACTIONS ==========
// Which management buttons to show on a net, one flag per server action.
// The server computes each flag with the same rule that action enforces
// (backend/app/permissions.py::net_actions), so a button is shown exactly
// when clicking it will succeed. Gate a management button on its flag here,
// never on the broad canManage: that is what offered net staff buttons the
// server refused, and hid Close from a Logger the server would have allowed.

export interface NetActions {
  edit: boolean;              // Edit net, Go live
  start: boolean;             // Start
  close: boolean;             // Close net
  import_check_ins: boolean;  // Import
  lifecycle: boolean;         // Cancel, Restore, Archive, Unarchive, Delete
  claim_ncs: boolean;         // Claim NCS
  manage_roles: boolean;      // Roles dialog
  email_subscribers: boolean; // Email subscribers
}

const NO_ACTIONS: NetActions = {
  edit: false,
  start: false,
  close: false,
  import_check_ins: false,
  lifecycle: false,
  claim_ncs: false,
  manage_roles: false,
  email_subscribers: false,
};

interface WithActions {
  actions?: Partial<NetActions> | null;
  actions_as_regular_user?: Partial<NetActions> | null;
}

// An admin using "View as Regular User" (AuthContext's simulateRegularUser)
// gets the server's no-admin-bypass copy, since their real requests would
// still succeed and the preview is meant to show what everyone else sees.
export const getNetActions = (net: WithActions | null | undefined, simulateRegularUser: boolean): NetActions => ({
  ...NO_ACTIONS,
  ...((simulateRegularUser && net?.actions_as_regular_user) || net?.actions || {}),
});
