import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  to?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard' },
  { label: 'Clientes', to: '/customers' },
  { label: 'Desejos', to: '/wishes' },
  { label: 'Ofertas', to: '/offers' },
  { label: 'Propostas', to: '/proposals' },
  { label: 'Reservas', to: '/bookings' },
  { label: 'Vendas' },
  { label: 'Viagens', to: '/trips' },
  { label: 'Rotas', to: '/transport/routes' },
  { label: 'Produtos de transporte', to: '/transport/products' },
  { label: 'Fornecedores', to: '/transport/suppliers' },
  { label: 'Saídas', to: '/transport/departures' },
  { label: 'Agenda', to: '/transport/agenda' },
  { label: 'Operações de hoje', to: '/operations/today' },
];

// Commercial Cockpit nav section -- kept as its own group, appended after
// the existing flat list above (which is left untouched: Ofertas/
// Propostas/Vendas/Reservas keep their current spots).
const COMMERCIAL_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard comercial', to: '/commercial/dashboard' },
  { label: 'Pipeline', to: '/commercial/pipeline' },
  { label: 'Agenda comercial', to: '/commercial/agenda' },
];

// Minimal "Configurações" nav section (no settings framework existed
// before this) -- currently just Pipelines. Every write on that page is
// still enforced server-side by requirePipelineAdmin(); this link is not
// itself a permission gate.
const SETTINGS_NAV_ITEMS: NavItem[] = [{ label: 'Pipelines', to: '/settings/pipelines' }];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4">
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          Travel Platform
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <NavItemLink key={`main-${item.label}-${item.to ?? ''}`} item={item} />
        ))}

        <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Comercial
        </div>
        {COMMERCIAL_NAV_ITEMS.map((item) => (
          <NavItemLink key={`commercial-${item.label}`} item={item} />
        ))}

        <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Configurações
        </div>
        {SETTINGS_NAV_ITEMS.map((item) => (
          <NavItemLink key={`settings-${item.label}`} item={item} />
        ))}
      </nav>
    </aside>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  if (!item.to) {
    return (
      <span
        aria-disabled="true"
        title="Em breve"
        className="cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-slate-400"
      >
        {item.label}
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100',
          isActive && 'bg-slate-900 text-white hover:bg-slate-900',
        )
      }
    >
      {item.label}
    </NavLink>
  );
}
