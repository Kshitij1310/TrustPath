import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/app/queryClient';
import { alertsApi } from './api';

export function useAlerts(filters = {}) {
  return useQuery({
    queryKey: queryKeys.alerts.list(filters),
    queryFn: () => alertsApi.list(filters),
    select: (data) => data.alerts,
  });
}

export function useNearbyAlerts(params, enabled = true) {
  return useQuery({
    queryKey: queryKeys.alerts.nearby(params),
    queryFn: () => alertsApi.nearby(params),
    enabled: enabled && Boolean(params?.lat),
    select: (data) => data.alerts,
    staleTime: 60_000,
  });
}

/** Admin only — the server rejects everyone else. */
export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
      toast.success('Alert published — it now affects nearby risk scores.');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
      toast.success('Alert removed');
    },
    onError: (error) => toast.error(error.message),
  });
}
