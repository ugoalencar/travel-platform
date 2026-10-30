/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any -- HTTP/SQL fixtures */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';
import { startDisposableDb, type DisposableDb } from './helpers/disposable-postgres';

const migrationsDir = resolve(import.meta.dirname, '../../../infrastructure/migrations');
const ALL_MIGRATIONS = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const agencyA = '10000000-0000-4000-8000-000000000001';
const agencyB = '20000000-0000-4000-8000-000000000001';
const userA = '11000000-0000-4000-8000-000000000001';
const userB = '21000000-0000-4000-8000-000000000001';
const principal = (userId: string, agencyId: string, role: UserRole): AuthenticatedPrincipal => ({ userId, agencyId, role, email: 'u@example.test' });
const principals: Record<string, AuthenticatedPrincipal> = {
  adminA: principal(userA, agencyA, UserRole.ADMIN),
  managerA: principal(userA, agencyA, UserRole.MANAGER),
  adminB: principal(userB, agencyB, UserRole.ADMIN),
};

describe('commission release by receipt and partial settlement (Onda E2: COM-03 + Frente 8)', () => {
  let db: DisposableDb;
  let admin: Pool;
  let employee: string;
  let customer: string;
  let versionId: string;

  beforeAll(async () => {
    db = await startDisposableDb(ALL_MIGRATIONS);
    admin = db.adminPool;
    await admin.query(`INSERT INTO agencies (id, name, slug, email, plan, status) VALUES ($1, 'A', 'a-e2', 'a@example.test', 'FREE', 'ACTIVE'), ($2, 'B', 'b-e2', 'b@example.test', 'FREE', 'ACTIVE')`, [agencyA, agencyB]);
    await admin.query(`INSERT INTO users (id, agency_id, email, name, role, password_hash, status) VALUES ($1, $2, 'ua@example.test', 'UA', 'ADMIN', 'x', 'ACTIVE'), ($3, $4, 'ub@example.test', 'UB', 'ADMIN', 'x', 'ACTIVE')`, [userA, agencyA, userB, agencyB]);
    employee = (await admin.query(`INSERT INTO employees (agency_id, name, base_salary) VALUES ($1, 'Func A', 1000) RETURNING id`, [agencyA])).rows[0].id;
    customer = (await admin.query(`INSERT INTO customers (agency_id, name, status) VALUES ($1, 'C', 'ACTIVE') RETURNING id`, [agencyA])).rows[0].id;
    const scope = (await admin.query(`INSERT INTO employee_commission_rule_scopes (agency_id, employee_id) VALUES ($1, $2) RETURNING id`, [agencyA, employee])).rows[0].id;
    versionId = (await admin.query(`INSERT INTO employee_commission_rule_versions (agency_id, scope_id, version_number, effective_from, mode, value) VALUES ($1, $2, 1, '2020-01-01', 'PERCENTAGE', 3) RETURNING id`, [agencyA, scope])).rows[0].id;
  }, 300_000);

  beforeEach(async () => {
    await admin.query('ALTER TABLE sale_payment_reversals DISABLE TRIGGER sale_payment_reversals_immutable');
    try {
      await admin.query('DELETE FROM sale_payment_reversals');
    } finally {
      await admin.query('ALTER TABLE sale_payment_reversals ENABLE TRIGGER sale_payment_reversals_immutable');
    }
    await admin.query('ALTER TABLE commission_financial_profiles DISABLE TRIGGER cfp_immutable');
    await admin.query('ALTER TABLE commission_release_events DISABLE TRIGGER cre_immutable');
    await admin.query('DELETE FROM commission_release_events');
    await admin.query('DELETE FROM commission_financial_profiles');
    await admin.query('ALTER TABLE commission_financial_profiles ENABLE TRIGGER cfp_immutable');
    await admin.query('ALTER TABLE commission_release_events ENABLE TRIGGER cre_immutable');
    await admin.query('DELETE FROM payment_method_receipt_rules');
    await admin.query('DELETE FROM payment_allocations');
    await admin.query('DELETE FROM payments');
    await admin.query('DELETE FROM payables');
    await admin.query('DELETE FROM commission_entries');
    await admin.query('DELETE FROM payroll_entries');
    await admin.query('DELETE FROM receivables');
    await admin.query('TRUNCATE TABLE sales CASCADE');
  });

  afterAll(async () => {
    await db?.stop();
  });

  async function call(as: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
    const app = buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess: (u, a) => Promise.resolve((u === userA && a === agencyA) || (u === userB && a === agencyB)),
      database: createDatabaseRuntime(db.runtimePool),
    });
    try {
      const res = await app.inject({ method, url, headers: { 'x-test-principal': as }, ...(payload !== undefined ? { payload: payload as object } : {}) });
      return { status: res.statusCode, body: res.json() as Record<string, any> };
    } finally {
      await app.close();
    }
  }

  const configure = async (requiresReceipt = true) => {
    await call('adminA', 'PUT', '/commission-release/receipt-rules', { method: 'PIX', requiresReceipt });
    await call('adminA', 'POST', '/commission-release/financial-profiles', { effect: 'SOMENTE_LIBERACAO', effectiveFrom: '2020-01-01' });
  };

  /** Sale of 1000 with a PIX payment condition and one receivable; `received` already paid. */
  async function makeSale(received: number, withSnapshot = true): Promise<{ saleId: string; receivableId: string }> {
    const snapshot = withSnapshot ? JSON.stringify({ condition: { paymentMethods: ['PIX'] } }) : null;
    const saleId = (await admin.query(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, total, status, payment_condition_snapshot) VALUES ($1,$2,$3,1000,1000,'CONFIRMED',$4::jsonb) RETURNING id`,
      [agencyA, customer, userA, snapshot])).rows[0].id as string;
    const receivableId = (await admin.query(
      `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at) VALUES ($1,$2,$3,'r',1000,now()) RETURNING id`,
      [agencyA, saleId, customer])).rows[0].id as string;
    if (received > 0) await receive(receivableId, received);
    return { saleId, receivableId };
  }
  async function receive(receivableId: string, amount: number) {
    await admin.query(`WITH p AS (INSERT INTO payments (agency_id,direction,amount,occurred_at,created_by) VALUES ($1,'IN',$2,now(),$3) RETURNING id)
      INSERT INTO payment_allocations (agency_id,payment_id,receivable_id,amount) SELECT $1,id,$4,$2 FROM p`, [agencyA, amount, userA, receivableId]);
  }
  async function receiveWithId(receivableId: string, amount: number): Promise<string> {
    const paymentId = (await admin.query(`INSERT INTO payments (agency_id,direction,amount,occurred_at,created_by)
      VALUES ($1,'IN',$2,now(),$3) RETURNING id`, [agencyA,amount,userA])).rows[0].id as string;
    await admin.query('INSERT INTO payment_allocations (agency_id,payment_id,receivable_id,amount) VALUES ($1,$2,$3,$4)',
      [agencyA,paymentId,receivableId,amount]);
    return paymentId;
  }
  async function makeEntry(saleId: string | null, opts: { amount?: number; mode?: 'POLICY' | 'LEGACY'; status?: string } = {}): Promise<string> {
    return (await admin.query(
      `INSERT INTO commission_entries (agency_id, employee_id, sale_id, calculation_base, amount, status, release_mode, rule_version_id) VALUES ($1,$2,$3,1000,$4,$5,$6,$7) RETURNING id`,
      [agencyA, employee, saleId, opts.amount ?? 750, opts.status ?? 'APPROVED', opts.mode ?? 'POLICY', versionId])).rows[0].id as string;
  }
  async function pay(payableId: string, amount: number) {
    const paymentId = (await admin.query(`INSERT INTO payments (agency_id,direction,amount,occurred_at,created_by) VALUES ($1,'OUT',$2,now(),$3) RETURNING id`, [agencyA, amount, userA])).rows[0].id as string;
    return call('adminA', 'POST', `/financial/payments/${paymentId}/allocations`, { allocations: [{ payableId, amount }] });
  }
  const status = async (entryId: string) => (await admin.query('SELECT status, settlement_channel FROM commission_entries WHERE id = $1', [entryId])).rows[0];

  it('configuration: ADMIN writes, MANAGER reads, other agencies see nothing; without it the feature reports what is missing', async () => {
    expect((await call('managerA', 'PUT', '/commission-release/receipt-rules', { method: 'PIX', requiresReceipt: true })).status).toBe(403);
    expect((await call('managerA', 'POST', '/commission-release/financial-profiles', { effect: 'SOMENTE_LIBERACAO', effectiveFrom: '2020-01-01' })).status).toBe(403);
    const blocked = await call('managerA', 'GET', '/commission-release/config');
    expect(blocked.body).toMatchObject({ blocked: true, missing: ['PAYMENT_METHOD_RECEIPT_RULE_UNSET', 'FINANCIAL_PROFILE_NOT_ACTIVE'] });
    expect((await call('adminA', 'PUT', '/commission-release/receipt-rules', { method: 'PIX', requiresReceipt: 'yes' })).status).toBe(400);
    await configure();
    const ok = await call('managerA', 'GET', '/commission-release/config');
    expect(ok.body).toMatchObject({ blocked: false, receiptRules: [{ method: 'PIX', requiresReceipt: true }] });
    expect((await call('adminB', 'GET', '/commission-release/config')).body.blocked).toBe(true);
  });

  it('no policy: creating the payable is refused with 409 COMMISSION_RELEASE_POLICY_MISSING naming what is missing (never released on sale)', async () => {
    const { saleId } = await makeSale(1000);
    const entry = await makeEntry(saleId);
    const res = await call('managerA', 'POST', `/commissions/${entry}/create-payable`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'COMMISSION_RELEASE_POLICY_MISSING', missing: ['PAYMENT_METHOD_RECEIPT_RULE_UNSET', 'FINANCIAL_PROFILE_NOT_ACTIVE'] });
    expect((await status(entry)).status).toBe('APPROVED');
  });

  it('a sale without a payment method is blocked too, and a method with no decided rule is blocked even with a profile', async () => {
    await call('adminA', 'POST', '/commission-release/financial-profiles', { effect: 'SOMENTE_LIBERACAO', effectiveFrom: '2020-01-01' });
    const noMethod = await makeSale(1000, false);
    const e1 = await makeEntry(noMethod.saleId);
    expect((await call('managerA', 'POST', `/commissions/${e1}/create-payable`)).body.missing).toEqual(['PAYMENT_METHOD_NOT_SET']);
    const undecided = await makeSale(1000);
    const e2 = await makeEntry(undecided.saleId);
    expect((await call('managerA', 'POST', `/commissions/${e2}/create-payable`)).body.missing).toEqual(['PAYMENT_METHOD_RECEIPT_RULE_UNSET']);
  });

  it('QP-01/02: releases proportionally to the receipts; partial payments never mark the entry PAID; full payment does', async () => {
    await configure();
    const { saleId, receivableId } = await makeSale(300);
    const entry = await makeEntry(saleId, { amount: 750 });
    const created = await call('managerA', 'POST', `/commissions/${entry}/create-payable`);
    expect(created.status).toBe(201);
    const payableId = created.body.payableId as string;
    expect((await call('managerA', 'GET', `/commission-entries/${entry}/release`)).body).toMatchObject({ released: 225, paid: 0, allocable: 225 });

    expect((await pay(payableId, 100)).status).toBe(200);
    expect((await status(entry)).status).toBe('PAYABLE');
    expect((await pay(payableId, 125.01)).status).toBe(409);
    expect((await pay(payableId, 125)).status).toBe(200);
    expect((await status(entry)).status).toBe('PAYABLE');
    expect((await call('managerA', 'GET', `/commission-entries/${entry}/release`)).body).toMatchObject({ released: 225, paid: 225, allocable: 0 });
    expect((await pay(payableId, 0.01)).status).toBe(409);

    await receive(receivableId, 700);
    expect((await call('managerA', 'GET', `/commission-entries/${entry}/release`)).body).toMatchObject({ released: 750, allocable: 525 });
    expect((await pay(payableId, 525)).status).toBe(200);
    expect(await status(entry)).toMatchObject({ status: 'PAID', settlement_channel: 'PAYABLE' });
    const events = await admin.query(`SELECT event_type FROM commission_release_events WHERE commission_entry_id = $1 ORDER BY created_at`, [entry]);
    expect(events.rows.map((r) => r.event_type)).toEqual(['PAYABLE_CREATED', 'ALLOCATION_ACCEPTED', 'ALLOCATION_ACCEPTED', 'ALLOCATION_ACCEPTED']);
  });

  it('nothing received yet: the payable cannot be created (409), and the entry stays APPROVED', async () => {
    await configure();
    const { saleId } = await makeSale(0);
    const entry = await makeEntry(saleId);
    const res = await call('managerA', 'POST', `/commissions/${entry}/create-payable`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect((await status(entry)).status).toBe('APPROVED');
  });

  it('a method that does not require receipt releases the whole commission with no receipt', async () => {
    await configure(false);
    const { saleId } = await makeSale(0);
    const entry = await makeEntry(saleId);
    const created = await call('managerA', 'POST', `/commissions/${entry}/create-payable`);
    expect(created.status).toBe(201);
    expect((await pay(created.body.payableId, 750)).status).toBe(200);
    expect((await status(entry)).status).toBe('PAID');
  });

  it('reverses a customer receipt append-only, recalculates the balance, and is idempotent', async () => {
    const { saleId,receivableId }=await makeSale(0);
    const paymentId=await receiveWithId(receivableId,400);
    const first=await call('managerA','POST',`/sales/${saleId}/payments/${paymentId}/reverse`,{reason:'Cobrança duplicada'});
    expect(first.status).toBe(200);
    expect(first.body.balance).toMatchObject({received:0,remaining:1000,status:'OPEN'});
    const second=await call('managerA','POST',`/sales/${saleId}/payments/${paymentId}/reverse`,{reason:'Repetição idempotente'});
    expect(second.status).toBe(200);
    expect(second.body.reversalPaymentId).toBe(first.body.reversalPaymentId);
    expect((await admin.query('SELECT count(*)::int AS n FROM sale_payment_reversals WHERE agency_id=$1 AND original_payment_id=$2',[agencyA,paymentId])).rows[0].n).toBe(1);
  });

  it('blocks a reversal that would leave already-paid commission above the released amount', async () => {
    await configure();
    const { saleId,receivableId }=await makeSale(0);
    const receipt=await receiveWithId(receivableId,500);
    const entry=await makeEntry(saleId,{amount:100});
    const payableId=(await call('managerA','POST',`/commissions/${entry}/create-payable`)).body.payableId as string;
    expect((await pay(payableId,50)).status).toBe(200);
    const blocked=await call('managerA','POST',`/sales/${saleId}/payments/${receipt}/reverse`,{reason:'Tentativa de estorno'});
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('COMMISSION_PAID_EXCEEDS_RELEASED');
    expect((await call('managerA','GET',`/sales/${saleId}/balance`)).body).toMatchObject({received:500,remaining:500});
  });

  it('freezes the release policy when versioned commission is generated', async () => {
    await configure(true);
    const { saleId }=await makeSale(500);
    expect((await call('managerA','POST',`/sales/${saleId}/commission-attributions`,{employeeId:employee})).status).toBe(201);
    const generated=await call('managerA','POST',`/sales/${saleId}/commission-entries/versioned`,{employeeId:employee});
    expect(generated.status).toBe(201);
    await call('adminA','PUT','/commission-release/receipt-rules',{method:'PIX',requiresReceipt:false});
    const state=await call('managerA','GET',`/commission-entries/${generated.body.entryId}/release`);
    expect(state.body).toMatchObject({released:15,policy:{status:'RESOLVED',requiresReceipt:true,effect:'SOMENTE_LIBERACAO'}});
  });

  it('LEGACY entries (created before the feature) keep the current behaviour without any configuration', async () => {
    const { saleId } = await makeSale(0);
    const entry = await makeEntry(saleId, { mode: 'LEGACY' });
    const created = await call('managerA', 'POST', `/commissions/${entry}/create-payable`);
    expect(created.status).toBe(201);
    expect((await call('managerA', 'GET', `/commission-entries/${entry}/release`)).body.policy).toEqual({ status: 'LEGACY_PRE_FEATURE' });
    expect((await pay(created.body.payableId, 750)).status).toBe(200);
    expect((await status(entry)).status).toBe('PAID');
  });

  it('concurrency: two simultaneous allocations that together exceed the released balance - only one wins', async () => {
    await configure();
    const { saleId } = await makeSale(300);
    const entry = await makeEntry(saleId);
    const payableId = (await call('managerA', 'POST', `/commissions/${entry}/create-payable`)).body.payableId as string;
    const [a, b] = await Promise.all([pay(payableId, 200), pay(payableId, 200)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await call('managerA', 'GET', `/commission-entries/${entry}/release`)).body.paid).toBe(200);
  });

  it('payroll reserves only entries whose whole amount is released; the rest stays APPROVED for the standalone channel', async () => {
    await configure();
    const full = await makeSale(1000);
    const partial = await makeSale(300);
    const releasedEntry = await makeEntry(full.saleId, { amount: 100 });
    const heldEntry = await makeEntry(partial.saleId, { amount: 100 });
    const competence = (await admin.query(`SELECT date_trunc('month', now())::date::text AS d`)).rows[0].d as string;
    const res = await call('adminA', 'POST', '/payroll-entries/generate', { employeeId: employee, competence });
    expect(res.status).toBe(201);
    expect(res.body.payrollEntry.commissionsTotal).toBe(100);
    const rows = (await admin.query('SELECT id, payroll_entry_id FROM commission_entries')).rows;
    expect(rows.find((r) => r.id === releasedEntry).payroll_entry_id).not.toBeNull();
    expect(rows.find((r) => r.id === heldEntry).payroll_entry_id).toBeNull();
    expect((await status(releasedEntry)).settlement_channel).toBe('PAYROLL');
  });

  it('payroll without configuration reserves no policy-governed commission', async () => {
    const full = await makeSale(1000);
    await makeEntry(full.saleId, { amount: 100 });
    const competence = (await admin.query(`SELECT date_trunc('month', now())::date::text AS d`)).rows[0].d as string;
    const res = await call('adminA', 'POST', '/payroll-entries/generate', { employeeId: employee, competence });
    expect(res.body.payrollEntry.commissionsTotal).toBe(0);
  });

  it('the profile is append-only with an effective date: a future profile is not in force yet', async () => {
    await call('adminA', 'PUT', '/commission-release/receipt-rules', { method: 'PIX', requiresReceipt: true });
    await call('adminA', 'POST', '/commission-release/financial-profiles', { effect: 'SOMENTE_LIBERACAO', effectiveFrom: '2999-01-01' });
    const config = await call('managerA', 'GET', '/commission-release/config');
    expect(config.body.blocked).toBe(true);
    await expect(admin.query(`UPDATE commission_financial_profiles SET effect = 'META_E_LIBERACAO'`)).rejects.toThrow(/append-only/);
  });
});
