/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- HTTP/JSON and pg row fixtures in this integration test are intentionally untyped */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

// Own container/port: never the shared Onda B database, the demo or 55438.
vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55637';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-imp-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-imp-int';
});

import { buildApp } from '../../../services/api/src/app';
import type { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../../../services/api/src/auth';
import { createDatabaseRuntime } from '../../../services/api/src/database';
import { startDisposableDb, type DisposableDb } from '../../../services/api/tests/helpers/disposable-postgres';

const MIGRATIONS = readdirSync(resolve(import.meta.dirname, '../../../infrastructure/migrations'))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

const agencyA = '10000000-0000-4000-8000-0000000000ac';
const agencyB = '20000000-0000-4000-8000-0000000000bc';
const ids = {
  managerA: '11000000-0000-4000-8000-0000000000a3',
  agentA: '11000000-0000-4000-8000-0000000000a4',
  managerB: '21000000-0000-4000-8000-0000000000b1',
};
const roleOf: Record<keyof typeof ids, [string, UserRole]> = {
  managerA: [agencyA, 'MANAGER' as UserRole],
  agentA: [agencyA, 'AGENT' as UserRole],
  managerB: [agencyB, 'MANAGER' as UserRole],
};

const rows = (extra: Array<Record<string, string>> = []) => [
  { external_ref: 'V-1', sale_date: '2026-09-10', customer_cpf: '529.982.247-25', category: 'Aéreo', supplier: 'LATAM', total: '1.500,50', destination: 'Gramado' },
  { external_ref: 'V-2', sale_date: '2026-09-11', customer_cpf: '52998224725', category: 'Categoria Nova', supplier: 'Desconhecido', total: '800' },
  { external_ref: 'V-3', sale_date: '2026-09-12', customer_cpf: '390.533.447-05', category: 'Aéreo', total: '100' },
  ...extra,
];

describe('IMP-01 sales import over HTTP with a real database', () => {
  let db: DisposableDb;
  let admin: Pool;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-imp', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-imp', 'b@example.test', 'FREE', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    for (const [key, id] of Object.entries(ids)) {
      const [agencyId, role] = roleOf[key as keyof typeof ids];
      await admin.query(
        `INSERT INTO users (id, agency_id, email, name, role, password_hash, status) VALUES ($1, $2, $3, $4, $5, 'hash-test-only', 'ACTIVE')`,
        [id, agencyId, `${key}@example.test`, key, role],
      );
    }
    await admin.query(`INSERT INTO customers (agency_id, name, status, cpf) VALUES ($1, 'Maria', 'ACTIVE', '52998224725')`, [agencyA]);
    await admin.query(`INSERT INTO customers (agency_id, name, status, cpf) VALUES ($1, 'Outra Agência', 'ACTIVE', '39053344705')`, [agencyB]);
    await admin.query(`INSERT INTO suppliers (agency_id, name) VALUES ($1, 'Latam')`, [agencyA]);
    await admin.query(`INSERT INTO commission_categories (agency_id, name) VALUES ($1, 'Aéreo')`, [agencyA]).catch(async () => {
      await admin.query(`INSERT INTO commission_categories (agency_id, name, status) VALUES ($1, 'Aéreo', 'ACTIVE')`, [agencyA]);
    });
  }, 300_000);

  afterAll(async () => {
    await db?.stop();
  });

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
  async function post(as: string | null, url: string, payload: unknown) {
    const server = app();
    try {
      const res = await server.inject({ method: 'POST', url, ...(as ? { headers: { 'x-test-user': as } } : {}), payload: payload as object });
      return { status: res.statusCode, body: res.json<Record<string, any>>() };
    } finally {
      await server.close();
    }
  }
  const dry = (as: string | null, body: unknown) => post(as, '/imports/sales/dry-run', body);
  const confirm = (as: string | null, body: unknown) => post(as, '/imports/sales/confirm', body);
  const count = async (table: string, agencyId = agencyA) => Number((await admin.query(`SELECT count(*)::int AS n FROM ${table} WHERE agency_id = $1`, [agencyId])).rows[0].n);

  it('requires authentication and MANAGER+; validates the body', async () => {
    const body = { sourceSystem: 'BWT', rows: rows() };
    expect((await dry(null, body)).status).toBe(401);
    expect((await dry(ids.agentA, body)).status).toBe(403);
    expect((await confirm(ids.agentA, { ...body, contentHash: 'a'.repeat(64) })).status).toBe(403);
    expect((await dry(ids.managerA, { ...body, agencyId: agencyB })).status).toBe(400);
    expect((await dry(ids.managerA, { sourceSystem: 'BWT', rows: [{ external_ref: 'x', password: 'y' }] })).status).toBe(400);
    expect((await dry(ids.managerA, { sourceSystem: 'A|B', rows: [] })).status).toBe(400);
    expect((await confirm(ids.managerA, body)).status).toBe(400);
  });

  it('dry run writes nothing and reports new / rejected / a completar', async () => {
    const before = await count('sales');
    const res = await dry(ids.managerA, { sourceSystem: 'BWT', rows: rows() });
    expect(res.status).toBe(200);
    expect(res.body.plan.summary).toMatchObject({ total: 3, new: 2, rejected: 1, toComplete: 1 });
    expect(res.body.plan.rows[2].errors[0].column).toBe('customer_cpf');
    expect(res.body.plan.rows[1].toComplete).toEqual(expect.arrayContaining(['category', 'supplier', 'destination']));
    expect(await count('sales')).toBe(before);
    expect(await count('sale_import_batches')).toBe(0);
  });

  it('confirm requires the dry-run hash, creates the sales, never commissions or receivables, and audits', async () => {
    const body = { sourceSystem: 'BWT', rows: rows() };
    const plan = await dry(ids.managerA, body);
    expect((await confirm(ids.managerA, { ...body, contentHash: 'b'.repeat(64) })).status).toBe(409);
    const commissionsBefore = await count('commission_entries');
    const receivablesBefore = await count('receivables');
    const res = await confirm(ids.managerA, { ...body, contentHash: plan.body.contentHash });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ replayed: false, summary: { created: 2, rejected: 1, toComplete: 1 } });
    expect(res.body.summary.toCompleteRows).toHaveLength(1);
    expect(res.body.summary.rejections[0].row).toBe(3);
    expect(await count('sales')).toBe(2);
    expect(await count('sale_items')).toBe(1);
    expect(await count('commission_entries')).toBe(commissionsBefore);
    expect(await count('receivables')).toBe(receivablesBefore);
    const sale = (await admin.query(`SELECT total::float8 AS total, status::text AS status, sale_date::text AS sale_date, destination_text FROM sales WHERE agency_id = $1 ORDER BY total DESC`, [agencyA])).rows;
    expect(sale[0]).toMatchObject({ total: 1500.5, status: 'CONFIRMED', sale_date: '2026-09-10', destination_text: 'Gramado' });
    expect((await admin.query(`SELECT 1 FROM audit_logs WHERE agency_id = $1 AND event_type = 'SALES_IMPORTED'`, [agencyA])).rowCount).toBe(1);
  });

  it('the same file again writes nothing (replay); a different file with the same sales creates no duplicates', async () => {
    const body = { sourceSystem: 'BWT', rows: rows() };
    const plan = await dry(ids.managerA, body);
    expect(plan.body.alreadyImported).toBe(true);
    const again = await confirm(ids.managerA, { ...body, contentHash: plan.body.contentHash });
    expect(again.body.replayed).toBe(true);
    expect(await count('sales')).toBe(2);

    const extra = { sourceSystem: 'BWT', rows: rows([{ external_ref: 'V-4', sale_date: '2026-09-13', customer_cpf: '529.982.247-25', total: '50' }]) };
    const plan2 = await dry(ids.managerA, extra);
    expect(plan2.body.plan.summary).toMatchObject({ new: 1, alreadyImported: 2, rejected: 1 });
    const res = await confirm(ids.managerA, { ...extra, contentHash: plan2.body.contentHash });
    expect(res.body.summary.created).toBe(1);
    expect(await count('sales')).toBe(3);
    expect(await count('sale_import_keys')).toBe(3);
  });

  it('the database itself refuses a duplicated natural key and a duplicated content hash', async () => {
    await expect(admin.query(
      `INSERT INTO sale_import_keys (agency_id, source_system, external_ref, sale_id, batch_id)
       SELECT agency_id, source_system, external_ref, sale_id, batch_id FROM sale_import_keys WHERE agency_id = $1 LIMIT 1`,
      [agencyA],
    )).rejects.toThrow();
    await expect(db.runtimePool.query('DELETE FROM sale_import_keys')).rejects.toThrow();
    await expect(db.runtimePool.query('UPDATE sale_import_batches SET summary = \'{}\'')).rejects.toThrow();
  });

  it('is isolated by agency: B cannot see or match A\'s customers, and A\'s keys do not block B', async () => {
    const body = { sourceSystem: 'BWT', rows: [{ external_ref: 'V-1', sale_date: '2026-09-10', customer_cpf: '390.533.447-05', total: '10' }] };
    const plan = await dry(ids.managerB, body);
    expect(plan.body.alreadyImported).toBe(false);
    expect(plan.body.plan.summary).toMatchObject({ new: 1, alreadyImported: 0 });
    const res = await confirm(ids.managerB, { ...body, contentHash: plan.body.contentHash });
    expect(res.body.summary.created).toBe(1);
    expect(await count('sales', agencyB)).toBe(1);
    expect(await count('sales')).toBe(3);
    const crossCustomer = await dry(ids.managerB, { sourceSystem: 'BWT', rows: [{ external_ref: 'V-9', sale_date: '2026-09-10', customer_cpf: '529.982.247-25', total: '10' }] });
    expect(crossCustomer.body.plan.rows[0].status).toBe('REJECTED');
  });

  it('two simultaneous confirms of the same content create the sales once', async () => {
    const body = { sourceSystem: 'RACE', rows: [{ external_ref: 'R-1', sale_date: '2026-09-10', customer_cpf: '529.982.247-25', total: '10' }] };
    const plan = await dry(ids.managerA, body);
    const before = await count('sales');
    const results = await Promise.all([
      confirm(ids.managerA, { ...body, contentHash: plan.body.contentHash }),
      confirm(ids.managerA, { ...body, contentHash: plan.body.contentHash }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.filter((r) => r.body.replayed).length).toBe(1);
    expect(await count('sales')).toBe(before + 1);
  });
});
