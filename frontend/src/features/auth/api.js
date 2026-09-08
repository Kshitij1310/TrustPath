import { api } from '@/lib/apiClient';

export const authApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
  updateSettings: (settings) => api.patch('/auth/settings', settings),
  deleteAccount: () => api.delete('/auth/me'),
};
