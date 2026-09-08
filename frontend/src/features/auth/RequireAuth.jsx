import { Navigate, useLocation } from 'react-router-dom';
import { useIsAuthenticated } from '@/stores/authStore';
import { paths } from '@/app/routes';

/** Gate for the authenticated app. Remembers where the user was headed. */
export function RequireAuth({ children }) {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={paths.login} state={{ from: location }} replace />;
  }
  return children;
}

/** Keeps a signed-in user off the login/register screens. */
export function RedirectIfAuthed({ children }) {
  const isAuthenticated = useIsAuthenticated();
  return isAuthenticated ? <Navigate to={paths.plan} replace /> : children;
}
