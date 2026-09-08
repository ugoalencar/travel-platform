import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Heart,
  Fish,
  Tag,
  FileText,
  CalendarCheck,
  TrendingUp,
  Plane,
  Bus,
  UserRound,
  FolderClock,
  AlertTriangle,
  Undo2,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  GitCompareArrows,
  Landmark,
  Receipt,
  BarChart3,
  PieChart,
  ClipboardList,
  Building2,
  LayoutGrid,
  Compass,
  Wrench,
  Briefcase,
  Percent,
  HandCoins,
  Gift,
  Wallet2,
  Megaphone,
  Image,
  Send,
  Zap,
  ShieldCheck,
  Lock,
  Plug,
  SlidersHorizontal,
  ScrollText,
  ListChecks,
  Car,
  ClipboardCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { CurrentUserRole } from '../../hooks/useCurrentUser';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
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
    items: [{ label: 'Visão Geral', to: '/', icon: LayoutDashboard }],
  },
  {
    label: 'CRM & Comercial',
    items: [
      { label: 'Leads', to: '/customers', icon: Users, gap: true },
      { label: 'Clientes', to: '/customers', icon: Users },
      { label: 'Desejos', to: '/wishes', icon: Heart },
      { label: 'Pescador', to: '/pescador', icon: Fish },
      { label: 'Ofertas', to: '/offers', icon: Tag },
      { label: 'Propostas', to: '/proposals', icon: FileText },
      { label: 'Reservas', to: '/bookings', icon: CalendarCheck },
      { label: 'Vendas', to: '/sales', icon: TrendingUp },
    ],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Viagens', to: '/trips', icon: Compass },
      // Intentional shared route with Comercial's "Reservas" (not a gap):
      // BookingListPage/BookingDetailPage (SalesJourneyPages.tsx) are
      // already framed operationally ("Reservas operacionais", trip type,
      // confirmed/cancelled status per booking), so Operação's "Booking"
      // is the same underlying record viewed from the ops side, not a
      // separate concept that needs its own screen.
      { label: 'Booking', to: '/bookings', icon: ClipboardList },
      { label: 'Aéreo', to: '/operations/air', icon: Plane },
      { label: 'Terrestre', to: '/operations/land', icon: Bus },
      { label: 'Passageiros', to: '/operations/passengers', icon: UserRound },
      { label: 'Documentos', to: '/operations/documents', icon: FolderClock },
      { label: 'Ocorrências', to: '/operations/occurrences', icon: AlertTriangle },
      { label: 'Pós-viagem', to: '/operations/post-trip', icon: Undo2 },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Visão Geral', to: '/financial', icon: Wallet },
      { label: 'Contas a Receber', to: '/financial/receivables', icon: ArrowDownToLine },
      { label: 'Contas a Pagar', to: '/financial/payables', icon: ArrowUpFromLine },
      { label: 'Fluxo de Caixa', to: '/financial/cash-transactions', icon: ArrowLeftRight },
      { label: 'Conciliação', to: '/financial/reconciliation', icon: GitCompareArrows },
      { label: 'Receitas', to: '/financial/revenues', icon: Landmark },
      { label: 'Despesas', to: '/financial/expenses', icon: Receipt },
      { label: 'Margens', to: '/financial/dre', icon: PieChart, gap: true },
      { label: 'DRE Gerencial', to: '/financial/dre', icon: BarChart3 },
      { label: 'Relatórios', to: '/financial/reports', icon: ClipboardList },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { label: 'Fornecedores', to: '/suppliers', icon: Building2 },
      { label: 'Categorias', to: '/suppliers', icon: LayoutGrid, gap: true },
      { label: 'Produtos e Destinos', to: '/offers', icon: Compass, gap: true },
      { label: 'Centros de Custo', to: '/financial/cost-centers', icon: Wrench },
      { label: 'Categorias Financeiras', to: '/financial/categories', icon: LayoutGrid },
    ],
  },
  {
    label: 'Pessoal',
    items: [
      { label: 'Funcionários', to: '/employees', icon: Briefcase },
      { label: 'Planos de Comissão', to: '/commission-plans', icon: Percent },
      { label: 'Comissões', to: '/payroll', icon: HandCoins },
      { label: 'Salários e Benefícios', to: '/payroll', icon: Gift, gap: true },
      { label: 'Descontos e Adiantamentos', to: '/payroll', icon: Wallet2, gap: true },
      { label: 'Pagamentos', to: '/payroll', icon: HandCoins },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Campanhas', to: '/campaigns', icon: Megaphone },
      { label: 'Assets', to: '/campaigns', icon: Image, gap: true },
      { label: 'Publicações', to: '/campaigns', icon: Send, gap: true },
      { label: 'Automações', to: '/coupons', icon: Zap, gap: true },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { label: 'Usuários', to: '/settings', icon: ShieldCheck },
      { label: 'Papéis e Acessos', to: '/settings', icon: Lock, gap: true },
      { label: 'Integrações', to: '/settings', icon: Plug, gap: true },
      { label: 'Parametrizações', to: '/settings', icon: SlidersHorizontal, gap: true },
      { label: 'Logs e Auditoria', to: '/settings', icon: ScrollText, gap: true },
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
    items: [{ label: 'Minhas Tarefas', to: '/', icon: ListChecks }],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Passageiros', to: '/operations/passengers', icon: UserRound },
      { label: 'Documentos', to: '/operations/documents', icon: FolderClock },
      { label: 'Ocorrências', to: '/operations/occurrences', icon: AlertTriangle },
      { label: 'Aéreo', to: '/operations/air', icon: Plane },
      { label: 'Terrestre', to: '/operations/land', icon: Car },
      { label: 'Pós-viagem', to: '/operations/post-trip', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { label: 'Clientes', to: '/customers', icon: Users },
      { label: 'Reservas', to: '/bookings', icon: CalendarCheck },
    ],
  },
];

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
  const sections = isOperationalStaff ? STAFF_OPERATIONAL_SECTIONS : NAV_SECTIONS;

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
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-(--color-sidebar-border) px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-(--radius-sm) bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-bold text-white shadow-(--shadow-xs)">
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
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="px-3 text-[0.65rem] font-bold uppercase tracking-widest text-(--color-sidebar-muted)">
                {section.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={`${section.label}-${item.label}`}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onClose}
                      title={item.gap ? `${item.label} (tela dedicada prevista em onda futura)` : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-2.5 rounded-(--radius-sm) px-3 py-1.5 text-sm font-medium text-(--color-sidebar-foreground) transition-colors hover:bg-(--color-sidebar-active) hover:text-white',
                          isActive && 'bg-(--color-sidebar-active) text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-blue-400 transition-opacity',
                              isActive ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <Icon
                            className={cn(
                              'h-4 w-4 shrink-0 text-(--color-sidebar-muted) transition-colors group-hover:text-white',
                              isActive && 'text-blue-400',
                            )}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.gap && (
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                            />
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
