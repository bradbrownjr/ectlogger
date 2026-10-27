import axios from 'axios';
import type { CoverageSitePayload } from '../utils/siteDrafts';

// Default includes /api suffix for backend routes
// For LAN development: http://localhost:8000/api
// For production: https://yourdomain.com/api
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Backend origin with the /api suffix stripped, for routes mounted outside it
// (e.g. RSS feeds at /feed/*, which need to be reachable by plain HTTP GET
// without a JWT, so they live alongside /api and /ws rather than under /api).
export const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

// Filename extension only (the backend goes by the multipart part's actual
// Content-Type, not this), kept accurate so a saved/inspected upload isn't
// mislabeled -- net/schedule logo blobs are now PNG/WebP when the source had
// one, not always JPEG (see NetLogoSection.tsx).
const logoExtension = (mimeType: string) =>
  mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ========== BACKGROUND REQUEST MARKER ==========
// Spread into an axios config to mark a call as one the app made on a timer,
// rather than one the operator asked for:
//   api.get('/traffic/inbox', BACKGROUND_REQUEST_CONFIG)
//
// The backend skips its `last_active` bookkeeping for these, so a logged-in
// tab left open on the dashboard stops looking like somebody at the keyboard
// (see backend/app/dependencies.py's BACKGROUND_REQUEST_HEADER). Use it for
// every polled/interval-driven request; never for one triggered by a click,
// a navigation, or a form submit.
export const BACKGROUND_REQUEST_CONFIG = {
  headers: { 'X-Background-Request': '1' },
} as const;

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Matches app.dependencies.MFA_SETUP_REQUIRED_DETAIL verbatim -- keep these
// two in sync. Lets the interceptor tell "you're not an admin" apart from
// "you're an admin but haven't enrolled MFA yet" and route to enrollment
// instead of just showing a generic access-denied error.
export const MFA_SETUP_REQUIRED_DETAIL = 'Set up two-factor authentication to use admin features.';

// Handle responses: persist refreshed token and handle 401 logout
api.interceptors.response.use(
  (response) => {
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      localStorage.setItem('token', newToken);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // A 401 with no stored token just means a guest hit a login-required
      // resource while browsing a public net/report page -- that's expected
      // and the calling code already handles the rejected promise. Only a
      // 401 on a request that WAS sending a token means the session itself
      // died (expired/revoked), which is the case that should log the user
      // out and bounce to /login.
      const hadToken = !!localStorage.getItem('token');
      const isVerifyingMagicLink = window.location.pathname === '/auth/verify';
      if (hadToken && !isVerifyingMagicLink) {
        console.error('[API] 401 Unauthorized - redirecting to login');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    } else if (
      error.response?.status === 403 &&
      error.response?.data?.detail === MFA_SETUP_REQUIRED_DETAIL &&
      window.location.pathname !== '/profile'
    ) {
      // An admin without MFA enrolled hit an admin-only route. Send them to
      // enroll instead of showing a generic "access denied".
      window.location.href = '/profile?tab=security&mfaRequired=1';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authApi = {
  // redirect: in-app path the emailed link lands on after sign-in
  requestMagicLink: (email: string, redirect?: string | null) =>
    api.post('/auth/magic-link/request', { email: email.trim().toLowerCase(), redirect: redirect || undefined }),
  verifyMagicLink: (token: string, totp_code?: string) =>
    api.post('/auth/magic-link/verify', { token, totp_code }),
  // Emails a fresh link to the address an expired one was issued for.
  resendMagicLink: (token: string, redirect?: string | null) =>
    api.post('/auth/magic-link/resend', { token, redirect: redirect || undefined }),
  passwordLogin: (identifier: string, password: string, totp_code?: string) =>
    api.post('/auth/login', { identifier, password, totp_code }),
  setPassword: (new_password: string, current_password?: string) =>
    api.post('/auth/password/set', { new_password, current_password }),
  mfaSetupStart: () => api.post('/auth/mfa/setup/start'),
  mfaSetupConfirm: (totp_code: string) => api.post('/auth/mfa/setup/confirm', { totp_code }),
  mfaReplaceStart: (password: string) => api.post('/auth/mfa/replace/start', { password }),
  mfaReplaceConfirm: (totp_code: string) => api.post('/auth/mfa/replace/confirm', { totp_code }),
  mfaDisable: (password: string) => api.post('/auth/mfa/disable', { password }),
  // Self-service email change: the link goes to the new address, and the
  // change happens only when it is confirmed from that link.
  requestEmailChange: (new_email: string, totp_code?: string) =>
    api.post('/auth/email-change/request', { new_email: new_email.trim().toLowerCase(), totp_code: totp_code || undefined }),
  confirmEmailChange: (token: string) => api.post('/auth/email-change/confirm', { token }),
  // Backup sign-in addresses (backend routers/auth.py BACKUP EMAILS). A new
  // one is added only when confirmed from the link sent to it.
  getBackupEmails: () => api.get('/auth/backup-emails'),
  requestBackupEmail: (email: string, totp_code?: string) =>
    api.post('/auth/backup-emails/request', { email: email.trim().toLowerCase(), totp_code: totp_code || undefined }),
  confirmBackupEmail: (token: string) => api.post('/auth/backup-emails/confirm', { token }),
  removeBackupEmail: (email: string, totp_code?: string) =>
    api.post('/auth/backup-emails/remove', { email, totp_code: totp_code || undefined }),
  makeBackupEmailPrimary: (email: string, totp_code?: string) =>
    api.post('/auth/backup-emails/make-primary', { email, totp_code: totp_code || undefined }),
  getCurrentUser: () =>
    api.get('/users/me'),
};

// User API
export const userApi = {
  // Admin: schedule entries an account took over by callsign, and undoing one.
  listCallsignClaims: (userId: number) => api.get(`/users/${userId}/callsign-claims`),
  // An account's backup sign-in addresses (admin).
  listBackupEmails: (userId: number) => api.get(`/users/${userId}/backup-emails`),
  removeBackupEmail: (userId: number, backupId: number) => api.delete(`/users/${userId}/backup-emails/${backupId}`),
  // Pairs of accounts that are probably one operator (admin).
  listDuplicates: () => api.get('/users/duplicates'),
  // Merge account sourceId into targetId (admin). The preview changes nothing.
  mergePreview: (targetId: number, sourceId: number) =>
    api.get(`/users/${targetId}/merge-preview`, { params: { source_id: sourceId } }),
  mergeAccount: (targetId: number, sourceId: number, mfaCode: string) =>
    api.post(`/users/${targetId}/merge`, { source_id: sourceId, mfa_code: mfaCode }),
  revertCallsignClaim: (userId: number, claimId: number) =>
    api.post(`/users/${userId}/callsign-claims/${claimId}/revert`),
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: any) => api.put('/users/me', data),
  // lat/lon are sent rounded to ~1 km (see LocationContext) so the server can
  // name the town; only the grid is required.
  updateLocation: (location: string, lat?: number, lon?: number) =>
    api.put('/users/me/location', { location, lat, lon }),
  // Phase 5 of "Can hear" propagation logging (see docs/ROADMAP.md) - the
  // current user's personal coverage rollup for the Profile "Coverage" tab.
  getCanHearCoverage: () => api.get('/users/me/can-hear-coverage'),
  listUsers: () => api.get('/users'),
  // Minimal directory of active users (id/callsign/name) — available to any
  // authenticated user, used to populate staff/rotation pickers without
  // requiring admin access.
  listDirectory: () => api.get('/users/directory'),
  lookupByCallsign: (callsign: string) => api.get(`/users/lookup/${encodeURIComponent(callsign)}`),
  // Admin recovery actions for a user locked out of magic-link email or a lost authenticator.
  adminResetPassword: (userId: number) => api.post(`/users/${userId}/password/reset`),
  adminResetMfa: (userId: number) => api.post(`/users/${userId}/mfa/reset`),
  getPopup: (userId: number, netId?: number) =>
    api.get(`/users/${userId}/popup${netId ? `?net_id=${netId}` : ''}`),
  // Guest/accountless callsign popup -- for a check-in with no linked user_id.
  getPopupByCallsign: (callsign: string) =>
    api.get(`/users/callsign/${encodeURIComponent(callsign)}/popup`),
};

// Net API
export const netApi = {
  create: (data: any) => api.post('/nets/', data),
  list: (status?: string) => api.get('/nets/', { params: { status } }),
  // Archived Nets shows both terminal "not on the active dashboard" states side by side.
  // Built with URLSearchParams (not a plain object) so axios emits repeated
  // ?status=archived&status=cancelled keys, matching FastAPI's List[NetStatus]
  // query parsing -- axios's default array serialization uses status[]=... instead.
  listArchived: () => {
    const params = new URLSearchParams();
    params.append('include_archived', 'true');
    params.append('status', 'archived');
    params.append('status', 'cancelled');
    params.append('limit', '1000');
    return api.get('/nets/', { params });
  },
  get: (id: number, background = false) =>
    api.get(`/nets/${id}`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  update: (id: number, data: any) => api.put(`/nets/${id}`, data),
  start: (id: number) => api.post(`/nets/${id}/start`),
  openLobby: (id: number) => api.post(`/nets/${id}/open-lobby`),
  // holdLog closes without emailing the log; sendLog sends it later.
  close: (id: number, holdLog = false) => api.post(`/nets/${id}/close`, holdLog ? { hold_log: true } : undefined),
  sendLog: (id: number) => api.post(`/nets/${id}/send-log`),
  archive: (id: number) => api.post(`/nets/${id}/archive`),
  unarchive: (id: number) => api.post(`/nets/${id}/unarchive`),
  cancel: (id: number, reason?: string) => api.post(`/nets/${id}/cancel`, { reason: reason || null }),
  restore: (id: number) => api.post(`/nets/${id}/restore`),
  delete: (id: number) => api.delete(`/nets/${id}`),
  setActiveFrequency: (netId: number, frequencyId: number) => 
    api.put(`/nets/${netId}/active-frequency/${frequencyId}`),
  clearActiveFrequency: (netId: number) => 
    api.delete(`/nets/${netId}/active-frequency`),
  claimNcs: (netId: number) => api.post(`/nets/${netId}/claim-ncs`),
  // Attach (or detach with template_id=null) an existing net to a schedule/template.
  // Used by NCS/admin when a net was started outside its schedule and needs to be
  // counted under the right schedule's stats.
  linkToTemplate: (netId: number, templateId: number | null) =>
    api.put(`/nets/${netId}/template`, { template_id: templateId }),
  getTopicResponses: (id: number) => api.get(`/nets/${id}/topic-responses`),
  getPollResults: (id: number) => api.get(`/nets/${id}/poll-results`),
  // Structured (non-CSV) ICS-309 log, for ICS309PrintView's form-accurate PDF.
  // Draws from the same _build_ics309_data() as the CSV download so the two
  // never diverge -- see routers/nets_export.py.
  getIcs309Log: (id: number) => api.get(`/nets/${id}/export/ics309`, { params: { format: 'json' } }),
  uploadLogo: (id: number, file: Blob) => {
    const form = new FormData();
    form.append('file', file, `logo.${logoExtension(file.type)}`);
    return api.post(`/nets/${id}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteLogo: (id: number) => api.delete(`/nets/${id}/logo`),
};

// Check-in API
export const checkInApi = {
  create: (netId: number, data: any) => 
    api.post(`/check-ins/nets/${netId}/check-ins`, data),
  list: (netId: number, background = false) =>
    api.get(`/check-ins/nets/${netId}/check-ins`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  update: (id: number, data: any) => 
    api.put(`/check-ins/check-ins/${id}`, data),
  delete: (id: number) => 
    api.delete(`/check-ins/check-ins/${id}`),
  toggleHand: (id: number) =>
    api.post(`/check-ins/check-ins/${id}/toggle-hand`),
  getExpectedCode: (id: number) =>
    api.get(`/check-ins/check-ins/${id}/expected-code`),
  verifyIdentity: (id: number, verified: boolean) =>
    api.post(`/check-ins/check-ins/${id}/verify-identity`, { verified }),
};

// "Can hear" propagation logging API
export const canHearApi = {
  list: (netId: number, background = false) =>
    api.get(`/nets/${netId}/can-hear-reports`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  save: (netId: number, payload: { reporter_check_in_id: number; heard_check_in_ids: number[]; frequency_id?: number | null; operating_position?: string | null; coverage_site_id?: number | null }) =>
    api.put(`/nets/${netId}/can-hear-reports`, payload),
  updateFrequency: (netId: number, reportId: number, frequencyId: number | null) =>
    api.patch(`/nets/${netId}/can-hear-reports/${reportId}`, { frequency_id: frequencyId }),
};

// Coverage sites, contacts outside the net, and the by-site rollup
// (backend routers/coverage_sites.py). Reads are open to guests.
export const coverageSiteApi = {
  listSites: (netId: number, background = false) =>
    api.get(`/nets/${netId}/coverage-sites`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  saveSites: (netId: number, sites: CoverageSitePayload[]) =>
    api.put(`/nets/${netId}/coverage-sites`, sites),
  // An EMA's spreadsheet read into rows of text, for the import dialog to
  // map. Nothing is saved.
  readSiteFile: (netId: number, file: File, sheet?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (sheet) form.append('sheet', sheet);
    return api.post<{ sheets: string[]; sheet: string | null; rows: string[][]; truncated: boolean }>(
      `/nets/${netId}/coverage-sites/read-file`, form, { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
  listContacts: (netId: number, background = false) =>
    api.get(`/nets/${netId}/coverage-contacts`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  saveContacts: (netId: number, reporterCheckInId: number, contacts: { frequency_id: number | null; callsign: string | null; station: string | null; county: string | null; state: string | null; two_way: boolean }[]) =>
    api.put(`/nets/${netId}/coverage-contacts`, { reporter_check_in_id: reporterCheckInId, contacts }),
  listAccess: (netId: number, background = false) =>
    api.get(`/nets/${netId}/coverage-access`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  saveAccess: (netId: number, reporterCheckInId: number, results: { target_site_id: number; reached: boolean; note: string | null }[]) =>
    api.put(`/nets/${netId}/coverage-access`, { reporter_check_in_id: reporterCheckInId, results }),
  summary: (netId: number, background = false) =>
    api.get(`/nets/${netId}/site-coverage`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
};

// Drill plan for one net (routers/drill_plans.py). get 404s when the net
// has none; `background` marks the page's refresh poll.
// Off-net log: a station's activity away from the net, for its ICS-309
// (backend routers/off_net_log.py). A station's own entry waits for review.
export interface OffNetLogEntryPayload {
  occurred_at: string;
  from_station?: string | null;
  to_station: string;
  channel?: string | null;
  message: string;
  message_id?: string | null;
}

export interface OffNetLogEntry extends OffNetLogEntryPayload {
  id: number;
  net_id: number;
  from_station: string;
  status: 'pending' | 'accepted' | 'rejected';
  entered_by_user_id: number | null;
  entered_by_callsign: string | null;
  reviewed_by_callsign: string | null;
  reviewed_at: string | null;
  can_edit: boolean;
  can_review: boolean;
}

export interface OffNetLogList {
  entries: OffNetLogEntry[];
  can_add: boolean;
  adds_accepted: boolean;
  can_review: boolean;
  own_callsign: string | null;
  pending_count: number;
}

export const offNetLogApi = {
  list: (netId: number) => api.get<OffNetLogList>(`/nets/${netId}/off-net-log`),
  add: (netId: number, data: OffNetLogEntryPayload) => api.post<OffNetLogEntry>(`/nets/${netId}/off-net-log`, data),
  update: (netId: number, entryId: number, data: OffNetLogEntryPayload) =>
    api.put<OffNetLogEntry>(`/nets/${netId}/off-net-log/${entryId}`, data),
  review: (netId: number, entryId: number, status: 'accepted' | 'rejected') =>
    api.post<OffNetLogEntry>(`/nets/${netId}/off-net-log/${entryId}/review`, { status }),
  acceptPending: (netId: number) => api.post<{ accepted: number }>(`/nets/${netId}/off-net-log/accept-pending`),
  remove: (netId: number, entryId: number) => api.delete(`/nets/${netId}/off-net-log/${entryId}`),
};

// Stations net control removed from a net and blocked from checking back in
// (backend routers/net_blocks.py).
export interface NetBlock {
  id: number;
  net_id: number;
  callsign: string;
  user_id: number | null;
  blocked_by_callsign: string | null;
  created_at: string | null;
}

export const netBlockApi = {
  list: (netId: number) => api.get<NetBlock[]>(`/nets/${netId}/blocks`),
  block: (netId: number, checkInId: number) => api.post<NetBlock>(`/nets/${netId}/blocks`, { check_in_id: checkInId }),
  unblock: (netId: number, blockId: number) => api.delete(`/nets/${netId}/blocks/${blockId}`),
};

export const drillPlanApi = {
  get: (netId: number, background = false) =>
    api.get(`/nets/${netId}/drill-plan`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  save: (netId: number, plan: any) => api.put(`/nets/${netId}/drill-plan`, plan),
  remove: (netId: number) => api.delete(`/nets/${netId}/drill-plan`),
  send: (netId: number, eventId: number, data: { handled_by?: string | null }) =>
    api.post(`/nets/${netId}/drill-plan/events/${eventId}/send`, data),
};

// Template API
export const templateApi = {
  create: (data: any) => api.post('/templates/', data),
  // Emails the admins asking for early access to schedule creation
  // (templates_core.py::request_early_access). 400 if not needed, 429 after 3/day.
  requestEarlyAccess: (note?: string) => api.post('/templates/early-access-request', { note }),
  list: (params?: { my_templates?: boolean; include_inactive?: boolean }) => 
    api.get('/templates/', { params }),
  get: (id: number) => api.get(`/templates/${id}`),
  // Schedule page month calendar: real nets plus projected future slots
  // starting in [start, end). Window is capped at 62 days server-side.
  calendar: (start: Date, end: Date) =>
    api.get('/templates/calendar', { params: { start: start.toISOString(), end: end.toISOString() } }),
  listSubscriptions: (id: number) => api.get(`/templates/${id}/subscriptions`),
  update: (id: number, data: any) => api.put(`/templates/${id}`, data),
  delete: (id: number) => api.delete(`/templates/${id}`),
  subscribe: (id: number) => api.post(`/templates/${id}/subscribe`),
  unsubscribe: (id: number) => api.delete(`/templates/${id}/subscribe`),
  createNetFromTemplate: (id: number, data?: { scheduled_start_time?: string | null }) =>
    api.post(`/templates/${id}/create-net`, data || {}),
  mergePreview: (data: { target_template_id: number; source_template_ids: number[] }) =>
    api.post('/templates/merge/preview', data),
  merge: (data: { target_template_id: number; source_template_ids: number[] }) =>
    api.post('/templates/merge', data),
  // List nets the current user can attach to a given schedule/template.
  // Returns nets owned by the caller (or all nets if admin) that aren't already
  // attached to this template.
  linkableNets: (templateId: number) =>
    api.get(`/templates/${templateId}/linkable-nets`),
  uploadLogo: (id: number, file: Blob) => {
    const form = new FormData();
    form.append('file', file, `logo.${logoExtension(file.type)}`);
    return api.post(`/templates/${id}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteLogo: (id: number) => api.delete(`/templates/${id}/logo`),
};


// Frequency API
// The net or schedule form a frequency is changed from. Its own use of a
// frequency doesn't count against the person who added it
// (routers/frequencies.py::change_refusal).
export interface FrequencyFormContext {
  net_id?: number;
  template_id?: number;
}

export const frequencyApi = {
  create: (data: any) => api.post('/frequencies', data),
  list: (context?: FrequencyFormContext) => api.get('/frequencies', { params: context }),
  listWithUsage: () => api.get('/frequencies/admin/with-usage'),
  update: (id: number, data: any, context?: FrequencyFormContext) =>
    api.put(`/frequencies/${id}`, data, { params: context }),
  delete: (id: number, context?: FrequencyFormContext) =>
    api.delete(`/frequencies/${id}`, { params: context }),
  // Ask the admins for a change the server refused (edit_refused / delete_refused)
  requestChange: (id: number, data: { action: 'edit' | 'delete'; proposed?: any; note?: string } & FrequencyFormContext) =>
    api.post(`/frequencies/${id}/change-request`, data),
};

// NCS Rotation API
export const ncsRotationApi = {
  // Rotation members
  listMembers: (templateId: number) => 
    api.get(`/templates/${templateId}/ncs-rotation/members`),
  // An account (user_id) or a callsign with no account yet; see utils/staffPeople.ts.
  addMember: (templateId: number, data: { user_id?: number; callsign?: string; invite_email?: string }) =>
    api.post(`/templates/${templateId}/ncs-rotation/members`, data),
  removeMember: (templateId: number, memberId: number) => 
    api.delete(`/templates/${templateId}/ncs-rotation/members/${memberId}`),
  clearAllMembers: (templateId: number) =>
    api.delete(`/templates/${templateId}/ncs-rotation/members`),
  reorderMembers: (templateId: number, memberIds: number[]) => 
    api.put(`/templates/${templateId}/ncs-rotation/members/reorder`, { member_ids: memberIds }),
  // callsign corrects a callsign-only member's typo; link gives it to the account that now has it.
  updateMember: (templateId: number, memberId: number, data: { is_active?: boolean; callsign?: string; link?: boolean }) =>
    api.patch(`/templates/${templateId}/ncs-rotation/members/${memberId}`, data),
  
  // Schedule
  getSchedule: (templateId: number, weeks?: number) => 
    api.get(`/templates/${templateId}/ncs-rotation/schedule`, { params: { weeks } }),
  getNextNCS: (templateId: number) => 
    api.get(`/templates/${templateId}/ncs-rotation/next`),
  
  // Overrides
  listOverrides: (templateId: number) => 
    api.get(`/templates/${templateId}/ncs-rotation/overrides`),
  // Neither replacement field = cancel the net.
  createOverride: (templateId: number, data: { scheduled_date: string; replacement_user_id?: number | null; replacement_callsign?: string | null; reason?: string }) =>
    api.post(`/templates/${templateId}/ncs-rotation/overrides`, data),
  deleteOverride: (templateId: number, overrideId: number) => 
    api.delete(`/templates/${templateId}/ncs-rotation/overrides/${overrideId}`),
};

// Template Staff API (who can run nets, separate from rotation schedule)
export const templateStaffApi = {
  list: (templateId: number) =>
    api.get(`/templates/${templateId}/ncs-rotation/staff`),
  add: (templateId: number, data: { user_id?: number; callsign?: string; invite_email?: string }) =>
    api.post(`/templates/${templateId}/ncs-rotation/staff`, data),
  // Callsign-only entries: fix a typo, link to the account that now has the
  // callsign, or (re)send a sign-up invite.
  updatePlaceholder: (templateId: number, staffId: number, data: { callsign?: string; link?: boolean; invite_email?: string }) =>
    api.patch(`/templates/${templateId}/ncs-rotation/staff/${staffId}`, data),
  remove: (templateId: number, staffId: number) =>
    api.delete(`/templates/${templateId}/ncs-rotation/staff/${staffId}`),
  updateActive: (templateId: number, staffId: number, isActive: boolean) =>
    api.patch(`/templates/${templateId}/ncs-rotation/staff/${staffId}`, { is_active: isActive }),
  updateCoManager: (templateId: number, staffId: number, isCoManager: boolean) =>
    api.patch(`/templates/${templateId}/ncs-rotation/staff/${staffId}`, { is_co_manager: isCoManager }),
};

// Statistics API
export const statisticsApi = {
  getGlobal: (days: number = 30) => api.get('/statistics/global', { params: { days } }),
  getNetStats: (netId: number) => api.get(`/statistics/nets/${netId}`),
  getNetOperators: (netId: number) => api.get(`/statistics/nets/${netId}/operators`),
  getNetDaily: (netId: number) => api.get(`/statistics/nets/${netId}/daily`),
  getTemplateStats: (templateId: number, days?: number) =>
    api.get(`/statistics/templates/${templateId}`, { params: days !== undefined ? { days } : undefined }),
  getUserStats: () => api.get('/statistics/users/me'),
  getUserStatsById: (userId: number) => api.get(`/statistics/users/${userId}`),
  getCheckinMap: (days: number = 0) => api.get('/statistics/checkin-map', { params: { days } }),
};

// Credit-only roles for stations with no account (backend
// routers/nets_roles.py). Kept apart from netRoleApi.list on purpose: that
// list is matched to check-ins by user_id, and a guest row's null would match
// one of these. Match these by callsign (utils/stationRole.ts).
export const callsignRoleApi = {
  list: (netId: number, background = false) =>
    api.get(`/nets/${netId}/callsign-roles`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  assign: (netId: number, callsign: string, role: string) =>
    api.post(`/nets/${netId}/callsign-roles`, { callsign, role }),
  remove: (netId: number, roleId: number) => api.delete(`/nets/${netId}/callsign-roles/${roleId}`),
};

// Net Role API (for NCS frequency claiming)
export const netRoleApi = {
  list: (netId: number, background = false) =>
    api.get(`/nets/${netId}/roles`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  toggleSelf: (netId: number) => api.put(`/nets/${netId}/roles/toggle-self`),
  claimFrequency: (netId: number, roleId: number, frequencyId: number) =>
    api.put(`/nets/${netId}/roles/${roleId}/frequency/${frequencyId}`),
  clearFrequency: (netId: number, roleId: number) =>
    api.delete(`/nets/${netId}/roles/${roleId}/frequency`),
};

// Feedback API
export const feedbackApi = {
  submit: (data: {
    type: 'bug' | 'feature';
    subject: string;
    body: string;
    diagnostics?: string;
    screenshot_data?: string;
    screenshot_filename?: string;
    screenshot_mime?: string;
  }) => api.post('/feedback', data),
};

// Traffic API (Assisted Traffic Handling & Forms — radiograms, ICS-213, etc.)
// See docs/concepts/TRAFFIC-HANDLING-DESIGN.md sections 3.1-3.4 for the form
// CRUD/export/import surface and section 3.3 for the chain-of-custody log /
// inbox surface. Reminder endpoints are a later phase.
export const trafficApi = {
  // includeDisabled is admin-only (silently ignored server-side otherwise) --
  // used by AdminTrafficTab.tsx so a previously-disabled definition can be
  // found again and re-enabled.
  listDefinitions: (includeDisabled?: boolean) =>
    api.get('/traffic/definitions', { params: includeDisabled ? { include_disabled: true } : undefined }),
  getDefinition: (formType: string) => api.get(`/traffic/definitions/${formType}`),
  updateDefinition: (id: number, data: any) => api.put(`/traffic/definitions/${id}`, data),
  listArlMessages: () => api.get('/traffic/arl-messages'),

  create: (data: any) => api.post('/traffic/forms', data),
  list: (params?: any) => api.get('/traffic/forms', { params }),
  listForNet: (netId: number, params?: any, background = false) =>
    api.get(`/traffic/nets/${netId}/forms`, { params, ...(background ? BACKGROUND_REQUEST_CONFIG : {}) }),
  summary: (netId: number, background = false) =>
    api.get(`/traffic/nets/${netId}/summary`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  get: (id: number, background = false) =>
    api.get(`/traffic/forms/${id}`, background ? BACKGROUND_REQUEST_CONFIG : undefined),
  update: (id: number, data: any) => api.patch(`/traffic/forms/${id}`, data),
  delete: (id: number) => api.delete(`/traffic/forms/${id}`),
  // Set/clear the drill or demo label. Allowed regardless of append-only
  // state (unlike `update` above), so it also works on already-logged
  // traffic -- see routers/traffic_forms.py::set_test_category.
  setTestCategory: (id: number, testCategory: 'drill' | 'demo' | null) =>
    api.patch(`/traffic/forms/${id}/test-category`, { test_category: testCategory }),
  // responseType 'blob' since this returns a plaintext file download. The
  // printable PDF is rendered client-side now (RadiogramPrintView.tsx /
  // ICS213PrintView.tsx + utils/pdfExport.ts), not a server format option.
  exportForm: (id: number, format: 'text' = 'text') =>
    api.get(`/traffic/forms/${id}/export`, { params: { format }, responseType: 'blob' }),
  // Stateless parse-only preview (TRAFFIC-HANDLING-DESIGN.md D5) -- never
  // creates a Form. The review screen hands the result to FormRenderer/
  // RadiogramAssist pre-filled; only the ordinary `create` above commits.
  importPreview: (text: string) => api.post('/traffic/import/preview', { text }),

  // Define a new, reusable RRI strip type from a pasted example
  // (routers/traffic_strip_templates.py). tokenizeStripTemplate is stateless
  // (D5 shape, like importPreview above); createStripTemplate atomically
  // defines the type and -- unless file_first_form is false -- files the first
  // Form from the labeled values. Net settings defines the type up front and
  // passes false; the Import tab is defining from a real received strip and
  // leaves it true. Response is { definition, form } with form null in the
  // define-only case.
  tokenizeStripTemplate: (text: string) => api.post('/traffic/strip-templates/tokenize', { text }),
  createStripTemplate: (data: {
    form_type: string;
    title: string;
    net_id?: number;
    file_first_form?: boolean;
    fields: { label: string; starts_new_section: boolean; value: string }[];
  }) => api.post('/traffic/strip-templates', data),

  // Chain-of-custody log (routers/traffic_log.py)
  appendLogEntry: (formId: number, data: any) => api.post(`/traffic/forms/${formId}/log`, data),
  listLogEntries: (formId: number) => api.get(`/traffic/forms/${formId}/log`),
  deleteLogEntry: (formId: number, entryId: number) =>
    api.delete(`/traffic/forms/${formId}/log/${entryId}`),
  // `background` marks the navbar badge's 60s poll, so it doesn't count as
  // operator activity. The initial load and any manual refresh leave it off.
  getInbox: (background = false) =>
    api.get('/traffic/inbox', background ? BACKGROUND_REQUEST_CONFIG : undefined),
};

// Contact API (station contacts from check-in history)
export const contactApi = {
  list: (search?: string) => api.get('/contacts', { params: search ? { search } : undefined }),
  get: (id: number) => api.get(`/contacts/${id}`),
  create: (data: any) => api.post('/contacts', data),
  update: (id: number, data: any) => api.put(`/contacts/${id}`, data),
  delete: (id: number) => api.delete(`/contacts/${id}`),
  invite: (id: number) => api.post(`/contacts/${id}/invite`),
};

// Backups (Admin > Backups). Types live in components/admin/backups/types.ts.
// `background` marks the tab's own refresh while a backup runs, so an idle
// admin tab does not count as activity (see BACKGROUND_REQUEST_CONFIG).
export const backupApi = {
  overview: (background = false) =>
    api.get('/backups', background ? BACKGROUND_REQUEST_CONFIG : undefined),
  runs: (background = false) =>
    api.get('/backups/runs', background ? BACKGROUND_REQUEST_CONFIG : undefined),
  updateSettings: (data: any) => api.put('/backups/settings', data),
  setKey: (data: { passphrase: string; current_passphrase?: string; replace?: boolean }) =>
    api.post('/backups/key', data),
  downloadKeyFile: () => api.get('/backups/key/file', { responseType: 'blob' }),
  runNow: () => api.post('/backups/run'),
  verify: (runId: number, passphrase: string) =>
    api.post(`/backups/runs/${runId}/verify`, { passphrase }),
  download: (runId: number, mfaCode: string) =>
    api.post(`/backups/runs/${runId}/download`, { mfa_code: mfaCode }, { responseType: 'blob' }),
  targets: () => api.get('/backups/targets'),
  createTarget: (data: any) => api.post('/backups/targets', data),
  updateTarget: (id: number, data: any) => api.put(`/backups/targets/${id}`, data),
  deleteTarget: (id: number) => api.delete(`/backups/targets/${id}`),
  testTarget: (id: number) => api.post(`/backups/targets/${id}/test`),
  trustHostKey: (id: number, hostKey: string) =>
    api.post(`/backups/targets/${id}/trust-host-key`, { host_key: hostKey }),
  regenerateTargetKey: (id: number) => api.post(`/backups/targets/${id}/regenerate-key`),
};
