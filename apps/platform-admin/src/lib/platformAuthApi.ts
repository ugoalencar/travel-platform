import { clearSession, getSessionToken, setSession, type PlatformSessionUser } from './platformSession';
import { translateApiErrorMessage } from './errorTranslation';

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
      translateApiErrorMessage(typeof data.error === 'string' ? data.error : 'Falha na requisição'),
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

// ============================================================
// Account recovery + MFA settings (098)
// ============================================================

async function authedJson<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 401) {
    clearSession();
  }
  if (!response.ok) {
    throw new PlatformAuthApiError(
      translateApiErrorMessage(typeof data.error === 'string' ? data.error : 'Falha na requisição'),
      response.status,
    );
  }
  return data as T;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await postJson<{ requested: boolean }>('/platform-auth/forgot-password', { email });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  await postJson<{ reset: boolean }>('/platform-auth/reset-password', { token, newPassword });
}

export interface MfaStatus {
  mfaEnabled: boolean;
  recoveryCodesRemaining: number;
}

export function getMfaStatus(): Promise<MfaStatus> {
  return authedJson<MfaStatus>('GET', '/platform-auth/mfa/status');
}

export function startMfaEnrollment(): Promise<{ provisioningUri: string; recoveryCodes: string[] }> {
  return authedJson('POST', '/platform-auth/mfa/enroll');
}

export async function confirmMfaEnrollment(code: string): Promise<void> {
  await authedJson<{ enrolled: boolean }>('POST', '/platform-auth/mfa/enroll/confirm', { code });
}

export async function resetMfa(password: string, code: string): Promise<void> {
  await authedJson<{ mfaReset: boolean }>('POST', '/platform-auth/mfa/reset', { password, code });
}
