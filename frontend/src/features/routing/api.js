import { api } from '@/lib/apiClient';

export const routingApi = {
  plan: (payload) => api.post('/routes', payload),
  score: (payload) => api.post('/routes/score', payload),
  detail: (id) => api.get(`/routes/${id}`),
  geocode: (q, options) => api.get('/routes/geocode', { q }, options),
};
