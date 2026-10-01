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

  // Permissions can change while a session is open (MASTER edits them):
  // refresh the cached user once per page load.
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    api<{ user: SessionUser }>('/auth/me')
      .then((response) => {
        saveSession({ token: session.token, user: response.user });
        setUser(response.user);
      })
      .catch(() => undefined);
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

/**
 * UI-only hint mirroring the API's effective permissions: hides actions the
 * API would refuse. The API remains the authority (403).
 */
export function useCan(...anyOf: string[]): boolean {
  const { user } = useAuth();
  const granted = user?.permissions ?? [];
  return anyOf.some((permission) => granted.includes(permission));
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
