import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useCurrentUser } from '../../hooks/useCurrentUser';

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useCurrentUser();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[--color-canvas]">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        role={user?.role}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
