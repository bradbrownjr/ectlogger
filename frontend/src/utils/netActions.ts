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
  record_coverage: boolean;   // "Who can this station hear?" on any row
  run_drill: boolean;         // Drill plan: read it, mark messages sent
  log_off_net: boolean;       // Off-net log: add for any station, no review
  review_off_net_log: boolean; // Off-net log: accept, reject, edit any entry
  block_station: boolean;     // Remove and block a station from the net
  prepare_ics214: boolean;    // ICS-214: open, edit and download (closed nets)
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
  record_coverage: false,
  run_drill: false,
  log_off_net: false,
  review_off_net_log: false,
  block_station: false,
  prepare_ics214: false,
};

interface WithActions {
  actions?: Partial<NetActions> | null;
}

// The server answers for an admin as a regular user unless admin mode is open
// (backend app/admin_mode.py), so `actions` is already right either way.
export const getNetActions = (net: WithActions | null | undefined): NetActions => ({
  ...NO_ACTIONS,
  ...(net?.actions || {}),
});
