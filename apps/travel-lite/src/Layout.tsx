import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useCan } from './auth';
import { useBranding } from './BrandingProvider';
import { MENU } from './menu';

export function Layout() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const location = useLocation();
  const canCreateCustomer = useCan('customers.create');
  // Below the mobile breakpoint the sidebar is an off-canvas drawer (CSS);
  // this state only says whether it is open. On desktop it has no effect.
  const [menuOpen, setMenuOpen] = useState(false);
  const granted = user?.permissions ?? [];
  const items = MENU.filter(
    (item) => item.anyOf.length === 0 || item.anyOf.some((permission) => granted.includes(permission)),
  );

  // Close the drawer after navigating.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className="lite-shell">
      <aside id="lite-sidebar" className={menuOpen ? 'lite-sidebar open' : 'lite-sidebar'}>
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
        <nav className="lite-menu" aria-label="Menu principal">
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
      {menuOpen ? <div className="lite-scrim" data-testid="menu-scrim" onClick={() => setMenuOpen(false)} /> : null}
      <div className="lite-main">
        <header className="lite-topbar">
          <button
            type="button"
            className="btn btn-ghost lite-menu-toggle"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="lite-sidebar"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
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
      {canCreateCustomer ? (
        <Link className="lite-fab" to="/clientes?novo=1" aria-label="Novo cliente">
          + Cliente
        </Link>
      ) : null}
    </div>
  );
}
