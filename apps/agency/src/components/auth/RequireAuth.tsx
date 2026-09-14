import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasSession } from '../../lib/session';

// Route guard for every staff-facing route. Presence of a (non-expired)
// session token is the only client-side gate -- it decides whether to even
// attempt rendering the authenticated shell. It is NOT a trust boundary:
// every actual permission/tenant/role check still happens server-side
// (see useCurrentUser.ts's doc comment), and a token that's been revoked or
// expired server-side still gets caught by api.ts's 401 handling on the
// first real request, which clears the session and (via AppShell's own
// re-render once useCurrentUser() returns null) sends the user back here.
export function RequireAuth() {
  const location = useLocation();

  if (!hasSession()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
