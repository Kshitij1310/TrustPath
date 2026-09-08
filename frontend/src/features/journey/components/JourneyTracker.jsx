import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useJourneyStore } from '@/stores/journeyStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import { getSocket } from '@/lib/socket';
import { usePushLocation } from '../queries';

/** How often a fix is sent upstream. Every browser tick would be wasteful. */
const PUSH_INTERVAL_MS = 15_000;

/**
 * Headless. Mounted once in the app shell, it does three things while a
 * journey is active:
 *
 *   1. watches GPS and pushes a fix every 15 s
 *   2. subscribes to the journey's socket room for server-side events
 *   3. raises the deviation / overdue prompts
 *
 * It renders nothing — the UI for all of this lives in ActiveJourneyBar and
 * JourneyPrompts, so tracking keeps running regardless of the open page.
 */
export function JourneyTracker() {
  const journeyId = useJourneyStore((s) => s.activeJourneyId);
  const showPrompt = useJourneyStore((s) => s.showPrompt);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const pushLocation = usePushLocation();
  const lastPushRef = useRef(0);

  const { position, error } = useGeolocation({ watch: true, enabled: Boolean(journeyId) });

  // --- push fixes -------------------------------------------------------
  useEffect(() => {
    if (!journeyId || !position) return;

    const now = Date.now();
    if (now - lastPushRef.current < PUSH_INTERVAL_MS) return;
    lastPushRef.current = now;

    pushLocation.mutate({
      journeyId,
      lat: position.lat,
      lng: position.lng,
      accuracyM: position.accuracyM,
      speedMps: position.speedMps,
    });
    // `pushLocation` is a stable mutation object; including it would re-run
    // this on every mutation state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, position]);

  // A journey that cannot see the user is a safety problem — say so once.
  useEffect(() => {
    if (journeyId && error) {
      toast.error(error.message, { id: 'geolocation-error', duration: 8000 });
    }
  }, [journeyId, error]);

  // --- server-pushed events ---------------------------------------------
  useEffect(() => {
    if (!journeyId || !token) return undefined;

    const socket = getSocket({ token });
    socket.emit('journey:subscribe', journeyId, (ack) => {
      if (!ack?.ok) console.warn('[journey] subscribe failed:', ack?.error);
    });

    const onDeviation = () => showPrompt('deviation');
    const onOverdue = () => showPrompt('overdue');
    const onEnded = () => queryClient.invalidateQueries({ queryKey: queryKeys.journeys.all });

    socket.on('journey:deviation', onDeviation);
    socket.on('journey:overdue', onOverdue);
    socket.on('journey:ended', onEnded);

    return () => {
      socket.emit('journey:unsubscribe', journeyId);
      socket.off('journey:deviation', onDeviation);
      socket.off('journey:overdue', onOverdue);
      socket.off('journey:ended', onEnded);
    };
  }, [journeyId, token, showPrompt, queryClient]);

  return null;
}
