import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

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
    expect(response.json<{ error: string }>().error).toBe('Invalid credentials');
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
});
