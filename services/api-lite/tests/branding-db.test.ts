import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';
import { migrationFiles } from './helpers/lite-db';

/**
 * Real-Postgres checks for tenant_branding (constraints, RLS, grants and the
 * keep/remove/set logo semantics).
 *
 * The table comes from the PROPOSED migration in
 * docs/travel-lite/PX2-BRANDING-MIGRATION-PROPOSAL.md. Until a migration that
 * creates tenant_branding is copied into infrastructure/migrations-travel-lite
 * (which needs explicit approval), this suite stays skipped and nothing here
 * touches any database.
 */
const migrationPresent = migrationFiles().some((name) => /branding/i.test(name));

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 7)]);
const PNG_DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;

const BODY = {
  displayName: 'Agência A',
  welcomeText: 'Bem-vinda',
  primaryColor: '#1f4e8c',
  secondaryColor: '#0b2545',
  loginBackground: '#eef3fa',
};

describe.skipIf(!migrationPresent)('tenant_branding (real Postgres)', () => {
  let fixture: LiteFixture;
  let masterToken: string;
  let adminToken: string;

  beforeAll(async () => {
    fixture = await createLiteFixture();
    masterToken = await fixture.login('tenant-a', 'master@a.test');
    adminToken = await fixture.login('tenant-a', 'admin@a.test');
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function put(token: string, payload: Record<string, unknown>) {
    return fixture.app.inject({
      method: 'PUT',
      url: '/api/branding',
      headers: fixture.headers(token),
      payload,
    });
  }

  it('lets only a MASTER save and serves it publicly by slug, never across tenants', async () => {
    expect((await put(adminToken, BODY)).statusCode).toBe(403);

    const saved = await put(masterToken, { ...BODY, logoDataUrl: PNG_DATA_URL });
    expect(saved.statusCode).toBe(200);

    const publicA = await fixture.app.inject({ method: 'GET', url: '/api/branding/public?slug=tenant-a' });
    expect(publicA.json<{ branding: Record<string, unknown> }>().branding).toMatchObject({
      displayName: 'Agência A',
      primaryColor: '#1f4e8c',
      logoDataUrl: PNG_DATA_URL,
    });

    const publicB = await fixture.app.inject({ method: 'GET', url: '/api/branding/public?slug=tenant-b' });
    expect(publicB.json<{ branding: { displayName: string | null } }>().branding.displayName).toBeNull();
  });

  it('keeps the stored logo when it is not mentioned and removes it on null', async () => {
    await put(masterToken, { ...BODY, logoDataUrl: PNG_DATA_URL });

    const kept = await put(masterToken, { ...BODY, displayName: 'Agência A2' });
    expect(kept.json<{ branding: { logoDataUrl: string | null } }>().branding.logoDataUrl).toBe(PNG_DATA_URL);

    const removed = await put(masterToken, { ...BODY, logoDataUrl: null });
    expect(removed.json<{ branding: { logoDataUrl: string | null } }>().branding.logoDataUrl).toBeNull();
  });

  it('writes an audit event without any logo content', async () => {
    await put(masterToken, { ...BODY, displayName: 'Agência A3', logoDataUrl: PNG_DATA_URL });
    const result = await fixture.adminPool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_logs
        WHERE tenant_id = $1 AND event_type = 'BRANDING_UPDATED'
        ORDER BY created_at DESC LIMIT 1`,
      [fixture.tenantA],
    );
    const metadata = result.rows[0]?.metadata;
    expect(Object.keys(metadata ?? {})).toEqual(['fields']);
    expect(typeof metadata?.['fields']).toBe('string');
    expect(JSON.stringify(metadata)).not.toContain('base64');
  });

  it('rejects invalid values at the database even if the application let them through', async () => {
    const insert = (color: string) =>
      fixture.database.runAsTenant(fixture.tenantA, fixture.masterA, (client) =>
        client.query(
          `INSERT INTO tenant_branding (tenant_id, primary_color) VALUES ($1, $2)
           ON CONFLICT (tenant_id) DO UPDATE SET primary_color = EXCLUDED.primary_color`,
          [fixture.tenantA, color],
        ),
      );
    await expect(insert('red')).rejects.toThrow();
    await expect(insert('url(//evil.example)')).rejects.toThrow();
    await expect(
      fixture.database.runAsTenant(fixture.tenantA, fixture.masterA, (client) =>
        client.query(`INSERT INTO tenant_branding (tenant_id, logo_mime, logo_data) VALUES ($1, 'image/svg+xml', 'x')
                      ON CONFLICT (tenant_id) DO UPDATE SET logo_mime = EXCLUDED.logo_mime`, [fixture.tenantA]),
      ),
    ).rejects.toThrow();
  });

  it('isolates tenants with row level security', async () => {
    await expect(
      fixture.database.runAsTenant(fixture.tenantA, fixture.masterA, (client) =>
        client.query(`INSERT INTO tenant_branding (tenant_id, display_name) VALUES ($1, 'invasão')`, [fixture.tenantB]),
      ),
    ).rejects.toThrow();

    const visible = await fixture.database.runAsTenant(fixture.tenantB, null, (client) =>
      client.query('SELECT tenant_id FROM tenant_branding'),
    );
    expect(visible.rows.every((row: { tenant_id: string }) => row.tenant_id === fixture.tenantB)).toBe(true);
  });

  it('does not let the runtime role delete branding rows', async () => {
    await expect(
      fixture.database.runAsTenant(fixture.tenantA, fixture.masterA, (client) =>
        client.query('DELETE FROM tenant_branding WHERE tenant_id = $1', [fixture.tenantA]),
      ),
    ).rejects.toThrow();
  });
});
