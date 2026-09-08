import { api } from '@/lib/apiClient';

export const alertsApi = {
  list: (params) => api.get('/alerts', params),
  nearby: (params) => api.get('/alerts/nearby', params),
  create: (payload) => api.post('/alerts', payload),
  remove: (id) => api.delete(`/alerts/${id}`),
};
