import { api } from '@/lib/apiClient';

export const reportsApi = {
  list: (params) => api.get('/reports', params),
  nearby: (params) => api.get('/reports/nearby', params),
  heatmap: (bbox) => api.get('/reports/heatmap', bbox),
  upvote: (id) => api.post(`/reports/${id}/upvote`),
  remove: (id) => api.delete(`/reports/${id}`),
  moderate: (id, status) => api.patch(`/reports/${id}/moderate`, { status }),

  /** Multipart, because a report may carry a photo. */
  create: ({ lat, lng, category, description, severity, image }) => {
    const formData = new FormData();
    formData.append('lat', lat);
    formData.append('lng', lng);
    formData.append('category', category);
    formData.append('severity', severity);
    if (description) formData.append('description', description);
    if (image) formData.append('image', image);
    return api.postForm('/reports', formData);
  },
};
