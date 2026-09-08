import { NavLink } from 'react-router-dom';

// Standalone nav for the end-customer-facing portal. Intentionally does
// NOT reuse components/layout/Sidebar.tsx (the staff admin nav) -- that
// component lists admin/back-office sections (Customers, Suppliers,
// Operations...) that must never be shown to an end customer, on desktop
// or, especially, on mobile.
// Nav items follow docs/travel_platform_visual_functional_blueprint/
// 03_CUSTOMER_PORTAL_UX.md exactly: Início, Minhas Viagens, Propostas,
// Reservas, Documentos, Pagamentos, Perfil, Ajuda. "Ofertas" is
// deliberately NOT a top-level item per that list -- the route and page
// still exist (a customer may want to browse available offers before
// requesting a proposal), reached instead from a card on Início, so
// nothing built in an earlier wave is removed, just demoted out of the
// primary nav to match this spec's intended information architecture.
const LINKS = [
  { to: '/customer-portal', label: 'Início', end: true },
  { to: '/customer-portal/trips', label: 'Minhas Viagens' },
  { to: '/customer-portal/proposals', label: 'Propostas' },
  { to: '/customer-portal/bookings', label: 'Reservas' },
  { to: '/customer-portal/documents', label: 'Documentos' },
  { to: '/customer-portal/payments', label: 'Pagamentos' },
  { to: '/customer-portal/profile', label: 'Perfil' },
  { to: '/customer-portal/help', label: 'Ajuda' },
] as const;

export function CustomerNav() {
  return (
    <nav className="border-b border-orange-100 bg-white/80 backdrop-blur sm:border-b-0 sm:border-r sm:w-56 sm:shrink-0">
      <div className="hidden items-center gap-2 px-4 pb-2 pt-5 sm:flex">
        <span className="text-xl" aria-hidden="true">🧳</span>
        <span className="text-sm font-bold tracking-tight text-[color:var(--portal-ink)]">
          Minha Viagem
        </span>
      </div>
      <ul className="flex overflow-x-auto sm:flex-col sm:overflow-visible sm:px-2">
        {LINKS.map((link) => (
          <li key={link.to} className="shrink-0 sm:shrink">
            <NavLink
              to={link.to}
              end={'end' in link ? link.end : false}
              className={({ isActive }) =>
                [
                  'block whitespace-nowrap px-4 py-3 text-sm font-medium sm:mx-1 sm:my-0.5 sm:rounded-full',
                  isActive
                    ? 'text-[#f97362] border-b-2 border-[#f97362] sm:border-b-0 sm:bg-[#ffe4d6] sm:font-semibold'
                    : 'text-slate-600 hover:text-slate-900 sm:hover:bg-orange-50',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
