import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ErrorState } from '@/components/common/states';
import { ActiveJourneyBar } from '@/features/journey/components/ActiveJourneyBar';
import { JourneyTracker } from '@/features/journey/components/JourneyTracker';
import { SosButton } from '@/features/emergency/components/SosButton';
import { useMe } from '@/features/auth/queries';
import { DemoDataBanner } from './DemoDataBanner';
import { MobileNav } from './MobileNav';
import { Topbar } from './Topbar';

export function AppShell() {
  // Refresh the profile once per session; a deleted or demoted account is
  // caught here rather than at the first mutation.
  useMe();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <Topbar />

      {/* Sits directly under the header, above everything else — a demo-data
          notice buried below the fold would not be doing its job. */}
      <DemoDataBanner />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Journey state is app-wide: the tracker runs and the status bar
            shows no matter which page is open. */}
        <JourneyTracker />
        <ActiveJourneyBar />

        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <ErrorBoundary
            fallback={({ error, reset }) => (
              <ErrorState error={error} onRetry={reset} className="min-h-[60vh]" />
            )}
          >
            <Outlet />
          </ErrorBoundary>
        </main>

        <MobileNav />
      </div>

      {/* Always reachable, on every page. */}
      <SosButton />
    </div>
  );
}
