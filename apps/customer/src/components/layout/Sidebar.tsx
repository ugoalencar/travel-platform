import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  to?: string;
}

// Grouped nav sections (item 7 of the shared-UX batch). This is a
// label/grouping/ordering change only -- every `to` route below is exactly
// what the old flat NAV_ITEMS array had; nothing was renamed or rerouted.
//
// NOTE ON "Financeiro": every /financial/* backend route already requires
// MANAGER server-side (confirmed separately) -- this list intentionally
// does NOT hide it for lower roles. Doing so would require knowing the
// current user's role client-side, and this app has no client-side
// auth/session/role mechanism today (see services/api.ts: "The frontend
// never sets agencyId/tenant/role itself -- it only calls the API and
// renders what comes back."). Inventing one here would cross into
// Auth/TenantContext, which is out of scope for this batch, so the item is
// deferred rather than improvised -- see this batch's final report.
const COMERCIAL_NAV_ITEMS: NavItem[] = [
  { label: 'Clientes', to: '/customers' },
  { label: 'Desejos', to: '/wishes' },
  { label: 'Ofertas', to: '/offers' },
  { label: 'Propostas', to: '/proposals' },
  { label: 'Reservas', to: '/bookings' },
  { label: 'Vendas', to: '/sales' },
  { label: 'Viagens', to: '/trips' },
  { label: 'Painel comercial', to: '/commercial/dashboard' },
  { label: 'Pipeline', to: '/commercial/pipeline' },
  { label: 'Agenda comercial', to: '/commercial/agenda' },
];

const TRANSPORTES_NAV_ITEMS: NavItem[] = [
  { label: 'Rotas', to: '/transport/routes' },
  { label: 'Produtos de transporte', to: '/transport/products' },
  { label: 'Fornecedores', to: '/transport/suppliers' },
  { label: 'Saídas', to: '/transport/departures' },
  { label: 'Agenda', to: '/transport/agenda' },
  { label: 'Operações de hoje', to: '/operations/today' },
];

// See NOTE above on Financeiro's visibility being unconditional for now.
const FINANCEIRO_NAV_ITEMS: NavItem[] = [
  { label: 'Financeiro', to: '/financial' },
  { label: 'Pescador', to: '/pescador' },
];

const OFERTAS_MARKETING_NAV_ITEMS: NavItem[] = [
  { label: 'Creative Studio', to: '/offer-growth/studio' },
  { label: 'Templates', to: '/offer-growth/templates' },
  { label: 'Editor criativo', to: '/offer-growth/editor' },
  { label: 'Campanhas', to: '/offer-growth/campaigns' },
  { label: 'Publicações', to: '/offer-growth/publications' },
  { label: 'Automações', to: '/offer-growth/automations' },
  { label: 'Cupons', to: '/offer-growth/coupons' },
];

// Minimal "Configurações" nav section (no settings framework existed
// before this) -- currently just Pipelines. Every write on that page is
// still enforced server-side by requirePipelineAdmin(); this link is not
// itself a permission gate.
const CONFIGURACOES_NAV_ITEMS: NavItem[] = [{ label: 'Pipelines', to: '/settings/pipelines' }];

const NAV_SECTIONS: Array<{ key: string; heading: string; items: NavItem[] }> = [
  { key: 'comercial', heading: 'Comercial', items: COMERCIAL_NAV_ITEMS },
  { key: 'transportes', heading: 'Transportes', items: TRANSPORTES_NAV_ITEMS },
  { key: 'financeiro', heading: 'Financeiro', items: FINANCEIRO_NAV_ITEMS },
  {
    key: 'ofertas-marketing',
    heading: 'Ofertas & Marketing',
    items: OFERTAS_MARKETING_NAV_ITEMS,
  },
  { key: 'configuracoes', heading: 'Configurações', items: CONFIGURACOES_NAV_ITEMS },
];

export function Sidebar() {
  return (
    <aside className="flex max-h-48 w-full shrink-0 flex-col overflow-y-auto border-b border-slate-200 bg-white md:h-full md:max-h-none md:w-56 md:border-b-0 md:border-r">
      <div className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4">
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          Travel Platform
        </span>
      </div>
      <nav className="flex flex-row gap-1 overflow-x-auto p-3 md:flex-1 md:flex-col md:overflow-x-visible">
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.key} className="contents">
            <div
              className={cn(
                'shrink-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:py-0',
                index > 0 && 'md:mt-4',
              )}
            >
              {section.heading}
            </div>
            {section.items.map((item) => (
              <NavItemLink key={`${section.key}-${item.label}-${item.to ?? ''}`} item={item} />
            ))}
          </div>
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
          'shrink-0 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100',
          isActive && 'bg-slate-900 text-white hover:bg-slate-900',
        )
      }
    >
      {item.label}
    </NavLink>
  );
}
