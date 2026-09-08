import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useUiStore } from '@/stores/uiStore';
import { queryClient } from './queryClient';

/** Applies the persisted theme once the store has rehydrated. */
function ThemeGate({ children }) {
  const initTheme = useUiStore((s) => s.initTheme);
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    initTheme();
  }, [initTheme, theme]);

  // Follow the OS while the user is on "system".
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => initTheme();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme, initTheme]);

  return children;
}

export function AppProviders({ children }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeGate>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster
              position="top-center"
              richColors
              closeButton
              toastOptions={{ classNames: { toast: 'font-sans' } }}
            />
          </TooltipProvider>
        </ThemeGate>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
