import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import type { CurrentUserRole } from '../../hooks/useCurrentUser';

interface NavItem {
  label: string;
  to: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Sidebar structure -- one entry per real, distinct screen. Previously had
// several "gap" placeholder items mapped onto whatever existing page was
// closest (e.g. "Produtos e Destinos" and "Ofertas" both pointing at
// /offers, four separate "Pessoal" labels all pointing at /payroll):
// reported directly as confusing menu clutter ("várias entradas para a
// mesma coisa... o sistema pode ser completo mas não complexo"). Removed
// rather than left as decorative placeholders -- a link that lands on the
// same page as another link adds noise, not capability.
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Painel',
    items: [{ label: 'Visão Geral', to: '/' }],
  },
  {
    label: 'CRM & Comercial',
    items: [
      { label: 'Clientes', to: '/customers' },
      { label: 'Cadastro Remoto', to: '/enrollment-links' },
      // Requested directly: "Sinto falta de um ambiente ... o pipeline
      // não estou vendo" -- commercial_opportunities/pipeline backend
      // already existed (kanban stages, lead-to-close funnel) with zero
      // frontend surface. New PipelinePage.tsx is that surface.
      { label: 'Pipeline', to: '/pipeline' },
      { label: 'Desejos', to: '/wishes' },
      { label: 'Pescador', to: '/pescador' },
      { label: 'Ofertas', to: '/offers' },
      // Full backend (products, policies, travelers, documents; a sold
      // policy with a saleId auto-creates a real Receivable) existed
      // with zero frontend surface -- requested directly: "documentação
      // ... até mesmo dos seguros".
      { label: 'Seguros', to: '/insurance' },
      { label: 'Propostas', to: '/proposals' },
      { label: 'Reservas', to: '/bookings' },
      { label: 'Vendas', to: '/sales' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Viagens', to: '/trips' },
      // Reservas (CRM & Comercial) already covers /bookings -- a second
      // "Booking" entry here pointed at the exact same screen with no
      // operational-specific view behind it, same redundancy pattern.
      { label: 'Aéreo', to: '/operations/air' },
      { label: 'Terrestre', to: '/operations/land' },
      { label: 'Passageiros', to: '/operations/passengers' },
      { label: 'Documentos', to: '/operations/documents' },
      { label: 'Ocorrências', to: '/operations/occurrences' },
      { label: 'Pós-viagem', to: '/operations/post-trip' },
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
      { label: 'DRE Gerencial', to: '/financial/dre' },
      { label: 'Relatórios', to: '/financial/reports' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { label: 'Fornecedores', to: '/suppliers' },
      { label: 'Centros de Custo', to: '/financial/cost-centers' },
      { label: 'Categorias Financeiras', to: '/financial/categories' },
    ],
  },
  {
    label: 'Pessoal',
    items: [
      { label: 'Funcionários', to: '/employees' },
      { label: 'Planos de Comissão', to: '/commission-plans' },
      // Comissões, Salários e Benefícios, Descontos e Adiantamentos and
      // Pagamentos were four separate labels all pointing at this same
      // single-page screen (PayrollPage.tsx has no per-section deep link)
      // -- consolidated into one honest entry naming what the page is.
      { label: 'Folha de Pagamento', to: '/payroll' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Campanhas', to: '/campaigns' },
      { label: 'Cupons', to: '/coupons' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      // Both deep-link via ?tab= (SettingsPage.tsx reads it on mount) --
      // reported directly: "configuração de usuários, não consigo criar
      // outros funcionários" -- the features existed, they just landed on
      // the unrelated default "Perfil" tab instead of their own.
      { label: 'Usuários', to: '/settings?tab=invitations' },
      { label: 'Papéis e Acessos', to: '/settings?tab=permissions' },
    ],
  },
];

// Blueprint's "Staff Operacional" surface (01_MASTER_BLUEPRINT.md):
// "Ambiente simplificado. Foco: tarefas do dia, passageiros, check-ins,
// transfers, operações, ocorrências, documentos." AGENT is the role that
// maps to this day-to-day operational scope -- OWNER/ADMIN/MANAGER keep the
// full management sidebar above; VIEWER is read-only across the same full
// scope so it also keeps the full sidebar. This is presentation only: every
// route an AGENT doesn't see here is still reachable by URL and still
// enforced (or not) by the same server-side RBAC as before -- no new
// authorization boundary is introduced.
const STAFF_OPERATIONAL_SECTIONS: NavSection[] = [
  {
    label: 'Painel',
    items: [{ label: 'Minhas Tarefas', to: '/' }],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Passageiros', to: '/operations/passengers' },
      { label: 'Documentos', to: '/operations/documents' },
      { label: 'Ocorrências', to: '/operations/occurrences' },
      { label: 'Aéreo', to: '/operations/air' },
      { label: 'Terrestre', to: '/operations/land' },
      { label: 'Pós-viagem', to: '/operations/post-trip' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { label: 'Clientes', to: '/customers' },
      { label: 'Reservas', to: '/bookings' },
    ],
  },
];

// Per-user, per-module area grants (agent_area_grants -- Navigable
// Pilot Flow track): an admin can grant a specific AGENT individual
// extra modules beyond the fixed STAFF_OPERATIONAL_SECTIONS above,
// without changing their role. Backend enforcement lives in
// services/api/src/area-grants.ts / routes/financial.ts -- this is the
// matching UI side: only modules GET /settings/my-area-grants actually
// confirms are granted appear here, never assumed client-side. One
// entry per module value in area-grants.ts's AREA_GRANT_VALUES.
export type AreaGrantModule =
  | 'SALES_PROPOSALS'
  | 'SALES_BOOKINGS'
  | 'SALES_SALES'
  | 'FINANCIAL_OVERVIEW'
  | 'FINANCIAL_RECEIVABLES'
  | 'FINANCIAL_PAYABLES'
  | 'FINANCIAL_CASH'
  | 'FINANCIAL_RECONCILIATION'
  | 'FINANCIAL_REVENUES'
  | 'FINANCIAL_EXPENSES'
  | 'FINANCIAL_DRE'
  | 'FINANCIAL_REPORTS';

const AREA_GRANT_ITEMS: Record<AreaGrantModule, { section: 'Vendas' | 'Financeiro'; item: NavItem }> = {
  SALES_PROPOSALS: { section: 'Vendas', item: { label: 'Propostas', to: '/proposals' } },
  SALES_BOOKINGS: { section: 'Vendas', item: { label: 'Reservas', to: '/bookings' } },
  SALES_SALES: { section: 'Vendas', item: { label: 'Vendas', to: '/sales' } },
  FINANCIAL_OVERVIEW: { section: 'Financeiro', item: { label: 'Visão Geral', to: '/financial' } },
  FINANCIAL_RECEIVABLES: { section: 'Financeiro', item: { label: 'Contas a Receber', to: '/financial/receivables' } },
  FINANCIAL_PAYABLES: { section: 'Financeiro', item: { label: 'Contas a Pagar', to: '/financial/payables' } },
  FINANCIAL_CASH: { section: 'Financeiro', item: { label: 'Fluxo de Caixa', to: '/financial/cash-transactions' } },
  FINANCIAL_RECONCILIATION: { section: 'Financeiro', item: { label: 'Conciliação', to: '/financial/reconciliation' } },
  FINANCIAL_REVENUES: { section: 'Financeiro', item: { label: 'Receitas', to: '/financial/revenues' } },
  FINANCIAL_EXPENSES: { section: 'Financeiro', item: { label: 'Despesas', to: '/financial/expenses' } },
  FINANCIAL_DRE: { section: 'Financeiro', item: { label: 'DRE Gerencial', to: '/financial/dre' } },
  FINANCIAL_REPORTS: { section: 'Financeiro', item: { label: 'Relatórios', to: '/financial/reports' } },
};

/** Builds only the sections/items an AGENT's actual grants cover --
 * an empty grant list means no extra sections at all, and a section
 * only appears once at least one of its modules is granted. */
function buildGrantedSections(grantedModules: AreaGrantModule[]): NavSection[] {
  const bySection = new Map<'Vendas' | 'Financeiro', NavItem[]>();
  for (const module of grantedModules) {
    const entry = AREA_GRANT_ITEMS[module];
    if (!entry) continue;
    const items = bySection.get(entry.section) ?? [];
    items.push(entry.item);
    bySection.set(entry.section, items);
  }
  return Array.from(bySection.entries()).map(([label, items]) => ({ label, items }));
}

// A NavItem's `to` may carry a query string (e.g. '/settings?tab=invitations')
// to deep-link into a specific tab -- location.pathname never includes one,
// so every "is this item on the current route" check compares path only.
function itemMatchesPath(itemTo: string, pathname: string): boolean {
  const path = itemTo.split('?')[0] ?? itemTo;
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

export interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  /** Current principal's role, when known. Undefined/null (still loading,
   * or /me unavailable) falls back to the full management sidebar so the
   * app never silently hides navigation a user is entitled to. */
  role?: CurrentUserRole | null | undefined;
}

export function Sidebar({ mobileOpen, onClose, role }: SidebarProps) {
  const isOperationalStaff = role === 'AGENT';
  const [grantedModules, setGrantedModules] = useState<AreaGrantModule[]>([]);

  useEffect(() => {
    if (!isOperationalStaff) return;
    let cancelled = false;
    api
      .get<{ areas: AreaGrantModule[] }>('/settings/my-area-grants')
      .then(({ data }) => {
        if (!cancelled) setGrantedModules(data.areas);
      })
      .catch(() => {
        if (!cancelled) setGrantedModules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOperationalStaff]);

  const sections = isOperationalStaff
    ? [...STAFF_OPERATIONAL_SECTIONS, ...buildGrantedSections(grantedModules)]
    : NAV_SECTIONS;
  const location = useLocation();

  // Areas are collapsed by default -- each section header is a toggle, not
  // just a label. Requested directly: the previous always-expanded ~50-item
  // flat list made every area visually identical, impossible to scan one
  // area at a time. Whichever section contains the current route starts
  // open so navigating in doesn't hide where you are.
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const current = sections.find((section) =>
      section.items.some((item) => (itemMatchesPath(item.to, location.pathname))),
    );
    return new Set(current ? [current.label] : [sections[0]?.label ?? '']);
  });

  useEffect(() => {
    const current = sections.find((section) =>
      section.items.some((item) => (itemMatchesPath(item.to, location.pathname))),
    );
    if (current) {
      setOpenSections((prev) => (prev.has(current.label) ? prev : new Set(prev).add(current.label)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on route change, not on every sections/setOpenSections identity change
  }, [location.pathname]);

  function toggleSection(label: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

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
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col bg-(--color-sidebar) transition-transform md:static md:z-auto md:w-64 md:translate-x-0',
          mobileOpen && 'translate-x-0',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-(--color-sidebar-border) px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-xs font-bold text-white">
            TP
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">
            Travel Platform
          </span>
        </div>
        {isOperationalStaff && (
          <p className="border-b border-(--color-sidebar-border) px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-(--color-sidebar-muted)">
            Ambiente Operacional
          </p>
        )}
        {!isOperationalStaff && (
          <div className="flex items-center justify-end gap-3 border-b border-(--color-sidebar-border) px-3 py-1.5">
            <button
              type="button"
              onClick={() => setOpenSections(new Set(sections.map((s) => s.label)))}
              className="text-[0.65rem] font-medium uppercase tracking-wide text-(--color-sidebar-muted) hover:text-white"
            >
              Expandir tudo
            </button>
            <button
              type="button"
              onClick={() => setOpenSections(new Set())}
              className="text-[0.65rem] font-medium uppercase tracking-wide text-(--color-sidebar-muted) hover:text-white"
            >
              Recolher tudo
            </button>
          </div>
        )}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {sections.map((section) => {
            const isOpen = openSections.has(section.label);
            const sectionHasActiveItem = section.items.some((item) =>
              itemMatchesPath(item.to, location.pathname),
            );
            return (
              <div key={section.label} className="rounded-md">
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  aria-expanded={isOpen}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors',
                    sectionHasActiveItem
                      ? 'bg-(--color-sidebar-active)/40 text-white'
                      : 'text-(--color-sidebar-muted) hover:bg-white/5 hover:text-white',
                  )}
                >
                  <span className="flex items-center gap-2">
                    {section.label}
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[0.6rem] font-semibold normal-case tracking-normal text-(--color-sidebar-muted)">
                      {section.items.length}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="mb-2 mt-0.5 flex flex-col gap-0.5 border-l border-(--color-sidebar-border) pl-2">
                    {section.items.map((item) => (
                      <NavLink
                        key={`${section.label}-${item.label}`}
                        to={item.to}
                        end={item.to === '/'}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium text-(--color-sidebar-foreground) transition-colors hover:bg-(--color-sidebar-active) hover:text-white',
                            isActive && 'bg-(--color-sidebar-active) text-white',
                          )
                        }
                      >
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
