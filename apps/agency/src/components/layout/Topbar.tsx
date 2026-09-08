import { Menu } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

export interface TopbarProps {
  onMenuClick: () => void;
}

// Static, frontend-only demo persona for presentation purposes -- not a
// session, not tied to any auth mechanism. See docs/plans prototype
// integration notes: no AuthProvider/TenantContext exists in this app.
const DEMO_STAFF_NAME = 'Mariana Costa';
const DEMO_AGENCY_NAME = 'Horizonte Viagens';

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2">
        <span
          className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-blue-700 ring-1 ring-inset ring-blue-200"
          title="Ambiente da agência (distinto do Painel da Plataforma)"
        >
          Agência
        </span>
        <span className="hidden text-sm font-medium text-slate-700 sm:inline">{DEMO_AGENCY_NAME}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Badge variant="outline">Modo demonstração</Badge>
        <span className="text-sm text-slate-700">
          {DEMO_STAFF_NAME} <span className="text-slate-400">· ADMIN</span>
        </span>
      </div>
    </header>
  );
}
