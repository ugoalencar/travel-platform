import { cancelRevenueForSale, syncRevenueEntitlement } from './agency-revenue';
/**
 * Financial movement service: a payment row, its allocation to exactly one
 * receivable/payable, and the immutable ledger entry — always inside the
 * caller's tenant transaction (atomic with the receivable/payable update).
 */
import type { TenantClient } from './database';
import { resolveSaleReleaseMode } from './commission-release-policy';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { roundMoney } from './money';

export interface PaymentTarget {
  receivableId?: string;
  payableId?: string;
  receivables?: Array<{ receivableId: string; amount: number }>;
}

export interface CreatePaymentInput {
  schedulePayment?: boolean;
  paymentTimestamp?: string;
  direction: 'IN' | 'OUT';
  accountId: string;
  categoryId: string | null;
  amount: number;
  method: string | null;
  reference: string | null;
  paidAt: string;
  notes: string | null;
  description: string;
  target: PaymentTarget;
  financialPartyId?: string | null;
  saleId?: string | null;
  saleCostItemId?: string | null;
  paidByUserId?: string | null;
}

async function assertExists(
  client: TenantClient,
  tenantId: string,
  table: 'financial_accounts' | 'financial_categories',
  id: string,
  field: string,
): Promise<void> {
  const result = await client.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]);
  if ((result.rowCount ?? 0) === 0) {
    throw new ValidationError(`Field ${field} must reference an existing record of this tenant`);
  }
}

export async function recordPayment(
  client: TenantClient,
  tenantId: string,
  userId: string | null,
  input: CreatePaymentInput,
): Promise<string> {
  const hasReceivable = Boolean(input.target.receivableId) || Boolean(input.target.receivables?.length);
  const hasPayable = Boolean(input.target.payableId);
  if (hasReceivable === hasPayable) {
    throw new Error('recordPayment requires exactly one allocation target');
  }
  if (input.amount <= 0) {
    throw new ValidationError('Payment amount must be greater than zero');
  }

  const targets = input.target.receivables ?? [{ receivableId: input.target.receivableId, amount: input.amount }];
  if (input.target.receivables && (input.target.receivableId || input.target.payableId ||
      targets.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) !== Math.round(input.amount * 100) ||
      targets.some((row) => row.amount <= 0))) throw new ValidationError('Invalid payment allocations');
  if (!input.schedulePayment && hasReceivable) {
    const scheduled = await client.query(`SELECT 1 FROM receivables r JOIN sales s
      ON s.tenant_id=r.tenant_id AND s.id=r.sale_id WHERE r.tenant_id=$1 AND r.id=ANY($2::uuid[])
      AND s.payment_condition_snapshot IS NOT NULL`, [tenantId, targets.map((row) => row.receivableId)]);
    if (scheduled.rowCount) throw new ConflictError('Use a baixa idempotente da venda com cronograma aplicado');
  }

  await assertExists(client, tenantId, 'financial_accounts', input.accountId, 'account_id');
  if (input.categoryId) {
    await assertExists(client, tenantId, 'financial_categories', input.categoryId, 'category_id');
  }

  const payment = await client.query<{ id: string }>(
    `INSERT INTO payments (tenant_id, direction, account_id, category_id, amount, method,
                           reference, paid_at, notes, created_by, financial_party_id,
                           sale_id, sale_cost_item_id, paid_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      tenantId,
      input.direction,
      input.accountId,
      input.categoryId,
      input.amount,
      input.method,
      input.reference,
      input.paidAt,
      input.notes,
      userId,
      input.financialPartyId ?? null,
      input.saleId ?? null,
      input.saleCostItemId ?? null,
      input.paidByUserId ?? null,
    ],
  );
  const paymentId = payment.rows[0]!.id;

  if (input.paymentTimestamp) await client.query(
    'UPDATE payments SET payment_timestamp=$3::timestamptz WHERE tenant_id=$1 AND id=$2',
    [tenantId, paymentId, input.paymentTimestamp]);

  for (const target of targets) await client.query(
    `INSERT INTO payment_allocations (tenant_id, payment_id, receivable_id, payable_id, amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, paymentId, target.receivableId ?? null, input.target.payableId ?? null, target.amount],
  );

  await client.query(
    `INSERT INTO financial_transactions (tenant_id, account_id, category_id, payment_id,
                                         type, amount, occurred_at, description,
                                         financial_party_id, sale_id, sale_cost_item_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      tenantId,
      input.accountId,
      input.categoryId,
      paymentId,
      input.direction,
      input.amount,
      input.paidAt,
      input.description,
      input.financialPartyId ?? null,
      input.saleId ?? null,
      input.saleCostItemId ?? null,
    ],
  );

  return paymentId;
}

/**
 * After a receivable moves, realign the parent sale status:
 * every non-cancelled installment PAID -> sale PAID; some money received
 * -> PARTIALLY_PAID; nothing received (e.g. after a reversal) -> CONFIRMED.
 */
export async function refreshSaleStatus(
  client: TenantClient,
  tenantId: string,
  saleId: string,
): Promise<void> {
  await client.query('SELECT id FROM sales WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, saleId]);
  const result = await client.query<{ total: number; paid: number; touched: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'PAID')::int AS paid,
            count(*) FILTER (WHERE paid_amount > 0)::int AS touched
       FROM receivables
      WHERE tenant_id = $1 AND sale_id = $2 AND status <> 'CANCELLED'`,
    [tenantId, saleId],
  );
  const row = result.rows[0];
  if (!row || row.total === 0) return;
  const status =
    row.paid === row.total ? 'PAID' : row.touched > 0 ? 'PARTIALLY_PAID' : 'CONFIRMED';
  await client.query(
    `UPDATE sales SET status = $3,
        settled_at = CASE WHEN $3 = 'PAID' THEN COALESCE(settled_at, now()) ELSE NULL END, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status NOT IN ('CANCELLED', 'DRAFT')`,
    [tenantId, saleId, status],
  );
  await syncRevenueEntitlement(client, tenantId, saleId);
}

export interface ReversalResult {
  reversalPaymentId: string;
  amount: number;
  targetType: 'receivable' | 'payable';
  targetId: string;
  commissionId: string | null;
}

function reopenedStatus(paid: number): 'OPEN' | 'PARTIALLY_PAID' {
  return paid > 0 ? 'PARTIALLY_PAID' : 'OPEN';
}

/**
 * Lowers paid_amount on the allocated receivable/payable and reopens it.
 * Table name comes from a closed union, never from input.
 */
async function reopenAllocationTarget(
  client: TenantClient,
  tenantId: string,
  table: 'receivables' | 'payables',
  id: string,
  amount: number,
): Promise<{ sale_id?: string | null; commission_id?: string | null }> {
  const extra = table === 'receivables' ? 'sale_id' : 'commission_id';
  const result = await client.query<{
    paid_amount: string;
    sale_id?: string | null;
    commission_id?: string | null;
  }>(`SELECT paid_amount, ${extra} FROM ${table} WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [
    tenantId,
    id,
  ]);
  const row = result.rows[0];
  if (!row) throw new NotFoundError(`${table === 'receivables' ? 'Receivable' : 'Payable'} not found`);
  const newPaid = roundMoney(Number(row.paid_amount) - amount);
  if (newPaid < 0) throw new ConflictError('Reversal would make the paid amount negative');
  await client.query(
    `UPDATE ${table} SET paid_amount = $3, status = $4, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id, newPaid, reopenedStatus(newPaid)],
  );
  return row;
}

/**
 * A receipt that releases commission (release_mode ON_RECEIPT) cannot be reversed once the seller was
 * already paid above what the remaining receipts release: the overpayment would have no recovery entry
 * (spec decision D8 is still open). The caller's transaction rolls back, nothing is reversed.
 */
async function assertCommissionsStillCovered(client: TenantClient, tenantId: string, saleId: string): Promise<void> {
  const commissions = await client.query<{ id: string; paid: string }>(
    `SELECT sc.id, COALESCE(sum(p.paid_amount), 0)::text AS paid
       FROM seller_commissions sc
       JOIN payables p ON p.tenant_id = sc.tenant_id AND p.commission_id = sc.id AND p.status <> 'CANCELLED'
      WHERE sc.tenant_id = $1 AND sc.sale_id = $2 AND sc.release_mode = 'ON_RECEIPT'
      GROUP BY sc.id`,
    [tenantId, saleId],
  );
  for (const row of commissions.rows) {
    const release = await loadCommissionRelease(client, tenantId, row.id);
    if (roundMoney(Number(row.paid) - release.released) > 0) {
      throw new ConflictError(
        'This receipt releases commission that was already paid; reversing it would leave the commission overpaid',
      );
    }
  }
}

/**
 * Controlled reversal of a receipt (IN) or a payment (OUT). The original
 * payment and its ledger entry are never touched: a mirror payment in the
 * opposite direction and a mirror ledger entry are inserted, each pointing
 * at the original. The allocated receivable/payable gets its paid_amount
 * and status recomputed, and a commission paid through the payable goes
 * back to APPROVED. A payment can be reversed once and a reversal cannot
 * itself be reversed (uq_payments_reversal_of backs this in the database).
 */
export async function reversePayment(
  client: TenantClient,
  tenantId: string,
  userId: string | null,
  input: { paymentId: string; reason: string; reversedAt: string },
): Promise<ReversalResult> {
  // A receipt of a sale shares the release lock with the commission payment (see lockCommissionRelease).
  const receiptSale = await client.query<{ sale_id: string }>(
    `SELECT DISTINCT r.sale_id FROM payment_allocations a
       JOIN receivables r ON r.tenant_id = a.tenant_id AND r.id = a.receivable_id
      WHERE a.tenant_id = $1 AND a.payment_id = $2 AND r.sale_id IS NOT NULL ORDER BY r.sale_id`,
    [tenantId, input.paymentId],
  );
  for (const row of receiptSale.rows) {
    await lockCommissionRelease(client, tenantId, row.sale_id);
    await client.query('SELECT id FROM sales WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, row.sale_id]);
    await cancelRevenueForSale(client, tenantId, row.sale_id);
  }

  const original = await client.query<{
    id: string;
    direction: 'IN' | 'OUT';
    account_id: string;
    category_id: string | null;
    amount: string;
    method: string | null;
    reversal_of_payment_id: string | null;
  }>(
    `SELECT id, direction, account_id, category_id, amount, method, reversal_of_payment_id
       FROM payments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, input.paymentId],
  );
  const payment = original.rows[0];
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.reversal_of_payment_id) {
    throw new ConflictError('A reversal cannot be reversed');
  }
  const already = await client.query(
    `SELECT 1 FROM payments WHERE tenant_id = $1 AND reversal_of_payment_id = $2`,
    [tenantId, payment.id],
  );
  if ((already.rowCount ?? 0) > 0) {
    throw new ConflictError('Payment has already been reversed');
  }

  const allocations = await client.query<{
    receivable_id: string | null;
    payable_id: string | null;
    amount: string;
  }>(
    `SELECT receivable_id, payable_id, amount
       FROM payment_allocations WHERE tenant_id = $1 AND payment_id = $2`,
    [tenantId, payment.id],
  );
  const allocation = allocations.rows[0];
  if (!allocation || (allocations.rows.length > 1 && allocations.rows.some((row) => !row.receivable_id))) {
    throw new ConflictError('Payment has no single allocation to reverse');
  }
  const allocated = Number(allocation.amount);
  let commissionId: string | null = null;
  let targetType: ReversalResult['targetType'];
  let targetId: string;

  if (allocation.receivable_id) {
    targetType = 'receivable';
    targetId = allocation.receivable_id;
    const sales = new Set<string>();
    for (const row of allocations.rows) {
      const receivable = await reopenAllocationTarget(client, tenantId, 'receivables', row.receivable_id!, Number(row.amount));
      if (receivable.sale_id) sales.add(receivable.sale_id);
    }
    for (const saleId of sales) {
      await refreshSaleStatus(client, tenantId, saleId);
      await assertCommissionsStillCovered(client, tenantId, saleId);
    }
  } else {
    targetType = 'payable';
    targetId = allocation.payable_id!;
    const payable = await reopenAllocationTarget(client, tenantId, 'payables', targetId, allocated);
    if (payable.commission_id) {
      const reopened = await client.query(
        `UPDATE seller_commissions SET status = 'APPROVED', paid_at = NULL, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND status = 'PAID'`,
        [tenantId, payable.commission_id],
      );
      if ((reopened.rowCount ?? 0) > 0) commissionId = payable.commission_id;
    }
  }

  const reversal = await client.query<{ id: string }>(
    `INSERT INTO payments (tenant_id, direction, account_id, category_id, amount, method,
                           paid_at, notes, created_by, reversal_of_payment_id, reversal_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      tenantId,
      payment.direction === 'IN' ? 'OUT' : 'IN',
      payment.account_id,
      payment.category_id,
      payment.amount,
      payment.method,
      input.reversedAt,
      `Estorno: ${input.reason}`,
      userId,
      payment.id,
      input.reason,
    ],
  );
  const reversalPaymentId = reversal.rows[0]!.id;

  const ledger = await client.query<{
    id: string;
    account_id: string;
    category_id: string | null;
    type: 'IN' | 'OUT';
    amount: string;
    description: string;
  }>(
    `SELECT id, account_id, category_id, type, amount, description
       FROM financial_transactions WHERE tenant_id = $1 AND payment_id = $2`,
    [tenantId, payment.id],
  );
  for (const entry of ledger.rows) {
    await client.query(
      `INSERT INTO financial_transactions (tenant_id, account_id, category_id, payment_id, type,
                                           amount, occurred_at, description, reversal_of_transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId,
        entry.account_id,
        entry.category_id,
        reversalPaymentId,
        entry.type === 'IN' ? 'OUT' : 'IN',
        entry.amount,
        input.reversedAt,
        `Estorno: ${entry.description}`,
        entry.id,
      ],
    );
  }

  return { reversalPaymentId, amount: Number(payment.amount), targetType, targetId, commissionId };
}

/**
 * Serializes everything that moves the commission release of a sale: paying a commission payable and
 * reversing one of the sale's receipts. Callers take it BEFORE any row lock (a single total order, so no
 * deadlock between the two paths) and re-read release/paid state afterwards (READ COMMITTED sees the
 * other transaction's committed result).
 */
export function commissionReleaseLockKey(tenantId: string, saleId: string): string {
  return `commission-release:${tenantId}:${saleId}`;
}

export async function lockCommissionRelease(client: TenantClient, tenantId: string, saleId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [commissionReleaseLockKey(tenantId, saleId)]);
}

export interface CommissionRelease {
  release_mode: 'ON_SALE' | 'ON_RECEIPT' | 'BLOCKED';
  /** Only when BLOCKED: what configuration is missing. */
  missing?: string[];
  commission_amount: number;
  /** Amount the seller may be paid so far. */
  released: number;
}

/**
 * ON_SALE: the whole commission is releasable. ON_RECEIPT: proportional to
 * what was actually received of the sale (receivables paid / receivables
 * total, cancelled ones ignored); a reversed receipt lowers it again.
 */
export async function loadCommissionRelease(
  client: TenantClient,
  tenantId: string,
  commissionId: string,
): Promise<CommissionRelease> {
  const result = await client.query<{
    release_mode: 'ON_SALE' | 'ON_RECEIPT' | 'BLOCKED';
    commission_amount: string | null;
    payment_method_id: string | null;
    received: string;
    total: string;
  }>(
    `SELECT sc.release_mode, sc.commission_amount, s.payment_method_id,
            COALESCE(sum(r.paid_amount), 0)::text AS received,
            COALESCE(sum(r.amount), 0)::text AS total
       FROM seller_commissions sc
       JOIN sales s ON s.tenant_id = sc.tenant_id AND s.id = sc.sale_id
       LEFT JOIN receivables r ON r.tenant_id = sc.tenant_id AND r.sale_id = sc.sale_id AND r.status <> 'CANCELLED'
      WHERE sc.tenant_id = $1 AND sc.id = $2
      GROUP BY sc.id, s.payment_method_id`,
    [tenantId, commissionId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Commission not found');
  const amount = Number(row.commission_amount ?? 0);
  if (row.release_mode === 'BLOCKED') {
    // Re-resolve with the configuration as it is now: completing it unblocks the commission.
    const resolution = await resolveSaleReleaseMode(client, tenantId, row.payment_method_id);
    if (resolution.mode === 'BLOCKED') {
      await client.query(
        `UPDATE seller_commissions SET release_blocked_missing = $3 WHERE tenant_id = $1 AND id = $2`,
        [tenantId, commissionId, resolution.missing],
      );
      return { release_mode: 'BLOCKED', missing: resolution.missing, commission_amount: amount, released: 0 };
    }
    await client.query(
      `UPDATE seller_commissions SET release_mode = $3, release_blocked_missing = NULL WHERE tenant_id = $1 AND id = $2`,
      [tenantId, commissionId, resolution.mode],
    );
    row.release_mode = resolution.mode;
  }
  if (row.release_mode === 'ON_SALE') return { release_mode: 'ON_SALE', commission_amount: amount, released: amount };
  const total = Number(row.total);
  const ratio = total > 0 ? Math.min(Number(row.received) / total, 1) : 0;
  return { release_mode: 'ON_RECEIPT', commission_amount: amount, released: roundMoney(amount * ratio) };
}
