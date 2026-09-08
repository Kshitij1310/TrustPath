import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/app/queryClient';
import { useJourneyStore } from '@/stores/journeyStore';
import { journeyApi } from './api';

export function useJourneys() {
  return useQuery({
    queryKey: queryKeys.journeys.list,
    queryFn: journeyApi.list,
    select: (data) => data.journeys,
  });
}

export function useJourney(id) {
  const activeJourneyId = useJourneyStore((s) => s.activeJourneyId);

  return useQuery({
    queryKey: queryKeys.journeys.detail(id),
    queryFn: () => journeyApi.detail(id),
    enabled: Boolean(id),
    select: (data) => data.journey,
    // Socket.IO pushes live updates; this poll is only a safety net for a
    // dropped connection, so it stays slow.
    refetchInterval: id && id === activeJourneyId ? 60_000 : false,
  });
}

export function useStartJourney() {
  const queryClient = useQueryClient();
  const startTracking = useJourneyStore((s) => s.startTracking);

  return useMutation({
    mutationFn: journeyApi.start,
    onSuccess: ({ journey }) => {
      startTracking({ journeyId: journey.id, shareToken: journey.shareToken });
      queryClient.invalidateQueries({ queryKey: queryKeys.journeys.all });
      toast.success('Journey started. Tracking is on.');
    },
    onError: (error) => toast.error(error.message),
  });
}

/**
 * A GPS ping. Deliberately silent on failure: a dropped fix on a moving
 * phone is routine, and a toast per lost packet would train the user to
 * ignore the ones that matter.
 */
export function usePushLocation() {
  const updatePosition = useJourneyStore((s) => s.updatePosition);

  return useMutation({
    mutationFn: ({ journeyId, ...payload }) => journeyApi.pushLocation(journeyId, payload),
    onSuccess: (result) => updatePosition(result),
    onError: (error) => console.warn('[journey] location push failed:', error.message),
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  const dismissPrompt = useJourneyStore((s) => s.dismissPrompt);

  return useMutation({
    mutationFn: ({ journeyId, extendMinutes = 0 }) =>
      journeyApi.checkIn(journeyId, { extendMinutes }),
    onSuccess: ({ journey }) => {
      dismissPrompt();
      queryClient.invalidateQueries({ queryKey: queryKeys.journeys.all });
      queryClient.setQueryData(queryKeys.journeys.detail(journey.id), (old) =>
        old ? { journey: { ...old.journey, ...journey } } : old,
      );
      toast.success("Checked in. Glad you're safe.");
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useEndJourney() {
  const queryClient = useQueryClient();
  const stopTracking = useJourneyStore((s) => s.stopTracking);

  return useMutation({
    mutationFn: ({ journeyId, status = 'completed' }) => journeyApi.end(journeyId, { status }),
    onSuccess: (_data, variables) => {
      stopTracking();
      queryClient.invalidateQueries({ queryKey: queryKeys.journeys.all });
      toast.success(variables.status === 'cancelled' ? 'Journey cancelled' : 'Journey completed');
    },
    onError: (error) => toast.error(error.message),
  });
}

/** A trusted contact's read-only view. Polls, since they have no socket auth
    beyond the share token — and the token may expire mid-view. */
export function useSharedJourney(token) {
  return useQuery({
    queryKey: queryKeys.journeys.shared(token),
    queryFn: () => journeyApi.shared(token),
    enabled: Boolean(token),
    select: (data) => data.journey,
    refetchInterval: 20_000,
    retry: false,
  });
}
