import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/app/queryClient';
import { routingApi } from './api';

/**
 * Address search.
 *
 * Debouncing happens in the caller (`useDebouncedValue`); this hook only
 * decides when a query is worth sending. Nominatim rate-limits aggressively,
 * so results are cached for a long time — the same query twice is free.
 */
export function useGeocode(query) {
  return useQuery({
    queryKey: queryKeys.routes.geocode(query),
    queryFn: ({ signal }) => routingApi.geocode(query, { signal }),
    enabled: query.trim().length >= 3,
    staleTime: 10 * 60_000,
    select: (data) => data.results,
  });
}

/**
 * Planning is a mutation, not a query: it is an explicit user action with a
 * real cost upstream, and should never fire on a remount or a refocus.
 */
export function usePlanRoutes() {
  return useMutation({
    mutationFn: routingApi.plan,
    onError: (error) => {
      toast.error(
        error.status === 429
          ? 'The routing service is rate-limiting us. Wait a moment and try again.'
          : error.message,
      );
    },
  });
}

export function useRouteDetail(id) {
  return useQuery({
    queryKey: queryKeys.routes.detail(id),
    queryFn: () => routingApi.detail(id),
    enabled: Boolean(id),
    select: (data) => data.route,
  });
}
