import { api } from '@/lib/apiClient';

export const emergencyApi = {
  listContacts: () => api.get('/emergency/contacts'),
  addContact: (payload) => api.post('/emergency/contacts', payload),
  deleteContact: (id) => api.delete(`/emergency/contacts/${id}`),

  triggerSos: (payload) => api.post('/emergency/sos', payload),
  confirmSos: (id, attempts) => api.post(`/emergency/sos/${id}/confirm`, { attempts }),
  resolveSos: (id, status) => api.post(`/emergency/sos/${id}/resolve`, { status }),
  listSos: () => api.get('/emergency/sos'),

  nearbyFacilities: (params) => api.get('/emergency/facilities/nearby', params),
};
