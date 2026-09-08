import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * SOS UI state, plus the offline queue.
 *
 * If an SOS is triggered without connectivity, it is stored here with a
 * `clientRef` and replayed when the network returns. The server treats
 * `clientRef` as an idempotency key, so a replay cannot create duplicates.
 *
 * The queue is persisted: an SOS that only existed in memory would be lost by
 * exactly the kind of event it exists for.
 */
export const useSosStore = create(
  persist(
    (set, get) => ({
      isOpen: false,
      trigger: 'manual',
      /** Server response for the SOS currently on screen. */
      active: null,
      /** SOS payloads captured while offline, awaiting replay. */
      pending: [],

      open: ({ trigger = 'manual' } = {}) => set({ isOpen: true, trigger, active: null }),
      close: () => set({ isOpen: false, active: null }),
      setActive: (active) => set({ active }),

      queueOffline: (payload) =>
        set((state) => ({ pending: [...state.pending, payload] })),

      dequeue: (clientRef) =>
        set((state) => ({ pending: state.pending.filter((p) => p.clientRef !== clientRef) })),

      hasPending: () => get().pending.length > 0,
    }),
    {
      name: 'trustroute.sos',
      partialize: (state) => ({ pending: state.pending }),
    },
  ),
);
