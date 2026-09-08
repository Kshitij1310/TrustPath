import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Auth state.
 *
 * Only the token and a small user snapshot are persisted. Everything else the
 * UI needs about the user comes from the `auth.me` query, so a stale cached
 * profile can never outlive a real one.
 *
 * Kept free of imports from apiClient — apiClient reads this store, and the
 * dependency must not point both ways.
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,

      signIn: ({ token, user }) => set({ token, user }),
      setUser: (user) => set({ user }),
      signOut: () => set({ token: null, user: null }),
    }),
    {
      name: 'trustroute.auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);

export const useIsAuthenticated = () => useAuthStore((s) => Boolean(s.token));
export const useCurrentUser = () => useAuthStore((s) => s.user);
export const useIsAdmin = () => useAuthStore((s) => s.user?.role === 'admin');
