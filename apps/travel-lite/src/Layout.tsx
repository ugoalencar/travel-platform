import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';
import { MENU } from './menu';

export function Layout() {
  const { user, logout } = useAuth();
  const granted = user?.permissions ?? [];
  const items = MENU.filter(
    (item) => item.anyOf.length === 0 || item.anyOf.some((permission) => granted.includes(permission)),
  );

  return (
    <div className="lite-shell">
      <aside className="lite-sidebar">
        <div className="lite-brand">Travel Lite</div>
        <nav className="lite-menu">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
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
