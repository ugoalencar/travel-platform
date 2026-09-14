// Staff session client (Frontend Auth & Session track). Talks to the real
// Bearer-token contract the backend implements -- POST /api/auth/login
// issues an opaque session token, never a JWT, and there is no cookie.
//
// Storage: the token lives in a module-level variable (primary) mirrored
// into sessionStorage only so a page reload doesn't force a fresh login --
// sessionStorage is cleared when the tab/browser closes, unlike
// localStorage, which is the storage explicitly ruled out for this token
// (see the Frontend Auth & Session track decision). Nothing here treats the
// token as authoritative: every real permission/tenant check still happens
// server-side, exactly as documented in useCurrentUser.ts.

const STORAGE_KEY = 'travel_platform_agency_session';

export interface StaffSessionUser {
  id: string;
  agencyId: string;
  role: string;
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
    // sessionStorage unavailable (e.g. private mode edge cases) -- the
    // in-memory token still works for the current page lifetime.
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
