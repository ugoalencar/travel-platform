import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDecipheriv, scryptSync } from 'node:crypto';
import { createLiteFixture, FIXTURE_PASSWORD, type LiteFixture } from './helpers/fixture';

describe('Tenant operational backup', () => {
  let lite: LiteFixture;
  let token: string;
  beforeAll(async () => { lite = await createLiteFixture(); token = await lite.login('tenant-a', 'master@a.test'); });
  afterAll(async () => { await lite?.close(); });
  const archivePassword = 'Synthetic-archive-123!';
  async function exportBackup(body: object, session = token) {
    return lite.app.inject({ method: 'POST', url: '/backup/export', headers: lite.headers(session), payload: body });
  }
  it('requires authentication and an all-access administrator', async () => {
    expect((await lite.app.inject({ method: 'GET', url: '/backup/status' })).statusCode).toBe(401);
    for (const email of ['viewer@a.test', 'staff@a.test']) {
      const session = await lite.login('tenant-a', email);
      expect((await lite.app.inject({ method: 'GET', url: '/backup/status', headers: lite.headers(session) })).statusCode).toBe(403);
      expect((await exportBackup({ currentPassword: FIXTURE_PASSWORD, archivePassword }, session)).statusCode).toBe(403);
    }
    const response = await lite.app.inject({ method: 'GET', url: '/backup/status', headers: lite.headers(token) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ automatic: { configured: false }, history: [] });
  });
  it('validates archive password, rejects tenant selection and reauthenticates', async () => {
    expect((await exportBackup({ currentPassword: 'wrong', archivePassword })).statusCode).toBe(403);
    expect((await exportBackup({ currentPassword: FIXTURE_PASSWORD, archivePassword: 'short' })).statusCode).toBe(400);
    expect((await exportBackup({ currentPassword: FIXTURE_PASSWORD, archivePassword, tenant_id: lite.tenantB })).statusCode).toBe(400);
  });
  it('exports only the authenticated tenant, encrypted and without login secrets, with audited history', async () => {
    await lite.adminPool.query("INSERT INTO customers(tenant_id,name) VALUES($1,'OWN-BACKUP-CUSTOMER'),($2,'OTHER-TENANT-PRIVATE')", [lite.tenantA, lite.tenantB]);
    const response = await exportBackup({ currentPassword: FIXTURE_PASSWORD, archivePassword });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain('OWN-BACKUP-CUSTOMER');
    expect(response.body).not.toContain(FIXTURE_PASSWORD);
    const { archive, filename } = response.json<{ filename: string; archive: { salt: string; iv: string; tag: string; data: string } }>();
    const key = scryptSync(archivePassword, Buffer.from(archive.salt, 'base64'), 32);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(archive.iv, 'base64'));
    decipher.setAAD(Buffer.from(`travel-lite-backup-v1:${lite.tenantA}`));
    decipher.setAuthTag(Buffer.from(archive.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(archive.data, 'base64')), decipher.final()]).toString('utf8');
    const snapshot = JSON.parse(plain) as { tenantId: string; tables: Record<string, unknown[]> };
    expect(snapshot.tenantId).toBe(lite.tenantA);
    expect(snapshot.tables.customers).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'OWN-BACKUP-CUSTOMER' })]));
    expect(plain).not.toContain('OTHER-TENANT-PRIVATE');
    expect(snapshot.tables.users).toBeUndefined();
    expect(snapshot.tables.auth_sessions).toBeUndefined();
    expect(snapshot.tables.password_reset_tokens).toBeUndefined();
    expect(filename).toMatch(/\.tlbackup$/);
    const status = await lite.app.inject({ method: 'GET', url: '/backup/status', headers: lite.headers(token) });
    expect(status.json<{ history: Array<{ filename: string; userId: string }> }>().history[0]).toMatchObject({ filename, userId: lite.masterA });
  });
  it('fails closed when the backup audit cannot be written', async () => {
    await lite.adminPool.query("CREATE FUNCTION reject_backup_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='BACKUP_EXPORTED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_backup BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_backup_audit()");
    try { expect((await exportBackup({ currentPassword: FIXTURE_PASSWORD, archivePassword })).statusCode).toBe(500); }
    finally { await lite.adminPool.query('DROP TRIGGER reject_backup ON audit_logs; DROP FUNCTION reject_backup_audit()'); }
  });
  it('limits repeated reauthentication failures', async () => {
    for (let i = 0; i < 5; i++) expect((await exportBackup({ currentPassword: 'wrong', archivePassword })).statusCode).toBe(403);
    expect((await exportBackup({ currentPassword: FIXTURE_PASSWORD, archivePassword })).statusCode).toBe(429);
  });
});
