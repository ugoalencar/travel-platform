import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requirePermission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { recordPayment, refreshSaleStatus, reversePayment } from '../finance';
import { enqueueOutboxEvent } from '../outbox';
import { getTenantContext } from '../tenant-context';
import {
  optionalDate,
  optionalEnum,
  optionalString,
  optionalUuid,
  parseObjectBody,
  requiredDate,
  requiredPositiveAmount,
  requiredString,
  requiredUuid,
} from '../validation';

const MAX_PAGE_SIZE = 100;
const OPEN_STATUSES = ['OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;

interface ReceivableListItem {
  id: string;
  sale_id: string | null;
  installment_number: number | null;
  installment_count: number | null;
  customer_id: string | null;
  description: string;
  amount: string;
  paid_amount: string;
  due_at: string;
  status: string;
  customer_name: string | null;
  sale_number: string | null;
}

interface PayableListItem {
  id: string;
  category_id: string | null;
  seller_id: string | null;
  commission_id: string | null;
  financial_party_id: string | null;
  sale_id: string | null;
  sale_cost_item_id: string | null;
  supplier_name: string | null;
  description: string;
  amount: string;
  paid_amount: string;
  due_at: string;
  status: string;
  category_name: string | null;
  seller_name: string | null;
  financial_party_name: string | null;
  sale_number: string | null;
}

interface PaymentHistoryItem {
  id: string;
  direction: string;
  account_id: string;
  category_id: string | null;
  amount: string;
  method: string | null;
  reference: string | null;
  paid_at: string;
  notes: string | null;
  account_name: string | null;
  financial_party_id: string | null;
  financial_party_name: string | null;
  sale_id: string | null;
  sale_number: string | null;
  sale_cost_item_id: string | null;
  reversal_of_payment_id: string | null;
  reversal_reason: string | null;
  reversed_by_payment_id: string | null;
}

interface TransactionItem {
  id: string;
  account_id: string;
  category_id: string | null;
  payment_id: string | null;
  type: string;
  amount: string;
  occurred_at: string;
  description: string;
  created_at: string;
  account_name: string | null;
  financial_party_id: string | null;
  financial_party_name: string | null;
  sale_id: string | null;
  sale_number: string | null;
  sale_cost_item_id: string | null;
}

interface PaymentBodyFields {
  accountId: string;
  amount: number | null; // null = full remaining balance
  method: string | null;
  reference: string | null;
  paidAt: string;
  notes: string | null;
}

function parsePaymentBody(body: Record<string, unknown>): PaymentBodyFields {
  return {
    accountId: requiredUuid(body, 'account_id'),
    amount: 'amount' in body ? requiredPositiveAmount(body, 'amount') : null,
    method: optionalString(body, 'method', { max: 80 }),
    reference: optionalString(body, 'reference', { max: 120 }),
    paidAt: optionalDate(body, 'paid_at') ?? new Date().toISOString().slice(0, 10),
    notes: optionalString(body, 'notes', { max: 2000 }),
  };
}

async function loadReceivableForUpdate(
  client: TenantClient,
  tenantId: string,
  id: string,
): Promise<{
  id: string;
  sale_id: string | null;
  description: string;
  amount: string;
  paid_amount: string;
  status: string;
}> {
  const result = await client.query<{
    id: string;
    sale_id: string | null;
    description: string;
    amount: string;
    paid_amount: string;
    status: string;
  }>(
    `SELECT id, sale_id, description, amount, paid_amount, status
       FROM receivables WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Receivable not found');
  return row;
}

export function registerCashFlowRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  // ---------------------------------------------------------- receivables
  app.get('/receivables', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.read');
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));

    const conditions: string[] = ['r.tenant_id = $1'];
    const params: unknown[] = [context.tenantId];

    function addCondition(column: string, operator: string, value: unknown): void {
      params.push(value);
      conditions.push(`${column} ${operator} $${params.length}`);
    }

    if (query.status) {
      addCondition('r.status', '=', optionalEnum({ status: query.status }, 'status', OPEN_STATUSES));
    }
    if (query.customer_id) {
      addCondition('r.customer_id', '=', optionalUuid({ customer_id: query.customer_id }, 'customer_id'));
    }
    if (query.from) {
      addCondition('r.due_at', '>=', optionalDate({ from: query.from }, 'from'));
    }
    if (query.to) {
      addCondition('r.due_at', '<=', optionalDate({ to: query.to }, 'to'));
    }
    if (query.overdue === 'true') {
      conditions.push(`r.due_at < CURRENT_DATE AND r.status IN ('OPEN', 'PARTIALLY_PAID')`);
    }
    const where = conditions.join(' AND ');

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM receivables r WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<ReceivableListItem>(
        `SELECT r.id, r.sale_id, r.installment_number, r.installment_count, r.customer_id,
                r.description, r.amount, r.paid_amount, r.due_at, r.status,
                c.name AS customer_name, s.sale_number
           FROM receivables r
           LEFT JOIN customers c ON c.tenant_id = r.tenant_id AND c.id = r.customer_id
           LEFT JOIN sales s ON s.tenant_id = r.tenant_id AND s.id = r.sale_id
          WHERE ${where}
          ORDER BY r.due_at, r.installment_number NULLS LAST
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });

    return {
      items: result.items.map((row) => ({
        ...row,
        amount: Number(row.amount),
        paid_amount: Number(row.paid_amount),
        remaining_amount: Math.round((Number(row.amount) - Number(row.paid_amount)) * 100) / 100,
      })),
      page,
      pageSize,
      total: result.total,
    };
  });

  app.post('/receivables/:id/receive', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.manage');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);
    const payment = parsePaymentBody(body);

    await database.withTenantTransaction(async (client) => {
      const receivable = await loadReceivableForUpdate(client, context.tenantId, id);
      if (receivable.status === 'CANCELLED') {
        throw new ConflictError('A cancelled receivable cannot receive payments');
      }
      const total = Number(receivable.amount);
      const alreadyPaid = Number(receivable.paid_amount);
      const remaining = Math.round((total - alreadyPaid) * 100) / 100;
      if (remaining <= 0) {
        throw new ConflictError('Receivable is already fully paid');
      }
      const amount = payment.amount ?? remaining;
      if (amount > remaining) {
        throw new ValidationError(
          `Payment amount exceeds the remaining balance (${remaining.toFixed(2)})`,
        );
      }

      const newPaid = Math.round((alreadyPaid + amount) * 100) / 100;
      const newStatus = newPaid >= total ? 'PAID' : 'PARTIALLY_PAID';
      await client.query(
        `UPDATE receivables SET paid_amount = $3, status = $4, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id, newPaid, newStatus],
      );

      await recordPayment(client, context.tenantId, context.userId, {
        direction: 'IN',
        accountId: payment.accountId,
        categoryId: optionalUuid(body, 'category_id'),
        amount,
        method: payment.method,
        reference: payment.reference,
        paidAt: payment.paidAt,
        notes: payment.notes,
        description: receivable.description,
        target: { receivableId: id },
      });

      if (receivable.sale_id) {
        await refreshSaleStatus(client, context.tenantId, receivable.sale_id);
      }

      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.PAYMENT_RECEIVED,
        entityType: 'receivable',
        entityId: id,
        metadata: { amount },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'PAYMENT_RECEIVED',
        entityType: 'receivable',
        entityId: id,
        payload: { amount, status: newStatus },
      });
    });

    return { ok: true };
  });

  // ---------------------------------------------------------- payables
  app.get('/payables', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.read');
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));

    const conditions: string[] = ['p.tenant_id = $1'];
    const params: unknown[] = [context.tenantId];

    function addCondition(column: string, operator: string, value: unknown): void {
      params.push(value);
      conditions.push(`${column} ${operator} $${params.length}`);
    }

    if (query.status) {
      addCondition('p.status', '=', optionalEnum({ status: query.status }, 'status', OPEN_STATUSES));
    }
    if (query.from) {
      addCondition('p.due_at', '>=', optionalDate({ from: query.from }, 'from'));
    }
    if (query.to) {
      addCondition('p.due_at', '<=', optionalDate({ to: query.to }, 'to'));
    }
    const where = conditions.join(' AND ');

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM payables p WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<PayableListItem>(
        `SELECT p.id, p.category_id, p.seller_id, p.commission_id, p.financial_party_id,
                p.sale_id, p.sale_cost_item_id, p.supplier_name,
                p.description, p.amount, p.paid_amount, p.due_at, p.status,
                fc.name AS category_name, se.name AS seller_name,
                fp.name AS financial_party_name, s.sale_number
           FROM payables p
           LEFT JOIN financial_categories fc ON fc.tenant_id = p.tenant_id AND fc.id = p.category_id
           LEFT JOIN sellers se ON se.tenant_id = p.tenant_id AND se.id = p.seller_id
           LEFT JOIN financial_parties fp ON fp.tenant_id = p.tenant_id AND fp.id = p.financial_party_id
           LEFT JOIN sales s ON s.tenant_id = p.tenant_id AND s.id = p.sale_id
          WHERE ${where}
          ORDER BY p.due_at
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });

    return {
      items: result.items.map((row) => ({
        ...row,
        amount: Number(row.amount),
        paid_amount: Number(row.paid_amount),
      })),
      page,
      pageSize,
      total: result.total,
    };
  });

  app.post('/payables', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.manage');
    const body = parseObjectBody(request.body);

    const description = requiredString(body, 'description', { max: 500 });
    const amount = requiredPositiveAmount(body, 'amount');
    const dueAt = requiredDate(body, 'due_at');
    const categoryId = optionalUuid(body, 'category_id');
    const sellerId = optionalUuid(body, 'seller_id');
    const commissionId = optionalUuid(body, 'commission_id');

    const payable = await database.withTenantTransaction(async (client) => {
      if (categoryId) {
        const check = await client.query(
          `SELECT 1 FROM financial_categories WHERE tenant_id = $1 AND id = $2`,
          [context.tenantId, categoryId],
        );
        if ((check.rowCount ?? 0) === 0) {
          throw new ValidationError('Field category_id must reference an existing record of this tenant');
        }
      }
      if (sellerId) {
        const check = await client.query(`SELECT 1 FROM sellers WHERE tenant_id = $1 AND id = $2`, [
          context.tenantId,
          sellerId,
        ]);
        if ((check.rowCount ?? 0) === 0) {
          throw new ValidationError('Field seller_id must reference an existing record of this tenant');
        }
      }
      const result = await client.query<{ id: string }>(
        `INSERT INTO payables (tenant_id, category_id, seller_id, commission_id, supplier_name,
                               description, amount, due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          context.tenantId,
          categoryId,
          sellerId,
          commissionId,
          optionalString(body, 'supplier_name', { max: 200 }),
          description,
          amount,
          dueAt,
        ],
      );
      const created = result.rows[0]!;
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.EXPENSE_CREATED,
        entityType: 'payable',
        entityId: created.id,
        metadata: { amount },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'PAYABLE_CREATED',
        entityType: 'payable',
        entityId: created.id,
        payload: { amount, description },
      });
      return created;
    });

    reply.code(201);
    return { payable: { id: payable.id, status: 'OPEN', amount } };
  });

  // Paying money out needs finance.manage; a commission payable also needs
  // commissions.pay (checked once the payable is loaded).
  app.post('/payables/:id/pay', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.manage');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);
    const payment = parsePaymentBody(body);

    await database.withTenantTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        commission_id: string | null;
        financial_party_id: string | null;
        sale_id: string | null;
        sale_cost_item_id: string | null;
        description: string;
        amount: string;
        paid_amount: string;
        status: string;
      }>(
        `SELECT id, commission_id, financial_party_id, sale_id, sale_cost_item_id,
                description, amount, paid_amount, status
           FROM payables WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [context.tenantId, id],
      );
      const payable = result.rows[0];
      if (!payable) throw new NotFoundError('Payable not found');
      if (payable.commission_id) requirePermission(context, 'commissions.pay');
      if (payable.status === 'CANCELLED') {
        throw new ConflictError('A cancelled payable cannot be paid');
      }
      const total = Number(payable.amount);
      const alreadyPaid = Number(payable.paid_amount);
      const remaining = Math.round((total - alreadyPaid) * 100) / 100;
      if (remaining <= 0) {
        throw new ConflictError('Payable is already fully paid');
      }
      const amount = payment.amount ?? remaining;
      if (amount > remaining) {
        throw new ValidationError(
          `Payment amount exceeds the remaining balance (${remaining.toFixed(2)})`,
        );
      }

      const newPaid = Math.round((alreadyPaid + amount) * 100) / 100;
      const newStatus = newPaid >= total ? 'PAID' : 'PARTIALLY_PAID';
      await client.query(
        `UPDATE payables SET paid_amount = $3, status = $4, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id, newPaid, newStatus],
      );

      await recordPayment(client, context.tenantId, context.userId, {
        direction: 'OUT',
        accountId: payment.accountId,
        categoryId: optionalUuid(body, 'category_id'),
        amount,
        method: payment.method,
        reference: payment.reference,
        paidAt: payment.paidAt,
        notes: payment.notes,
        description: payable.description,
        target: { payableId: id },
        financialPartyId: payable.financial_party_id,
        saleId: payable.sale_id,
        saleCostItemId: payable.sale_cost_item_id,
        paidByUserId: context.userId,
      });

      if (payable.commission_id) {
        await client.query(
          `UPDATE seller_commissions SET status = 'PAID', paid_at = now(), updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND status IN ('APPROVED', 'PENDING')`,
          [context.tenantId, payable.commission_id],
        );
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.COMMISSION_PAID,
          entityType: 'seller_commission',
          entityId: payable.commission_id,
          metadata: { amount },
        });
        await enqueueOutboxEvent(client, {
          eventType: 'COMMISSION_PAID',
          entityType: 'seller_commission',
          entityId: payable.commission_id,
          payload: { amount },
        });
      }

      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.EXPENSE_PAID,
        entityType: 'payable',
        entityId: id,
        metadata: { amount, stage: 'paid' },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'EXPENSE_PAID',
        entityType: 'payable',
        entityId: id,
        payload: { amount },
      });
    });

    return { ok: true };
  });

  // ---------------------------------------------------------- reversal
  app.post('/payments/:id/reverse', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.manage');
    const id = requiredUuid({ id: (request.params as { id: string }).id }, 'id');
    const body = parseObjectBody(request.body);
    const reason = requiredString(body, 'reason', { max: 500 });
    if (reason.length < 3) throw new ValidationError('Field reason must be at least 3 characters');
    const reversedAt = optionalDate(body, 'reversed_at') ?? new Date().toISOString().slice(0, 10);

    const result = await database.withTenantTransaction(async (client) => {
      const reversal = await reversePayment(client, context.tenantId, context.userId, {
        paymentId: id,
        reason,
        reversedAt,
      });
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.PAYMENT_REVERSED,
        entityType: 'payment',
        entityId: id,
        metadata: {
          reversal_payment_id: reversal.reversalPaymentId,
          amount: reversal.amount,
          target_type: reversal.targetType,
          target_id: reversal.targetId,
          commission_id: reversal.commissionId,
          reason,
        },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'PAYMENT_REVERSED',
        entityType: 'payment',
        entityId: id,
        payload: {
          reversal_payment_id: reversal.reversalPaymentId,
          amount: reversal.amount,
          target_type: reversal.targetType,
          target_id: reversal.targetId,
        },
      });
      return reversal;
    });

    reply.code(201);
    return {
      reversal: {
        id: result.reversalPaymentId,
        reversal_of_payment_id: id,
        amount: result.amount,
        target_type: result.targetType,
        target_id: result.targetId,
      },
    };
  });

  // ---------------------------------------------------------- history
  app.get('/payments', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.read');
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));

    const conditions: string[] = ['p.tenant_id = $1'];
    const params: unknown[] = [context.tenantId];

    function addCondition(column: string, operator: string, value: unknown): void {
      params.push(value);
      conditions.push(`${column} ${operator} $${params.length}`);
    }

    if (query.direction) {
      addCondition('p.direction', '=', optionalEnum({ direction: query.direction }, 'direction', ['IN', 'OUT'] as const));
    }
    if (query.from) {
      addCondition('p.paid_at', '>=', optionalDate({ from: query.from }, 'from'));
    }
    if (query.to) {
      addCondition('p.paid_at', '<=', optionalDate({ to: query.to }, 'to'));
    }
    const where = conditions.join(' AND ');

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM payments p WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<PaymentHistoryItem>(
        `SELECT p.id, p.direction, p.account_id, p.category_id, p.amount, p.method,
                p.reference, p.paid_at, p.notes, a.name AS account_name,
                p.financial_party_id, fp.name AS financial_party_name,
                p.sale_id, s.sale_number, p.sale_cost_item_id,
                p.reversal_of_payment_id, p.reversal_reason,
                (SELECT r.id FROM payments r
                  WHERE r.tenant_id = p.tenant_id AND r.reversal_of_payment_id = p.id) AS reversed_by_payment_id
           FROM payments p
           LEFT JOIN financial_accounts a ON a.tenant_id = p.tenant_id AND a.id = p.account_id
           LEFT JOIN financial_parties fp ON fp.tenant_id = p.tenant_id AND fp.id = p.financial_party_id
           LEFT JOIN sales s ON s.tenant_id = p.tenant_id AND s.id = p.sale_id
          WHERE ${where}
          ORDER BY p.paid_at DESC, p.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });

    return {
      items: result.items.map((row) => ({
        ...row,
        amount: Number(row.amount),
      })),
      page,
      pageSize,
      total: result.total,
    };
  });

  app.get('/financial-transactions', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.read');
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));

    const conditions: string[] = ['t.tenant_id = $1'];
    const params: unknown[] = [context.tenantId];

    function addCondition(column: string, operator: string, value: unknown): void {
      params.push(value);
      conditions.push(`${column} ${operator} $${params.length}`);
    }

    if (query.type) {
      addCondition('t.type', '=', optionalEnum({ type: query.type }, 'type', ['IN', 'OUT'] as const));
    }
    if (query.account_id) {
      addCondition('t.account_id', '=', optionalUuid({ account_id: query.account_id }, 'account_id'));
    }
    if (query.from) {
      addCondition('t.occurred_at', '>=', optionalDate({ from: query.from }, 'from'));
    }
    if (query.to) {
      addCondition('t.occurred_at', '<=', optionalDate({ to: query.to }, 'to'));
    }
    const where = conditions.join(' AND ');

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM financial_transactions t WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<TransactionItem>(
        `SELECT t.id, t.account_id, t.category_id, t.payment_id, t.type, t.amount,
                t.occurred_at, t.description, t.created_at, a.name AS account_name,
                t.financial_party_id, fp.name AS financial_party_name,
                t.sale_id, s.sale_number, t.sale_cost_item_id
           FROM financial_transactions t
           LEFT JOIN financial_accounts a ON a.tenant_id = t.tenant_id AND a.id = t.account_id
           LEFT JOIN financial_parties fp ON fp.tenant_id = t.tenant_id AND fp.id = t.financial_party_id
           LEFT JOIN sales s ON s.tenant_id = t.tenant_id AND s.id = t.sale_id
          WHERE ${where}
          ORDER BY t.occurred_at DESC, t.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });

    return {
      items: result.items.map((row) => ({
        ...row,
        amount: Number(row.amount),
      })),
      page,
      pageSize,
      total: result.total,
    };
  });
}
