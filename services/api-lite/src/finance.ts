/**
 * Financial movement service: a payment row, its allocation to exactly one
 * receivable/payable, and the immutable ledger entry — always inside the
 * caller's tenant transaction (atomic with the receivable/payable update).
 */
import type { TenantClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';

export interface PaymentTarget {
  receivableId?: string;
  payableId?: string;
}

export interface CreatePaymentInput {
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
  const hasReceivable = Boolean(input.target.receivableId);
  const hasPayable = Boolean(input.target.payableId);
  if (hasReceivable === hasPayable) {
    throw new Error('recordPayment requires exactly one allocation target');
  }
  if (input.amount <= 0) {
    throw new ValidationError('Payment amount must be greater than zero');
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

  await client.query(
    `INSERT INTO payment_allocations (tenant_id, payment_id, receivable_id, payable_id, amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, paymentId, input.target.receivableId ?? null, input.target.payableId ?? null, input.amount],
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
    `UPDATE sales SET status = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status NOT IN ('CANCELLED', 'DRAFT')`,
    [tenantId, saleId, status],
  );
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
  const newPaid = Math.round((Number(row.paid_amount) - amount) * 100) / 100;
  if (newPaid < 0) throw new ConflictError('Reversal would make the paid amount negative');
  await client.query(
    `UPDATE ${table} SET paid_amount = $3, status = $4, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id, newPaid, reopenedStatus(newPaid)],
  );
  return row;
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
  if (allocations.rows.length !== 1 || !allocation) {
    throw new ConflictError('Payment has no single allocation to reverse');
  }
  const allocated = Number(allocation.amount);
  let commissionId: string | null = null;
  let targetType: ReversalResult['targetType'];
  let targetId: string;

  if (allocation.receivable_id) {
    targetType = 'receivable';
    targetId = allocation.receivable_id;
    const receivable = await reopenAllocationTarget(client, tenantId, 'receivables', targetId, allocated);
    if (receivable.sale_id) await refreshSaleStatus(client, tenantId, receivable.sale_id);
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
