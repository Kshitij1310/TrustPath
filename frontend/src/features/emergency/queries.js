import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/app/queryClient';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { emergencyApi } from './api';
import { useSosStore } from './sosStore';

export function useContacts() {
  return useQuery({
    queryKey: queryKeys.emergency.contacts,
    queryFn: emergencyApi.listContacts,
    select: (data) => data.contacts,
  });
}

export function useAddContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: emergencyApi.addContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emergency.contacts });
      toast.success('Trusted contact added');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: emergencyApi.deleteContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emergency.contacts });
      toast.success('Contact removed');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useSosHistory() {
  return useQuery({
    queryKey: queryKeys.emergency.sosList,
    queryFn: emergencyApi.listSos,
    select: (data) => data.incidents,
  });
}

export function useNearbyFacilities(params, enabled = true) {
  return useQuery({
    queryKey: queryKeys.emergency.facilities(params),
    queryFn: () => emergencyApi.nearbyFacilities(params),
    enabled: enabled && Boolean(params?.lat),
    select: (data) => data.facilities,
    staleTime: 10 * 60_000,
  });
}

/**
 * Trigger an SOS.
 *
 * Offline, the payload is queued locally instead of failing — and the UI says
 * so plainly. Nothing here claims a message was delivered; the server only
 * prepares the links, and the device confirms afterwards.
 */
export function useTriggerSos() {
  const queryClient = useQueryClient();
  const setActive = useSosStore((s) => s.setActive);
  const queueOffline = useSosStore((s) => s.queueOffline);
  const isOnline = useOnlineStatus();

  return useMutation({
    mutationFn: async (payload) => {
      const withRef = { ...payload, clientRef: payload.clientRef ?? crypto.randomUUID() };

      if (!isOnline) {
        queueOffline(withRef);
        // A local-only object shaped like the server's response, so the sheet
        // can still render the call/SMS links from cached contacts.
        return { offline: true, request: withRef };
      }

      return emergencyApi.triggerSos(withRef);
    },
    onSuccess: (result) => {
      setActive(result);
      if (!result.offline) {
        queryClient.invalidateQueries({ queryKey: queryKeys.emergency.sosList });
      }
    },
    onError: (error) => toast.error(error.message),
  });
}

/** Report to the server what the device actually managed to send. */
export function useConfirmSos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sosId, attempts }) => emergencyApi.confirmSos(sosId, attempts),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.emergency.sosList }),
    onError: (error) => console.warn('[sos] confirm failed:', error.message),
  });
}

export function useResolveSos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sosId, status }) => emergencyApi.resolveSos(sosId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emergency.sosList });
      toast.success('SOS resolved');
    },
    onError: (error) => toast.error(error.message),
  });
}

/**
 * Replays SOS events captured while offline, once connectivity returns.
 * Mounted once, in the SOS button.
 */
export function useOfflineSosReplay() {
  const isOnline = useOnlineStatus();
  const pending = useSosStore((s) => s.pending);
  const dequeue = useSosStore((s) => s.dequeue);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline || pending.length === 0) return;

    (async () => {
      for (const payload of pending) {
        try {
          await emergencyApi.triggerSos({ ...payload, trigger: 'offline_sync' });
          dequeue(payload.clientRef);
          toast.success('An SOS recorded while you were offline has now reached the server.');
        } catch (error) {
          // Leave it queued and try again on the next reconnection.
          console.warn('[sos] replay failed:', error.message);
          break;
        }
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.emergency.sosList });
    })();
  }, [isOnline, pending, dequeue, queryClient]);

  return pending.length;
}
