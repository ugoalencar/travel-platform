import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

// The route only depends on sendPasswordResetEmail's signature; capturing
// its calls is the only way to observe the raw token a real caller would
// get by e-mail, since the database only ever stores its hash.
vi.mock('../src/email', () => ({ sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) }));
import { sendPasswordResetEmail } from '../src/email';

const sendPasswordResetEmailMock = vi.mocked(sendPasswordResetEmail);

describe('Travel Lite authentication', () => {
  let lite: LiteFixture;

  beforeAll(async () => {
    lite = await createLiteFixture();
  });

  afterAll(async () => {
    await lite?.close();
  });

  async function login(slug: string, email: string, password: string) {
    return lite.app.inject({ method: 'POST', url: '/auth/login', payload: { slug, email, password } });
  }

  async function resetPassword(token: string, userId: string) {
    return lite.app.inject({
      method: 'POST',
      url: `/users/${userId}/reset-password`,
      headers: lite.headers(token),
    });
  }

  it('logs in with valid credentials and returns a usable session token', async () => {
    const token = await lite.login('tenant-a', 'admin@a.test');

    const me = await lite.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: lite.headers(token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { id: string; role: string; tenantId: string; email: string } }>()).toMatchObject({
      user: {
        id: lite.adminA,
        role: 'ADMIN',
        tenantId: lite.tenantA,
        email: 'admin@a.test',
      },
    });
  });

  it('rejects wrong password with 401 and records LOGIN_FAILED audit', async () => {
    const response = await login('tenant-a', 'admin@a.test', 'wrong-password');

    expect(response.statusCode).toBe(401);
    const audit = await lite.adminPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND event_type = 'LOGIN_FAILED'`,
      [lite.tenantA],
    );
    expect(audit.rows[0]?.n).toBeGreaterThanOrEqual(1);
  });

  it('rejects unknown tenant slug with the same generic 401', async () => {
    const response = await login('does-not-exist', 'admin@a.test', 'correct-horse-battery-staple');

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>().error).toBe('Agência, e-mail ou senha inválidos');
  });

  it('rate-limits repeated failed login attempts without revealing account existence', async () => {
    let response = await login('tenant-a', 'probe-rate-limit@a.test', 'wrong-password');

    for (let attempt = 0; attempt < 5 && response.statusCode !== 429; attempt += 1) {
      response = await login('tenant-a', 'probe-rate-limit@a.test', 'wrong-password');
    }

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: 'Muitas tentativas. Tente novamente mais tarde.',
      code: 'RATE_LIMITED',
    });
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('rejects requests without a token', async () => {
    const response = await lite.app.inject({ method: 'GET', url: '/auth/me' });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a forged token whose tenant/user claim does not match the secret', async () => {
    const token = await lite.login('tenant-a', 'admin@a.test');
    const forged = token.replace(lite.tenantA, lite.tenantB);

    const response = await lite.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: lite.headers(forged),
    });

    expect(response.statusCode).toBe(401);
  });

  it('supports /api prefix (production same-origin path)', async () => {
    const token = await lite.login('tenant-b', 'staff@b.test');

    const me = await lite.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: lite.headers(token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { id: string } }>().user.id).toBe(lite.staffB);
  });

  it('logout revokes the session', async () => {
    const token = await lite.login('tenant-a', 'admin@a.test');

    const logout = await lite.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: lite.headers(token),
    });
    expect(logout.statusCode).toBe(200);

    const me = await lite.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: lite.headers(token),
    });
    expect(me.statusCode).toBe(401);
  });

  it('keeps sessions tenant-scoped: tenant B login never sees tenant A users', async () => {
    const token = await lite.login('tenant-b', 'staff@b.test');

    const me = await lite.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: lite.headers(token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { email: string } }>().user.email).toBe('staff@b.test');

    const wrongTenant = await login('tenant-b', 'admin@a.test', 'correct-horse-battery-staple');
    expect(wrongTenant.statusCode).toBe(401);
  });

  it('lets an admin issue a one-time temporary password without storing it in clear text', async () => {
    const adminToken = await lite.login('tenant-a', 'master@a.test');

    const response = await resetPassword(adminToken, lite.staffA);

    expect(response.statusCode).toBe(200);
    const body = response.json<{ temporaryPassword: string; user: { id: string }; passwordChangeRequired: boolean }>();
    expect(body.user.id).toBe(lite.staffA);
    expect(body.passwordChangeRequired).toBe(true);
    expect(body.temporaryPassword).toHaveLength(24);

    const stored = await lite.adminPool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE tenant_id = $1 AND id = $2',
      [lite.tenantA, lite.staffA],
    );
    expect(stored.rows[0]!.password_hash).not.toContain(body.temporaryPassword);
    expect(stored.rows[0]!.password_hash.startsWith('scrypt$')).toBe(true);

    const audit = await lite.adminPool.query<{ user_id: string; metadata: Record<string, unknown> }>(
      `SELECT user_id, metadata FROM audit_logs
        WHERE tenant_id = $1 AND event_type = 'USER_PASSWORD_RESET' AND entity_id = $2`,
      [lite.tenantA, lite.staffA],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.user_id).toBe(lite.masterA);
    expect(JSON.stringify(audit.rows[0]!.metadata)).not.toContain(body.temporaryPassword);
  });

  it('returns only a password-change challenge on login with a temporary password', async () => {
    const adminToken = await lite.login('tenant-a', 'master@a.test');
    const reset = await resetPassword(adminToken, lite.staffA);
    const temporaryPassword = reset.json<{ temporaryPassword: string }>().temporaryPassword;

    const response = await login('tenant-a', 'staff@a.test', temporaryPassword);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      passwordChangeRequired: true,
      challenge: 'PASSWORD_CHANGE_REQUIRED',
      user: { id: lite.staffA, tenantId: lite.tenantA, email: 'staff@a.test' },
    });
    expect(response.json()).not.toHaveProperty('sessionToken');
  });

  it('does not allow an old normal session after an admin reset', async () => {
    const staffToken = await lite.login('tenant-a', 'viewer@a.test');
    const adminToken = await lite.login('tenant-a', 'master@a.test');

    await resetPassword(adminToken, lite.viewerA);

    const me = await lite.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: lite.headers(staffToken),
    });
    expect(me.statusCode).toBe(401);
  });

  it('changes the required password, clears the challenge state, revokes old sessions and audits without secrets', async () => {
    const oldStaffToken = await lite.login('tenant-a', 'seller1@a.test');
    const adminToken = await lite.login('tenant-a', 'master@a.test');
    const reset = await resetPassword(adminToken, lite.sellerUserA1);
    const temporaryPassword = reset.json<{ temporaryPassword: string }>().temporaryPassword;
    const newPassword = 'new-required-password-42';

    const changed = await lite.app.inject({
      method: 'POST',
      url: '/auth/change-required-password',
      payload: {
        slug: 'tenant-a',
        email: 'seller1@a.test',
        currentPassword: temporaryPassword,
        newPassword,
      },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ ok: true });

    const freshLogin = await lite.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-forwarded-for': '203.0.113.42' },
      payload: { slug: 'tenant-a', email: 'seller1@a.test', password: newPassword },
    });
    expect(freshLogin.statusCode).toBe(200);
    expect(freshLogin.json()).toHaveProperty('sessionToken');
    expect(freshLogin.json()).not.toHaveProperty('passwordChangeRequired');

    const oldSession = await lite.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: lite.headers(oldStaffToken),
    });
    expect(oldSession.statusCode).toBe(401);

    const audit = await lite.adminPool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_logs
        WHERE tenant_id = $1 AND event_type = 'USER_REQUIRED_PASSWORD_CHANGED' AND entity_id = $2`,
      [lite.tenantA, lite.sellerUserA1],
    );
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows[0]!.metadata)).not.toContain(temporaryPassword);
    expect(JSON.stringify(audit.rows[0]!.metadata)).not.toContain(newPassword);
  });

  it('does not let an admin reset their own password through this endpoint', async () => {
    // Distinct IP: earlier tests in this file deliberately exhaust the
    // shared-IP failure counter (rate-limit test), which would otherwise
    // 429 this unrelated login too.
    const loginResponse = await lite.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-forwarded-for': '203.0.113.77' },
      payload: { slug: 'tenant-a', email: 'master@a.test', password: 'correct-horse-battery-staple' },
    });
    expect(loginResponse.statusCode).toBe(200);
    const adminToken = loginResponse.json<{ sessionToken: string }>().sessionToken;

    const response = await resetPassword(adminToken, lite.masterA);

    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('Você não pode redefinir sua própria senha');
  });
});

describe('Travel Lite public "forgot password" flow', () => {
  let lite: LiteFixture;
  const GENERIC_MESSAGE = 'Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado.';

  beforeAll(async () => {
    lite = await createLiteFixture();
  });

  afterAll(async () => {
    await lite?.close();
  });

  async function forgotPassword(slug: string, email: string, ip: string) {
    return lite.app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      headers: { 'x-forwarded-for': ip },
      payload: { slug, email },
    });
  }

  function latestResetToken(): string {
    const calls = sendPasswordResetEmailMock.mock.calls;
    const last = calls[calls.length - 1]?.[0];
    if (!last) throw new Error('sendPasswordResetEmail was not called');
    const token = new URL(last.resetUrl).searchParams.get('token');
    if (!token) throw new Error(`resetUrl carried no token: ${last.resetUrl}`);
    return token;
  }

  it('requests a reset and completes it end-to-end, revoking old sessions and auditing without secrets', async () => {
    const oldToken = await lite.login('tenant-a', 'seller2@a.test');

    const requested = await forgotPassword('tenant-a', 'seller2@a.test', '198.51.100.10');
    expect(requested.statusCode).toBe(200);
    expect(requested.json()).toEqual({ message: GENERIC_MESSAGE });
    const sentTo = sendPasswordResetEmailMock.mock.calls.at(-1)?.[0];
    expect(sentTo?.to).toBe('seller2@a.test');
    expect(sentTo?.resetUrl).toContain('/reset-password?token=');
    const rawToken = latestResetToken();

    const stored = await lite.adminPool.query<{ token_hash: string; used_at: string | null }>(
      `SELECT token_hash, used_at FROM password_reset_tokens
        WHERE tenant_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [lite.tenantA, lite.sellerUserA2],
    );
    expect(stored.rows[0]!.used_at).toBeNull();
    expect(stored.rows[0]!.token_hash).not.toContain(rawToken);

    const newPassword = 'nova-senha-definitiva-99';
    const reset = await lite.app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: rawToken, newPassword },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({ message: 'Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.' });

    const oldSession = await lite.app.inject({ method: 'GET', url: '/auth/me', headers: lite.headers(oldToken) });
    expect(oldSession.statusCode).toBe(401);

    const freshLogin = await lite.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-forwarded-for': '198.51.100.11' },
      payload: { slug: 'tenant-a', email: 'seller2@a.test', password: newPassword },
    });
    expect(freshLogin.statusCode).toBe(200);
    expect(freshLogin.json()).toHaveProperty('sessionToken');

    const audit = await lite.adminPool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_logs
        WHERE tenant_id = $1 AND event_type = 'PASSWORD_RESET_COMPLETED' AND entity_id = $2`,
      [lite.tenantA, lite.sellerUserA2],
    );
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows[0]!.metadata)).not.toContain(rawToken);
    expect(JSON.stringify(audit.rows[0]!.metadata)).not.toContain(newPassword);

    const requestedAudit = await lite.adminPool.query(
      `SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND event_type = 'PASSWORD_RESET_REQUESTED' AND entity_id = $2`,
      [lite.tenantA, lite.sellerUserA2],
    );
    expect(requestedAudit.rows).toHaveLength(1);
  });

  it('answers the same generic message for an unknown agency, an unknown e-mail and a real account alike', async () => {
    const unknownAgency = await forgotPassword('does-not-exist', 'master@a.test', '198.51.100.20');
    const unknownEmail = await forgotPassword('tenant-a', 'nobody@a.test', '198.51.100.21');
    const realAccount = await forgotPassword('tenant-a', 'admin@a.test', '198.51.100.22');

    for (const response of [unknownAgency, unknownEmail, realAccount]) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: GENERIC_MESSAGE });
    }
    // Only the real, active account actually triggers an e-mail.
    const recipients = sendPasswordResetEmailMock.mock.calls.map((call) => call[0]?.to);
    expect(recipients).toContain('admin@a.test');
    expect(recipients).not.toContain('nobody@a.test');
  });

  it('rejects an expired token with the same generic error as an unknown one', async () => {
    await forgotPassword('tenant-a', 'viewer@a.test', '198.51.100.30');
    const rawToken = latestResetToken();
    await lite.adminPool.query(
      `UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'
        WHERE tenant_id = $1 AND user_id = $2`,
      [lite.tenantA, lite.viewerA],
    );

    const response = await lite.app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: rawToken, newPassword: 'outra-senha-99999' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe('Link de redefinição inválido ou expirado');
  });

  it('rejects a token that was already used, and an unknown token, with the same error', async () => {
    await forgotPassword('tenant-a', 'staff@a.test', '198.51.100.40');
    const rawToken = latestResetToken();
    const payload = { token: rawToken, newPassword: 'primeira-troca-99999' };

    const firstUse = await lite.app.inject({ method: 'POST', url: '/auth/reset-password', payload });
    expect(firstUse.statusCode).toBe(200);

    const reuse = await lite.app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: rawToken, newPassword: 'segunda-troca-99999' },
    });
    expect(reuse.statusCode).toBe(404);
    expect(reuse.json<{ error: string }>().error).toBe('Link de redefinição inválido ou expirado');

    const unknown = await lite.app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'a'.repeat(64), newPassword: 'terceira-troca-99999' },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json<{ error: string }>().error).toBe('Link de redefinição inválido ou expirado');
  });

  it('rate-limits repeated forgot-password requests from the same IP', async () => {
    let response = await forgotPassword('tenant-a', 'probe-forgot-rate-limit@a.test', '198.51.100.50');
    for (let attempt = 0; attempt < 10 && response.statusCode !== 429; attempt += 1) {
      response = await forgotPassword('tenant-a', 'probe-forgot-rate-limit@a.test', '198.51.100.50');
    }
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
