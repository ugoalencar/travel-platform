import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { api } from '../../lib/api';

// Sends a brand-new agency's OWNER/ADMIN into the onboarding wizard exactly
// once, on first load after their profile shows no onboardingCompletedAt --
// no manual "start onboarding" step needed. Runs once per mount; the wizard
// itself owns navigating back to "/" when done (see OnboardingWizardPage).
// Never blocks MANAGER/AGENT/VIEWER -- they can't drive onboarding anyway
// (routes are ADMIN+), and an invited member joining an already-configured
// agency shouldn't be redirected regardless of role.
function useOnboardingRedirect(role: string | undefined): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (role !== 'OWNER' && role !== 'ADMIN') return;
    let cancelled = false;
    api
      .get('/settings/agency')
      .then((resp) => {
        if (cancelled) return;
        const data = resp.data as { profile?: { onboardingCompletedAt?: string } };
        if (!data.profile?.onboardingCompletedAt) {
          void navigate('/onboarding', { replace: true });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [role, navigate]);
}

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useCurrentUser();
  useOnboardingRedirect(user?.role);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[--color-canvas]">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        role={user?.role}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} user={user} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
