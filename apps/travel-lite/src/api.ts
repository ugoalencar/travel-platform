const SESSION_KEY = 'travel_lite_token';
const SESSION_USER_KEY = 'travel_lite_token_user';

export interface SessionUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
}

export interface StoredSession {
  token: string;
  user: SessionUser;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function loadSession(): StoredSession | null {
  return readSession();
}

export function saveSession(session: StoredSession): void {
  window.localStorage.setItem(SESSION_KEY, session.token);
  window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify(session.user));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(SESSION_USER_KEY);
}

function readSession(): StoredSession | null {
  try {
    const token = window.localStorage.getItem(SESSION_KEY);
    const rawUser = window.localStorage.getItem(SESSION_USER_KEY);
    if (!token || !rawUser) return null;
    const user = JSON.parse(rawUser) as SessionUser;
    return { token, user };
  } catch {
    return null;
  }
}

export { readSession };

function authHeaders(token: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = options.token === undefined ? readSession()?.token ?? null : options.token;
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(token),
    },
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(`/api${path}`, init);

  if (response.status === 401) {
    clearSession();
    window.dispatchEvent(new Event('travel-lite:unauthorized'));
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

export async function apiCsv(path: string, token?: string | null): Promise<Blob> {
  const authToken = token === undefined ? readSession()?.token ?? null : token;
  const response = await fetch(`/api${path}`, { headers: authHeaders(authToken) });
  if (!response.ok) {
    throw new ApiError(response.status, `Export failed (${response.status})`);
  }
  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
