import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, clearSession, loadSession, saveSession, type SessionUser } from './api';

interface LoginResponse {
  sessionToken: string;
  user: SessionUser;
}

interface AuthContextValue {
  user: SessionUser | null;
  login: (slug: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => loadSession()?.user ?? null);

  useEffect(() => {
    function onUnauthorized() {
      setUser(null);
    }
    window.addEventListener('travel-lite:unauthorized', onUnauthorized);
    return () => window.removeEventListener('travel-lite:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (slug: string, email: string, password: string) => {
    const response = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { slug, email, password },
      token: null,
    });
    saveSession({ token: response.sessionToken, user: response.user });
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      clearSession();
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

const ROLE_RANK: Record<string, number> = { VIEWER: 0, OPERATOR: 1, MANAGER: 2, ADMIN: 3 };

/**
 * UI-only convenience mirroring services/api-lite/src/roles.ts: hides
 * actions the API would refuse. The API remains the authority (403).
 */
export function useHasRole(minimum: 'OPERATOR' | 'MANAGER' | 'ADMIN'): boolean {
  const { user } = useAuth();
  return (ROLE_RANK[user?.role ?? ''] ?? -1) >= ROLE_RANK[minimum]!;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
