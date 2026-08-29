import axios from 'axios';

// Default includes /api suffix for backend routes
// For LAN development: http://localhost:8000/api
// For production: https://yourdomain.com/api
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Backend origin with the /api suffix stripped, for routes mounted outside it
// (e.g. RSS feeds at /feed/*, which need to be reachable by plain HTTP GET
// without a JWT, so they live alongside /api and /ws rather than under /api).
export const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

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
  requestMagicLink: (email: string) =>
    api.post('/auth/magic-link/request', { email }),
  verifyMagicLink: (token: string, totp_code?: string) =>
    api.post('/auth/magic-link/verify', { token, totp_code }),
  passwordLogin: (identifier: string, password: string, totp_code?: string) =>
    api.post('/auth/login', { identifier, password, totp_code }),
  setPassword: (new_password: string, current_password?: string) =>
    api.post('/auth/password/set', { new_password, current_password }),
  mfaSetupStart: () => api.post('/auth/mfa/setup/start'),
  mfaSetupConfirm: (totp_code: string) => api.post('/auth/mfa/setup/confirm', { totp_code }),
  mfaReplaceStart: (password: string) => api.post('/auth/mfa/replace/start', { password }),
  mfaReplaceConfirm: (totp_code: string) => api.post('/auth/mfa/replace/confirm', { totp_code }),
  mfaDisable: (password: string) => api.post('/auth/mfa/disable', { password }),
  getCurrentUser: () =>
    api.get('/users/me'),
};

// User API
export const userApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: any) => api.put('/users/me', data),
  updateLocation: (location: string) => api.put('/users/me/location', { location }),
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
  get: (id: number) => api.get(`/nets/${id}`),
  update: (id: number, data: any) => api.put(`/nets/${id}`, data),
  start: (id: number) => api.post(`/nets/${id}/start`),
  close: (id: number) => api.post(`/nets/${id}/close`),
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
};

// Check-in API
export const checkInApi = {
  create: (netId: number, data: any) => 
    api.post(`/check-ins/nets/${netId}/check-ins`, data),
  list: (netId: number) => 
    api.get(`/check-ins/nets/${netId}/check-ins`),
  update: (id: number, data: any) => 
    api.put(`/check-ins/check-ins/${id}`, data),
  delete: (id: number) => 
    api.delete(`/check-ins/check-ins/${id}`),
  toggleHand: (id: number) =>
    api.post(`/check-ins/check-ins/${id}/toggle-hand`),
};

// "Can hear" propagation logging API
export const canHearApi = {
  list: (netId: number) =>
    api.get(`/nets/${netId}/can-hear-reports`),
  save: (netId: number, payload: { reporter_check_in_id: number; heard_check_in_ids: number[]; frequency_id?: number | null; operating_position?: string | null }) =>
    api.put(`/nets/${netId}/can-hear-reports`, payload),
  updateFrequency: (netId: number, reportId: number, frequencyId: number | null) =>
    api.patch(`/nets/${netId}/can-hear-reports/${reportId}`, { frequency_id: frequencyId }),
};

// Template API
export const templateApi = {
  create: (data: any) => api.post('/templates/', data),
  list: (params?: { my_templates?: boolean; include_inactive?: boolean }) => 
    api.get('/templates/', { params }),
  get: (id: number) => api.get(`/templates/${id}`),
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
};


// Frequency API
export const frequencyApi = {
  create: (data: any) => api.post('/frequencies', data),
  list: () => api.get('/frequencies'),
  listWithUsage: () => api.get('/frequencies/admin/with-usage'),
  update: (id: number, data: any) => api.put(`/frequencies/${id}`, data),
  delete: (id: number) => api.delete(`/frequencies/${id}`),
};

// NCS Rotation API
export const ncsRotationApi = {
  // Rotation members
  listMembers: (templateId: number) => 
    api.get(`/templates/${templateId}/ncs-rotation/members`),
  addMember: (templateId: number, data: { user_id: number; position?: number }) => 
    api.post(`/templates/${templateId}/ncs-rotation/members`, data),
  removeMember: (templateId: number, memberId: number) => 
    api.delete(`/templates/${templateId}/ncs-rotation/members/${memberId}`),
  clearAllMembers: (templateId: number) =>
    api.delete(`/templates/${templateId}/ncs-rotation/members`),
  reorderMembers: (templateId: number, memberIds: number[]) => 
    api.put(`/templates/${templateId}/ncs-rotation/members/reorder`, { member_ids: memberIds }),
  updateMember: (templateId: number, memberId: number, data: { is_active?: boolean; position?: number }) =>
    api.put(`/templates/${templateId}/ncs-rotation/members/${memberId}`, data),
  
  // Schedule
  getSchedule: (templateId: number, weeks?: number) => 
    api.get(`/templates/${templateId}/ncs-rotation/schedule`, { params: { weeks } }),
  getNextNCS: (templateId: number) => 
    api.get(`/templates/${templateId}/ncs-rotation/next`),
  
  // Overrides
  listOverrides: (templateId: number) => 
    api.get(`/templates/${templateId}/ncs-rotation/overrides`),
  createOverride: (templateId: number, data: { scheduled_date: string; replacement_user_id: number | null; reason?: string }) => 
    api.post(`/templates/${templateId}/ncs-rotation/overrides`, data),
  deleteOverride: (templateId: number, overrideId: number) => 
    api.delete(`/templates/${templateId}/ncs-rotation/overrides/${overrideId}`),
};

// Template Staff API (who can run nets, separate from rotation schedule)
export const templateStaffApi = {
  list: (templateId: number) =>
    api.get(`/templates/${templateId}/ncs-rotation/staff`),
  add: (templateId: number, data: { user_id: number }) =>
    api.post(`/templates/${templateId}/ncs-rotation/staff`, data),
  remove: (templateId: number, staffId: number) =>
    api.delete(`/templates/${templateId}/ncs-rotation/staff/${staffId}`),
  updateActive: (templateId: number, staffId: number, isActive: boolean) =>
    api.patch(`/templates/${templateId}/ncs-rotation/staff/${staffId}`, { is_active: isActive }),
  updateCoManager: (templateId: number, staffId: number, isCoManager: boolean) =>
    api.patch(`/templates/${templateId}/ncs-rotation/staff/${staffId}`, { is_co_manager: isCoManager }),
};

// Statistics API
export const statisticsApi = {
  getGlobal: () => api.get('/statistics/global'),
  getNetStats: (netId: number) => api.get(`/statistics/nets/${netId}`),
  getNetOperators: (netId: number) => api.get(`/statistics/nets/${netId}/operators`),
  getNetDaily: (netId: number) => api.get(`/statistics/nets/${netId}/daily`),
  getTemplateStats: (templateId: number, days?: number) =>
    api.get(`/statistics/templates/${templateId}`, { params: days !== undefined ? { days } : undefined }),
  getUserStats: () => api.get('/statistics/users/me'),
  getUserStatsById: (userId: number) => api.get(`/statistics/users/${userId}`),
  getCheckinMap: () => api.get('/statistics/checkin-map'),
};

// Net Role API (for NCS frequency claiming)
export const netRoleApi = {
  list: (netId: number) => api.get(`/nets/${netId}/roles`),
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
  listForNet: (netId: number, params?: any) => api.get(`/traffic/nets/${netId}/forms`, { params }),
  summary: (netId: number) => api.get(`/traffic/nets/${netId}/summary`),
  get: (id: number) => api.get(`/traffic/forms/${id}`),
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
