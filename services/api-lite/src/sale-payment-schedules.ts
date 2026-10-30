import { getTenantId, getUserId, getTenantContext } from './tenant-context';
import { inScope, scopeFor } from './access';
import { lockCommissionRelease, recordPayment, refreshSaleStatus } from './finance';
import type { LiteDatabase, TenantClient } from './database';
import { AUDIT_EVENTS, recordAuditEvent } from './audit-log';
import { ConflictError, NotFoundError } from './errors';
import { overdueReceivableSql, receivableTimezone } from './receivable-sql';
import { syncRevenueEntitlement } from './agency-revenue';
import { calculatePaymentSchedule, moneyCents, scheduleError, validatePaymentCondition,
  type PaymentCondition, type ScheduleItem } from './payment-schedule';

export interface ConditionDefinition extends PaymentCondition {
  paymentMethods: string[];
  categoryIds: string[];
  productIds: string[];
}
export interface StoredCondition extends ConditionDefinition { id: string }
interface ConditionRow {
  id: string; name: string; version: number; schedule_kind: PaymentCondition['scheduleKind'];
  max_installments: number; min_installment_amount: string | null; interest_free: boolean;
  down_payment_mode: PaymentCondition['downPaymentMode']; down_payment_value: string;
  down_payment_required: boolean; balance_deadline_anchor: PaymentCondition['balanceDeadlineAnchor'];
  balance_deadline_offset_days: number; allows_partial_payments: boolean;
  payment_methods: string[]; category_ids: string[]; product_ids: string[];
}
interface ScheduleSnapshot {
  version: number;
  condition: StoredCondition;
  paymentMethod: string;
  travelerInstallments: number;
  saleDate: string;
  travelStart: string | null;
  total: number;
  schedule: ScheduleItem[];
}
interface SaleRow {
  id: string; customer_id: string; seller_id: string; total: string; status: string; category_id: string | null;
  sale_date: string; travel_start_date: string | null;
  payment_condition_snapshot: ScheduleSnapshot | null; settled_at: Date | null;
}
interface ReceivableRow {
  id: string; amount: string; paid: string; due_date: string; status: string;
  kind: ScheduleItem['kind']; installment_number: number; installment_count: number;
  last_payment_at: Date | null;
  overdue: boolean;
  paid_late: boolean;
}
export interface SaleBalance {
  total: number; received: number; remaining: number;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  receivables: Array<{ id: string; kind: ScheduleItem['kind']; amount: number; paid: number;
    due: string; status: string; late: boolean }>;
  next_due: string | null; last_payment_at: string | null; settled_at: string | null;
  down_payment_pending: boolean; balance_deadline: string | null; late: boolean;
  snapshot: ScheduleSnapshot | null;
}
export interface SalePaymentInput {
  amount: number;
  account_id: string;
  idempotency_key: string;
  method: string;
  paid_at: string;
  receivable_id: string | null;
  reference: string | null;
  notes: string | null;
}

const conditionColumns = `c.*,
  ARRAY(SELECT method FROM payment_condition_methods WHERE tenant_id=c.tenant_id AND condition_id=c.id ORDER BY method) AS payment_methods,
  ARRAY(SELECT category_id FROM payment_condition_categories WHERE tenant_id=c.tenant_id AND condition_id=c.id ORDER BY category_id) AS category_ids,
  ARRAY(SELECT product_id FROM payment_condition_products WHERE tenant_id=c.tenant_id AND condition_id=c.id ORDER BY product_id) AS product_ids`;

function toCondition(row: ConditionRow): StoredCondition {
  return { id: row.id, name: row.name, version: row.version, scheduleKind: row.schedule_kind,
    maxInstallments: row.max_installments, minInstallmentAmount: row.min_installment_amount === null ? null : Number(row.min_installment_amount),
    interestFree: row.interest_free, downPaymentMode: row.down_payment_mode, downPaymentValue: Number(row.down_payment_value),
    downPaymentRequired: row.down_payment_required, balanceDeadlineAnchor: row.balance_deadline_anchor,
    balanceDeadlineOffsetDays: row.balance_deadline_offset_days, allowsPartialPayments: row.allows_partial_payments,
    paymentMethods: row.payment_methods, categoryIds: row.category_ids, productIds: row.product_ids };
}

export async function listPaymentConditions(database: LiteDatabase): Promise<StoredCondition[]> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ConditionRow>(`SELECT ${conditionColumns} FROM payment_conditions c
      WHERE c.tenant_id=$1 AND c.active ORDER BY c.name,c.id`, [getTenantId()]);
    return result.rows.map(toCondition);
  });
}

export async function createPaymentCondition(database: LiteDatabase, data: ConditionDefinition): Promise<StoredCondition> {
  validatePaymentCondition(data);
  const tenantId = getTenantId();
  return database.withTenantTransaction(async (client) => {
    for (const [table, ids] of [['sale_categories', data.categoryIds], ['catalog_products', data.productIds]] as const) {
      if (ids.length === 0) continue;
      const refs = await client.query<{ id: string }>(`SELECT id FROM ${table}
        WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND active FOR SHARE`, [tenantId, ids]);
      if (refs.rows.length !== ids.length) scheduleError('Condition applicability contains an invalid reference');
    }
    const result = await client.query<{ id: string }>(`INSERT INTO payment_conditions
      (tenant_id,name,schedule_kind,max_installments,min_installment_amount,interest_free,
       down_payment_mode,down_payment_value,down_payment_required,balance_deadline_anchor,
       balance_deadline_offset_days,allows_partial_payments)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [tenantId,data.name,data.scheduleKind,data.maxInstallments,data.minInstallmentAmount,data.interestFree,
        data.downPaymentMode,data.downPaymentValue,data.downPaymentRequired,data.balanceDeadlineAnchor,
        data.balanceDeadlineOffsetDays,data.allowsPartialPayments]);
    const id = result.rows[0]!.id;
    for (const method of data.paymentMethods) {
      await client.query('INSERT INTO payment_condition_methods (tenant_id,condition_id,method) VALUES ($1,$2,$3)', [tenantId,id,method]);
    }
    for (const category of data.categoryIds) {
      await client.query('INSERT INTO payment_condition_categories (tenant_id,condition_id,category_id) VALUES ($1,$2,$3)', [tenantId,id,category]);
    }
    for (const product of data.productIds) {
      await client.query('INSERT INTO payment_condition_products (tenant_id,condition_id,product_id) VALUES ($1,$2,$3)', [tenantId,id,product]);
    }
    await recordAuditEvent(client, { eventType: AUDIT_EVENTS.PAYMENT_CONDITION_CREATED,
      entityType: 'payment_condition', entityId: id,  metadata: { version: 1 } });
    return { ...data, id };
  });
}

async function loadSale(client: TenantClient, saleId: string, lock: boolean): Promise<SaleRow> {
  const result = await client.query<SaleRow>(`SELECT id,customer_id,seller_id,gross_amount AS total,status,category_id,
    sale_date::text,travel_start_date::text,payment_condition_snapshot,settled_at
    FROM sales WHERE tenant_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : 'FOR SHARE'}`, [getTenantId(),saleId]);
  const sale = result.rows[0];
  if (!sale || !inScope(scopeFor(getTenantContext(), 'sales.read_all', 'sales.read_own'), sale.seller_id)) throw new NotFoundError('Sale not found');
  return sale;
}
async function lockSale(client: TenantClient, saleId: string): Promise<SaleRow> {
  await lockCommissionRelease(client, getTenantId(), saleId);
  return loadSale(client,saleId,true);
}
function assertCollectible(sale: SaleRow): void {
  if (sale.status !== 'DRAFT' && sale.status !== 'CONFIRMED' && sale.status !== 'PARTIALLY_PAID') {
    throw new ConflictError('Sale is not open for collection');
  }
}
async function receivables(client: TenantClient, saleId: string, lock: boolean): Promise<ReceivableRow[]> {
  const result = await client.query<ReceivableRow>(`SELECT r.id,r.amount,r.status,r.kind,r.installment_number,r.installment_count,
    r.due_at::text AS due_date,
    r.paid_amount::text AS paid,a.last_payment_at,
    ${overdueReceivableSql('$3')} AS overdue,
    (a.last_payment_at AT TIME ZONE '${receivableTimezone}')::date > r.due_at AS paid_late
    FROM receivables r LEFT JOIN LATERAL (
      SELECT sum(pa.amount) AS paid,max(COALESCE(p.payment_timestamp,p.paid_at::timestamp AT TIME ZONE 'America/Sao_Paulo')) AS last_payment_at FROM payment_allocations pa
      JOIN payments p ON p.tenant_id=pa.tenant_id AND p.id=pa.payment_id
      WHERE pa.tenant_id=r.tenant_id AND pa.receivable_id=r.id
    ) a ON true WHERE r.tenant_id=$1 AND r.sale_id=$2
    ORDER BY r.due_at,r.installment_number,r.id
    ${lock ? 'FOR UPDATE OF r' : ''}`, [getTenantId(),saleId,new Date()]);
  return result.rows;
}

async function saveSnapshot(client: TenantClient, sale: SaleRow, snapshot: ScheduleSnapshot, reason: string): Promise<void> {
  const tenantId = getTenantId();
  await client.query(`INSERT INTO sale_payment_condition_versions
    (tenant_id,sale_id,version,condition_id,snapshot,reason,created_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
    [tenantId,sale.id,snapshot.version,snapshot.condition.id,JSON.stringify(snapshot),reason,getUserId()]);
  await client.query('UPDATE sales SET payment_condition_snapshot=$3::jsonb,updated_at=now() WHERE tenant_id=$1 AND id=$2',
    [tenantId,sale.id,JSON.stringify(snapshot)]);
  sale.payment_condition_snapshot = snapshot;
  await recordAuditEvent(client, { eventType: AUDIT_EVENTS.SALE_PAYMENT_SCHEDULE_APPLIED,
    entityType: 'sale', entityId: sale.id,  metadata: { version: snapshot.version, reason } });
}

export async function createSalePaymentSchedule(database: LiteDatabase, saleId: string,
  choice: { conditionId: string; installments: number; paymentMethod: string }): Promise<SaleBalance> {
  return database.withTenantTransaction(async (client) => {
    const tenantId = getTenantId();
    const sale = await lockSale(client,saleId);
    assertCollectible(sale);
    if (sale.payment_condition_snapshot) throw new ConflictError('Sale already has an applied condition');
    const found = await client.query<ConditionRow>(`SELECT ${conditionColumns} FROM payment_conditions c
      WHERE c.tenant_id=$1 AND c.id=$2 AND c.active FOR SHARE OF c`, [tenantId,choice.conditionId]);
    if (!found.rows[0]) scheduleError('Payment condition not found or inactive');
    const condition = toCondition(found.rows[0]);
    if (!condition.paymentMethods.includes(choice.paymentMethod) ||
      (condition.categoryIds.length > 0 && (!sale.category_id || !condition.categoryIds.includes(sale.category_id)))) {
      scheduleError('Payment condition is not applicable to this sale or method');
    }
    if (condition.productIds.length > 0) {
      const items = await client.query<{ product_id: string | null }>(`SELECT product_id FROM sale_items
        WHERE tenant_id=$1 AND sale_id=$2 AND status <> 'CANCELLED'`, [tenantId,saleId]);
      if (items.rows.length === 0 || items.rows.some((item) => !item.product_id || !condition.productIds.includes(item.product_id))) {
        scheduleError('Payment condition is not applicable to every sale item');
      }
    }
    const existing = await receivables(client,saleId,true);
    if (existing.length > 1 || existing.some((r) => Number(r.paid) > 0 || r.status !== 'OPEN')) {
      throw new ConflictError('Existing receivables require explicit reconciliation');
    }
    const schedule = calculatePaymentSchedule(condition,Number(sale.total),choice.installments,
      { saleDate: sale.sale_date, travelStart: sale.travel_start_date });
    for (const item of schedule) {
      const old = existing[item.installmentNumber - 1];
      if (old) {
        await client.query(`UPDATE receivables SET amount=$3,kind=$4,installment_number=$5,installment_count=$6,
          due_at=$7::date,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [tenantId,old.id,item.amount,item.kind,item.installmentNumber,item.installmentCount,item.dueDate]);
      } else {
        await client.query(`INSERT INTO receivables
          (tenant_id,sale_id,customer_id,description,amount,kind,installment_number,installment_count,due_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date)`,
          [tenantId,saleId,sale.customer_id,condition.name,item.amount,item.kind,item.installmentNumber,item.installmentCount,item.dueDate]);
      }
    }
    await saveSnapshot(client,sale,{ version: 1,condition,paymentMethod: choice.paymentMethod,
      travelerInstallments: choice.installments,saleDate: sale.sale_date,travelStart: sale.travel_start_date,
      total: Number(sale.total),schedule },'Initial payment schedule');
    return balanceInTransaction(client,sale);
  });
}

function balanceFromRows(sale: SaleRow, rows: ReceivableRow[]): SaleBalance {
  const total = moneyCents(Number(sale.total));
  const received = rows.reduce((sum,row) => sum + moneyCents(Number(row.paid)),0);
  const remaining = total - received;
  const mapped = rows.map((row) => ({ id: row.id,kind: row.kind,amount: Number(row.amount),paid: Number(row.paid),
    due: row.due_date,status: row.status,late: row.status !== 'CANCELLED' &&
      ((Number(row.paid) < Number(row.amount) && row.overdue) || row.paid_late === true) }));
  const last = rows.flatMap((r) => r.last_payment_at ? [r.last_payment_at.toISOString()] : []).sort().at(-1) ?? null;
  return { total: total / 100,received: received / 100,remaining: remaining / 100,
    status: sale.status === 'CANCELLED' ? 'CANCELLED' : remaining === 0 ? 'PAID' : received > 0 ? 'PARTIALLY_PAID' : 'OPEN',
    receivables: mapped,next_due: mapped.find((r) => r.status !== 'CANCELLED' && r.paid < r.amount)?.due ?? null,
    last_payment_at: last,settled_at: remaining === 0 ? sale.settled_at?.toISOString() ?? last : null,
    down_payment_pending: sale.payment_condition_snapshot?.condition.downPaymentRequired === true &&
      mapped.some((r) => r.kind === 'DOWN_PAYMENT' && r.paid < r.amount),
    balance_deadline: mapped.find((r) => r.kind === 'BALANCE')?.due ?? null,
    late: mapped.some((r) => r.late),snapshot: sale.payment_condition_snapshot };
}
async function balanceInTransaction(client: TenantClient, sale: SaleRow): Promise<SaleBalance> {
  return balanceFromRows(sale,await receivables(client,sale.id,false));
}
export async function getSaleBalance(database: LiteDatabase, saleId: string): Promise<SaleBalance> {
  return database.withTenantTransaction(async (client) => balanceInTransaction(client,await loadSale(client,saleId,false)));
}

export async function recordSalePayment(database: LiteDatabase, saleId: string, input: SalePaymentInput): Promise<{ paymentId: string; balance: SaleBalance }> {
  const amount = moneyCents(input.amount);
  if (amount <= 0) scheduleError('Payment must be positive');
  return database.withTenantTransaction(async (client) => {
    const tenantId = getTenantId();
    const sale = await lockSale(client,saleId);
    const previous = await client.query<{ request: SalePaymentInput; response: { paymentId: string; balance: SaleBalance } }>(
      `SELECT request,response FROM sale_payment_requests WHERE tenant_id=$1 AND sale_id=$2 AND idempotency_key=$3`,
      [tenantId,saleId,input.idempotency_key]);
    if (previous.rows[0]) {
      const saved = previous.rows[0];
      if ((Object.keys(input) as Array<keyof SalePaymentInput>).some((key) => saved.request[key] !== input[key])) {
        throw new ConflictError('Idempotency key was already used with a different payload');
      }
      return saved.response;
    }
    assertCollectible(sale);
    const snapshot = sale.payment_condition_snapshot;
    if (!snapshot) throw new ConflictError('Apply a payment condition before collecting sale payments');
    if (!snapshot.condition.paymentMethods.includes(input.method)) scheduleError('Payment method is not applicable');
    const rows = await receivables(client,saleId,true);
    const received = rows.reduce((sum,row) => sum + moneyCents(Number(row.paid)),0);
    if (amount > moneyCents(Number(sale.total)) - received) scheduleError('Payment exceeds sale balance');
    const eligible = rows.filter((r) => r.status !== 'CANCELLED' && Number(r.paid) < Number(r.amount) &&
      (input.receivable_id === null || r.id === input.receivable_id));
    const capacity = eligible.reduce((sum,r) => sum + moneyCents(Number(r.amount)) - moneyCents(Number(r.paid)),0);
    if (amount > capacity) scheduleError('Payment exceeds selected receivable balance');
    const allocations: Array<{ id: string; cents: number; paid: number; total: number }> = [];
    let left = amount;
    for (const row of eligible) {
      if (left === 0) break;
      const total = moneyCents(Number(row.amount));
      const paid = moneyCents(Number(row.paid));
      const cents = Math.min(left,total - paid);
      if (!snapshot.condition.allowsPartialPayments && cents < total - paid) scheduleError('Partial payments are not allowed');
      allocations.push({ id: row.id,cents,paid,total });
      left -= cents;
    }
    if (left !== 0) scheduleError('No receivable available for allocation');
    if (sale.status === 'DRAFT') throw new ConflictError('Confirme a venda antes de registrar baixas');
    const civilPaidAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(input.paid_at));
    const paymentId = await recordPayment(client, tenantId, getUserId(), {
      direction: 'IN', accountId: input.account_id, categoryId: null, amount: input.amount,
      method: input.method, reference: input.reference, paidAt: civilPaidAt,
      paymentTimestamp: input.paid_at, notes: input.notes, description: snapshot.condition.name,
      saleId, schedulePayment: true,
      target: { receivables: allocations.map((a) => ({ receivableId: a.id, amount: a.cents / 100 })) },
    });
    for (const allocation of allocations) {
      await client.query(`UPDATE receivables SET paid_amount=$3,status=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [tenantId,allocation.id,(allocation.paid + allocation.cents) / 100,
          allocation.paid + allocation.cents === allocation.total ? 'PAID' : 'PARTIALLY_PAID']);
    }
    await refreshSaleStatus(client, tenantId, saleId);
    const settled = received + amount === moneyCents(Number(sale.total));
    if (settled) {
      const updated = await client.query<{ settled_at: Date }>(`UPDATE sales SET settled_at=(
        SELECT max(COALESCE(p.payment_timestamp,p.paid_at::timestamp AT TIME ZONE 'America/Sao_Paulo')) FROM payments p JOIN payment_allocations a ON a.tenant_id=p.tenant_id AND a.payment_id=p.id
        JOIN receivables r ON r.tenant_id=a.tenant_id AND r.id=a.receivable_id WHERE r.tenant_id=$1 AND r.sale_id=$2),
        updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING settled_at`, [tenantId,saleId]);
      sale.settled_at = updated.rows[0]!.settled_at;
    }
    // ADR-007: customer settlement may entitle agency revenue (never marks it received).
    await syncRevenueEntitlement(client, tenantId, saleId);
    await recordAuditEvent(client, { eventType: AUDIT_EVENTS.SALE_PAYMENT_RECORDED,entityType: 'sale',entityId: saleId,
      metadata: { paymentId,amount: input.amount } });
    const response = { paymentId,balance: await balanceInTransaction(client,sale) };
    await client.query(`INSERT INTO sale_payment_requests (tenant_id,sale_id,idempotency_key,payment_id,request,response)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [tenantId,saleId,input.idempotency_key,paymentId,JSON.stringify(input),JSON.stringify(response)]);
    return response;
  });
}

/** Re-anchor the applied condition only; paid and partially paid obligations retain their original dates. */
export async function reviseSalePaymentSchedule(database: LiteDatabase, saleId: string, reason: string): Promise<SaleBalance> {
  return database.withTenantTransaction(async (client) => {
    const sale = await lockSale(client,saleId);
    assertCollectible(sale);
    if (!reason.trim() || reason.trim().length > 500) scheduleError('Informe um motivo de ate 500 caracteres');
    const old = sale.payment_condition_snapshot;
    if (!old) throw new ConflictError('No payment condition to revise');
    const generated = calculatePaymentSchedule(old.condition,old.total,old.travelerInstallments,
      { saleDate: sale.sale_date,travelStart: sale.travel_start_date });
    const rows = await receivables(client,saleId,true);
    const schedule: ScheduleItem[] = [];
    for (const row of rows) {
      const proposed = generated.find((item) => item.installmentNumber === row.installment_number);
      if (!proposed || moneyCents(proposed.amount) !== moneyCents(Number(row.amount))) throw new ConflictError('Revision cannot change obligation amounts');
      const dueDate = row.status === 'OPEN' && Number(row.paid) === 0 ? proposed.dueDate : row.due_date;
      if (dueDate !== row.due_date) {
        await client.query(`UPDATE receivables SET due_at=$3::date,updated_at=now()
          WHERE tenant_id=$1 AND id=$2`, [getTenantId(),row.id,dueDate]);
      }
      schedule.push({ ...proposed,dueDate });
    }
    await saveSnapshot(client,sale,{ ...old,version: old.version + 1,saleDate: sale.sale_date,
      travelStart: sale.travel_start_date,schedule },reason);
    return balanceInTransaction(client,sale);
  });
}
