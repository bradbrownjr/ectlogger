import axios from 'axios';

// Default includes /api suffix for backend routes
// For LAN development: http://localhost:8000/api
// For production: https://yourdomain.com/api
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect to login if we're already verifying a magic link
      const isVerifyingMagicLink = window.location.pathname === '/auth/verify';
      if (!isVerifyingMagicLink) {
        console.error('[API] 401 Unauthorized - redirecting to login');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authApi = {
  requestMagicLink: (email: string) => 
    api.post('/auth/magic-link/request', { email }),
  verifyMagicLink: (token: string) => 
    api.post('/auth/magic-link/verify', { token }),
  getCurrentUser: () => 
    api.get('/users/me'),
};

// User API
export const userApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: any) => api.put('/users/me', data),
  listUsers: () => api.get('/users'),
  lookupByCallsign: (callsign: string) => api.get(`/users/lookup/${encodeURIComponent(callsign)}`),
};

// Net API
export const netApi = {
  create: (data: any) => api.post('/nets/', data),
  list: (status?: string) => api.get('/nets/', { params: { status } }),
  listArchived: () => api.get('/nets/', { params: { include_archived: true, status: 'archived' } }),
  get: (id: number) => api.get(`/nets/${id}`),
  update: (id: number, data: any) => api.put(`/nets/${id}`, data),
  start: (id: number) => api.post(`/nets/${id}/start`),
  close: (id: number) => api.post(`/nets/${id}/close`),
  archive: (id: number) => api.post(`/nets/${id}/archive`),
  delete: (id: number) => api.delete(`/nets/${id}`),
  setActiveFrequency: (netId: number, frequencyId: number) => 
    api.put(`/nets/${netId}/active-frequency/${frequencyId}`),
  clearActiveFrequency: (netId: number) => 
    api.delete(`/nets/${netId}/active-frequency`),
  claimNcs: (netId: number) => api.post(`/nets/${netId}/claim-ncs`),
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
};

// Template API
export const templateApi = {
  create: (data: any) => api.post('/templates/', data),
  list: (params?: { my_templates?: boolean; include_inactive?: boolean }) => 
    api.get('/templates/', { params }),
  get: (id: number) => api.get(`/templates/${id}`),
  update: (id: number, data: any) => api.put(`/templates/${id}`, data),
  delete: (id: number) => api.delete(`/templates/${id}`),
  subscribe: (id: number) => api.post(`/templates/${id}/subscribe`),
  unsubscribe: (id: number) => api.delete(`/templates/${id}/subscribe`),
  createNetFromTemplate: (id: number) => api.post(`/templates/${id}/create-net`),
};

// Frequency API
export const frequencyApi = {
  create: (data: any) => api.post('/frequencies', data),
  list: () => api.get('/frequencies'),
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

// Statistics API
export const statisticsApi = {
  getGlobal: () => api.get('/statistics/global'),
  getNetStats: (netId: number) => api.get(`/statistics/nets/${netId}`),
  getNetOperators: (netId: number) => api.get(`/statistics/nets/${netId}/operators`),
  getNetDaily: (netId: number) => api.get(`/statistics/nets/${netId}/daily`),
  getTemplateStats: (templateId: number) => api.get(`/statistics/templates/${templateId}`),
  getUserStats: () => api.get('/statistics/users/me'),
  getUserStatsById: (userId: number) => api.get(`/statistics/users/${userId}`),
};
