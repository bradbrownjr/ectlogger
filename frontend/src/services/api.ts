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
  console.log('[API] Request to:', config.url);
  console.log('[API] Token from localStorage:', token ? token.substring(0, 20) + '...' : 'none');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log('[API] Authorization header set');
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('[API] 401 Unauthorized - redirecting to login');
      console.error('[API] Request URL:', error.config?.url);
      console.error('[API] Error details:', error.response?.data);
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
