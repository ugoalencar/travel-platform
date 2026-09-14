import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasSession } from '../lib/customerSession';

// Route guard for every customer-portal route. Same rationale as
// apps/agency's RequireAuth: presence of a non-expired session token gates
// rendering only, never a trust boundary -- validateCustomerAgencyAccess
// (a real DB check server-side) is what actually enforces the
// customer/agency pairing on every request.
export function RequireCustomerAuth() {
  const location = useLocation();

  if (!hasSession()) {
    return <Navigate to="/customer-portal/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
