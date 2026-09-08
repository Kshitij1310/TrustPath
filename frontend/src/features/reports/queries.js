import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/app/queryClient';
import { reportsApi } from './api';

export function useReports(filters = {}) {
  return useQuery({
    queryKey: queryKeys.reports.list(filters),
    queryFn: () => reportsApi.list(filters),
    select: (data) => data.reports,
  });
}

/**
 * Map layers for the visible bounding box.
 *
 * Held longer than the default stale time: panning the map should not refetch
 * the world, and safety data does not change second to second.
 */
export function useHeatmap(bbox, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.heatmap(bbox),
    queryFn: () => reportsApi.heatmap(bbox),
    enabled: enabled && Boolean(bbox?.minLat),
    select: (data) => data.layers,
    staleTime: 2 * 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reportsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
      toast.success('Report submitted', {
        description: 'It starts as unverified and carries lower weight until others corroborate it.',
      });
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useUpvoteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reportsApi.upvote,
    onSuccess: ({ report }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
      if (report.status === 'corroborated') {
        toast.success('Enough people agree — this report is now corroborated.');
      }
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reportsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
      toast.success('Report deleted');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useModerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }) => reportsApi.moderate(id, status),
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.overview });
      toast.success(status === 'verified' ? 'Report verified' : 'Report rejected');
    },
    onError: (error) => toast.error(error.message),
  });
}
