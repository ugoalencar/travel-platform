import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';
import { useBranding } from './BrandingProvider';
import { MENU } from './menu';

export function Layout() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const granted = user?.permissions ?? [];
  const items = MENU.filter(
    (item) => item.anyOf.length === 0 || item.anyOf.some((permission) => granted.includes(permission)),
  );

  return (
    <div className="lite-shell">
      <aside className="lite-sidebar">
        <div className="lite-brand">
          {branding.logoDataUrl ? (
            <img
              className="lite-brand-logo"
              src={branding.logoDataUrl}
              alt={branding.displayName ? `Logo ${branding.displayName}` : 'Logo da agência'}
            />
          ) : null}
          <span>{branding.displayName ?? 'Travel Lite'}</span>
        </div>
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
          <div className="lite-topbar-actions">
            <Link className="btn btn-ghost" to="/ajuda">
              Ajuda
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
              Sair
            </button>
          </div>
        </header>
        <main className="lite-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
