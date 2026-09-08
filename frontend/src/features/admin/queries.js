import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/app/queryClient';
import { adminApi } from './api';

export function useAdminOverview() {
  return useQuery({
    queryKey: queryKeys.admin.overview,
    queryFn: adminApi.overview,
    // Open SOS events and active journeys are the point of this screen —
    // stale numbers would be worse than none.
    refetchInterval: 30_000,
  });
}

export function useRiskZones() {
  return useQuery({
    queryKey: queryKeys.admin.riskZones,
    queryFn: adminApi.riskZones,
    select: (data) => data.zones,
    staleTime: 5 * 60_000,
  });
}
