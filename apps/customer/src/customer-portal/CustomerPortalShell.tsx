import { Outlet } from 'react-router-dom';
import { CustomerNav } from './CustomerNav';
import { InstallAppBanner } from './InstallAppBanner';

// Mobile-first layout for the end-customer portal: a top bar + horizontal
// nav on narrow screens (e.g. 375x667 / 390x844), becoming a left rail on
// wider screens. Deliberately its own shell, not AppShell (which pairs
// with the staff admin Sidebar).
export function CustomerPortalShell() {
  return (
    <div className="customer-portal-shell flex min-h-screen w-full flex-col sm:flex-row">
      <CustomerNav />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <InstallAppBanner />
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
