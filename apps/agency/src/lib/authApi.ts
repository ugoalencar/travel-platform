import { clearSession, getSessionToken, rememberAgencySlug, setSession, type StaffSessionUser } from './session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class AuthApiError extends Error {
  readonly status: number;
  readonly captchaRequired: boolean;

  constructor(message: string, status: number, captchaRequired = false) {
    super(message);
    this.name = 'AuthApiError';
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
    throw new AuthApiError(
      typeof data.error === 'string' ? data.error : 'Falha na requisição',
      response.status,
      data.captchaRequired === true,
    );
  }
  return data as T;
}

export type LoginResult =
  | { state: 'MFA_REQUIRED'; mfaChallengeToken: string; expiresAt: string }
  | { state: 'FULLY_AUTHENTICATED'; sessionToken: string; expiresAt: string; user: StaffSessionUser };

export async function login(agencySlug: string, email: string, password: string): Promise<LoginResult> {
  const result = await postJson<LoginResult>('/api/auth/login', { agencySlug, email, password });
  if (result.state === 'FULLY_AUTHENTICATED') {
    setSession(result.sessionToken, result.expiresAt);
    rememberAgencySlug(agencySlug);
  }
  return result;
}

export interface SignUpInput {
  agencyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  country?: string;
  companyIdentifier?: string;
  password: string;
}

export type SignUpResult = LoginResult & { agencySlug: string };

export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const result = await postJson<SignUpResult>('/api/agencies/signup', input);
  if (result.state === 'FULLY_AUTHENTICATED') {
    setSession(result.sessionToken, result.expiresAt);
  }
  // Remember regardless of MFA state -- the slug itself is assigned at
  // signup time and never changes, and this is the ONLY point in the
  // whole app where the frontend ever learns it (see session.ts's
  // rememberAgencySlug doc comment).
  rememberAgencySlug(result.agencySlug);
  return result;
}

export async function verifyMfa(mfaChallengeToken: string, code: string): Promise<LoginResult> {
  const result = await postJson<LoginResult>('/api/auth/mfa/verify', { sessionToken: mfaChallengeToken, code });
  if (result.state === 'FULLY_AUTHENTICATED') {
    setSession(result.sessionToken, result.expiresAt);
  }
  return result;
}

export async function forgotPassword(agencySlug: string, email: string): Promise<void> {
  await postJson('/api/auth/forgot-password', { agencySlug, email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await postJson('/api/auth/reset-password', { token, newPassword });
}

export async function logout(): Promise<void> {
  const token = getSessionToken();
  clearSession();
  if (!token) return;
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort server-side revoke -- the client-side session is already
    // cleared regardless, so a network failure here doesn't leave the user
    // stuck logged in on this device.
  }
}
