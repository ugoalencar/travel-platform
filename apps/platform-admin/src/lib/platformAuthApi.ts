import { clearSession, getSessionToken, setSession, type PlatformSessionUser } from './platformSession';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class PlatformAuthApiError extends Error {
  readonly status: number;
  readonly captchaRequired: boolean;

  constructor(message: string, status: number, captchaRequired = false) {
    super(message);
    this.name = 'PlatformAuthApiError';
    this.status = status;
    this.captchaRequired = captchaRequired;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new PlatformAuthApiError(
      typeof data.error === 'string' ? data.error : 'Falha na requisição',
      response.status,
      data.captchaRequired === true,
    );
  }
  return data as T;
}

export type PlatformLoginResult =
  | { state: 'MFA_REQUIRED'; mfaChallengeToken: string; expiresAt: string }
  | { state: 'FULLY_AUTHENTICATED'; sessionToken: string; expiresAt: string; user: PlatformSessionUser };

export async function login(email: string, password: string): Promise<PlatformLoginResult> {
  const result = await postJson<PlatformLoginResult>('/platform-auth/login', { email, password });
  if (result.state === 'FULLY_AUTHENTICATED') {
    setSession(result.sessionToken, result.expiresAt);
  }
  return result;
}

export async function verifyMfa(mfaChallengeToken: string, code: string): Promise<PlatformLoginResult> {
  const result = await postJson<PlatformLoginResult>('/platform-auth/mfa/verify', {
    sessionToken: mfaChallengeToken,
    code,
  });
  if (result.state === 'FULLY_AUTHENTICATED') {
    setSession(result.sessionToken, result.expiresAt);
  }
  return result;
}

export async function logout(): Promise<void> {
  const token = getSessionToken();
  clearSession();
  if (!token) return;
  try {
    await fetch(`${API_BASE_URL}/platform-auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort server-side revoke -- client-side session is already
    // cleared regardless.
  }
}
