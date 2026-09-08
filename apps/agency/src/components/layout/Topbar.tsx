import { Menu, Search, Bell, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Dropdown } from '../ui/dropdown';
import { CURRENT_USER_ROLE_LABELS, type CurrentUser } from '../../hooks/useCurrentUser';

export interface TopbarProps {
  onMenuClick: () => void;
  /** Authenticated principal from the same GET /me-backed useCurrentUser()
   * call that drives the Sidebar, so the role shown here can never diverge
   * from the role that decided which nav sections are visible. Undefined
   * while loading or if /me is unavailable. */
  user?: CurrentUser | null;
}

// Agency display name isn't part of GET /me today; keeping this fixed avoids
// widening this pass into a backend change unrelated to the reported
// role/identity mismatch (see KNOWN REMAINING GAP notes).
const DEMO_AGENCY_NAME = 'Horizonte Viagens';

// Visual placeholder only -- no notification backend exists yet. Shown as a
// static badge count so the topbar reads as "populated" per the reference,
// not wired to any real notification feed. Flagged here rather than
// pretending it's live data.
const MOCK_NOTIFICATION_COUNT = 3;

function initialsFor(label: string | null): string {
  if (!label) return '?';
  const parts = label.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function Topbar({ onMenuClick, user }: TopbarProps) {
  const roleLabel = user ? CURRENT_USER_ROLE_LABELS[user.role] : null;

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="hidden items-center gap-2 sm:flex">
        <span
          className="rounded-[--radius-pill] bg-blue-50 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-blue-700 ring-1 ring-inset ring-blue-200"
          title="Ambiente da agência (distinto do Painel da Plataforma)"
        >
          Agência
        </span>
        <span className="text-sm font-medium text-slate-700">{DEMO_AGENCY_NAME}</span>
      </div>

      <div className="relative mx-2 hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Buscar clientes, reservas, propostas..."
          aria-label="Busca global"
          className="w-full rounded-[--radius-pill] border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus-visible:border-blue-300 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Button size="sm" className="hidden gap-1.5 sm:inline-flex">
          <Plus className="h-4 w-4" />
          Nova Viagem
        </Button>

        <button
          type="button"
          aria-label="Notificações"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Bell className="h-5 w-5" />
          {MOCK_NOTIFICATION_COUNT > 0 && (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.625rem] font-bold leading-none text-white"
            >
              {MOCK_NOTIFICATION_COUNT}
            </span>
          )}
        </button>

        <Dropdown
          align="end"
          items={[{ label: 'Sair', onSelect: () => {}, destructive: true }]}
          trigger={
            <div className="flex items-center gap-2 rounded-[--radius-pill] py-1 pl-1 pr-2 transition-colors hover:bg-slate-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-bold text-white">
                {initialsFor(roleLabel)}
              </span>
              <span className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-sm font-semibold text-slate-800">{roleLabel ?? 'Carregando…'}</span>
                <span className="text-xs text-slate-500">{DEMO_AGENCY_NAME}</span>
              </span>
            </div>
          }
        />
      </div>
    </header>
  );
}
