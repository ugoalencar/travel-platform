import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  to: string;
  /** True when this label maps to a page that doesn't fully cover the
   * concept yet (linked to the closest existing screen). Surfaced as a
   * subtle marker so it's not silently indistinguishable from a complete
   * mapping -- see the wave 1 report for the full gap list. */
  gap?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Sidebar structure per docs/travel_platform_visual_functional_blueprint/
// 02_AGENCY_INFORMATION_ARCHITECTURE.md -- exact section order and labels.
// Items without a dedicated route yet are mapped to the closest existing
// page and flagged with `gap: true` (see report for the reasoning per item).
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Painel',
    items: [{ label: 'Visão Geral', to: '/' }],
  },
  {
    label: 'CRM & Comercial',
    items: [
      { label: 'Leads', to: '/customers', gap: true },
      { label: 'Clientes', to: '/customers' },
      { label: 'Desejos', to: '/wishes' },
      { label: 'Pescador', to: '/pescador' },
      { label: 'Ofertas', to: '/offers' },
      { label: 'Propostas', to: '/proposals' },
      { label: 'Reservas', to: '/bookings' },
      { label: 'Vendas', to: '/sales' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Viagens', to: '/trips' },
      { label: 'Booking', to: '/bookings' },
      { label: 'Aéreo', to: '/operations/air' },
      { label: 'Terrestre', to: '/operations/land' },
      { label: 'Passageiros', to: '/trips', gap: true },
      { label: 'Documentos', to: '/trips', gap: true },
      { label: 'Ocorrências', to: '/trips', gap: true },
      { label: 'Pós-viagem', to: '/trips', gap: true },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Visão Geral', to: '/financial' },
      { label: 'Contas a Receber', to: '/financial/receivables' },
      { label: 'Contas a Pagar', to: '/financial/payables' },
      { label: 'Fluxo de Caixa', to: '/financial/cash-transactions' },
      { label: 'Conciliação', to: '/financial/reconciliation' },
      { label: 'Receitas', to: '/financial/revenues' },
      { label: 'Despesas', to: '/financial/expenses' },
      { label: 'Margens', to: '/financial/dre', gap: true },
      { label: 'DRE Gerencial', to: '/financial/dre' },
      { label: 'Relatórios', to: '/financial/reports' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { label: 'Fornecedores', to: '/suppliers' },
      { label: 'Categorias', to: '/suppliers', gap: true },
      { label: 'Produtos e Destinos', to: '/offers', gap: true },
      { label: 'Centros de Custo', to: '/financial/cost-centers' },
      { label: 'Categorias Financeiras', to: '/financial/categories' },
    ],
  },
  {
    label: 'Pessoal',
    items: [
      { label: 'Funcionários', to: '/employees' },
      { label: 'Planos de Comissão', to: '/commission-plans' },
      { label: 'Comissões', to: '/payroll' },
      { label: 'Salários e Benefícios', to: '/payroll', gap: true },
      { label: 'Descontos e Adiantamentos', to: '/payroll', gap: true },
      { label: 'Pagamentos', to: '/payroll' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Campanhas', to: '/campaigns' },
      { label: 'Assets', to: '/campaigns', gap: true },
      { label: 'Publicações', to: '/campaigns', gap: true },
      { label: 'Automações', to: '/coupons', gap: true },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { label: 'Usuários', to: '/settings' },
      { label: 'Papéis e Acessos', to: '/settings', gap: true },
      { label: 'Integrações', to: '/settings', gap: true },
      { label: 'Parametrizações', to: '/settings', gap: true },
      { label: 'Logs e Auditoria', to: '/settings', gap: true },
    ],
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
          className="fixed inset-0 z-30 bg-slate-900/60 md:hidden"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col bg-[--color-sidebar] transition-transform md:static md:z-auto md:w-64 md:translate-x-0',
          mobileOpen && 'translate-x-0',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[--color-sidebar-border] px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-xs font-bold text-white">
            TP
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">
            Travel Platform
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="px-3 text-[0.68rem] font-bold uppercase tracking-wide text-[--color-sidebar-muted]">
                {section.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={`${section.label}-${item.label}`}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onClose}
                    title={item.gap ? `${item.label} (tela dedicada prevista em onda futura)` : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium text-[--color-sidebar-foreground] transition-colors hover:bg-[--color-sidebar-active] hover:text-white',
                        isActive && 'bg-[--color-sidebar-active] text-white',
                      )
                    }
                  >
                    <span>{item.label}</span>
                    {item.gap && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                      />
                    )}
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
