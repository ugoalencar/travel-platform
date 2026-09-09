import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  Gift,
  Heart,
  LayoutDashboard,
  Map,
  Megaphone,
  Plane,
  Route,
  Search,
  Settings,
  Sparkles,
  Ticket,
  Users,
  WalletCards,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  key: string;
  heading: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    key: 'comercial',
    heading: 'CRM & Comercial',
    items: [
      { label: 'Clientes', to: '/customers', icon: Users },
      { label: 'Desejos', to: '/wishes', icon: Heart },
      { label: 'Ofertas', to: '/offers', icon: Gift },
      { label: 'Propostas', to: '/proposals', icon: FileText },
      { label: 'Reservas', to: '/bookings', icon: Ticket },
      { label: 'Vendas', to: '/sales', icon: WalletCards },
      { label: 'Viagens', to: '/trips', icon: Plane },
      { label: 'Painel comercial', to: '/commercial/dashboard', icon: BarChart3 },
      { label: 'Pipeline', to: '/commercial/pipeline', icon: BriefcaseBusiness },
      { label: 'Agenda comercial', to: '/commercial/agenda', icon: CalendarClock },
    ],
  },
  {
    key: 'transportes',
    heading: 'Operacao',
    items: [
      { label: 'Rotas', to: '/transport/routes', icon: Route },
      { label: 'Produtos', to: '/transport/products', icon: Map },
      { label: 'Fornecedores', to: '/transport/suppliers', icon: Users },
      { label: 'Saidas', to: '/transport/departures', icon: CalendarDays },
      { label: 'Agenda', to: '/transport/agenda', icon: CalendarClock },
      { label: 'Operacoes de hoje', to: '/operations/today', icon: ClipboardCheck },
    ],
  },
  {
    key: 'financeiro',
    heading: 'Financeiro',
    items: [
      { label: 'Visao geral', to: '/financial', icon: WalletCards },
      { label: 'Pagamentos', to: '/financial/payments', icon: CreditCard },
      { label: 'Custos operacionais', to: '/financial/operational-costs', icon: BarChart3 },
      { label: 'Pescador', to: '/pescador', icon: Search },
    ],
  },
  {
    key: 'marketing',
    heading: 'Ofertas & Marketing',
    items: [
      { label: 'Estudio criativo', to: '/offer-growth/studio', icon: Sparkles },
      { label: 'Modelos', to: '/offer-growth/templates', icon: FileText },
      { label: 'Campanhas', to: '/offer-growth/campaigns', icon: Megaphone },
      { label: 'Publicacoes', to: '/offer-growth/publications', icon: Megaphone },
      { label: 'Automacoes', to: '/offer-growth/automations', icon: Settings },
      { label: 'Cupons', to: '/offer-growth/coupons', icon: Gift },
    ],
  },
  {
    key: 'configuracoes',
    heading: 'Configuracoes',
    items: [{ label: 'Pipelines', to: '/settings/pipelines', icon: Settings }],
  },
];

export function Sidebar() {
  return (
    <aside className="flex max-h-52 w-full shrink-0 flex-col overflow-y-auto border-b border-slate-800 bg-[#0f172a] text-white md:h-full md:max-h-none md:w-64 md:border-b-0 md:border-r md:border-[#1e293b]">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#1e293b] px-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-900/30">
          TP
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-bold tracking-tight text-white">Travel Platform</span>
          <span className="block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">
            Agencia / CRM
          </span>
        </span>
      </div>
      <nav className="flex flex-row gap-2 overflow-x-auto p-3 md:flex-1 md:flex-col md:gap-5 md:overflow-x-visible">
        <NavItemLink item={{ label: 'Painel', to: '/customers', icon: LayoutDashboard }} />
        {NAV_SECTIONS.map((section) => (
          <div key={section.key} className="contents md:block md:space-y-1">
            <p className="hidden px-3 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 md:block">
              {section.heading}
            </p>
            {section.items.map((item) => (
              <NavItemLink key={`${section.key}-${item.to}-${item.label}`} item={item} />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.to === '/customers' || item.to === '/financial'}
      className={({ isActive }) =>
        cn(
          'inline-flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-[#1e293b] hover:text-white md:flex md:w-full',
          isActive && 'bg-blue-600 text-white shadow-sm shadow-blue-950/30 hover:bg-blue-600',
        )
      }
    >
      <Icon size={16} className="shrink-0" />
      <span className="whitespace-nowrap">{item.label}</span>
    </NavLink>
  );
}
