import { NavLink } from 'react-router-dom';

// Standalone nav for the end-customer-facing portal. Intentionally does
// NOT reuse components/layout/Sidebar.tsx (the staff admin nav) -- that
// component lists admin/back-office sections (Customers, Suppliers,
// Operations...) that must never be shown to an end customer, on desktop
// or, especially, on mobile.
const LINKS = [
  { to: '/customer-portal', label: 'Início', end: true },
  { to: '/customer-portal/trips', label: 'Viagens' },
  { to: '/customer-portal/offers', label: 'Ofertas' },
  { to: '/customer-portal/proposals', label: 'Propostas' },
  { to: '/customer-portal/bookings', label: 'Reservas' },
  { to: '/customer-portal/documents', label: 'Documentos' },
  { to: '/customer-portal/profile', label: 'Perfil' },
] as const;

export function CustomerNav() {
  return (
    <nav className="border-b border-slate-200 bg-white sm:border-b-0 sm:border-r sm:w-56 sm:shrink-0">
      <ul className="flex overflow-x-auto sm:flex-col sm:overflow-visible">
        {LINKS.map((link) => (
          <li key={link.to} className="shrink-0 sm:shrink">
            <NavLink
              to={link.to}
              end={'end' in link ? link.end : false}
              className={({ isActive }) =>
                [
                  'block whitespace-nowrap px-4 py-3 text-sm font-medium',
                  isActive
                    ? 'text-teal-700 border-b-2 border-teal-600 sm:border-b-0 sm:border-l-2 sm:bg-teal-50'
                    : 'text-slate-600 hover:text-slate-900',
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
