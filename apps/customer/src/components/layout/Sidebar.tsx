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
  { label: 'Propostas' },
  { label: 'Vendas' },
  { label: 'Viagens', to: '/trips' },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center border-b border-slate-200 px-4">
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          Travel Platform
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) =>
          item.to ? (
            <NavLink
              key={item.label}
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
          ) : (
            <span
              key={item.label}
              aria-disabled="true"
              title="Em breve"
              className="cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-slate-400"
            >
              {item.label}
            </span>
          ),
        )}
      </nav>
    </aside>
  );
}
