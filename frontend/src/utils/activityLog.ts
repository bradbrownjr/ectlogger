// ========== ACTIVITY LOG WORDING ==========
// How Admin > Activity names each action the server logs (backend
// app/audit.py). backend/tests/test_activity_log_labels.py fails when the
// server writes an action this list doesn't name, so a new event can't ship
// showing its raw code.

export interface ActivityEvent {
  id: number;
  created_at: string;
  action: string;
  actor_user_id: number | null;
  actor_label: string | null;
  ip: string | null;
  user_agent: string | null;
  location: string | null;
  target_type: string | null;
  target_id: number | null;
  target_label: string | null;
  subject_user_id: number | null;
  net_id: number | null;
  template_id: number | null;
  details: Record<string, any> | null;
}

/** The filter groups, in the order the filter menu lists them. */
export const ACTION_GROUPS: { prefix: string; label: string }[] = [
  { prefix: 'alert.', label: 'Security alerts' },
  { prefix: 'auth.', label: 'Sign-ins' },
  { prefix: 'user.', label: 'Accounts' },
  { prefix: 'net.', label: 'Nets' },
  { prefix: 'schedule.', label: 'Schedules' },
  { prefix: 'check_in.', label: 'Check-ins' },
  { prefix: 'chat.', label: 'Chat' },
  { prefix: 'off_net_log.', label: 'Off-net log' },
  { prefix: 'admin.', label: 'Site settings' },
  { prefix: 'frequency.', label: 'Frequencies' },
  { prefix: 'contact.', label: 'Contacts' },
  { prefix: 'backup.', label: 'Backups' },
];

export const ACTION_LABELS: Record<string, string> = {
  'alert.failed_sign_ins': 'Failed sign-in alert sent',
  'alert.muted_often': 'Muted-by-others alert sent',

  'auth.signed_in': 'Signed in',
  'auth.password_failed': 'Wrong password',
  'auth.mfa_failed': 'Wrong two-factor code',
  'auth.banned_sign_in_refused': 'Banned account tried to sign in',

  'user.created': 'Account created',
  'user.created_by_admin': 'Account created by an admin',
  'user.profile_changed': 'Profile changed',
  'user.avatar_changed': 'Profile picture changed',
  'user.avatar_removed': 'Profile picture removed',
  'user.email_change_requested': 'Asked to change email',
  'user.email_changed': 'Email changed',
  'user.password_set': 'Password set',
  'user.password_changed': 'Password changed',
  'user.mfa_enabled': 'Two-factor turned on',
  'user.mfa_replaced': 'Two-factor device replaced',
  'user.mfa_disabled': 'Two-factor turned off',
  'user.admin_edited': 'Account edited by an admin',
  'user.role_changed': 'Site role changed',
  'user.banned': 'Banned',
  'user.unbanned': 'Unbanned',
  'user.password_reset_by_admin': 'Password reset by an admin',
  'user.mfa_reset_by_admin': 'Two-factor reset by an admin',
  'user.early_access_granted': 'Early schedule access granted',
  'user.early_access_revoked': 'Early schedule access revoked',
  'user.callsign_claim_reverted': 'Callsign takeover reverted',
  'user.deleted': 'Account deleted',

  'net.closed': 'Net closed',
  'net.auto_closed': 'Net closed automatically',
  'net.cancelled': 'Net cancelled',
  'net.restored': 'Net restored',
  'net.archived': 'Net archived',
  'net.auto_archived': 'Net archived automatically',
  'net.unarchived': 'Net unarchived',
  'net.deleted': 'Net deleted',
  'net.role_assigned': 'Net role given',
  'net.role_removed': 'Net role removed',
  'net.ncs_claimed': 'Claimed NCS',

  'schedule.deleted': 'Schedule deleted',
  'schedule.merged': 'Schedules merged into this one',
  'schedule.merged_away': 'Schedule merged into another',
  'schedule.manager_changed': 'Schedule handed to a new manager',
  'schedule.staff_added': 'Staff added',
  'schedule.staff_removed': 'Staff removed',
  'schedule.staff_changed': 'Staff changed',
  'schedule.rotation_added': 'Added to NCS rotation',
  'schedule.rotation_removed': 'Removed from NCS rotation',
  'schedule.rotation_cleared': 'NCS rotation cleared',

  'check_in.deleted': 'Check-in deleted',
  'net.station_blocked': 'Station removed and blocked from the net',
  'net.station_unblocked': 'Station unblocked',
  'chat.message_deleted': "Someone else's chat message deleted",
  'chat.station_muted': 'Station muted for everyone',
  'chat.station_unmuted': 'Station unmuted for everyone',
  'chat.muted_by_peer': 'Muted by another station',
  'chat.unmuted_by_peer': 'Unmuted by another station',
  'off_net_log.deleted': 'Off-net log entry deleted',

  'admin.settings_changed': 'Site settings changed',
  'admin.logo_changed': 'Site logo changed',
  'admin.logo_removed': 'Site logo removed',
  'admin.field_created': 'Check-in field added',
  'admin.field_changed': 'Check-in field changed',
  'admin.field_archived': 'Check-in field archived',
  'admin.emailed_all_users': 'Emailed all users',
  'frequency.deleted': 'Frequency deleted',
  'contact.deleted': 'Contact deleted',

  'backup.downloaded': 'Backup downloaded',
  'backup.key_changed': 'Backup key changed',
  'backup.key_file_downloaded': 'Backup key file downloaded',
  'backup.settings_changed': 'Backup settings changed',
  'backup.target_added': 'Backup destination added',
  'backup.target_changed': 'Backup destination changed',
  'backup.target_removed': 'Backup destination removed',
  'backup.target_key_regenerated': 'Backup destination key replaced',
  'backup.target_host_key_trusted': 'Backup server key trusted',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** "Field: old → new" lines for an event's recorded changes. */
export function describeChanges(details: ActivityEvent['details']): string[] {
  const changes = details?.changes;
  if (!changes || typeof changes !== 'object') return [];
  return Object.entries(changes as Record<string, [unknown, unknown]>).map(
    ([field, [before, after]]) => `${field.replace(/_/g, ' ')}: ${show(before)} → ${show(after)}`,
  );
}

/** The event's other details, one "key: value" line each. */
export function describeDetails(details: ActivityEvent['details']): string[] {
  if (!details) return [];
  return Object.entries(details)
    .filter(([key]) => key !== 'changes')
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${show(value)}`);
}
