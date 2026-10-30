import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { CommissionPaidExceedsReleasedError, ConflictError, NotFoundError } from './errors';
import { overdueReceivableSql, receivableTimezone } from './receivable-sql';
import { syncRevenueEntitlement } from './agency-revenue';
import { computeEntryRelease, lockEntrySettlement } from './commission-release-service';
import { calculatePaymentSchedule, moneyCents, scheduleError, validatePaymentCondition,
  type PaymentCondition, type ScheduleItem } from './payment-schedule';

export interface ConditionDefinition extends PaymentCondition {
  paymentMethods: string[];
  categoryIds: string[];
  productIds: string[];
}
export interface StoredCondition extends ConditionDefinition { id: string; active: boolean }
interface ConditionRow {
  id: string; name: string; version: number; schedule_kind: PaymentCondition['scheduleKind'];
  max_installments: number; min_installment_amount: string | null; interest_free: boolean;
  down_payment_mode: PaymentCondition['downPaymentMode']; down_payment_value: string;
  down_payment_required: boolean; balance_deadline_anchor: PaymentCondition['balanceDeadlineAnchor'];
  balance_deadline_offset_days: number; allows_partial_payments: boolean;
  payment_methods: string[]; category_ids: string[]; product_ids: string[]; active: boolean;
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
  id: string; customer_id: string; total: string; status: string; category_id: string | null;
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
  payments?: Array<{ id: string; amount: number; method: string | null; paid_at: string; reversed: boolean }>;
  snapshot: ScheduleSnapshot | null;
}
export interface SalePaymentInput {
  amount: number;
  idempotency_key: string;
  method: string;
  paid_at: string;
  receivable_id: string | null;
  reference: string | null;
  notes: string | null;
}

const conditionColumns = `c.*,
  ARRAY(SELECT method FROM payment_condition_methods WHERE agency_id=c.agency_id AND condition_id=c.id ORDER BY method) AS payment_methods,
  ARRAY(SELECT category_id FROM payment_condition_categories WHERE agency_id=c.agency_id AND condition_id=c.id ORDER BY category_id) AS category_ids,
  ARRAY(SELECT product_id FROM payment_condition_products WHERE agency_id=c.agency_id AND condition_id=c.id ORDER BY product_id) AS product_ids`;

function toCondition(row: ConditionRow): StoredCondition {
  return { id: row.id, name: row.name, version: row.version, scheduleKind: row.schedule_kind,
    maxInstallments: row.max_installments, minInstallmentAmount: row.min_installment_amount === null ? null : Number(row.min_installment_amount),
    interestFree: row.interest_free, downPaymentMode: row.down_payment_mode, downPaymentValue: Number(row.down_payment_value),
    downPaymentRequired: row.down_payment_required, balanceDeadlineAnchor: row.balance_deadline_anchor,
    balanceDeadlineOffsetDays: row.balance_deadline_offset_days, allowsPartialPayments: row.allows_partial_payments,
    paymentMethods: row.payment_methods, categoryIds: row.category_ids, productIds: row.product_ids, active: row.active };
}

export async function listPaymentConditions(database: DatabaseRuntime, options: { includeInactive?: boolean } = {}): Promise<StoredCondition[]> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ConditionRow>(`SELECT ${conditionColumns} FROM payment_conditions c
      WHERE c.agency_id=$1 AND ($2::boolean OR c.active) ORDER BY c.name,c.id`, [getAgencyId(), options.includeInactive === true]);
    return result.rows.map(toCondition);
  });
}

export async function revisePaymentCondition(database: DatabaseRuntime, id: string, data: ConditionDefinition): Promise<StoredCondition> {
  validatePaymentCondition(data);
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const current = await client.query<{ version: number; active: boolean; name: string; schedule_kind: PaymentCondition['scheduleKind']; max_installments: number; min_installment_amount: string | null; interest_free: boolean; down_payment_mode: PaymentCondition['downPaymentMode']; down_payment_value: string; down_payment_required: boolean; balance_deadline_anchor: PaymentCondition['balanceDeadlineAnchor']; balance_deadline_offset_days: number; allows_partial_payments: boolean }>(
      'SELECT * FROM payment_conditions WHERE agency_id=$1 AND id=$2 FOR UPDATE', [agencyId,id]);
    if (!current.rows[0] || !current.rows[0].active) throw new NotFoundError('Active payment condition not found');
    for (const [table, ids] of [['commission_categories', data.categoryIds], ['travel_products', data.productIds]] as const) {
      if (ids.length === 0) continue;
      const refs = await client.query<{ id: string }>(`SELECT id FROM ${table} WHERE agency_id=$1 AND id=ANY($2::text[]) AND active FOR SHARE`, [agencyId,ids]);
      if (refs.rows.length !== ids.length) scheduleError('Condition applicability contains an invalid reference');
    }
    const previous=current.rows[0];
    const version = previous.version + 1;
    const created=await client.query<{id:string}>(`INSERT INTO payment_conditions
      (agency_id,name,version,schedule_kind,max_installments,min_installment_amount,interest_free,down_payment_mode,
       down_payment_value,down_payment_required,balance_deadline_anchor,balance_deadline_offset_days,allows_partial_payments)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [agencyId,data.name,version,data.scheduleKind,data.maxInstallments,data.minInstallmentAmount,data.interestFree,
       data.downPaymentMode,data.downPaymentValue,data.downPaymentRequired,data.balanceDeadlineAnchor,data.balanceDeadlineOffsetDays,data.allowsPartialPayments]);
    const nextId=created.rows[0]!.id;
    for (const method of data.paymentMethods) await client.query('INSERT INTO payment_condition_methods (agency_id,condition_id,method) VALUES ($1,$2,$3)',[agencyId,nextId,method]);
    for (const category of data.categoryIds) await client.query('INSERT INTO payment_condition_categories (agency_id,condition_id,category_id) VALUES ($1,$2,$3)',[agencyId,nextId,category]);
    for (const product of data.productIds) await client.query('INSERT INTO payment_condition_products (agency_id,condition_id,product_id) VALUES ($1,$2,$3)',[agencyId,nextId,product]);
    await client.query('UPDATE payment_conditions SET active=false WHERE agency_id=$1 AND id=$2',[agencyId,id]);
    await recordAuditEvent(client,{eventType:AuditEventType.PAYMENT_CONDITION_REVISED,entityType:'payment_condition',entityId:nextId,required:true,metadata:{version,status:'REVISED'}});
    return { ...data,id:nextId,version,active:true };
  });
}

export async function deactivatePaymentCondition(database: DatabaseRuntime, id: string): Promise<void> {
  const agencyId=getAgencyId();
  await database.withTenantTransaction(async (client)=>{
    const result=await client.query('UPDATE payment_conditions SET active=false WHERE agency_id=$1 AND id=$2 AND active RETURNING id',[agencyId,id]);
    if (!result.rows.length) throw new NotFoundError('Active payment condition not found');
    await recordAuditEvent(client,{eventType:AuditEventType.PAYMENT_CONDITION_DEACTIVATED,entityType:'payment_condition',entityId:id,required:true,metadata:{status:'DEACTIVATED'}});
  });
}

export async function createPaymentCondition(database: DatabaseRuntime, data: ConditionDefinition): Promise<StoredCondition> {
  validatePaymentCondition(data);
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    for (const [table, ids] of [['commission_categories', data.categoryIds], ['travel_products', data.productIds]] as const) {
      if (ids.length === 0) continue;
      const refs = await client.query<{ id: string }>(`SELECT id FROM ${table}
        WHERE agency_id=$1 AND id=ANY($2::text[]) AND active FOR SHARE`, [agencyId, ids]);
      if (refs.rows.length !== ids.length) scheduleError('Condition applicability contains an invalid reference');
    }
    const result = await client.query<{ id: string }>(`INSERT INTO payment_conditions
      (agency_id,name,schedule_kind,max_installments,min_installment_amount,interest_free,
       down_payment_mode,down_payment_value,down_payment_required,balance_deadline_anchor,
       balance_deadline_offset_days,allows_partial_payments)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [agencyId,data.name,data.scheduleKind,data.maxInstallments,data.minInstallmentAmount,data.interestFree,
        data.downPaymentMode,data.downPaymentValue,data.downPaymentRequired,data.balanceDeadlineAnchor,
        data.balanceDeadlineOffsetDays,data.allowsPartialPayments]);
    const id = result.rows[0]!.id;
    for (const method of data.paymentMethods) {
      await client.query('INSERT INTO payment_condition_methods (agency_id,condition_id,method) VALUES ($1,$2,$3)', [agencyId,id,method]);
    }
    for (const category of data.categoryIds) {
      await client.query('INSERT INTO payment_condition_categories (agency_id,condition_id,category_id) VALUES ($1,$2,$3)', [agencyId,id,category]);
    }
    for (const product of data.productIds) {
      await client.query('INSERT INTO payment_condition_products (agency_id,condition_id,product_id) VALUES ($1,$2,$3)', [agencyId,id,product]);
    }
    await recordAuditEvent(client, { eventType: AuditEventType.PAYMENT_CONDITION_CREATED,
      entityType: 'payment_condition', entityId: id, required: true, metadata: { version: 1 } });
    return { ...data, id, active: true };
  });
}

async function loadSale(client: TenantTransactionClient, saleId: string, lock: boolean): Promise<SaleRow> {
  const result = await client.query<SaleRow>(`SELECT id,customer_id,total,status,category_id,
    sale_date::text,travel_start_date::text,payment_condition_snapshot,settled_at
    FROM sales WHERE agency_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : 'FOR SHARE'}`, [getAgencyId(),saleId]);
  const sale = result.rows[0];
  if (!sale) throw new NotFoundError('Sale not found');
  return sale;
}
async function lockSale(client: TenantTransactionClient, saleId: string): Promise<SaleRow> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${getAgencyId()}:sale:${saleId}`]);
  return loadSale(client,saleId,true);
}
function assertCollectible(sale: SaleRow): void {
  if (sale.status !== 'PENDING' && sale.status !== 'CONFIRMED') {
    throw new ConflictError('Sale is not open for collection');
  }
}
async function receivables(client: TenantTransactionClient, saleId: string, lock: boolean): Promise<ReceivableRow[]> {
  const result = await client.query<ReceivableRow>(`SELECT r.id,r.amount,r.status,r.kind,r.installment_number,r.installment_count,
    COALESCE(r.due_date,(r.due_at AT TIME ZONE 'UTC')::date)::text AS due_date,
    COALESCE(a.paid,0)::text AS paid,a.last_payment_at,
    ${overdueReceivableSql('$3')} AS overdue,
    CASE WHEN r.due_date IS NOT NULL
      THEN (a.last_payment_at AT TIME ZONE '${receivableTimezone}')::date > r.due_date
      ELSE a.last_payment_at > r.due_at END AS paid_late
    FROM receivables r LEFT JOIN LATERAL (
      SELECT sum(pa.amount) AS paid,max(p.occurred_at) AS last_payment_at FROM payment_allocations pa
      JOIN payments p ON p.agency_id=pa.agency_id AND p.id=pa.payment_id
      WHERE pa.agency_id=r.agency_id AND pa.receivable_id=r.id AND p.direction='IN'
        AND NOT EXISTS (SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=p.agency_id AND spr.original_payment_id=p.id)
    ) a ON true WHERE r.agency_id=$1 AND r.sale_id=$2
    ORDER BY COALESCE(r.due_date,(r.due_at AT TIME ZONE 'UTC')::date),r.installment_number,r.id
    ${lock ? 'FOR UPDATE OF r' : ''}`, [getAgencyId(),saleId,new Date()]);
  return result.rows;
}

async function saveSnapshot(client: TenantTransactionClient, sale: SaleRow, snapshot: ScheduleSnapshot, reason: string): Promise<void> {
  const agencyId = getAgencyId();
  await client.query(`INSERT INTO sale_payment_condition_versions
    (agency_id,sale_id,version,condition_id,snapshot,reason,created_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
    [agencyId,sale.id,snapshot.version,snapshot.condition.id,JSON.stringify(snapshot),reason,getUserId()]);
  await client.query('UPDATE sales SET payment_condition_snapshot=$3::jsonb,updated_at=now() WHERE agency_id=$1 AND id=$2',
    [agencyId,sale.id,JSON.stringify(snapshot)]);
  sale.payment_condition_snapshot = snapshot;
  await recordAuditEvent(client, { eventType: AuditEventType.SALE_PAYMENT_SCHEDULE_APPLIED,
    entityType: 'sale', entityId: sale.id, required: true, metadata: { version: snapshot.version, reason } });
}

export async function createSalePaymentSchedule(database: DatabaseRuntime, saleId: string,
  choice: { conditionId: string; installments: number; paymentMethod: string }): Promise<SaleBalance> {
  return database.withTenantTransaction(async (client) => {
    const agencyId = getAgencyId();
    const sale = await lockSale(client,saleId);
    assertCollectible(sale);
    if (sale.payment_condition_snapshot) throw new ConflictError('Sale already has an applied condition');
    const found = await client.query<ConditionRow>(`SELECT ${conditionColumns} FROM payment_conditions c
      WHERE c.agency_id=$1 AND c.id=$2 AND c.active FOR SHARE OF c`, [agencyId,choice.conditionId]);
    if (!found.rows[0]) scheduleError('Payment condition not found or inactive');
    const condition = toCondition(found.rows[0]);
    if (!condition.paymentMethods.includes(choice.paymentMethod) ||
      (condition.categoryIds.length > 0 && (!sale.category_id || !condition.categoryIds.includes(sale.category_id)))) {
      scheduleError('Payment condition is not applicable to this sale or method');
    }
    if (condition.productIds.length > 0) {
      const items = await client.query<{ product_id: string | null }>(`SELECT product_id FROM sale_items
        WHERE agency_id=$1 AND sale_id=$2 AND status <> 'CANCELLED'`, [agencyId,saleId]);
      if (items.rows.length === 0 || items.rows.some((item) => !item.product_id || !condition.productIds.includes(item.product_id))) {
        scheduleError('Payment condition is not applicable to every sale item');
      }
    }
    const schedule = calculatePaymentSchedule(condition,Number(sale.total),choice.installments,
      { saleDate: sale.sale_date, travelStart: sale.travel_start_date });
    const existing = await receivables(client,saleId,true);
    if (existing.length > 1 || existing.some((r) => Number(r.paid) > 0 || r.status !== 'OPEN')) {
      throw new ConflictError('Existing receivables require explicit reconciliation');
    }
    for (const item of schedule) {
      const old = existing[item.installmentNumber - 1];
      if (old) {
        await client.query(`UPDATE receivables SET amount=$3,kind=$4,installment_number=$5,installment_count=$6,
          due_date=$7::date,due_at=$7::date::timestamp AT TIME ZONE 'UTC',updated_at=now() WHERE agency_id=$1 AND id=$2`,
          [agencyId,old.id,item.amount,item.kind,item.installmentNumber,item.installmentCount,item.dueDate]);
      } else {
        await client.query(`INSERT INTO receivables
          (agency_id,sale_id,customer_id,description,amount,kind,installment_number,installment_count,due_date,due_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$9::date::timestamp AT TIME ZONE 'UTC')`,
          [agencyId,saleId,sale.customer_id,condition.name,item.amount,item.kind,item.installmentNumber,item.installmentCount,item.dueDate]);
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
async function balanceInTransaction(client: TenantTransactionClient, sale: SaleRow): Promise<SaleBalance> {
  const [rows,payments] = await Promise.all([
    receivables(client,sale.id,false),
    client.query<{ id: string; amount: string; method: string | null; paid_at: Date; reversed: boolean }>(
      `SELECT p.id,p.amount::text,p.method,p.occurred_at AS paid_at,
              EXISTS(SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=p.agency_id AND spr.original_payment_id=p.id) AS reversed
         FROM payments p JOIN payment_allocations pa ON pa.agency_id=p.agency_id AND pa.payment_id=p.id
         JOIN receivables r ON r.agency_id=pa.agency_id AND r.id=pa.receivable_id
        WHERE p.agency_id=$1 AND r.sale_id=$2 AND p.direction='IN'
        GROUP BY p.id ORDER BY p.occurred_at,p.id`, [getAgencyId(),sale.id]),
  ]);
  return { ...balanceFromRows(sale,rows), payments: payments.rows.map((row) => ({
    id:row.id,amount:Number(row.amount),method:row.method,paid_at:row.paid_at.toISOString(),reversed:row.reversed,
  })) };
}
export async function getSaleBalance(database: DatabaseRuntime, saleId: string): Promise<SaleBalance> {
  return database.withTenantTransaction(async (client) => balanceInTransaction(client,await loadSale(client,saleId,false)));
}

export async function recordSalePayment(database: DatabaseRuntime, saleId: string, input: SalePaymentInput): Promise<{ paymentId: string; balance: SaleBalance }> {
  const amount = moneyCents(input.amount);
  if (amount <= 0) scheduleError('Payment must be positive');
  return database.withTenantTransaction(async (client) => {
    const agencyId = getAgencyId();
    const sale = await lockSale(client,saleId);
    const previous = await client.query<{ request: SalePaymentInput; response: { paymentId: string; balance: SaleBalance } }>(
      `SELECT request,response FROM sale_payment_requests WHERE agency_id=$1 AND sale_id=$2 AND idempotency_key=$3`,
      [agencyId,saleId,input.idempotency_key]);
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
    const payment = await client.query<{ id: string }>(`INSERT INTO payments
      (agency_id,direction,amount,occurred_at,method,reference,notes,created_by)
      VALUES ($1,'IN',$2,$3,$4,$5,$6,$7) RETURNING id`,
      [agencyId,input.amount,input.paid_at,input.method,input.reference,input.notes,getUserId()]);
    const paymentId = payment.rows[0]!.id;
    for (const allocation of allocations) {
      await client.query(`INSERT INTO payment_allocations (agency_id,payment_id,receivable_id,amount) VALUES ($1,$2,$3,$4)`,
        [agencyId,paymentId,allocation.id,allocation.cents / 100]);
      await client.query(`UPDATE receivables SET status=$3::"FinancialObligationStatus",updated_at=now() WHERE agency_id=$1 AND id=$2`,
        [agencyId,allocation.id,allocation.paid + allocation.cents === allocation.total ? 'PAID' : 'PARTIALLY_PAID']);
    }
    const settled = received + amount === moneyCents(Number(sale.total));
    if (settled) {
      const updated = await client.query<{ settled_at: Date }>(`UPDATE sales SET settled_at=(
        SELECT max(p.occurred_at) FROM payments p JOIN payment_allocations a ON a.agency_id=p.agency_id AND a.payment_id=p.id
        JOIN receivables r ON r.agency_id=a.agency_id AND r.id=a.receivable_id WHERE r.agency_id=$1 AND r.sale_id=$2),
        updated_at=now() WHERE agency_id=$1 AND id=$2 RETURNING settled_at`, [agencyId,saleId]);
      sale.settled_at = updated.rows[0]!.settled_at;
    }
    await recordAuditEvent(client, { eventType: AuditEventType.SALE_PAYMENT_RECORDED,entityType: 'sale',entityId: saleId,
      required: true,metadata: { paymentId,amount: input.amount } });
    // ADR-007: customer settlement may entitle agency revenue (never marks it received).
    await syncRevenueEntitlement(client, saleId);
    const response = { paymentId,balance: await balanceInTransaction(client,sale) };
    await client.query(`INSERT INTO sale_payment_requests (agency_id,sale_id,idempotency_key,payment_id,request,response)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [agencyId,saleId,input.idempotency_key,paymentId,JSON.stringify(input),JSON.stringify(response)]);
    return response;
  });
}

export async function reverseSalePayment(database: DatabaseRuntime, saleId: string, paymentId: string, reason: string): Promise<{ reversalPaymentId: string; balance: SaleBalance }> {
  const cleanReason = reason.trim();
  if (cleanReason.length < 1 || cleanReason.length > 500) scheduleError('A reversal reason of 1 to 500 characters is required');
  return database.withTenantTransaction(async (client) => {
    const agencyId = getAgencyId();
    await lockSale(client, saleId);
    const prior = await client.query<{ reversal_payment_id: string }>(
      'SELECT reversal_payment_id FROM sale_payment_reversals WHERE agency_id=$1 AND original_payment_id=$2',
      [agencyId, paymentId],
    );
    if (prior.rows[0]) {
      return { reversalPaymentId: prior.rows[0].reversal_payment_id, balance: await balanceInTransaction(client, await loadSale(client,saleId,false)) };
    }

    const allocations = await client.query<{ direction: string; amount: string; method: string | null; receivable_id: string | null; allocated: string | null; receivable_sale_id: string | null }>(
      `SELECT p.direction::text AS direction,p.amount::text,p.method,pa.receivable_id,pa.amount::text AS allocated,r.sale_id AS receivable_sale_id
       FROM payments p LEFT JOIN payment_allocations pa ON pa.agency_id=p.agency_id AND pa.payment_id=p.id
       LEFT JOIN receivables r ON r.agency_id=pa.agency_id AND r.id=pa.receivable_id
       WHERE p.agency_id=$1 AND p.id=$2 ORDER BY pa.receivable_id FOR UPDATE OF p`,
      [agencyId, paymentId],
    );
    const first = allocations.rows[0];
    if (!first) throw new NotFoundError('Sale payment not found');
    if (first.direction !== 'IN' || allocations.rows.some((row) => !row.receivable_id || row.receivable_sale_id !== saleId)) {
      throw new ConflictError('Only a customer receipt allocated exclusively to this sale can be reversed');
    }
    const amountCents = moneyCents(Number(first.amount));
    const allocatedCents = allocations.rows.reduce((sum, row) => sum + moneyCents(Number(row.allocated ?? 0)), 0);
    if (amountCents <= 0 || allocatedCents !== amountCents) throw new ConflictError('The receipt allocations do not reconcile to its total');

    const reversal = await client.query<{ id: string }>(
      `INSERT INTO payments (agency_id,direction,amount,occurred_at,method,reference,notes,created_by)
       VALUES ($1,'OUT',$2,now(),$3,$4,$5,$6) RETURNING id`,
      [agencyId, Number(first.amount), first.method, `Estorno do recebimento ${paymentId}`, cleanReason, getUserId()],
    );
    const reversalPaymentId = reversal.rows[0]!.id;
    await client.query(
      `INSERT INTO sale_payment_reversals (agency_id,sale_id,original_payment_id,reversal_payment_id,amount,allocations_snapshot,reason,created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [agencyId,saleId,paymentId,reversalPaymentId,Number(first.amount),JSON.stringify(allocations.rows.map((row) => ({ receivableId: row.receivable_id, amount: Number(row.allocated) }))),cleanReason,getUserId()],
    );

    const receivableIds = [...new Set(allocations.rows.map((row) => row.receivable_id!))];
    for (const receivableId of receivableIds) {
      await client.query(
        `UPDATE receivables r SET status=CASE WHEN net.paid<=0 THEN 'OPEN'::"FinancialObligationStatus"
          WHEN net.paid>=r.amount THEN 'PAID'::"FinancialObligationStatus" ELSE 'PARTIALLY_PAID'::"FinancialObligationStatus" END,
          updated_at=now()
         FROM (SELECT COALESCE(SUM(pa.amount) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=pa.agency_id AND spr.original_payment_id=pa.payment_id)),0) AS paid
          FROM payment_allocations pa WHERE pa.agency_id=$1 AND pa.receivable_id=$2) net
         WHERE r.agency_id=$1 AND r.id=$2`, [agencyId,receivableId]);
    }

    await client.query(
      `UPDATE sales s SET settled_at=CASE WHEN net.paid>=s.total THEN (
           SELECT max(p.occurred_at) FROM payments p JOIN payment_allocations pa ON pa.agency_id=p.agency_id AND pa.payment_id=p.id
           JOIN receivables r ON r.agency_id=pa.agency_id AND r.id=pa.receivable_id
           WHERE r.agency_id=s.agency_id AND r.sale_id=s.id AND p.direction='IN'
             AND NOT EXISTS (SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=p.agency_id AND spr.original_payment_id=p.id))
         ELSE NULL END,
         status=CASE WHEN net.paid<s.total AND s.status='PAID' THEN 'CONFIRMED'::"SaleStatus" ELSE s.status END,
         updated_at=now()
       FROM (SELECT COALESCE(SUM(pa.amount) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=pa.agency_id AND spr.original_payment_id=pa.payment_id)),0) AS paid
         FROM receivables r JOIN payment_allocations pa ON pa.agency_id=r.agency_id AND pa.receivable_id=r.id
         WHERE r.agency_id=$1 AND r.sale_id=$2 AND r.status<>'CANCELLED') net
       WHERE s.agency_id=$1 AND s.id=$2`, [agencyId,saleId]);

    const entries = await client.query<{ id: string; release_mode: string }>(
      `SELECT id,release_mode FROM commission_entries WHERE agency_id=$1 AND sale_id=$2 AND status<>'CANCELLED' ORDER BY id`,
      [agencyId,saleId],
    );
    for (const entry of entries.rows.filter((row) => row.release_mode !== 'LEGACY')) {
      await lockEntrySettlement(client,agencyId,entry.id);
      const state = await computeEntryRelease(client,agencyId,entry.id);
      if (moneyCents(state.paid) > moneyCents(state.released)) throw new CommissionPaidExceedsReleasedError();
    }
    await syncRevenueEntitlement(client,saleId);
    await recordAuditEvent(client,{eventType:AuditEventType.SALE_PAYMENT_REVERSED,entityType:'sale',entityId:saleId,required:true,
      metadata:{paymentId,amount:Number(first.amount),reason:cleanReason.slice(0,128)}});
    return { reversalPaymentId, balance: await balanceInTransaction(client,await loadSale(client,saleId,false)) };
  });
}

/** Re-anchor the applied condition only; paid and partially paid obligations retain their original dates. */
export async function reviseSalePaymentSchedule(database: DatabaseRuntime, saleId: string, reason: string): Promise<SaleBalance> {
  return database.withTenantTransaction(async (client) => {
    const sale = await lockSale(client,saleId);
    assertCollectible(sale);
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
        await client.query(`UPDATE receivables SET due_date=$3::date,due_at=$3::date::timestamp AT TIME ZONE 'UTC',updated_at=now()
          WHERE agency_id=$1 AND id=$2`, [getAgencyId(),row.id,dueDate]);
      }
      schedule.push({ ...proposed,dueDate });
    }
    await saveSnapshot(client,sale,{ ...old,version: old.version + 1,saleDate: sale.sale_date,
      travelStart: sale.travel_start_date,schedule },reason);
    return balanceInTransaction(client,sale);
  });
}
