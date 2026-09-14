import { clearSession, getSessionToken, setSession } from './customerSession';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class CustomerAuthApiError extends Error {
  readonly status: number;
  readonly captchaRequired: boolean;

  constructor(message: string, status: number, captchaRequired = false) {
    super(message);
    this.name = 'CustomerAuthApiError';
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
    throw new CustomerAuthApiError(
      typeof data.error === 'string' ? data.error : 'Falha na requisição',
      response.status,
      data.captchaRequired === true,
    );
  }
  return data as T;
}

export interface CustomerLoginResult {
  sessionToken: string;
  expiresAt: string;
  agencyId: string;
  customerId: string;
  email: string;
}

export async function login(agencySlug: string, email: string, password: string): Promise<CustomerLoginResult> {
  const result = await postJson<CustomerLoginResult>('/customer-auth/login', { agencySlug, email, password });
  setSession(result.sessionToken, result.expiresAt);
  return result;
}

export async function forgotPassword(agencySlug: string, email: string): Promise<void> {
  await postJson('/customer-auth/forgot-password', { agencySlug, email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await postJson('/customer-auth/reset-password', { token, newPassword });
}

export async function logout(): Promise<void> {
  const token = getSessionToken();
  clearSession();
  if (!token) return;
  try {
    await fetch(`${API_BASE_URL}/customer-auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort server-side revoke -- client-side session is already
    // cleared regardless.
  }
}
