import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import { requireRole } from '../roles';
import { getTenantContext } from '../tenant-context';
import {
  optionalDate,
  optionalEnum,
  optionalString,
  optionalUuid,
  parseObjectBody,
  requiredAmount,
  requiredDate,
  requiredString,
} from '../validation';

const MAX_PAGE_SIZE = 100;
const MAX_INSTALLMENTS = 999;
const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;

// pg returns DATE columns as 'YYYY-MM-DD' strings — no to_char needed.
const SELECT_SALE = `id, sale_number, customer_id, seller_id, category_id, description,
  gross_amount, cost_amount, margin_amount, sale_date, due_date,
  installment_count, status, payment_method_id, notes, created_at, updated_at`;

interface SaleRow {
  id: string;
  sale_number: string;
  customer_id: string;
  seller_id: string;
  category_id: string;
  description: string | null;
  gross_amount: string;
  cost_amount: string;
  margin_amount: string;
  sale_date: string;
  due_date: string;
  installment_count: number;
  status: string;
  payment_method_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SaleListItem extends SaleRow {
  customer_name: string;
  seller_name: string;
  category_name: string;
  payment_method_name: string | null;
}

function computeMargin(gross: number, cost: number): number {
  if (cost > gross) {
    throw new ValidationError('Field cost_amount must not exceed gross_amount');
  }
  return Math.round((gross - cost) * 100) / 100;
}

function serializeSale(row: SaleRow) {
  return {
    ...row,
    gross_amount: Number(row.gross_amount),
    cost_amount: Number(row.cost_amount),
    margin_amount: Number(row.margin_amount),
    installment_count: Number(row.installment_count),
  };
}

function serializeListItem(row: SaleListItem) {
  const { customer_name, seller_name, category_name, payment_method_name, ...fields } = row;
  const sale = serializeSale(fields);
  return {
    ...sale,
    customer: { id: sale.customer_id, name: customer_name },
    seller: { id: sale.seller_id, name: seller_name },
    category: { id: sale.category_id, name: category_name },
    payment_method: row.payment_method_id
      ? { id: row.payment_method_id, name: payment_method_name }
      : null,
  };
}

function parseInstallmentCount(body: Record<string, unknown>): number {
  const raw = body.installment_count === undefined ? 1 : Number(body.installment_count);
  if (!Number.isInteger(raw) || raw < 1 || raw > MAX_INSTALLMENTS) {
    throw new ValidationError(
      `Field installment_count must be an integer between 1 and ${MAX_INSTALLMENTS}`,
    );
  }
  return raw;
}

async function assertReferenceExists(
  client: TenantClient,
  tenantId: string,
  table: 'customers' | 'sellers' | 'sale_categories' | 'payment_methods',
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

/** Per-tenant sale number: VENDA-000001. UPDATE ... RETURNING takes the row lock. */
async function nextSaleNumber(client: TenantClient, tenantId: string): Promise<string> {
  await client.query(
    `INSERT INTO tenant_sequences (tenant_id, key) VALUES ($1, 'sale_number') ON CONFLICT DO NOTHING`,
    [tenantId],
  );
  const result = await client.query<{ value: string }>(
    `UPDATE tenant_sequences SET next_value = next_value + 1
      WHERE tenant_id = $1 AND key = 'sale_number'
      RETURNING next_value - 1 AS value`,
    [tenantId],
  );
  return `VENDA-${String(result.rows[0]!.value).padStart(6, '0')}`;
}

interface SaleRelations {
  customer_id: string;
  seller_id: string;
  category_id: string;
  payment_method_id: string | null;
}

async function validateSaleRelations(
  client: TenantClient,
  tenantId: string,
  relations: SaleRelations,
): Promise<void> {
  await assertReferenceExists(client, tenantId, 'customers', relations.customer_id, 'customer_id');
  await assertReferenceExists(client, tenantId, 'sellers', relations.seller_id, 'seller_id');
  await assertReferenceExists(client, tenantId, 'sale_categories', relations.category_id, 'category_id');
  if (relations.payment_method_id) {
    await assertReferenceExists(
      client,
      tenantId,
      'payment_methods',
      relations.payment_method_id,
      'payment_method_id',
    );
  }
}

async function loadSaleForUpdate(
  client: TenantClient,
  tenantId: string,
  saleId: string,
): Promise<SaleRow> {
  const result = await client.query<SaleRow>(
    `SELECT ${SELECT_SALE} FROM sales WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, saleId],
  );
  const sale = result.rows[0];
  if (!sale) throw new NotFoundError('Sale not found');
  return sale;
}

export function registerSaleRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/sales', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));

    const conditions: string[] = ['s.tenant_id = $1'];
    const params: unknown[] = [context.tenantId];

    function addCondition(column: string, operator: string, value: unknown): void {
      params.push(value);
      conditions.push(`${column} ${operator} $${params.length}`);
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      params.push(term);
      const p = `$${params.length}`;
      conditions.push(
        `(s.sale_number ILIKE ${p} OR s.description ILIKE ${p}
          OR c.name ILIKE ${p} OR se.name ILIKE ${p})`,
      );
    }
    if (query.status) {
      addCondition('s.status', '=', optionalEnum({ status: query.status }, 'status', SALE_STATUSES));
    }
    if (query.seller_id) {
      addCondition('s.seller_id', '=', optionalUuid({ seller_id: query.seller_id }, 'seller_id'));
    }
    if (query.customer_id) {
      addCondition('s.customer_id', '=', optionalUuid({ customer_id: query.customer_id }, 'customer_id'));
    }
    if (query.from) {
      addCondition('s.sale_date', '>=', optionalDate({ from: query.from }, 'from'));
    }
    if (query.to) {
      addCondition('s.sale_date', '<=', optionalDate({ to: query.to }, 'to'));
    }
    const where = conditions.join(' AND ');

    const joins = `FROM sales s
      JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
      JOIN sellers se ON se.tenant_id = s.tenant_id AND se.id = s.seller_id
      JOIN sale_categories sc ON sc.tenant_id = s.tenant_id AND sc.id = s.category_id
      LEFT JOIN payment_methods pm ON pm.tenant_id = s.tenant_id AND pm.id = s.payment_method_id`;

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total ${joins} WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<SaleListItem>(
        `SELECT s.id, s.sale_number, s.customer_id, s.seller_id, s.category_id, s.description,
                s.gross_amount, s.cost_amount, s.margin_amount, s.sale_date, s.due_date,
                s.installment_count, s.status, s.payment_method_id, s.notes,
                s.created_at, s.updated_at,
                c.name AS customer_name, se.name AS seller_name, sc.name AS category_name,
                pm.name AS payment_method_name
           ${joins}
          WHERE ${where}
          ORDER BY s.sale_date DESC, s.sale_number DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });

    return {
      items: result.items.map(serializeListItem),
      page,
      pageSize,
      total: result.total,
    };
  });

  app.get('/sales/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };

    return database.withTenantTransaction(async (client) => {
      const saleResult = await client.query<SaleRow>(
        `SELECT ${SELECT_SALE} FROM sales WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      );
      const sale = saleResult.rows[0];
      if (!sale) throw new NotFoundError('Sale not found');

      const receivablesResult = await client.query<{
        id: string;
        installment_number: number;
        installment_count: number;
        description: string;
        amount: string;
        paid_amount: string;
        due_at: string;
        status: string;
      }>(
        `SELECT id, installment_number, installment_count, description, amount, paid_amount,
                due_at, status
           FROM receivables WHERE tenant_id = $1 AND sale_id = $2
          ORDER BY installment_number NULLS LAST, due_at`,
        [context.tenantId, id],
      );

      const commissionResult = await client.query<{
        id: string;
        status: string;
        calculation_type: string | null;
        calculation_base: string | null;
        percentage: string | null;
        fixed_amount: string | null;
        commission_amount: string | null;
        paid_at: string | null;
        notes: string | null;
      }>(
        `SELECT id, status, calculation_type, calculation_base, percentage, fixed_amount,
                commission_amount, paid_at, notes
           FROM seller_commissions
          WHERE tenant_id = $1 AND sale_id = $2
          ORDER BY (status = 'CANCELLED'), created_at
          LIMIT 1`,
        [context.tenantId, id],
      );

      const commission = commissionResult.rows[0];
      return {
        sale: serializeSale(sale),
        receivables: receivablesResult.rows.map((r) => ({
          ...r,
          amount: Number(r.amount),
          paid_amount: Number(r.paid_amount),
          installment_number: Number(r.installment_number),
          installment_count: Number(r.installment_count),
        })),
        commission: commission
          ? {
              ...commission,
              calculation_base: commission.calculation_base ? Number(commission.calculation_base) : null,
              percentage: commission.percentage ? Number(commission.percentage) : null,
              fixed_amount: commission.fixed_amount ? Number(commission.fixed_amount) : null,
              commission_amount: commission.commission_amount
                ? Number(commission.commission_amount)
                : null,
            }
          : null,
      };
    });
  });

  app.post('/sales', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const body = parseObjectBody(request.body);

    const relations: SaleRelations = {
      customer_id: requiredString(body, 'customer_id', { max: 36 }),
      seller_id: requiredString(body, 'seller_id', { max: 36 }),
      category_id: requiredString(body, 'category_id', { max: 36 }),
      payment_method_id: optionalUuid(body, 'payment_method_id'),
    };
    const gross = requiredAmount(body, 'gross_amount');
    const cost = 'cost_amount' in body ? requiredAmount(body, 'cost_amount') : 0;
    const margin = computeMargin(gross, cost);
    const saleDate = optionalDate(body, 'sale_date') ?? new Date().toISOString().slice(0, 10);
    const dueDate = requiredDate(body, 'due_date');
    const installmentCount = parseInstallmentCount(body);

    const sale = await database.withTenantTransaction(async (client) => {
      await validateSaleRelations(client, context.tenantId, relations);
      const saleNumber = await nextSaleNumber(client, context.tenantId);
      const result = await client.query<SaleRow>(
        `INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number,
                            description, gross_amount, cost_amount, margin_amount,
                            sale_date, due_date, installment_count, payment_method_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING ${SELECT_SALE}`,
        [
          context.tenantId,
          relations.customer_id,
          relations.seller_id,
          relations.category_id,
          saleNumber,
          optionalString(body, 'description', { max: 2000 }),
          gross,
          cost,
          margin,
          saleDate,
          dueDate,
          installmentCount,
          relations.payment_method_id,
          optionalString(body, 'notes', { max: 2000 }),
        ],
      );
      const created = result.rows[0]!;
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_CREATED,
        entityType: 'sale',
        entityId: created.id,
        metadata: { sale_number: created.sale_number },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_CREATED',
        entityType: 'sale',
        entityId: created.id,
        payload: { sale_number: created.sale_number },
      });
      return created;
    });

    reply.code(201);
    return { sale: serializeSale(sale) };
  });

  app.patch('/sales/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);

    if ('status' in body) {
      throw new ValidationError('Status changes go through confirm/cancel');
    }

    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];

    function set(column: string, value: unknown): void {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }

    if ('customer_id' in body) set('customer_id', requiredString(body, 'customer_id', { max: 36 }));
    if ('seller_id' in body) set('seller_id', requiredString(body, 'seller_id', { max: 36 }));
    if ('category_id' in body) set('category_id', requiredString(body, 'category_id', { max: 36 }));
    if ('payment_method_id' in body) set('payment_method_id', optionalUuid(body, 'payment_method_id'));
    if ('description' in body) set('description', optionalString(body, 'description', { max: 2000 }));
    if ('notes' in body) set('notes', optionalString(body, 'notes', { max: 2000 }));
    if ('sale_date' in body) {
      const saleDate = optionalDate(body, 'sale_date');
      if (saleDate === null) throw new ValidationError('Field sale_date is required');
      set('sale_date', saleDate);
    }
    if ('due_date' in body) set('due_date', requiredDate(body, 'due_date'));
    if ('installment_count' in body) set('installment_count', parseInstallmentCount(body));

    const needsAmounts = 'gross_amount' in body || 'cost_amount' in body;
    if (needsAmounts) {
      set('gross_amount', requiredAmount(body, 'gross_amount'));
      set('cost_amount', 'cost_amount' in body ? requiredAmount(body, 'cost_amount') : 0);
    }

    if (updates.length === 0) {
      throw new ValidationError('At least one field is required');
    }

    const sale = await database.withTenantTransaction(async (client) => {
      const current = await loadSaleForUpdate(client, context.tenantId, id);
      if (current.status !== 'DRAFT') {
        throw new ConflictError('Only DRAFT sales can be edited');
      }

      let gross = Number(current.gross_amount);
      let cost = Number(current.cost_amount);
      if (needsAmounts) {
        gross = 'gross_amount' in body ? requiredAmount(body, 'gross_amount') : gross;
        cost = 'cost_amount' in body ? requiredAmount(body, 'cost_amount') : cost;
        set('margin_amount', computeMargin(gross, cost));
      }

      await validateSaleRelations(client, context.tenantId, {
        customer_id: 'customer_id' in body ? requiredString(body, 'customer_id', { max: 36 }) : current.customer_id,
        seller_id: 'seller_id' in body ? requiredString(body, 'seller_id', { max: 36 }) : current.seller_id,
        category_id: 'category_id' in body ? requiredString(body, 'category_id', { max: 36 }) : current.category_id,
        payment_method_id:
          'payment_method_id' in body ? optionalUuid(body, 'payment_method_id') : current.payment_method_id,
      });

      updates.push('updated_at = now()');
      const result = await client.query<SaleRow>(
        `UPDATE sales SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2
         RETURNING ${SELECT_SALE}`,
        params,
      );
      const updated = result.rows[0]!;
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_UPDATED,
        entityType: 'sale',
        entityId: updated.id,
        metadata: { sale_number: updated.sale_number },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_UPDATED',
        entityType: 'sale',
        entityId: updated.id,
        payload: { sale_number: updated.sale_number },
      });
      return updated;
    });

    return { sale: serializeSale(sale) };
  });

  app.post('/sales/:id/confirm', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const { id } = request.params as { id: string };

    const sale = await database.withTenantTransaction(async (client) => {
      const current = await loadSaleForUpdate(client, context.tenantId, id);
      if (current.status !== 'DRAFT') {
        throw new ConflictError(`Only DRAFT sales can be confirmed (current: ${current.status})`);
      }

      await client.query(
        `UPDATE sales SET status = 'CONFIRMED', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      );

      const gross = Number(current.gross_amount);
      const count = Number(current.installment_count);
      const base = Math.floor((gross / count) * 100) / 100;
      for (let i = 1; i <= count; i += 1) {
        const amount = i === count ? Math.round((gross - base * (count - 1)) * 100) / 100 : base;
        const receivable = await client.query<{ id: string }>(
          `INSERT INTO receivables (tenant_id, sale_id, installment_number, installment_count,
                                    customer_id, description, amount, due_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, ($8::date + make_interval(months => $9::int))::date)
           RETURNING id`,
          [
            context.tenantId,
            id,
            i,
            count,
            current.customer_id,
            `${current.sale_number} - parcela ${i}/${count}`,
            amount,
            current.due_date,
            i - 1,
          ],
        );
        await enqueueOutboxEvent(client, {
          eventType: 'RECEIVABLE_CREATED',
          entityType: 'receivable',
          entityId: receivable.rows[0]!.id,
          payload: { sale_number: current.sale_number, installment_number: i },
        });
      }

      const sellerResult = await client.query<{
        commission_rule_type: string;
        commission_rate: string | null;
        commission_fixed_amount: string | null;
      }>(
        `SELECT commission_rule_type, commission_rate, commission_fixed_amount
           FROM sellers WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, current.seller_id],
      );
      const seller = sellerResult.rows[0]!;

      if (seller.commission_rule_type === 'UNDEFINED') {
        const pending = await client.query<{ id: string }>(
          `INSERT INTO seller_commissions (tenant_id, sale_id, seller_id, status, rule_snapshot)
           VALUES ($1, $2, $3, 'PENDING_RULE', $4::jsonb)
           RETURNING id`,
          [context.tenantId, id, current.seller_id, JSON.stringify({ rule_type: 'UNDEFINED' })],
        );
        await enqueueOutboxEvent(client, {
          eventType: 'COMMISSION_CREATED',
          entityType: 'seller_commission',
          entityId: pending.rows[0]!.id,
          payload: { sale_number: current.sale_number, pending_rule: true },
        });
      } else {
        const percentage = seller.commission_rate !== null ? Number(seller.commission_rate) : null;
        const fixedAmount =
          seller.commission_fixed_amount !== null ? Number(seller.commission_fixed_amount) : null;
        let baseAmount: number | null = null;
        let amount: number;
        if (seller.commission_rule_type === 'FIXED') {
          amount = fixedAmount ?? 0;
        } else {
          baseAmount =
            seller.commission_rule_type === 'PERCENTAGE_ON_MARGIN'
              ? Number(current.margin_amount)
              : Number(current.gross_amount);
          amount = Math.round(baseAmount * (percentage ?? 0)) / 100;
        }
        const computed = await client.query<{ id: string }>(
          `INSERT INTO seller_commissions (tenant_id, sale_id, seller_id, calculation_type,
                                           calculation_base, percentage, fixed_amount,
                                           commission_amount, status, rule_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9::jsonb)
           RETURNING id`,
          [
            context.tenantId,
            id,
            current.seller_id,
            seller.commission_rule_type,
            baseAmount,
            percentage,
            fixedAmount,
            amount,
            JSON.stringify({
              rule_type: seller.commission_rule_type,
              rate: percentage,
              fixed_amount: fixedAmount,
            }),
          ],
        );
        await enqueueOutboxEvent(client, {
          eventType: 'COMMISSION_CREATED',
          entityType: 'seller_commission',
          entityId: computed.rows[0]!.id,
          payload: { sale_number: current.sale_number, amount },
        });
      }

      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_CONFIRMED,
        entityType: 'sale',
        entityId: id,
        metadata: { sale_number: current.sale_number, installments: count },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_CONFIRMED',
        entityType: 'sale',
        entityId: id,
        payload: { sale_number: current.sale_number },
      });

      return { ...current, status: 'CONFIRMED' };
    });

    return { sale: serializeSale(sale) };
  });

  app.post('/sales/:id/cancel', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requireRole(context, 'MANAGER');
    const { id } = request.params as { id: string };

    await database.withTenantTransaction(async (client) => {
      const current = await loadSaleForUpdate(client, context.tenantId, id);
      if (current.status === 'CANCELLED') {
        throw new ConflictError('Sale is already cancelled');
      }
      if (current.status === 'PAID') {
        throw new ConflictError('A paid sale cannot be cancelled');
      }

      const payments = await client.query<{ paid: string }>(
        `SELECT COALESCE(sum(paid_amount), 0)::text AS paid
           FROM receivables WHERE tenant_id = $1 AND sale_id = $2`,
        [context.tenantId, id],
      );
      if (Number(payments.rows[0]?.paid ?? 0) > 0) {
        throw new ConflictError('Sale has received payments and cannot be cancelled');
      }

      const paidCommission = await client.query(
        `SELECT 1 FROM seller_commissions WHERE tenant_id = $1 AND sale_id = $2 AND status = 'PAID'`,
        [context.tenantId, id],
      );
      if ((paidCommission.rowCount ?? 0) > 0) {
        throw new ConflictError('Commission for this sale was already paid');
      }

      await client.query(
        `UPDATE sales SET status = 'CANCELLED', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      );
      await client.query(
        `UPDATE receivables SET status = 'CANCELLED', updated_at = now()
          WHERE tenant_id = $1 AND sale_id = $2 AND status <> 'CANCELLED'`,
        [context.tenantId, id],
      );
      await client.query(
        `UPDATE seller_commissions SET status = 'CANCELLED', updated_at = now()
          WHERE tenant_id = $1 AND sale_id = $2 AND status NOT IN ('CANCELLED', 'PAID')`,
        [context.tenantId, id],
      );
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_CANCELLED,
        entityType: 'sale',
        entityId: id,
        metadata: { sale_number: current.sale_number },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_CANCELLED',
        entityType: 'sale',
        entityId: id,
        payload: { sale_number: current.sale_number },
      });
    });

    return { ok: true };
  });
}
