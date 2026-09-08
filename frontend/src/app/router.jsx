import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, useRouteError } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth, RedirectIfAuthed } from '@/features/auth/RequireAuth';
import { ErrorState, PageLoader } from '@/components/common/states';
import { paths } from './routes';

/**
 * Every page is code-split. The map bundle in particular (Leaflet + tiles) is
 * large enough that loading it on the login screen would be wasteful.
 */
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const RoutePlannerPage = lazy(() => import('@/features/routing/pages/RoutePlannerPage'));
const JourneyPage = lazy(() => import('@/features/journey/pages/JourneyPage'));
const SharedJourneyPage = lazy(() => import('@/features/journey/pages/SharedJourneyPage'));
const ReportsPage = lazy(() => import('@/features/reports/pages/ReportsPage'));
const AlertsPage = lazy(() => import('@/features/alerts/pages/AlertsPage'));
const EmergencyPage = lazy(() => import('@/features/emergency/pages/EmergencyPage'));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'));
const AdminPage = lazy(() => import('@/features/admin/pages/AdminPage'));

/**
 * Wraps a lazily-imported page in its own Suspense boundary, so a slow chunk
 * shows a loader instead of blanking the shell.
 *
 * Applied per element rather than via a wrapper route: an index route cannot
 * have children, so a layout route would not work for the index page.
 */
const suspend = (Component) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

function RouteError() {
  const error = useRouteError();
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <ErrorState
        error={error instanceof Error ? error : new Error('This page could not be loaded.')}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      // --- public -------------------------------------------------------
      {
        element: (
          <RedirectIfAuthed>
            <Outlet />
          </RedirectIfAuthed>
        ),
        children: [
          { path: paths.login, element: suspend(LoginPage) },
          { path: paths.register, element: suspend(RegisterPage) },
        ],
      },
      // A trusted contact opening a share link — no account required.
      { path: paths.sharedJourney(), element: suspend(SharedJourneyPage) },
      // --- authenticated app --------------------------------------------
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: suspend(RoutePlannerPage) },
          { path: paths.journey, element: suspend(JourneyPage) },
          { path: paths.reports, element: suspend(ReportsPage) },
          { path: paths.alerts, element: suspend(AlertsPage) },
          { path: paths.emergency, element: suspend(EmergencyPage) },
          { path: paths.settings, element: suspend(SettingsPage) },
          { path: paths.admin, element: suspend(AdminPage) },
        ],
      },
      { path: '*', element: <Navigate to={paths.plan} replace /> },
    ],
  },
]);
