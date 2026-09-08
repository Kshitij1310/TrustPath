import { api } from '@/lib/apiClient';

export const journeyApi = {
  start: (payload) => api.post('/journeys', payload),
  list: () => api.get('/journeys'),
  detail: (id) => api.get(`/journeys/${id}`),
  pushLocation: (id, payload) => api.post(`/journeys/${id}/location`, payload),
  checkIn: (id, payload) => api.post(`/journeys/${id}/safe`, payload),
  end: (id, payload) => api.post(`/journeys/${id}/end`, payload),
  shared: (token) => api.get(`/journeys/shared/${token}`),
};
