import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/apiClient';

/**
 * Query keys live in one place so an invalidation can never miss a cache
 * entry because two files spelled the same key differently.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'],
  },
  routes: {
    all: ['routes'],
    detail: (id) => ['routes', 'detail', id],
    plan: (params) => ['routes', 'plan', params],
    geocode: (q) => ['routes', 'geocode', q],
  },
  reports: {
    all: ['reports'],
    list: (filters) => ['reports', 'list', filters],
    nearby: (params) => ['reports', 'nearby', params],
    heatmap: (bbox) => ['reports', 'heatmap', bbox],
  },
  alerts: {
    all: ['alerts'],
    list: (filters) => ['alerts', 'list', filters],
    nearby: (params) => ['alerts', 'nearby', params],
  },
  journeys: {
    all: ['journeys'],
    list: ['journeys', 'list'],
    detail: (id) => ['journeys', 'detail', id],
    shared: (token) => ['journeys', 'shared', token],
  },
  emergency: {
    contacts: ['emergency', 'contacts'],
    sosList: ['emergency', 'sos'],
    sosDetail: (id) => ['emergency', 'sos', id],
    facilities: (params) => ['emergency', 'facilities', params],
  },
  admin: {
    overview: ['admin', 'overview'],
    riskZones: ['admin', 'risk-zones'],
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 4xx just replays the same rejection. Rate limits and
        // auth failures in particular must surface immediately.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
