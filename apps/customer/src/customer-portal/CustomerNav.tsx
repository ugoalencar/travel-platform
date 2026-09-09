import { NavLink } from 'react-router-dom';
import {
  BadgeHelp,
  CalendarCheck,
  CreditCard,
  FileText,
  Home,
  Luggage,
  MapPinned,
  UserRound,
} from 'lucide-react';

const LINKS = [
  { to: '/customer-portal', label: 'Inicio', icon: Home, end: true },
  { to: '/customer-portal/trips', label: 'Minhas viagens', icon: Luggage },
  { to: '/customer-portal/proposals', label: 'Propostas', icon: MapPinned },
  { to: '/customer-portal/bookings', label: 'Reservas', icon: CalendarCheck },
  { to: '/customer-portal/documents', label: 'Documentos', icon: FileText },
  { to: '/customer-portal/payments', label: 'Pagamentos', icon: CreditCard },
  { to: '/customer-portal/profile', label: 'Perfil', icon: UserRound },
  { to: '/customer-portal/help', label: 'Ajuda', icon: BadgeHelp },
] as const;

export function CustomerNav() {
  return (
    <nav className="border-b border-orange-100 bg-[#fff7ed]/95 backdrop-blur sm:w-64 sm:shrink-0 sm:border-b-0 sm:border-r">
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200">
          <Luggage size={19} />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-black tracking-tight text-[#3a2e2a]">Minha Viagem</span>
          <span className="block text-xs font-medium text-orange-700">Tudo pronto para partir</span>
        </span>
      </div>
      <ul className="flex gap-2 overflow-x-auto px-3 pb-3 sm:flex-col sm:overflow-visible">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <li key={link.to} className="shrink-0 sm:shrink">
              <NavLink
                to={link.to}
                end={'end' in link ? link.end : false}
                className={({ isActive }) =>
                  [
                    'inline-flex w-full items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition',
                    isActive
                      ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
                      : 'text-[#6f5a51] hover:bg-orange-100 hover:text-[#3a2e2a]',
                  ].join(' ')
                }
              >
                <Icon size={16} />
                {link.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
