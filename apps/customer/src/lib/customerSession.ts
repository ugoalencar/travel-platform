// Customer Portal session client (Frontend Auth & Session track). Same
// Bearer-token contract and storage rationale as apps/agency/src/lib/session.ts
// (opaque token, sessionStorage-backed, never localStorage) -- a distinct
// storage key so a customer session can never be confused with, or
// overwrite, a staff session even if both apps somehow shared an origin.

const STORAGE_KEY = 'travel_platform_customer_session';

export interface CustomerSessionUser {
  agencyId: string;
  customerId: string;
  email: string;
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
