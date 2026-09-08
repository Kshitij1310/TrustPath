import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Client-side state for the *active* journey only.
 *
 * The journey's authoritative record lives on the server and is read through
 * TanStack Query. This store holds what the server does not own: which
 * journey this device is currently tracking, the latest GPS fix, and whether
 * a safety prompt is on screen.
 *
 * `activeJourneyId` is persisted so a refresh mid-journey does not silently
 * stop tracking — that would be a safety failure, not just a UX annoyance.
 */
export const useJourneyStore = create(
  persist(
    (set) => ({
      activeJourneyId: null,
      shareToken: null,
      lastPosition: null,
      deviationM: null,
      isDeviating: false,
      /** null | 'deviation' | 'overdue' — which safety prompt to show. */
      prompt: null,

      startTracking: ({ journeyId, shareToken = null }) =>
        set({
          activeJourneyId: journeyId,
          shareToken,
          lastPosition: null,
          deviationM: null,
          isDeviating: false,
          prompt: null,
        }),

      updatePosition: ({ position, deviationM, deviating }) =>
        set((state) => ({
          lastPosition: position,
          deviationM: deviationM ?? state.deviationM,
          isDeviating: deviating ?? state.isDeviating,
          // Raise the prompt on the transition into deviation, and never
          // stomp an overdue prompt, which is the more urgent of the two.
          prompt: deviating && !state.isDeviating && state.prompt !== 'overdue'
            ? 'deviation'
            : state.prompt,
        })),

      showPrompt: (prompt) => set({ prompt }),
      dismissPrompt: () => set({ prompt: null }),

      stopTracking: () =>
        set({
          activeJourneyId: null,
          shareToken: null,
          lastPosition: null,
          deviationM: null,
          isDeviating: false,
          prompt: null,
        }),
    }),
    {
      name: 'trustroute.journey',
      partialize: (state) => ({
        activeJourneyId: state.activeJourneyId,
        shareToken: state.shareToken,
      }),
    },
  ),
);

export const useActiveJourneyId = () => useJourneyStore((s) => s.activeJourneyId);
