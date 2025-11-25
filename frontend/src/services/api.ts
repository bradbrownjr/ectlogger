import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
      console.error('[API] 401 Unauthorized - redirecting to login');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
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
};

// Net API
export const netApi = {
  create: (data: any) => api.post('/nets/', data),
  list: (status?: string) => api.get('/nets/', { params: { status } }),
  get: (id: number) => api.get(`/nets/${id}`),
  update: (id: number, data: any) => api.put(`/nets/${id}`, data),
  start: (id: number) => api.post(`/nets/${id}/start`),
  close: (id: number) => api.post(`/nets/${id}/close`),
  delete: (id: number) => api.delete(`/nets/${id}`),
  setActiveFrequency: (netId: number, frequencyId: number) => 
    api.put(`/nets/${netId}/active-frequency/${frequencyId}`),
  clearActiveFrequency: (netId: number) => 
    api.delete(`/nets/${netId}/active-frequency`),
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
  create: (data: any) => api.post('/frequencies/', data),
  list: () => api.get('/frequencies/'),
  update: (id: number, data: any) => api.put(`/frequencies/${id}`, data),
  delete: (id: number) => api.delete(`/frequencies/${id}`),
};

// NCS Rotation API
export const ncsRotationApi = {
  // Rotation members
  listMembers: (templateId: number) => 
    api.get(`/ncs-rotation/templates/${templateId}/ncs-rotation/members`),
  addMember: (templateId: number, data: { user_id: number; position?: number }) => 
    api.post(`/ncs-rotation/templates/${templateId}/ncs-rotation/members`, data),
  removeMember: (templateId: number, memberId: number) => 
    api.delete(`/ncs-rotation/templates/${templateId}/ncs-rotation/members/${memberId}`),
  reorderMembers: (templateId: number, memberIds: number[]) => 
    api.put(`/ncs-rotation/templates/${templateId}/ncs-rotation/members/reorder`, { member_ids: memberIds }),
  updateMember: (templateId: number, memberId: number, data: { is_active?: boolean; position?: number }) =>
    api.put(`/ncs-rotation/templates/${templateId}/ncs-rotation/members/${memberId}`, data),
  
  // Schedule
  getSchedule: (templateId: number, weeks?: number) => 
    api.get(`/ncs-rotation/templates/${templateId}/ncs-rotation/schedule`, { params: { weeks } }),
  getNextNCS: (templateId: number) => 
    api.get(`/ncs-rotation/templates/${templateId}/ncs-rotation/next`),
  
  // Overrides
  listOverrides: (templateId: number) => 
    api.get(`/ncs-rotation/templates/${templateId}/ncs-rotation/overrides`),
  createOverride: (templateId: number, data: { net_date: string; original_user_id: number | null; replacement_user_id: number | null; reason?: string; is_cancelled?: boolean }) => 
    api.post(`/ncs-rotation/templates/${templateId}/ncs-rotation/overrides`, data),
  deleteOverride: (templateId: number, overrideId: number) => 
    api.delete(`/ncs-rotation/templates/${templateId}/ncs-rotation/overrides/${overrideId}`),
};
