import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  to: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'INÍCIO',
    items: [{ label: 'Painel', to: '/' }],
  },
  {
    label: 'RELACIONAMENTO',
    items: [
      { label: 'Clientes', to: '/customers' },
      { label: 'Desejos', to: '/wishes' },
      { label: 'Viagens', to: '/trips' },
    ],
  },
  {
    label: 'COMERCIAL',
    items: [
      { label: 'Pescador', to: '/pescador' },
      { label: 'Ofertas', to: '/offers' },
      { label: 'Propostas', to: '/proposals' },
      { label: 'Reservas', to: '/bookings' },
      { label: 'Aéreo', to: '/operations/air' },
      { label: 'Vendas', to: '/sales' },
    ],
  },
  {
    label: 'MARKETING',
    items: [
      { label: 'Campanhas', to: '/campaigns' },
      { label: 'Cupons', to: '/coupons' },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { label: 'Visão Geral', to: '/financial' },
      { label: 'Receitas', to: '/financial/revenues' },
      { label: 'Despesas', to: '/financial/expenses' },
      { label: 'Contas a Receber', to: '/financial/receivables' },
      { label: 'Contas a Pagar', to: '/financial/payables' },
      { label: 'Fornecedores', to: '/suppliers' },
      { label: 'Caixa', to: '/financial/cash-transactions' },
      { label: 'Conciliação', to: '/financial/reconciliation' },
      { label: 'Relatórios', to: '/financial/reports' },
    ],
  },
  {
    label: 'GESTÃO',
    items: [{ label: 'Configurações', to: '/settings' }],
  },
];

export interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Fechar menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col border-r border-slate-200 bg-white transition-transform md:static md:z-auto md:w-56 md:translate-x-0',
          mobileOpen && 'translate-x-0',
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4">
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            Travel Platform
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="px-3 text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">
                {section.label}
              </p>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100',
                        isActive && 'bg-slate-900 text-white hover:bg-slate-900',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
