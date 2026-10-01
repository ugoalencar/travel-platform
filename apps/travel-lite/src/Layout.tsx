import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';

const MENU = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/clientes', label: 'Clientes' },
  { to: '/vendedores', label: 'Vendedores' },
  { to: '/vendas', label: 'Vendas' },
  { to: '/comissoes', label: 'Comissões' },
  { to: '/financeiro', label: 'Financeiro' },
  { to: '/relatorios', label: 'Relatórios' },
  { to: '/cadastros', label: 'Cadastros' },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="lite-shell">
      <aside className="lite-sidebar">
        <div className="lite-brand">Travel Lite</div>
        <nav className="lite-menu">
          {MENU.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end === true}
              className={({ isActive }) => (isActive ? 'lite-menu-link active' : 'lite-menu-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="lite-main">
        <header className="lite-topbar">
          <span className="lite-user">{user?.name}</span>
          <span className="lite-role">{user?.role}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
            Sair
          </button>
        </header>
        <main className="lite-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
