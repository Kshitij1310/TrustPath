import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const applyTheme = (theme) => {
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.classList.toggle('dark', resolved === 'dark');
};

/** Cross-cutting UI preferences: theme, sidebar, map layer toggles. */
export const useUiStore = create(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarOpen: true,
      mapLayers: {
        communityReports: true,
        historicalIncidents: false,
        activeAlerts: true,
      },

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleMapLayer: (layer) =>
        set((s) => ({ mapLayers: { ...s.mapLayers, [layer]: !s.mapLayers[layer] } })),

      /** Called once at boot, after the persisted state has rehydrated. */
      initTheme: () => applyTheme(get().theme),
    }),
    { name: 'trustroute.ui' },
  ),
);
