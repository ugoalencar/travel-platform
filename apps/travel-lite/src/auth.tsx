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

interface PasswordChangeRequiredResponse {
  passwordChangeRequired: true;
}

type LoginApiResponse = LoginResponse | PasswordChangeRequiredResponse;
type LoginResult = 'authenticated' | 'password-change-required';

interface PasswordChangeChallenge {
  slug: string;
  email: string;
  currentPassword: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  passwordChangeRequired: boolean;
  login: (slug: string, email: string, password: string) => Promise<LoginResult>;
  completeRequiredPasswordChange: (currentPassword: string, newPassword: string) => Promise<void>;
  cancelRequiredPasswordChange: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isPasswordChangeRequired(response: LoginApiResponse): response is PasswordChangeRequiredResponse {
  return 'passwordChangeRequired' in response && response.passwordChangeRequired === true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => loadSession()?.user ?? null);
  const [passwordChangeChallenge, setPasswordChangeChallenge] = useState<PasswordChangeChallenge | null>(null);

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
    const normalizedSlug = slug.trim();
    const normalizedEmail = email.trim();
    const response = await api<LoginApiResponse>('/auth/login', {
      method: 'POST',
      body: { slug: normalizedSlug, email: normalizedEmail, password },
      token: null,
    });
    if (isPasswordChangeRequired(response)) {
      clearSession();
      setUser(null);
      setPasswordChangeChallenge({ slug: normalizedSlug, email: normalizedEmail, currentPassword: password });
      return 'password-change-required';
    }
    saveSession({ token: response.sessionToken, user: response.user });
    setUser(response.user);
    setPasswordChangeChallenge(null);
    return 'authenticated';
  }, []);

  const completeRequiredPasswordChange = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!passwordChangeChallenge) throw new Error('Faça login novamente para criar a nova senha.');
      const { slug, email } = passwordChangeChallenge;
      await api('/auth/change-required-password', {
        method: 'POST',
        token: null,
        body: {
          slug,
          email,
          currentPassword: currentPassword || passwordChangeChallenge.currentPassword,
          newPassword,
        },
      });
      // The backend only confirms the change; it never issues a session in
      // the same call (same two-step shape as the MFA challenge elsewhere).
      // Re-run the normal, already-tested login with the new password to
      // get a real session instead of duplicating that logic here.
      const result = await login(slug, email, newPassword);
      if (result !== 'authenticated') {
        throw new Error('Senha criada, mas não foi possível entrar automaticamente. Faça login novamente.');
      }
      setPasswordChangeChallenge(null);
    },
    [passwordChangeChallenge, login],
  );

  const cancelRequiredPasswordChange = useCallback(() => {
    setPasswordChangeChallenge(null);
    clearSession();
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      clearSession();
    }
    clearSession();
    setPasswordChangeChallenge(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      passwordChangeRequired: passwordChangeChallenge !== null,
      login,
      completeRequiredPasswordChange,
      cancelRequiredPasswordChange,
      logout,
    }),
    [user, passwordChangeChallenge, login, completeRequiredPasswordChange, cancelRequiredPasswordChange, logout],
  );

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
