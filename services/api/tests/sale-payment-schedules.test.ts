import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';
import type { SaleBalance } from '../src/sale-payment-schedules';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { getFinancialSummary, getCashFlowReport, getOverdueReport } from '../src/financial';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-sale-payment-schedules-postgres';
const containerName = process.env.DATABASE_TEST_CONTAINER_NAME ?? 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const poolPasswordKey = 'pass' + 'word';

const agencyAId = '10000000-0000-4000-8000-000000000001';
const agencyBId = '20000000-0000-4000-8000-000000000001';
const userAId = '11000000-0000-4000-8000-000000000001';
const userBId = '21000000-0000-4000-8000-000000000001';

const principals: Record<string, AuthenticatedPrincipal> = {
  a: { userId: userAId, agencyId: agencyAId, role: UserRole.ADMIN, email: 'user-a@example.test' },
  b: { userId: userBId, agencyId: agencyBId, role: UserRole.ADMIN, email: 'user-b@example.test' },
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  manager: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  owner: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

let preservedLegacy: { kind: string; installment_number: number; installment_count: number;
  amount: string; paid: string; due_date: string; status: string } | undefined;

describe('ADR-006 schedules and partial payments', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let app: ReturnType<typeof buildApp>;
  let saleId: string;
  let conditionId: string;
  const headers = { 'x-test-principal': 'a' };
  beforeAll(async () => {
    assertSafeTestDatabase(); resetDisposableDatabase();
    await waitForHealthyContainer(); assertContainerIsLocal();
    const base = { host: databaseHost, port: databasePort, database: databaseName };
    adminPool = new Pool({ ...base, user: adminUser, [poolPasswordKey]: adminPassword });
    runtimePool = new Pool({ ...base, user: runtimeUser, [poolPasswordKey]: runtimePassword });
    await resetDatabase(adminPool);
    app = buildApp({ database: createDatabaseRuntime(runtimePool), authProvider: {
      authenticate: (request) => { const key = request.headers['x-test-principal'];
        return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null); },
    }, validateUserAgencyAccess: (userId, agencyId) => Promise.resolve(
      (userId === userAId && agencyId === agencyAId) || (userId === userBId && agencyId === agencyBId)) });
  });
  beforeEach(async () => {
    await adminPool.query('TRUNCATE customers, sales, payments, payment_conditions, audit_logs CASCADE');
    const customer = await adminPool.query<{ id: string }>(
      "INSERT INTO customers (agency_id,name,status) VALUES ($1,'Test','ACTIVE') RETURNING id", [agencyAId]);
    const sale = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id,customer_id,user_id,amount,discount,total,status,sale_date,travel_start_date)
       VALUES ($1,$2,$3,1000,0,1000,'CONFIRMED','2026-10-24','2026-12-20') RETURNING id`,
      [agencyAId, customer.rows[0]!.id, userAId]);
    saleId = sale.rows[0]!.id;
    const response = await app.inject({ method: 'POST', url: '/payment-conditions', headers, payload: {
      name: 'Entrada teste', scheduleKind: 'DOWN_PAYMENT_PLUS_BALANCE', maxInstallments: 10,
      minInstallmentAmount: null, interestFree: true, downPaymentMode: 'PERCENT', downPaymentValue: 30,
      downPaymentRequired: true, balanceDeadlineAnchor: 'TRAVEL_START', balanceDeadlineOffsetDays: -15,
      allowsPartialPayments: true, paymentMethods: ['PIX','CARD'], categoryIds: [], productIds: [],
    } });
    expect(response.statusCode).toBe(201);
    conditionId = response.json<{ condition: { id: string } }>().condition.id;
  });
  afterAll(async () => { await app?.close(); await runtimePool?.end(); await adminPool?.end();
    if (process.env.CI !== 'true') compose(['down']); });
  const create = () => app.inject({ method: 'POST', url: `/sales/${saleId}/payment-schedule`, headers,
    payload: { conditionId, installments: 1, paymentMethod: 'PIX' } });
  const pay = (amount: number, key: string, receivableId?: string) => app.inject({ method: 'POST',
    url: `/sales/${saleId}/payments`, headers, payload: { amount, idempotency_key: key, method: 'PIX',
      paid_at: '2026-12-05T12:00:00.000Z', ...(receivableId ? { receivable_id: receivableId } : {}) } });
  const balance = async () => (await app.inject({ url: `/sales/${saleId}/balance`, headers })).json<SaleBalance>();
  const financial = <T>(read: (database: ReturnType<typeof createDatabaseRuntime>) => Promise<T>) =>
    runWithTenantContext({ agencyId: agencyAId, userId: userAId, userRole: UserRole.ADMIN, email: 'user-a@example.test' },
      () => read(createDatabaseRuntime(runtimePool)));

  it('revises conditions by creating an immutable version and can deactivate the new version', async () => {
    const original = conditionId;
    const payload = {
      name: 'Entrada revisada', scheduleKind: 'DOWN_PAYMENT_PLUS_BALANCE', maxInstallments: 10,
      minInstallmentAmount: null, interestFree: true, downPaymentMode: 'PERCENT', downPaymentValue: 35,
      downPaymentRequired: true, balanceDeadlineAnchor: 'TRAVEL_START', balanceDeadlineOffsetDays: -15,
      allowsPartialPayments: true, paymentMethods: ['PIX','CARD'], categoryIds: [], productIds: [],
    };
    const revised = await app.inject({ method: 'PUT', url: `/payment-conditions/${original}`, headers, payload });
    expect(revised.statusCode).toBe(200);
    const nextId = revised.json<{ condition: { id: string; version: number } }>().condition.id;
    expect(nextId).not.toBe(original);
    expect(revised.json<{ condition: { version: number } }>().condition.version).toBe(2);
    const all = await app.inject({ url: '/payment-conditions?includeInactive=true', headers });
    expect(all.json<{ conditions: Array<{ id: string; active: boolean }> }>().conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: original, active: false }), expect.objectContaining({ id: nextId, active: true })]),
    );
    expect((await create()).statusCode).toBe(422);
    const deactivated = await app.inject({ method: 'POST', url: `/payment-conditions/${nextId}/deactivate`, headers });
    expect(deactivated.statusCode).toBe(200);
    expect((await app.inject({ url: '/payment-conditions', headers })).json<{ conditions: Array<{ id: string }> }>().conditions).toHaveLength(0);
  });

  const raceOnSale = async <T>(start: () => Promise<T>[]) => {
    const blocker = await adminPool.connect();
    let pending: Promise<T[]> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM sales WHERE id=$1 FOR UPDATE', [saleId]);
      pending = Promise.all(start());
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const locks = await adminPool.query<{ count: string }>(`SELECT count(*)::text FROM pg_stat_activity
          WHERE datname=current_database() AND usename=$1 AND wait_event_type='Lock'`, [runtimeUser]);
        if (Number(locks.rows[0]?.count) >= 2) { waiting = true; break; }
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
      }
      expect(waiting).toBe(true);
      await blocker.query('COMMIT');
      return await pending;
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      if (pending) await pending;
    }
  };

  it.each(['2026-12-05T15:00:00Z', '2026-12-06T01:00:00Z', '2026-12-06T03:00:00Z'])(
    'agrees on civil overdue dates at %s in Sao Paulo', async (instant) => {
      await create();
      await pay(300, 'entry');
      await adminPool.query("UPDATE payments SET occurred_at='2026-10-24T12:00:00Z'");
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(instant));
      try {
        const late = instant === '2026-12-06T03:00:00Z';
        expect((await balance()).late).toBe(late);
        expect((await financial(getOverdueReport)).receivables).toHaveLength(late ? 1 : 0);
        expect((await financial(getFinancialSummary)).dashboard.overdueReceivable).toBe(late ? 700 : 0);
      } finally { vi.useRealTimers(); }
    });

  it('preserves the instant comparison for legacy rows without due_date', async () => {
    await create();
    await pay(300, 'entry');
    await adminPool.query("UPDATE payments SET occurred_at='2026-10-24T12:00:00Z'");
    const target = (await balance()).receivables.find((r) => r.kind === 'BALANCE')!.id;
    await adminPool.query("UPDATE receivables SET due_date=NULL,due_at='2026-12-05T12:00:00Z' WHERE id=$1", [target]);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-12-05T11:59:59Z'));
      expect((await balance()).late).toBe(false);
      expect((await financial(getOverdueReport)).receivables).toHaveLength(0);
      vi.setSystemTime(new Date('2026-12-05T12:00:01Z'));
      expect((await balance()).late).toBe(true);
      expect((await financial(getOverdueReport)).receivables).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it('migration grants runtime SELECT and INSERT without test grants', async () => {
    for (const table of ['payment_conditions','payment_condition_methods','payment_condition_categories',
      'payment_condition_products','sale_payment_condition_versions','sale_payment_requests']) {
      const result = await runtimePool.query<{ readable: boolean; writable: boolean }>(
        `SELECT has_table_privilege(current_user,$1,'SELECT') AS readable,
          has_table_privilege(current_user,$1,'INSERT') AS writable`, [table]);
      expect(result.rows[0]).toEqual({ readable: true,writable: true });
    }
    const update = await runtimePool.query<{ allowed: boolean }>(
      "SELECT has_table_privilege(current_user,'payment_conditions','UPDATE') AS allowed");
    expect(update.rows[0]?.allowed).toBe(true);
  });

  it.each([0,300,800])('uses outstanding money with %s allocated in every financial query', async (allocated) => {
    await create();
    expect((await financial(getFinancialSummary)).pending).toBe(1000);
    await pay(300, 'entry-paid');
    const target = (await balance()).receivables.find((r) => r.kind === 'BALANCE')!.id;
    if (allocated > 0) {
      await adminPool.query(`WITH p AS (INSERT INTO payments
        (agency_id,direction,amount,occurred_at,created_by) VALUES ($1,'IN',$3,now(),$2) RETURNING id)
        INSERT INTO payment_allocations (agency_id,payment_id,receivable_id,amount)
        SELECT $1,id,$4,$3 FROM p`, [agencyAId,userAId,allocated,target]);
      await adminPool.query("UPDATE receivables SET status='PARTIALLY_PAID' WHERE id=$1", [target]);
    }
    const outstanding = Math.max(700-allocated,0);
    await adminPool.query(`UPDATE receivables SET due_at=now()+interval '1 day',
      due_date=(now() AT TIME ZONE 'America/Sao_Paulo')::date+1 WHERE id=$1`, [target]);
    const summary = await financial(getFinancialSummary);
    expect(summary.pending).toBe(outstanding);
    expect(summary.upcomingReceivables).toHaveLength(1);
    expect(summary.upcomingReceivables[0]?.amount).toBe(outstanding);
    expect(summary.dashboard.totalReceivable).toBe(outstanding);
    const flow = await financial(getCashFlowReport);
    expect(flow.projection_30_days - flow.current_balance).toBe(outstanding);
    expect(flow.projection_60_days - flow.current_balance).toBe(outstanding);
    expect(flow.projection_90_days - flow.current_balance).toBe(outstanding);
    await adminPool.query(`UPDATE receivables SET due_at=now()-interval '2 days',
      due_date=(now() AT TIME ZONE 'America/Sao_Paulo')::date-2 WHERE id=$1`, [target]);
    expect((await financial(getFinancialSummary)).dashboard.overdueReceivable).toBe(outstanding);
    expect((await financial(getOverdueReport)).receivables).toEqual([
      expect.objectContaining({ id: target, amount: outstanding, daysOverdue: 2 }),
    ]);
  });

  it('returns a split payment once and limits distinct payments to ten', async () => {
    await create();
    await pay(1000, 'split');
    const summary = await financial(getFinancialSummary);
    expect(summary.recentPayments).toHaveLength(1);
    expect(summary.recentPayments[0]?.amount).toBe(1000);
    await adminPool.query(`INSERT INTO payments (agency_id,direction,amount,occurred_at,created_by)
      SELECT $1,'IN',n,'2026-12-06T12:00:00Z'::timestamptz+n*interval '1 minute',$2
      FROM generate_series(1,10) n`, [agencyAId,userAId]);
    const recent = (await financial(getFinancialSummary)).recentPayments;
    expect(recent).toHaveLength(10);
    expect(new Set(recent.map((p) => p.id)).size).toBe(10);
    expect(recent.map((p) => p.amount)).toEqual([10,9,8,7,6,5,4,3,2,1]);
  });

  it('blocks changing category on a PENDING sale with an applied schedule', async () => {
    await adminPool.query("UPDATE sales SET status='PENDING' WHERE id=$1", [saleId]);
    const category = await adminPool.query<{ id: string }>(
      "INSERT INTO commission_categories (agency_id,name) VALUES ($1,'New category') RETURNING id", [agencyAId]);
    await create();
    const original = await balance();
    const response = await app.inject({ method: 'PATCH',url: `/sales/${saleId}`,headers,
      payload: { categoryId: category.rows[0]!.id } });
    expect(response.statusCode).toBe(409);
    expect(response.body).toContain('payment condition');
    expect(await balance()).toEqual(original);
    const saleRow = await adminPool.query<{ category_id: string | null }>('SELECT category_id FROM sales WHERE id=$1', [saleId]);
    expect(saleRow.rows[0]?.category_id).toBeNull();
  });

  it('serializes schedule application against legacy allocation without losing money', async () => {
    const old = await adminPool.query<{ id: string }>(`INSERT INTO receivables
      (agency_id,sale_id,customer_id,description,amount,due_at)
      SELECT agency_id,id,customer_id,'Legacy race',total,now() FROM sales WHERE id=$1 RETURNING id`, [saleId]);
    const payment = await adminPool.query<{ id: string }>(`INSERT INTO payments
      (agency_id,direction,amount,occurred_at,created_by) VALUES ($1,'IN',100,now(),$2) RETURNING id`, [agencyAId,userAId]);
    const results = await raceOnSale(() => [Promise.resolve(create()), Promise.resolve(app.inject({ method: 'POST',
      url: `/financial/payments/${payment.rows[0]!.id}/allocations`,headers,
      payload: { allocations: [{ receivableId: old.rows[0]!.id,amount: 100 }] } }))]);
    const applied = results[0]?.statusCode === 201;
    expect(results.map((r) => r.statusCode)).toEqual(applied ? [201,409] : [409,200]);
    const b = await balance();
    expect(b.received).toBe(applied ? 0 : 100);
    expect(b.remaining).toBe(applied ? 1000 : 900);
    expect(b.snapshot !== null).toBe(applied);
    expect(b.receivables.reduce((sum,r) => sum+r.amount,0)).toBe(1000);
  });

  it('serializes payment against revision and keeps snapshot dates consistent', async () => {
    await create();
    const target = (await balance()).receivables.find((r) => r.kind === 'BALANCE')!.id;
    await adminPool.query("UPDATE sales SET travel_start_date='2027-01-20' WHERE id=$1", [saleId]);
    const results = await raceOnSale(() => [Promise.resolve(pay(100,'revision-race',target)), Promise.resolve(app.inject({ method: 'POST',
      url: `/sales/${saleId}/payment-schedule/revise`,headers,payload: { reason: 'New departure' } }))]);
    expect(results.map((r) => r.statusCode)).toEqual([201,200]);
    const b = await balance();
    expect(b.received).toBe(100);
    expect(b.remaining).toBe(900);
    expect(b.snapshot?.version).toBe(2);
    const obligation = b.receivables.find((r) => r.id === target)!;
    expect(['2026-12-05','2027-01-05']).toContain(obligation.due);
    expect(b.snapshot?.schedule.find((r) => r.kind === 'BALANCE')?.dueDate).toBe(obligation.due);
  });

  it.each(['application','revision'])('rolls back %s when required audit fails', async (operation) => {
    if (operation === 'revision') {
      await create();
      await adminPool.query("UPDATE sales SET travel_start_date='2027-01-20' WHERE id=$1", [saleId]);
    } else {
      await adminPool.query(`INSERT INTO receivables (agency_id,sale_id,customer_id,description,amount,due_at)
        SELECT agency_id,id,customer_id,'Original',total,now() FROM sales WHERE id=$1`, [saleId]);
    }
    const state = async () => ({
      sale: (await adminPool.query('SELECT * FROM sales WHERE id=$1', [saleId])).rows,
      obligations: (await adminPool.query('SELECT * FROM receivables WHERE sale_id=$1 ORDER BY id', [saleId])).rows,
      versions: (await adminPool.query('SELECT * FROM sale_payment_condition_versions WHERE sale_id=$1 ORDER BY version', [saleId])).rows,
      audit: (await adminPool.query('SELECT * FROM audit_logs WHERE entity_id=$1 ORDER BY id', [saleId])).rows,
    });
    const original = await state();
    await adminPool.query(`CREATE FUNCTION reject_schedule_apply_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='SALE_PAYMENT_SCHEDULE_APPLIED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_schedule_apply_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION reject_schedule_apply_audit();`);
    try {
      const response = operation === 'application' ? await create() : await app.inject({ method: 'POST',
        url: `/sales/${saleId}/payment-schedule/revise`,headers,payload: { reason: 'New departure' } });
      expect(response.statusCode).toBe(500);
      expect(await state()).toEqual(original);
    } finally {
      await adminPool.query('DROP TRIGGER reject_schedule_apply_audit ON audit_logs; DROP FUNCTION reject_schedule_apply_audit();');
    }
    const retry = operation === 'application' ? await create() : await app.inject({ method: 'POST',
      url: `/sales/${saleId}/payment-schedule/revise`,headers,payload: { reason: 'New departure' } });
    expect(retry.statusCode).toBe(operation === 'application' ? 201 : 200);
  });
  it('migration preserves the legacy single receivable, timestamp, status and allocated money', () => {
    expect(preservedLegacy).toMatchObject({ kind: 'SINGLE',installment_number: 1,installment_count: 1,
      amount: '1000.00',paid: '300.00',due_date: '2026-12-05',status: 'PARTIALLY_PAID' });
  });
  it('entry 300 plus balance 700 paid as 300 + 400 at the deadline', async () => {
    expect((await create()).statusCode).toBe(201);
    expect(await balance()).toMatchObject({ total: 1000, remaining: 1000, down_payment_pending: true, balance_deadline: '2026-12-05' });
    expect((await balance()).receivables.map((r) => r.amount)).toEqual([300, 700]);
    expect((await pay(300, 'entry')).statusCode).toBe(201);
    expect((await balance()).down_payment_pending).toBe(false);
    expect((await pay(300, 'balance-first')).statusCode).toBe(201);
    expect(await balance()).toMatchObject({ received: 600, remaining: 400, status: 'PARTIALLY_PAID', settled_at: null });
    expect((await pay(400, 'balance-final')).statusCode).toBe(201);
    expect(await balance()).toMatchObject({ remaining: 0, status: 'PAID', settled_at: '2026-12-05T12:00:00.000Z' });
    expect((await adminPool.query('SELECT id FROM audit_logs WHERE entity_id=$1', [saleId])).rows.length).toBeGreaterThanOrEqual(4);
  });
  it('rejects excess, repeated schedule and nonapplicable method', async () => {
    expect((await app.inject({ method: 'POST', url: `/sales/${saleId}/payment-schedule`, headers,
      payload: { conditionId, installments: 1, paymentMethod: 'CASH' } })).statusCode).toBe(422);
    await create(); expect((await create()).statusCode).toBe(409);
    expect((await pay(1000.01, 'excess')).statusCode).toBe(422);
    expect((await balance()).received).toBe(0);
  });
  it('replays the exact response and rejects changed payload for the same key', async () => {
    await create(); const first = await pay(300, 'same'); await pay(400, 'another');
    expect((await pay(300, 'same')).json()).toEqual(first.json());
    expect((await balance()).received).toBe(700);
    expect((await pay(301, 'same')).statusCode).toBe(409);
    expect((await adminPool.query('SELECT id FROM payments')).rowCount).toBe(2);
  });
  it('serializes concurrent duplicates and excess', async () => {
    await create();
    const duplicate = await Promise.all([pay(300, 'duplicate'), pay(300, 'duplicate')]);
    expect(duplicate.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(duplicate[0].json()).toEqual(duplicate[1].json());
    const results = await Promise.all([pay(500, 'race-a'), pay(500, 'race-b')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 422]);
    expect((await balance()).received).toBe(800);
  });
  it('requires auth, finance role and tenant scope, rejecting client authority', async () => {
    expect((await app.inject({ url: `/sales/${saleId}/balance` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/sales/${saleId}/balance`, headers: { 'x-test-principal': 'b' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/sales/${saleId}/payment-schedule`, headers: { 'x-test-principal': 'agent' },
      payload: { conditionId, installments: 1, paymentMethod: 'PIX' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/sales/${saleId}/payment-schedule`, headers,
      payload: { conditionId, installments: 1, paymentMethod: 'PIX', agencyId: agencyBId } })).statusCode).toBe(400);
  });
  it('freezes the snapshot and total, never silently recalculating travel deadlines', async () => {
    await create(); const original = (await balance()).snapshot;
    await adminPool.query("UPDATE payment_conditions SET name='Changed' WHERE id=$1", [conditionId]);
    await adminPool.query("UPDATE sales SET travel_start_date='2027-01-20' WHERE id=$1", [saleId]);
    expect((await balance()).snapshot).toEqual(original);
    expect((await balance()).balance_deadline).toBe('2026-12-05');
    expect((await app.inject({ method: 'PATCH', url: `/sales/${saleId}`, headers, payload: { amount: 1200 } })).statusCode).toBe(409);
  });
  it('enforces runtime RLS and compound foreign keys', async () => {
    await create();
    expect((await runtimePool.query('SELECT id FROM payment_conditions')).rows).toHaveLength(0);
    const category = await adminPool.query<{ id: string }>(
      "INSERT INTO commission_categories (agency_id,name) VALUES ($1,'Other tenant category') RETURNING id", [agencyBId]);
    const client = await runtimePool.connect();
    try { await client.query('BEGIN'); await client.query('SELECT set_tenant_context($1,$2)', [agencyAId,userAId]);
      expect((await client.query('SELECT id FROM payment_conditions')).rows).toEqual([{ id: conditionId }]);
      await expect(client.query(`INSERT INTO payment_condition_categories (agency_id,condition_id,category_id)
        VALUES ($1,$2,$3)`, [agencyAId,conditionId,category.rows[0]!.id])).rejects.toMatchObject({ code: '23503' });
    } finally { await client.query('ROLLBACK'); client.release(); }
    const flags = await adminPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('payment_conditions','sale_payment_requests','sale_payment_condition_versions')");
    expect(flags.rows).toHaveLength(3);
    expect(flags.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
  });
  it('creates ten real card installments, refusing eleven through the API', async () => {
    await adminPool.query(`UPDATE payment_conditions SET schedule_kind='EQUAL_INSTALLMENTS',
      down_payment_mode='NONE',down_payment_value=0,down_payment_required=false,
      min_installment_amount=100,balance_deadline_anchor='SALE_DATE',balance_deadline_offset_days=0 WHERE id=$1`, [conditionId]);
    const request = (installments: number) => app.inject({ method: 'POST',url: `/sales/${saleId}/payment-schedule`,headers,
      payload: { conditionId,installments,paymentMethod: 'CARD' } });
    expect((await request(11)).statusCode).toBe(422);
    expect((await request(10)).statusCode).toBe(201);
    const b = await balance();
    expect(b.receivables).toHaveLength(10);
    expect(b.receivables.map((r) => r.amount)).toEqual(Array(10).fill(100));
    await pay(100,'first');
    expect((await app.inject({ method: 'POST',url: `/sales/${saleId}/mark-paid`,headers })).statusCode).toBe(409);
    await pay(900,'rest');
    expect((await app.inject({ method: 'POST',url: `/sales/${saleId}/mark-paid`,headers })).statusCode).toBe(200);
  });
  it('accepts late money, marks late and enforces selected receivable capacity', async () => {
    await create();
    const target = (await balance()).receivables.find((r) => r.kind === 'BALANCE')!.id;
    expect((await pay(701,'too-much',target)).statusCode).toBe(422);
    const response = await app.inject({ method: 'POST',url: `/sales/${saleId}/payments`,headers,
      payload: { amount: 300,method: 'PIX',paid_at: '2026-12-06T12:00:00Z',receivable_id: target,idempotency_key: 'late' } });
    expect(response.statusCode).toBe(201);
    const b = await balance();
    expect(b.receivables.find((r) => r.id === target)).toMatchObject({ paid: 300,late: true });
    expect(b.down_payment_pending).toBe(true);
  });
  it('revision needs ADMIN and a reason, versions snapshots and changes only open dates', async () => {
    await create(); await pay(100,'partial-entry');
    const old = await balance();
    await adminPool.query("UPDATE sales SET sale_date='2026-11-01',travel_start_date='2027-01-20' WHERE id=$1", [saleId]);
    const url = `/sales/${saleId}/payment-schedule/revise`;
    expect((await app.inject({ method: 'POST',url,headers,payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST',url,headers: { 'x-test-principal': 'manager' },payload: { reason: 'New departure' } })).statusCode).toBe(403);
    const revision = await app.inject({ method: 'POST',url,headers,payload: { reason: 'New departure' } });
    expect(revision.statusCode).toBe(200);
    const b = await balance();
    expect(b.snapshot?.version).toBe(2);
    expect(b.receivables.find((r) => r.kind === 'DOWN_PAYMENT')?.due).toBe(old.receivables[0]!.due);
    expect(b.balance_deadline).toBe('2027-01-05');
    const versions = await adminPool.query<{ snapshot: unknown; reason: string }>(
      'SELECT snapshot,reason FROM sale_payment_condition_versions WHERE sale_id=$1 ORDER BY version', [saleId]);
    expect(versions.rows[0]!.snapshot).toEqual(old.snapshot);
    expect(versions.rows[1]!.reason).toBe('New departure');
    await expect(adminPool.query("UPDATE sale_payment_condition_versions SET reason='overwrite' WHERE sale_id=$1", [saleId])).rejects.toThrow();
  });
  it('rolls payment, allocations, status and idempotency back if required audit fails', async () => {
    await create();
    await adminPool.query(`CREATE FUNCTION reject_schedule_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='SALE_PAYMENT_RECORDED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_schedule_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_schedule_test_audit();`);
    try {
      expect((await pay(100,'retry-after-failure')).statusCode).toBe(500);
      expect((await balance()).received).toBe(0);
      expect((await adminPool.query('SELECT id FROM payments')).rows).toHaveLength(0);
      expect((await adminPool.query('SELECT payment_id FROM sale_payment_requests')).rows).toHaveLength(0);
    } finally {
      await adminPool.query('DROP TRIGGER reject_schedule_test_audit ON audit_logs; DROP FUNCTION reject_schedule_test_audit();');
    }
    expect((await pay(100,'retry-after-failure')).statusCode).toBe(201);
  });
  it('does not accept legacy allocation routes for a scheduled sale', async () => {
    await create();
    const payment = await adminPool.query<{ id: string }>(`INSERT INTO payments
      (agency_id,direction,amount,occurred_at,created_by) VALUES ($1,'IN',100,now(),$2) RETURNING id`, [agencyAId,userAId]);
    const response = await app.inject({ method: 'POST',url: `/financial/payments/${payment.rows[0]!.id}/allocations`,headers,
      payload: { allocations: [{ receivableId: (await balance()).receivables[0]!.id,amount: 100 }] } });
    expect(response.statusCode).toBe(409);
    expect((await balance()).received).toBe(0);
  });
  it('rejects missing travel anchor, category mismatch, disallowed partial payments and interest', async () => {
    await adminPool.query('UPDATE sales SET travel_start_date=NULL WHERE id=$1', [saleId]);
    expect((await create()).statusCode).toBe(422);
    expect((await adminPool.query('SELECT id FROM receivables WHERE sale_id=$1', [saleId])).rows).toHaveLength(0);
    await adminPool.query("UPDATE sales SET travel_start_date='2026-12-20' WHERE id=$1", [saleId]);
    const category = await adminPool.query<{ id: string }>(
      "INSERT INTO commission_categories (agency_id,name) VALUES ($1,'Only category') RETURNING id", [agencyAId]);
    await adminPool.query('INSERT INTO payment_condition_categories (agency_id,condition_id,category_id) VALUES ($1,$2,$3)',
      [agencyAId,conditionId,category.rows[0]!.id]);
    expect((await create()).statusCode).toBe(422);
    await adminPool.query('UPDATE sales SET category_id=$2 WHERE id=$1', [saleId,category.rows[0]!.id]);
    await adminPool.query('UPDATE payment_conditions SET allows_partial_payments=false WHERE id=$1', [conditionId]);
    expect((await create()).statusCode).toBe(201);
    expect((await pay(100,'partial-blocked')).statusCode).toBe(422);
    expect((await pay(300,'full-entry')).statusCode).toBe(201);
    const invalid = await app.inject({ method: 'POST',url: '/payment-conditions',headers,payload: {
      name: 'Interest',scheduleKind: 'SINGLE',maxInstallments: 1,minInstallmentAmount: null,
      interestFree: false,downPaymentMode: 'NONE',downPaymentValue: 0,downPaymentRequired: false,
      balanceDeadlineAnchor: 'SALE_DATE',balanceDeadlineOffsetDays: 0,allowsPartialPayments: true,
      paymentMethods: ['PIX'],categoryIds: [],productIds: [],
    } });
    expect(invalid.statusCode).toBe(422);
  });
  it('reuses an unallocated legacy receivable', async () => {
    const old = await adminPool.query<{ id: string }>(`INSERT INTO receivables
      (agency_id,sale_id,customer_id,description,amount,due_at)
      SELECT agency_id,id,customer_id,'Original',total,now() FROM sales WHERE id=$1 RETURNING id`, [saleId]);
    expect((await create()).statusCode).toBe(201);
    expect((await balance()).receivables[0]!.id).toBe(old.rows[0]!.id);
  });
  it('refuses to replace allocated legacy money', async () => {
    const old = await adminPool.query<{ id: string }>(`INSERT INTO receivables
      (agency_id,sale_id,customer_id,description,amount,due_at)
      SELECT agency_id,id,customer_id,'Original',total,now() FROM sales WHERE id=$1 RETURNING id`, [saleId]);
    const payment = await adminPool.query<{ id: string }>(`INSERT INTO payments
      (agency_id,direction,amount,occurred_at,created_by) VALUES ($1,'IN',300,now(),$2) RETURNING id`, [agencyAId,userAId]);
    await adminPool.query(`INSERT INTO payment_allocations (agency_id,payment_id,receivable_id,amount)
      VALUES ($1,$2,$3,300)`, [agencyAId,payment.rows[0]!.id,old.rows[0]!.id]);
    expect((await create()).statusCode).toBe(409);
    expect((await adminPool.query('SELECT amount FROM receivables WHERE id=$1', [old.rows[0]!.id])).rows[0]).toEqual({ amount: '1000.00' });
  });
});
function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Sale item route tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Sale item route tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Sale item route tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run sale item route tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  if (process.env.CI === 'true') return;
  const existing = run(
    'docker',
    ['ps', '--filter', `name=${containerName}`, '--filter', 'status=running', '--format', '{{.Names}}'],
    false,
  );
  if (existing.stdout.split(/\r?\n/).map((line) => line.trim()).includes(containerName)) {
    return;
  }

  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  if (process.env.CI === 'true') return;
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run(
      'docker',
      ['inspect', '-f', '{{.State.Health.Status}}', containerName],
      false,
    );

    if (result.stdout.trim() === 'healthy') {
      return;
    }

    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }

  throw new Error('Local PostgreSQL container did not become healthy in time.');
}

function assertContainerIsLocal(): void {
  if (process.env.CI === 'true') return;
  const result = run('docker', [
    'ps',
    '--filter',
    `name=${containerName}`,
    '--format',
    '{{.Image}}|{{.Ports}}',
  ]);
  const output = result.stdout.trim();

  expect(output).toContain(postgresImage);
  expect(output).toContain(`${databaseHost}:${databasePort}->5432/tcp`);
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const migrationFile of migrationFiles) {
    if (migrationFile.endsWith('105_receivable_payment_schedules.sql')) {
      await pool.query(readSqlForPg(prepareRolesSql));
      await seedAgenciesAndUsers(pool);
      await pool.query(`WITH customer AS (
        INSERT INTO customers (id,agency_id,name,status) VALUES ('legacy-c',$1,'Legacy','ACTIVE') RETURNING id
      ), sale AS (
        INSERT INTO sales (id,agency_id,customer_id,user_id,amount,discount,total,status)
        SELECT 'legacy-s',$1,id,$2,1000,0,1000,'CONFIRMED' FROM customer RETURNING id
      ) INSERT INTO receivables (id,agency_id,sale_id,customer_id,description,amount,due_at,status)
        SELECT 'legacy-r',$1,id,'legacy-c','Legacy',1000,'2026-12-05T15:00:00Z','PARTIALLY_PAID' FROM sale`, [agencyAId,userAId]);
      await pool.query(`INSERT INTO payments (id,agency_id,direction,amount,occurred_at,created_by)
        VALUES ('legacy-p',$1,'IN',300,'2026-12-01T12:00:00Z',$2)`, [agencyAId,userAId]);
      await pool.query(`INSERT INTO payment_allocations (agency_id,payment_id,receivable_id,amount)
        VALUES ($1,'legacy-p','legacy-r',300)`, [agencyAId]);
    }
    await pool.query(readSqlForPg(migrationFile));
  }
  // Tables created by migrations after 105 (e.g. 106 agency revenue) need the runtime grants too.
  await pool.query(readSqlForPg(prepareRolesSql));
  const result = await pool.query<NonNullable<typeof preservedLegacy>>(`SELECT kind,installment_number,installment_count,
    amount::text,due_date::text,status,(SELECT sum(amount)::text FROM payment_allocations WHERE receivable_id='legacy-r') AS paid
    FROM receivables WHERE id='legacy-r' AND due_at='2026-12-05T15:00:00Z'::timestamptz`);
  preservedLegacy = result.rows[0];
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

async function seedAgenciesAndUsers(pool: Pool): Promise<void> {
  await pool.query(
    `
      INSERT INTO agencies (id, name, slug, email, plan, status)
      VALUES
        ($1, 'Agency A', 'agency-a-sale-item-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-sale-item-routes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-sale-item-routes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-sale-item-routes-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userBId, agencyBId],
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(
  command: string,
  args: readonly string[],
  throwOnError = true,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (throwOnError && result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        `Exit code: ${result.status ?? 'unknown'}`,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return { stdout, stderr };
}
