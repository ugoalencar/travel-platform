import { Outlet } from 'react-router-dom';
import { Bell, CalendarDays, Menu, Plus, Search } from 'lucide-react';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#f4f7fb] md:flex-row">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 shadow-sm shadow-slate-200/40 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Abrir menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 md:hidden"
          >
            <Menu size={18} />
          </button>

          <div className="relative hidden w-full max-w-xl md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Busca global"
              placeholder="Buscar clientes, reservas, destinos..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm sm:inline-flex"
            >
              <CalendarDays size={16} />
              Hoje
            </button>
            <button
              type="button"
              aria-label="Notificacoes"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
            >
              <Bell size={17} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
            </button>
            <button
              type="button"
              className="hidden h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 sm:inline-flex"
            >
              <Plus size={16} />
              Nova viagem
            </button>
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                FS
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold text-slate-900">Fernanda Silva</span>
                <span className="block text-xs text-slate-500">Agencia Demo</span>
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
