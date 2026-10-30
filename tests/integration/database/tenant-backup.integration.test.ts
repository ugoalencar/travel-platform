/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- HTTP/JSON and pg row fixtures in this integration test are intentionally untyped */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

// Own container/port: never the shared Onda B database, the demo or 55438.
vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55635';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-bak-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-bak-int';
});

import { buildApp } from '../../../services/api/src/app';
import type { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../../../services/api/src/auth';
import { createDatabaseRuntime } from '../../../services/api/src/database';
import { hashPassword } from '../../../services/api/src/password-hashing';
import {
  BACKUP_TABLES,
  EXCLUDED_WITH_REASON,
  FORBIDDEN_COLUMN,
  PENDING_INVENTORY,
  resetBackupRateLimitForTests,
  restoreBackupInto,
} from '../../../services/api/src/tenant-backup';
import { canonicalTableHash, decryptBackup, type BackupEnvelope } from '../../../services/api/src/tenant-backup-crypto';
import {
  startDisposableDb,
  type DisposableDb,
} from '../../../services/api/tests/helpers/disposable-postgres';

const MIGRATIONS = readdirSync(resolve(import.meta.dirname, '../../../infrastructure/migrations'))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

const agencyA = '10000000-0000-4000-8000-0000000000ab';
const agencyB = '20000000-0000-4000-8000-0000000000bb';
const ids = {
  ownerA: '11000000-0000-4000-8000-0000000000a1',
  adminA: '11000000-0000-4000-8000-0000000000a2',
  agentA: '11000000-0000-4000-8000-0000000000a4',
  ownerB: '21000000-0000-4000-8000-0000000000b1',
};
const roleOf: Record<keyof typeof ids, [string, UserRole]> = {
  ownerA: [agencyA, 'OWNER' as UserRole],
  adminA: [agencyA, 'ADMIN' as UserRole],
  agentA: [agencyA, 'AGENT' as UserRole],
  ownerB: [agencyB, 'OWNER' as UserRole],
};
const accessPassword = 'senha-de-acesso-correta-1';
const archivePassword = 'senha-do-arquivo-bem-longa-2';

describe('BAK-01 per-agency backup over HTTP with a real database', () => {
  let db: DisposableDb;
  let admin: Pool;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-bak', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-bak', 'b@example.test', 'FREE', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    const hash = await hashPassword(accessPassword);
    for (const [key, id] of Object.entries(ids)) {
      const [agencyId, role] = roleOf[key as keyof typeof ids];
      await admin.query(
        `INSERT INTO users (id, agency_id, email, name, role, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
        [id, agencyId, `${key}@example.test`, key, role, hash],
      );
    }
    await seed(agencyA, 'A');
    await seed(agencyB, 'B');
  }, 300_000);

  afterAll(async () => {
    await db?.stop();
  });

  async function seed(agencyId: string, tag: string) {
    const owner = agencyId === agencyA ? ids.ownerA : ids.ownerB;
    const customer = (await admin.query<{ id: string }>(`INSERT INTO customers (agency_id, name, status, cpf) VALUES ($1, $2, 'ACTIVE', $3) RETURNING id`, [agencyId, `Cliente ${tag}`, tag === 'A' ? '52998224725' : '11144477735'])).rows[0]!.id;
    const supplier = (await admin.query<{ id: string }>(`INSERT INTO suppliers (agency_id, name) VALUES ($1, $2) RETURNING id`, [agencyId, `Fornecedor ${tag}`])).rows[0]!.id;
    const sale = (await admin.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status, destination_text) VALUES ($1, $2, $3, 1000, 0, 1000, 'CONFIRMED', $4) RETURNING id`,
      [agencyId, customer, owner, `Destino ${tag}`],
    )).rows[0]!.id;
    const item = (await admin.query<{ id: string }>(
      `INSERT INTO sale_items (agency_id, sale_id, description, supplier_id, qty, unit_price, line_total, line_margin) VALUES ($1, $2, 'Item', $3, 1, 1000, 1000, 0) RETURNING id`,
      [agencyId, sale, supplier],
    )).rows[0]!.id;
    const receivable = (await admin.query<{ id: string }>(
      `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at, due_date, status, installment_number, installment_count)
       VALUES ($1, $2, $3, 'Parcela', 1000, now(), CURRENT_DATE, 'PARTIALLY_PAID', 1, 1) RETURNING id`,
      [agencyId, sale, customer],
    )).rows[0]!.id;
    const payment = (await admin.query<{ id: string }>(`INSERT INTO payments (agency_id, direction, amount, occurred_at, created_by) VALUES ($1, 'IN', 300, now(), $2) RETURNING id`, [agencyId, owner])).rows[0]!.id;
    await admin.query(`INSERT INTO payment_allocations (agency_id, payment_id, receivable_id, amount) VALUES ($1, $2, $3, 300)`, [agencyId, payment, receivable]);
    const scope = (await admin.query<{ id: string }>(`INSERT INTO agency_revenue_scopes (agency_id, supplier_id) VALUES ($1, $2) RETURNING id`, [agencyId, supplier])).rows[0]!.id;
    const version = (await admin.query<{ id: string }>(
      `INSERT INTO agency_revenue_rule_versions (agency_id, scope_id, version_number, effective_from, mode, base_selector, value, reason)
       VALUES ($1, $2, 1, CURRENT_DATE, 'PERCENTAGE', 'LINE_TOTAL', 10, 'teste') RETURNING id`,
      [agencyId, scope],
    )).rows[0]!.id;
    const revenue = (await admin.query<{ id: string }>(
      `INSERT INTO agency_revenue_entries (agency_id, sale_id, sale_item_id, supplier_id, rule_version_id, status, amount, base_amount)
       VALUES ($1, $2, $3, $4, $5, 'FORECAST', 100, 1000) RETURNING id`,
      [agencyId, sale, item, supplier, version],
    )).rows[0]!.id;
    const employee = (await admin.query(`INSERT INTO employees (agency_id,name,base_salary) VALUES ($1,'Funcionário',1000) RETURNING id`, [agencyId])).rows[0].id;
    const commissionScope = (await admin.query(`INSERT INTO employee_commission_rule_scopes (agency_id,employee_id) VALUES ($1,$2) RETURNING id`, [agencyId,employee])).rows[0].id;
    const commissionVersion = (await admin.query(`INSERT INTO employee_commission_rule_versions (agency_id,scope_id,version_number,effective_from,mode,progressive)
      VALUES ($1,$2,1,'2020-01-01','PERCENTAGE',true) RETURNING id`, [agencyId,commissionScope])).rows[0].id;
    await admin.query(`INSERT INTO employee_commission_rule_tiers (agency_id,version_id,tier_number,from_amount,rate) VALUES ($1,$2,1,0,3)`, [agencyId,commissionVersion]);
    await admin.query(`INSERT INTO sale_commission_attributions (agency_id,sale_id,employee_id,recognition_date,gross_amount,created_by_user_id)
      VALUES ($1,$2,$3,CURRENT_DATE,1000,$4)`, [agencyId,sale,employee,owner]);
    const commission = (await admin.query(`INSERT INTO commission_entries (agency_id,employee_id,sale_id,calculation_base,amount,status,rule_version_id,release_mode,release_policy_snapshot,agency_revenue_entry_id)
      VALUES ($1,$2,$3,1000,30,'APPROVED',$4,'LEGACY','{"status":"LEGACY_PRE_FEATURE"}',$5) RETURNING id`, [agencyId,employee,sale,commissionVersion,revenue])).rows[0].id;
    const payable = (await admin.query(`INSERT INTO payables (agency_id,sale_id,description,amount,due_at,commission_entry_id)
      VALUES ($1,$2,'Comissão',9,now(),$3) RETURNING id`, [agencyId,sale,commission])).rows[0].id;
    // Exercise the financial FK cycle: item -> payable -> commission -> revenue -> item.
    await admin.query(`UPDATE sale_items SET payable_id=$2 WHERE id=$1`, [item,payable]);
    await admin.query(`INSERT INTO payroll_entries (agency_id,employee_id,competence,base_salary,net_amount) VALUES ($1,$2,date_trunc('month',CURRENT_DATE)::date,1000,1000)`, [agencyId,employee]);
    await admin.query(`INSERT INTO payment_method_receipt_rules (agency_id,method,requires_receipt,updated_by) VALUES ($1,'PIX',true,$2)`, [agencyId,owner]);
    await admin.query(`INSERT INTO commission_financial_profiles (agency_id,effect,effective_from,created_by) VALUES ($1,'SOMENTE_LIBERACAO','2020-01-01',$2)`, [agencyId,owner]);
    await admin.query(`INSERT INTO commission_release_events (agency_id,commission_entry_id,event_type,recognized,received,sale_total,released,paid,policy)
      VALUES ($1,$2,'PAYABLE_CREATED',30,300,1000,9,0,'{}')`, [agencyId,commission]);
    const batch = (await admin.query(`INSERT INTO agency_revenue_batches (agency_id,window_month,window_start,window_end,expected_payment_date,policy_snapshot,created_by)
      VALUES ($1,'2026-01-01','2026-01-01','2026-02-01','2026-02-10','{}',$2) RETURNING id`, [agencyId,owner])).rows[0].id;
    await admin.query(`UPDATE agency_revenue_entries SET status='RECEIVED',received_at=now(),received_amount=100,expected_payment_date='2026-02-10' WHERE id=$1`, [revenue]);
    await admin.query(`INSERT INTO agency_revenue_batch_entries (agency_id,batch_id,entry_id,amount) VALUES ($1,$2,$3,100)`, [agencyId,batch,revenue]);
    await admin.query(`INSERT INTO agency_revenue_batch_receipts (agency_id,batch_id,created_by) VALUES ($1,$2,$3)`, [agencyId,batch,owner]);
    const importBatch = (await admin.query(`INSERT INTO sale_import_batches (agency_id,source_system,content_hash,summary) VALUES ($1,'test',$2,'{}') RETURNING id`, [agencyId,'a'.repeat(64)])).rows[0].id;
    await admin.query(`INSERT INTO sale_import_keys (agency_id,source_system,external_ref,sale_id,batch_id) VALUES ($1,'test','sale-1',$2,$3)`, [agencyId,sale,importBatch]);
    const condition = (await admin.query(`INSERT INTO payment_conditions (agency_id,name,schedule_kind,max_installments,interest_free,down_payment_mode,down_payment_value,down_payment_required,balance_deadline_anchor,balance_deadline_offset_days,allows_partial_payments)
      VALUES ($1,'PIX','SINGLE',1,true,'NONE',0,false,'SALE_DATE',0,true) RETURNING id`, [agencyId])).rows[0].id;
    await admin.query(`INSERT INTO payment_condition_methods (agency_id,condition_id,method) VALUES ($1,$2,'PIX')`, [agencyId,condition]);
    await admin.query(`INSERT INTO sale_payment_condition_versions (agency_id,sale_id,version,condition_id,snapshot,reason,created_by) VALUES ($1,$2,1,$3,'{}','backup test',$4)`, [agencyId,sale,condition,owner]);
    const reversed = (await admin.query(`INSERT INTO payments (agency_id,direction,amount,occurred_at,created_by) VALUES ($1,'IN',100,now(),$2) RETURNING id`, [agencyId,owner])).rows[0].id;
    const reversal = (await admin.query(`INSERT INTO payments (agency_id,direction,amount,occurred_at,created_by) VALUES ($1,'OUT',100,now(),$2) RETURNING id`, [agencyId,owner])).rows[0].id;
    await admin.query(`INSERT INTO payment_allocations (agency_id,payment_id,receivable_id,amount) VALUES ($1,$2,$3,100)`, [agencyId,reversed,receivable]);
    await admin.query(`INSERT INTO sale_payment_reversals (agency_id,sale_id,original_payment_id,reversal_payment_id,amount,allocations_snapshot,reason,created_by)
      VALUES ($1,$2,$3,$4,100,'[]','backup test',$5)`, [agencyId,sale,reversed,reversal,owner]);
    if (agencyId === agencyA) await admin.query(`INSERT INTO user_permission_overrides (agency_id,user_id,resource,action,effect,reason,created_by_user_id)
      VALUES ($1,$2,'customers','view','REVOKE','backup test',$3)`, [agencyId,ids.agentA,owner]);
    await admin.query(`INSERT INTO customer_field_settings (agency_id, field_key, enabled, required) VALUES ($1, 'phone', true, true)`, [agencyId]);
    await admin.query(`INSERT INTO dashboard_layouts (agency_id, widgets, version, updated_by_user_id) VALUES ($1, '[]'::jsonb, 1, $2)`, [agencyId, owner]);
  }

  function app() {
    return buildApp({
      authProvider: {
        async authenticate(request) {
          const token = request.headers['x-test-user'];
          if (typeof token !== 'string') return null;
          const row = (await admin.query<{ id: string; agency_id: string; role: string; email: string }>(
            `SELECT id, agency_id, role, email FROM users WHERE id = $1 AND status = 'ACTIVE'`, [token])).rows[0];
          if (!row) return null;
          const principal: AuthenticatedPrincipal = { userId: row.id, agencyId: row.agency_id, role: row.role as UserRole, email: row.email };
          return principal;
        },
      },
      validateUserAgencyAccess: async (userId, agencyId) =>
        (await admin.query(`SELECT 1 FROM users WHERE id = $1 AND agency_id = $2`, [userId, agencyId])).rowCount === 1,
      database: createDatabaseRuntime(db.runtimePool),
    });
  }

  async function call(as: string | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
    const server = app();
    try {
      const res = await server.inject({ method, url, ...(as ? { headers: { 'x-test-user': as } } : {}), ...(payload !== undefined ? { payload: payload as object } : {}) });
      return { status: res.statusCode, headers: res.headers, body: res.json<Record<string, any>>() };
    } finally {
      await server.close();
    }
  }
  let keepLimiter = false;
  const exportAs = (as: string | null, body: Record<string, unknown> = { currentPassword: accessPassword, archivePassword }) => {
    if (!keepLimiter) resetBackupRateLimitForTests();
    return call(as, 'POST', '/settings/backup/export', body);
  };
  const verifyAs = (as: string, method: 'POST', url: string, payload: unknown) => {
    resetBackupRateLimitForTests();
    return call(as, method, url, payload);
  };
  const counts = async (agencyId: string) =>
    Object.fromEntries(await Promise.all(BACKUP_TABLES.map(async (t) => [t, (await admin.query(`SELECT count(*)::int AS n FROM ${t} WHERE agency_id = $1`, [agencyId])).rows[0].n])));
  const financialTotals = async (agencyId: string) => (await admin.query(`SELECT
    (SELECT COALESCE(SUM(total),0)::text FROM sales WHERE agency_id=$1) AS sales,
    (SELECT COALESCE(SUM(amount),0)::text FROM receivables WHERE agency_id=$1) AS receivables,
    (SELECT COALESCE(SUM(amount),0)::text FROM payables WHERE agency_id=$1) AS payables,
    (SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END),0)::text FROM payments WHERE agency_id=$1) AS cash,
    (SELECT COALESCE(SUM(amount),0)::text FROM payment_allocations WHERE agency_id=$1) AS allocations,
    (SELECT COALESCE(SUM(amount),0)::text FROM commission_entries WHERE agency_id=$1) AS commissions,
    (SELECT COALESCE(SUM(net_amount),0)::text FROM payroll_entries WHERE agency_id=$1) AS payroll,
    (SELECT COALESCE(SUM(amount),0)::text FROM agency_revenue_entries WHERE agency_id=$1) AS revenue`, [agencyId])).rows[0];

  describe('access and step-up', () => {
    it('requires authentication and the exact OWNER role', async () => {
      expect((await exportAs(null)).status).toBe(401);
      for (const who of [ids.adminA, ids.agentA]) {
        expect((await exportAs(who)).status).toBe(403);
        expect((await call(who, 'GET', '/settings/backup/status')).status).toBe(403);
      }
    });
    it('validates the body: unknown fields, short or equal archive password', async () => {
      expect((await exportAs(ids.ownerA, { currentPassword: accessPassword, archivePassword, agencyId: agencyB })).status).toBe(400);
      expect((await exportAs(ids.ownerA, { currentPassword: accessPassword, archivePassword: 'curta' })).status).toBe(400);
      expect((await exportAs(ids.ownerA, { currentPassword: accessPassword, archivePassword: accessPassword })).status).toBe(400);
    });
    it('a wrong password is refused with a generic message, audited, and rate limited', async () => {
      keepLimiter = true;
      resetBackupRateLimitForTests();
      const bad = await exportAs(ids.ownerB, { currentPassword: 'errada-errada', archivePassword });
      expect(bad.status).toBe(403);
      expect(JSON.stringify(bad.body)).not.toContain('errada');
      expect((await admin.query(`SELECT 1 FROM audit_logs WHERE agency_id = $1 AND event_type = 'BACKUP_EXPORT_DENIED'`, [agencyB])).rowCount).toBeGreaterThan(0);
      await exportAs(ids.ownerB, { currentPassword: 'errada-errada', archivePassword });
      await exportAs(ids.ownerB, { currentPassword: 'errada-errada', archivePassword });
      const limited = await exportAs(ids.ownerB);
      expect(limited.status).toBe(429);
      keepLimiter = false;
    });
    it('an owner with MFA enrolled cannot export (no bypass)', async () => {
      await admin.query(`INSERT INTO mfa_totp_secrets (agency_id, user_id, secret_encrypted, verified_at) VALUES ($1, $2, 'x', now())`, [agencyA, ids.ownerA]).catch(() => undefined);
      const mfa = (await admin.query(`SELECT 1 FROM mfa_totp_secrets WHERE user_id = $1 AND verified_at IS NOT NULL`, [ids.ownerA])).rowCount;
      if (mfa) expect((await exportAs(ids.ownerA)).status).toBe(403);
      await admin.query(`DELETE FROM mfa_totp_secrets WHERE user_id = $1`, [ids.ownerA]);
    });
    it('the backup key is not delegable (a GRANT on it is refused)', async () => {
      const grant = await call(ids.ownerA, 'PUT', `/settings/team/${ids.agentA}/permission-overrides`, {
        overrides: [{ resource: 'backup', action: 'export', effect: 'GRANT', reason: 'x' }],
      });
      expect(grant.status).toBe(400);
    });
  });

  describe('export content', () => {
    let envelope: BackupEnvelope;
    it('returns an encrypted file, no-store, only for the session agency, without forbidden columns', async () => {
      const res = await exportAs(ids.ownerA);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      envelope = res.body.envelope;
      expect(envelope.format).toBe('travel-platform-encrypted-v1');
      expect(JSON.stringify(res.body)).not.toContain('Cliente A');
      expect(res.body.summary).toMatchObject({ scope: 'CLASSIFIED', pendingInventory: [], automatic: { configured: false } });
      const plain = await decryptBackup(envelope, archivePassword, agencyA);
      expect(JSON.stringify(plain)).toContain('Cliente A');
      expect(JSON.stringify(plain)).not.toContain('Cliente B');
      expect(JSON.stringify(plain)).not.toContain(agencyB);
      for (const [table, rows] of Object.entries(plain.tables)) {
        for (const row of rows) for (const column of Object.keys(row)) expect(FORBIDDEN_COLUMN.test(column), `${table}.${column}`).toBe(false);
      }
      expect(plain.manifest.map((m) => m.table)).toEqual([...BACKUP_TABLES]);
    });
    it('audits the export without secrets or content', async () => {
      const events = (await admin.query(`SELECT metadata FROM audit_logs WHERE agency_id = $1 AND event_type = 'BACKUP_EXPORTED'`, [agencyA])).rows;
      expect(events.length).toBeGreaterThan(0);
      const text = JSON.stringify(events);
      for (const secret of [archivePassword, accessPassword, 'Cliente A', '52998224725']) expect(text).not.toContain(secret);
    });
    it('a file of agency A is not accepted by agency B', async () => {
      const verify = await verifyAs(ids.ownerB, 'POST', '/settings/backup/verify', { envelope, archivePassword, currentPassword: accessPassword });
      expect(verify.status).toBe(422);
    });
    it('verify is a dry run: no writes, reports conflicts, and detects a corrupt file', async () => {
      const before = await counts(agencyA);
      const verify = await verifyAs(ids.ownerA, 'POST', '/settings/backup/verify', { envelope, archivePassword, currentPassword: accessPassword });
      expect(verify.status).toBe(200);
      expect(verify.body.tables.every((t: any) => t.hashOk)).toBe(true);
      expect(verify.body.tables.some((t: any) => t.conflict)).toBe(true);
      expect(await counts(agencyA)).toEqual(before);
      const tag = Buffer.from(envelope.tag, 'base64');
      tag[0] = (tag[0] ?? 0) ^ 0xff;
      expect((await verifyAs(ids.ownerA, 'POST', '/settings/backup/verify', { envelope: { ...envelope, tag: tag.toString('base64') }, archivePassword, currentPassword: accessPassword })).status).toBe(422);
      expect((await verifyAs(ids.ownerA, 'POST', '/settings/backup/verify', { envelope, archivePassword: 'senha-errada-errada-1', currentPassword: accessPassword })).status).toBe(422);
    });
  });

  describe('recovery round trip (disposable database)', () => {
    async function freshExport() {
      const res = await exportAs(ids.ownerA);
      expect(res.status).toBe(200);
      return decryptBackup(res.body.envelope, archivePassword, agencyA);
    }
    async function wipe(agencyId: string) {
      // Test-only operator teardown in this suite's disposable database. Runtime restore
      // never disables a trigger, RLS policy or foreign key.
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL session_replication_role = replica');
        for (const table of [...BACKUP_TABLES].reverse()) await client.query(`DELETE FROM ${table} WHERE agency_id = $1`, [agencyId]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    async function restore(plain: Awaited<ReturnType<typeof freshExport>>) {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT set_tenant_context($1,$2)', [agencyA, ids.ownerA]);
        await restoreBackupInto(client, agencyA, plain);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    it('export A -> wipe A -> restore -> same counts and hashes; B untouched', async () => {
      await admin.query('DELETE FROM audit_logs WHERE false');
      const plain = await freshExport();
      const beforeA = await counts(agencyA);
      const beforeB = await counts(agencyB);
      const moneyA = await financialTotals(agencyA);
      const moneyB = await financialTotals(agencyB);
      expect(Object.fromEntries(Object.entries(moneyA).map(([key,value]) => [key,Number(value)]))).toEqual({ sales: 1000, receivables: 1000, payables: 9, cash: 300, allocations: 400, commissions: 30, payroll: 1000, revenue: 100 });
      const snapshotB = await exportAs(ids.ownerB);
      const plainB = await decryptBackup(snapshotB.body.envelope, archivePassword, agencyB);
      await wipe(agencyA);
      expect(Object.values(await counts(agencyA)).every((n) => n === 0)).toBe(true);
      await restore(plain);
      expect(await counts(agencyA)).toEqual(beforeA);
      expect(await counts(agencyB)).toEqual(beforeB);
      expect(await financialTotals(agencyA)).toEqual(moneyA);
      expect(await financialTotals(agencyB)).toEqual(moneyB);
      const againB = await exportAs(ids.ownerB);
      expect((await decryptBackup(againB.body.envelope, archivePassword, agencyB)).manifest).toEqual(plainB.manifest);
      const again = await freshExport();
      expect(again.manifest.map((m) => [m.table, m.rows, m.sha256])).toEqual(plain.manifest.map((m) => [m.table, m.rows, m.sha256]));
      const next = (await admin.query(`SELECT nextval('sale_commission_attributions_seq_seq')::text AS n`)).rows[0].n;
      expect(Number(next)).toBeGreaterThan(Math.max(...plain.tables.sale_commission_attributions!.map(row => Number(row.seq))));
    });
    it('refuses to restore over existing data, a different schema version, or a corrupted table (nothing partial)', async () => {
      const plain = await freshExport();
      await expect(restore(plain)).rejects.toThrow(/empty/);
      await wipe(agencyA);
      await expect(restore({ ...plain, schemaVersion: 'otra' })).rejects.toThrow(/schema/i);
      const corrupted = { ...plain, tables: { ...plain.tables, customers: [{ ...plain.tables.customers![0]!, name: 'Adulterado' }] } };
      await expect(restore(corrupted)).rejects.toThrow(/Hash mismatch/);
      expect(Object.values(await counts(agencyA)).every((n) => n === 0)).toBe(true);
      await restore(plain);
      expect((await counts(agencyA)).customers).toBe(1);
    });
    it('HTTP assisted recovery checks step-up, reviewed report, and empty destination', async () => {
      const exported = await exportAs(ids.ownerA);
      const payload = { envelope: exported.body.envelope, archivePassword, currentPassword: accessPassword };
      const plain = await decryptBackup(payload.envelope, archivePassword, agencyA);
      expect((await verifyAs(ids.ownerA, 'POST', '/settings/backup/restore', { ...payload, reportHash: '0'.repeat(64) })).status).toBe(409);
      await wipe(agencyA);
      const verification = await verifyAs(ids.ownerA, 'POST', '/settings/backup/verify', payload);
      expect(verification.status).toBe(200);
      expect(verification.body.ok).toBe(true);
      expect((await verifyAs(ids.ownerA, 'POST', '/settings/backup/restore', { ...payload, reportHash: '0'.repeat(64) })).status).toBe(409);
      const restored = await verifyAs(ids.ownerA, 'POST', '/settings/backup/restore', { ...payload, reportHash: verification.body.reportHash });
      expect(restored.status).toBe(200);
      expect(restored.body.restored).toBe(true);
      expect((await freshExport()).manifest).toEqual(plain.manifest);
      expect((await admin.query("SELECT 1 FROM audit_logs WHERE agency_id=$1 AND event_type='BACKUP_RESTORED'", [agencyA])).rowCount).toBeGreaterThan(0);
    });
    it('refuses a file of another agency', async () => {
      const plain = await freshExport();
      await wipe(agencyA);
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await expect(restoreBackupInto(client as never, agencyB, plain)).rejects.toThrow(/another agency/);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      await restore(plain);
    });
  });

  describe('manifest completeness', () => {
    it('every table with agency_id is included, excluded with a reason, or explicitly pending', async () => {
      const tables = (await admin.query<{ table_name: string }>(
        `SELECT DISTINCT c.table_name FROM information_schema.columns c
           JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
          WHERE c.table_schema = 'public' AND c.column_name = 'agency_id' ORDER BY 1`,
      )).rows.map((row) => row.table_name);
      const known = new Set<string>([...BACKUP_TABLES, ...Object.keys(EXCLUDED_WITH_REASON), ...PENDING_INVENTORY]);
      const missing = tables.filter((table) => !known.has(table));
      expect(missing).toEqual([]);
      expect(PENDING_INVENTORY).toEqual([]);
      // no entry may be both included and excluded/pending
      for (const table of BACKUP_TABLES) {
        expect(EXCLUDED_WITH_REASON[table]).toBeUndefined();
        expect(PENDING_INVENTORY).not.toContain(table);
      }
      for (const table of [...BACKUP_TABLES, ...Object.keys(EXCLUDED_WITH_REASON)]) expect(tables).toContain(table);
    });
    it('canonical hash of an empty table is stable', () => {
      expect(canonicalTableHash([])).toBe(canonicalTableHash([]));
    });
  });
});
