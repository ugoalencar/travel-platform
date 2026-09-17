import { NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../lib/customerAuthApi';

// Standalone nav for the end-customer-facing portal. Intentionally does
// NOT reuse components/layout/Sidebar.tsx (the staff admin nav) -- that
// component lists admin/back-office sections (Customers, Suppliers,
// Operations...) that must never be shown to an end customer, on desktop
// or, especially, on mobile.
//
// Direction A visual contract (docs/visual-reference/direction-a-customer-app.png):
// a fixed 5-icon bottom tab bar on mobile -- Início / Viagens / Ofertas /
// Suporte / Perfil -- shown on every customer-app mobile mockup. On wider
// screens this becomes a left rail, same 5 items plus a "Sair" action
// (the bottom tab bar has no room for a 6th item, and mobile logout lives
// on the Perfil page instead).
const LINKS = [
  { to: '/customer-portal', label: 'Início', icon: '🏠', end: true },
  { to: '/customer-portal/trips', label: 'Viagens', icon: '🧳' },
  { to: '/customer-portal/offers', label: 'Ofertas', icon: '🎁' },
  { to: '/customer-portal/help', label: 'Suporte', icon: '💬' },
  { to: '/customer-portal/profile', label: 'Perfil', icon: '👤' },
] as const;

export function CustomerNav() {
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    void navigate('/customer-portal/login', { replace: true });
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-orange-100 bg-white/95 backdrop-blur
        sm:static sm:inset-auto sm:z-auto sm:w-56 sm:shrink-0 sm:border-t-0 sm:border-r"
      aria-label="Navegação principal"
    >
      <div className="hidden items-center gap-2 px-4 pb-2 pt-5 sm:flex">
        <span className="text-xl" aria-hidden="true">🧳</span>
        <span className="text-sm font-bold tracking-tight text-[color:var(--portal-ink)]">
          Minha Viagem
        </span>
      </div>
      <ul className="flex sm:flex-col sm:px-2">
        {LINKS.map((link) => (
          <li key={link.to} className="flex-1 sm:flex-initial">
            <NavLink
              to={link.to}
              end={'end' in link ? link.end : false}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium',
                  'sm:mx-1 sm:my-0.5 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-3 sm:text-sm',
                  isActive
                    ? 'text-[#f97362] sm:bg-[#ffe4d6] sm:font-semibold'
                    : 'text-slate-500 hover:text-slate-900 sm:hover:bg-orange-50',
                ].join(' ')
              }
            >
              <span aria-hidden="true" className="text-lg sm:text-base">
                {link.icon}
              </span>
              <span>{link.label}</span>
            </NavLink>
          </li>
        ))}
        <li className="hidden sm:mt-2 sm:block">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="block w-full whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-slate-500 hover:text-slate-900 sm:mx-1 sm:my-0.5 sm:rounded-full sm:hover:bg-orange-50"
          >
            Sair
          </button>
        </li>
      </ul>
    </nav>
  );
}
