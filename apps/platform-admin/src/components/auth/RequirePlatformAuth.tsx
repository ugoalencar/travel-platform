import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasSession } from '../../lib/platformSession';

// Route guard for every platform-admin route. Same rationale as
// apps/agency's RequireAuth: a non-expired session token gates rendering
// only -- requirePlatformRole()/the resolved principal drive every real
// permission check server-side.
export function RequirePlatformAuth() {
  const location = useLocation();

  if (!hasSession()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
