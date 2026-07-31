// Shared shape of the Profile page's edit form, used by both ProfileTab and
// SettingsTab (they submit the same PUT /users/me via one shared handleSubmit
// owned by the parent Profile page).
export interface ProfileFormData {
  name: string;
  callsign: string;
  gmrs_callsign: string;
  callsigns: string[];
  skywarn_number: string;
  location: string;
  prefer_utc: boolean;
  show_activity_in_chat: boolean;
  location_awareness: boolean;
  email_notifications: boolean;
  notify_net_start: boolean;
  notify_net_close: boolean;
  notify_net_reminder: boolean;
  notify_ics309: boolean;
  notify_whats_new: boolean;
  theme: string | null;
}
