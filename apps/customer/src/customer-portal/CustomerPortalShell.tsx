import { Outlet } from 'react-router-dom';
import { CustomerNav } from './CustomerNav';

// Mobile-first layout for the end-customer portal: a top bar + horizontal
// nav on narrow screens (e.g. 375x667 / 390x844), becoming a left rail on
// wider screens. Deliberately its own shell, not AppShell (which pairs
// with the staff admin Sidebar).
export function CustomerPortalShell() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50 sm:flex-row">
      <CustomerNav />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
