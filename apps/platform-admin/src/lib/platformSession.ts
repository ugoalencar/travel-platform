// Platform Admin session client (Frontend Auth & Session track). Same
// Bearer-token contract and sessionStorage rationale as the other two apps'
// session clients -- see apps/agency/src/lib/session.ts's doc comment.
// Distinct storage key so this can never be confused with a staff or
// customer session.

const STORAGE_KEY = 'travel_platform_platform_admin_session';

export interface PlatformSessionUser {
  id: string;
  email: string;
  role: string;
}

interface StoredSession {
  token: string;
  expiresAt: string;
}

let currentToken: string | null = null;
let currentExpiresAt: number | null = null;

function loadFromStorage(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredSession;
    const expiresAt = Date.parse(parsed.expiresAt);
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    currentToken = parsed.token;
    currentExpiresAt = expiresAt;
  } catch {
    // Corrupt/unavailable sessionStorage -- fall back to logged-out state.
  }
}

loadFromStorage();

export function getSessionToken(): string | null {
  if (currentExpiresAt !== null && currentExpiresAt <= Date.now()) {
    clearSession();
    return null;
  }
  return currentToken;
}

export function setSession(token: string, expiresAt: string): void {
  currentToken = token;
  currentExpiresAt = Date.parse(expiresAt);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt }));
  } catch {
    // ignore -- in-memory token still works for the current page lifetime
  }
}

export function clearSession(): void {
  currentToken = null;
  currentExpiresAt = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasSession(): boolean {
  return getSessionToken() !== null;
}
