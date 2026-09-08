import { useEffect, useState } from 'react';

// Minimal client-side view of the authenticated principal, fetched from the
// server-authoritative GET /me (services/api/src/app.ts). This app has no
// AuthProvider/TenantContext of its own -- role is never computed or
// trusted client-side, it's read as-is from the backend. Used only to
// decide sidebar *presentation* (which sections a role sees); every actual
// permission/tenant boundary is still enforced server-side regardless of
// what this hook returns.
export type CurrentUserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';

export interface CurrentUser {
  userId: string;
  agencyId: string;
  role: CurrentUserRole;
}

// pt-BR display labels for the roles above. Single source of truth so every
// screen that shows a role (topbar, sidebar, user menus) renders the same
// word for the same role -- no risk of one place saying "ADMIN" while
// another shows a stale/hardcoded value.
export const CURRENT_USER_ROLE_LABELS: Record<CurrentUserRole, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  AGENT: 'Agente',
  VIEWER: 'Visualizador',
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/api/me`)
      .then((response) => (response.ok ? (response.json() as Promise<CurrentUser>) : null))
      .then((data) => {
        if (!cancelled) {
          setUser(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}
