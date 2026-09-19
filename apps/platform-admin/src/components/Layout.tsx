import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Package,
  CreditCard,
  Receipt,
  MessageSquare,
  AlertTriangle,
  Flag,
  HeartPulse,
  ClipboardList,
  Settings,
  Zap,
  Megaphone,
  ShieldCheck,
  LogOut,
  FileText,
  Image,
  HelpCircle,
  Handshake,
  Share2,
  Percent,
  Wallet,
} from 'lucide-react';
import { logout } from '../lib/platformAuthApi';

// Sidebar structure per docs/travel_platform_visual_functional_blueprint/
// 04_PLATFORM_ADMIN_SEPARATION.md -- exact section order and labels for the
// platform (governance) navigation. Deliberately excludes agency-operational
// concepts (Booking, Aereo, Terrestre, Clientes da agencia, Comissoes
// internas, Caixa operacional): none of those exist as routes in this app.
interface NavItem {
  label: string;
  to: string;
  icon: typeof BarChart3;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Painel',
    items: [{ label: 'Visão Geral', to: '/', icon: BarChart3 }],
  },
  {
    label: 'Governança de Contas',
    items: [
      { label: 'Agências', to: '/subscribers', icon: Building2 },
      { label: 'Planos', to: '/plans', icon: Package },
      { label: 'Assinaturas', to: '/subscriptions', icon: CreditCard },
    ],
  },
  {
    label: 'Faturamento SaaS',
    items: [{ label: 'Faturamento', to: '/financial', icon: Receipt }],
  },
  {
    label: 'Pessoas',
    // "Usuários" pointed at this same /settings route as Governança's
    // "Configurações" below -- no dedicated platform-staff screen exists,
    // so it was a second label for the same page. Removed rather than
    // left as a placeholder (redundant-menu sweep requested directly).
    items: [{ label: 'Suporte', to: '/support', icon: MessageSquare }],
  },
  {
    label: 'Confiabilidade',
    items: [
      { label: 'Incidentes', to: '/incidents', icon: AlertTriangle },
      { label: 'Feature Flags', to: '/feature-flags', icon: Flag },
      { label: 'Monitoramento', to: '/health', icon: HeartPulse },
    ],
  },
  {
    label: 'Governança',
    items: [
      { label: 'Relatórios', to: '/audit', icon: ClipboardList },
      { label: 'Configurações', to: '/settings', icon: Settings },
    ],
  },
  {
    label: 'Aquisição (não operacional)',
    items: [
      { label: 'Leads', to: '/leads', icon: Zap },
      { label: 'Marketing', to: '/marketing', icon: Megaphone },
    ],
  },
  // Platform Admin Comercial & Parcerias (META PÓS-PILOTO 01) -- Landing
  // CMS/Banners/FAQ (Travel Plataforma's own marketing content) and
  // Partners/Referrals/Commissions/Credits (the platform's own commercial
  // partnership program). Deliberately separate from any agency-facing
  // concept -- this is Travel Plataforma's own commercial layer, not a
  // tenant/agency feature.
  {
    label: 'Conteúdo',
    items: [
      { label: 'Landing', to: '/content/landing', icon: FileText },
      { label: 'Banners', to: '/content/banners', icon: Image },
      { label: 'FAQ', to: '/content/faq', icon: HelpCircle },
    ],
  },
  {
    label: 'Parcerias',
    items: [
      { label: 'Parceiros', to: '/partnerships/partners', icon: Handshake },
      { label: 'Indicações', to: '/partnerships/referrals', icon: Share2 },
      { label: 'Comissões', to: '/partnerships/commissions', icon: Percent },
      { label: 'Créditos', to: '/partnerships/credits', icon: Wallet },
    ],
  },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar -- governance palette (indigo/violet), distinct from the
       * Agency app's slate/blue operational sidebar. */}
      <aside className="flex w-64 shrink-0 flex-col bg-(--color-sidebar) text-white shadow-lg">
        <div className="flex items-center gap-2 border-b border-(--color-sidebar-border) p-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-600 text-white">
            <ShieldCheck size={18} />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">Admin da Plataforma</p>
            <p className="text-[0.7rem] leading-tight text-(--color-sidebar-muted)">
              Controle central do SaaS
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="px-3 text-[0.65rem] font-bold uppercase tracking-wide text-(--color-sidebar-muted)">
                {section.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive =
                    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
                  const Icon = item.icon;
                  return (
                    <NavLink key={`${section.label}-${item.label}`} to={item.to} isActive={isActive}>
                      <Icon size={16} />
                      <span className="flex-1">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header distinct from Agency's Topbar: governance badge instead of
         * "Agência" badge, violet accent instead of blue. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-violet-200 bg-white px-6">
          <span
            className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-200"
            title="Ambiente de governança da plataforma (distinto do Painel da Agência)"
          >
            Plataforma
          </span>
          <span className="hidden text-sm font-medium text-slate-700 sm:inline">
            Travel Platform SaaS
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600">
              Modo demonstração
            </span>
            <span className="text-sm text-slate-700">
              Equipe da Plataforma <span className="text-slate-400">· PLATFORM_OWNER</span>
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              aria-label="Sair"
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function NavLink({
  to,
  isActive,
  title,
  children,
}: {
  to: string;
  isActive: boolean;
  title?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      title={title}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-(--color-sidebar-active) text-white'
          : 'text-(--color-sidebar-foreground) hover:bg-(--color-sidebar-active) hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}
