import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { QuickSearch } from '../commercial/QuickSearch';

export function AppShell() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50 md:flex-row">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4 sm:px-6">
          <QuickSearch />
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
