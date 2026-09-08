import { api } from '@/lib/apiClient';

export const adminApi = {
  overview: () => api.get('/admin/overview'),
  riskZones: () => api.get('/admin/risk-zones'),
};
