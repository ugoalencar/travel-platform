import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  can,
  inScope,
  requirePermission,
  scopeFor,
  type Scope,
} from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import { getTenantContext } from '../tenant-context';
import {
  optionalDate,
  optionalEnum,
  optionalString,
  optionalUuid,
  parseObjectBody,
  requiredAmount,
  requiredEnum,
  requiredString,
} from '../validation';

const PARTY_TYPES = ['SUPPLIER', 'SERVICE_PROVIDER', 'OTHER'] as const;
const PARTY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const COST_TYPES = ['AIRFARE', 'HOTEL', 'TRANSFER', 'INSURANCE', 'FEE', 'OPERATOR', 'SERVICE', 'OTHER'] as const;
const MAX_PAGE_SIZE = 100;

interface FinancialPartyRow {
  id: string;
  type: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SaleCostRow {
  id: string;
  sale_id: string;
  financial_party_id: string | null;
  financial_party_name: string | null;
  cost_type: string;
  description: string;
  amount: string;
  due_date: string | null;
  payable_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function serializeParty(row: FinancialPartyRow) {
  return row;
}

function serializeCost(row: SaleCostRow) {
  return { ...row, amount: Number(row.amount) };
}

function costReadScope(): Scope {
  return scopeFor(getTenantContext(), 'sale_costs.read_all', 'sale_costs.read_own');
}

async function assertFinancialParty(
  client: TenantClient,
  tenantId: string,
  id: string | null,
): Promise<void> {
  if (!id) return;
  const result = await client.query('SELECT 1 FROM financial_parties WHERE tenant_id = $1 AND id = $2', [
    tenantId,
    id,
  ]);
  if ((result.rowCount ?? 0) === 0) {
    throw new ValidationError('Field financial_party_id must reference an existing record of this tenant');
  }
}

async function assertCategory(
  client: TenantClient,
  tenantId: string,
  id: string | null,
): Promise<void> {
  if (!id) return;
  const result = await client.query(
    `SELECT 1 FROM financial_categories WHERE tenant_id = $1 AND id = $2 AND direction = 'OUT'`,
    [tenantId, id],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new ValidationError('Field category_id must reference an OUT financial category of this tenant');
  }
}

async function loadSaleForCosts(
  client: TenantClient,
  tenantId: string,
  saleId: string,
  scope: Scope,
): Promise<{ id: string; seller_id: string; gross_amount: string; status: string }> {
  const result = await client.query<{ id: string; seller_id: string; gross_amount: string; status: string }>(
    `SELECT id, seller_id, gross_amount, status FROM sales
      WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, saleId],
  );
  const row = result.rows[0];
  if (!row || !inScope(scope, row.seller_id)) throw new NotFoundError('Sale not found');
  return row;
}

export async function recalculateSaleCostTotals(
  client: TenantClient,
  tenantId: string,
  saleId: string,
): Promise<void> {
  const result = await client.query<{ gross_amount: string; total_cost: string }>(
    `SELECT s.gross_amount,
            COALESCE(sum(c.amount), 0)::text AS total_cost
       FROM sales s
       LEFT JOIN sale_cost_items c ON c.tenant_id = s.tenant_id AND c.sale_id = s.id
      WHERE s.tenant_id = $1 AND s.id = $2
      GROUP BY s.id, s.gross_amount`,
    [tenantId, saleId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Sale not found');
  const gross = Number(row.gross_amount);
  const totalCost = Math.round(Number(row.total_cost) * 100) / 100;
  if (totalCost > gross) {
    throw new ValidationError('Total sale costs must not exceed gross_amount');
  }
  const margin = Math.round((gross - totalCost) * 100) / 100;
  await client.query(
    `UPDATE sales SET cost_amount = $3, margin_amount = $4, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, saleId, totalCost, margin],
  );
}

async function createPayableForCost(
  client: TenantClient,
  tenantId: string,
  cost: SaleCostRow,
  categoryId: string | null,
): Promise<string> {
  if (cost.payable_id) throw new ConflictError('A payable already exists for this sale cost');
  await assertCategory(client, tenantId, categoryId);
  const dueAt = cost.due_date ?? new Date().toISOString().slice(0, 10);
  const payable = await client.query<{ id: string }>(
    `INSERT INTO payables (tenant_id, category_id, supplier_name, description, amount, due_at,
                           financial_party_id, sale_id, sale_cost_item_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      tenantId,
      categoryId,
      cost.financial_party_name,
      cost.description,
      cost.amount,
      dueAt,
      cost.financial_party_id,
      cost.sale_id,
      cost.id,
    ],
  );
  const payableId = payable.rows[0]!.id;
  await client.query(
    `UPDATE sale_cost_items SET payable_id = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, cost.id, payableId],
  );
  await recordAuditEvent(client, {
    eventType: AUDIT_EVENTS.EXPENSE_CREATED,
    entityType: 'payable',
    entityId: payableId,
    metadata: { amount: Number(cost.amount), sale_cost_item_id: cost.id },
  });
  await enqueueOutboxEvent(client, {
    eventType: 'PAYABLE_CREATED',
    entityType: 'payable',
    entityId: payableId,
    payload: { amount: Number(cost.amount), sale_cost_item_id: cost.id },
  });
  return payableId;
}

async function loadCost(
  client: TenantClient,
  tenantId: string,
  costId: string,
): Promise<SaleCostRow> {
  const result = await client.query<SaleCostRow>(
    `SELECT c.id, c.sale_id, c.financial_party_id, fp.name AS financial_party_name,
            c.cost_type, c.description, c.amount, c.due_date, c.payable_id,
            c.created_by, c.created_at, c.updated_at
       FROM sale_cost_items c
       LEFT JOIN financial_parties fp ON fp.tenant_id = c.tenant_id AND fp.id = c.financial_party_id
      WHERE c.tenant_id = $1 AND c.id = $2
      FOR UPDATE OF c`,
    [tenantId, costId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Sale cost not found');
  return row;
}

export function registerSaleCostRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/financial-parties', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'finance.read', 'suppliers.manage');
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 50));
    const conditions = ['tenant_id = $1'];
    const params: unknown[] = [context.tenantId];
    if (query.type) {
      params.push(optionalEnum({ type: query.type }, 'type', PARTY_TYPES));
      conditions.push(`type = $${params.length}`);
    }
    if (query.status) {
      params.push(optionalEnum({ status: query.status }, 'status', PARTY_STATUSES));
      conditions.push(`status = $${params.length}`);
    }
    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR document ILIKE $${params.length})`);
    }
    const where = conditions.join(' AND ');
    const result = await database.withTenantTransaction(async (client) => {
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM financial_parties WHERE ${where}`,
        params,
      );
      const rows = await client.query<FinancialPartyRow>(
        `SELECT id, type, name, document, phone, email, notes, status, created_at, updated_at
           FROM financial_parties WHERE ${where}
          ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { total: count.rows[0]?.total ?? 0, items: rows.rows };
    });
    return { items: result.items.map(serializeParty), total: result.total, page, pageSize };
  });

  app.post('/financial-parties', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'suppliers.manage');
    const body = parseObjectBody(request.body);
    const party = await database.withTenantTransaction(async (client) => {
      const result = await client.query<FinancialPartyRow>(
        `INSERT INTO financial_parties (tenant_id, type, name, document, phone, email, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, type, name, document, phone, email, notes, status, created_at, updated_at`,
        [
          context.tenantId,
          requiredEnum(body, 'type', PARTY_TYPES),
          requiredString(body, 'name', { max: 200 }),
          optionalString(body, 'document', { max: 40 }),
          optionalString(body, 'phone', { max: 40 }),
          optionalString(body, 'email', { max: 254 }),
          optionalString(body, 'notes', { max: 2000 }),
        ],
      );
      const created = result.rows[0]!;
      await recordAuditEvent(client, {
        eventType: 'FINANCIAL_PARTY_CREATED',
        entityType: 'financial_party',
        entityId: created.id,
      });
      return created;
    });
    reply.code(201);
    return { financialParty: serializeParty(party) };
  });

  app.patch('/financial-parties/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'suppliers.manage');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);
    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];
    function set(column: string, value: unknown): void {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }
    if ('type' in body) set('type', requiredEnum(body, 'type', PARTY_TYPES));
    if ('name' in body) set('name', requiredString(body, 'name', { max: 200 }));
    for (const field of ['document', 'phone', 'email', 'notes'] as const) {
      if (field in body) set(field, optionalString(body, field, { max: field === 'notes' ? 2000 : 254 }));
    }
    if ('status' in body) set('status', requiredEnum(body, 'status', PARTY_STATUSES));
    if (updates.length === 0) throw new ValidationError('At least one field is required');
    const party = await database.withTenantTransaction(async (client) => {
      updates.push('updated_at = now()');
      const result = await client.query<FinancialPartyRow>(
        `UPDATE financial_parties SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2
         RETURNING id, type, name, document, phone, email, notes, status, created_at, updated_at`,
        params,
      );
      const updated = result.rows[0];
      if (!updated) throw new NotFoundError('Financial party not found');
      await recordAuditEvent(client, {
        eventType: 'FINANCIAL_PARTY_UPDATED',
        entityType: 'financial_party',
        entityId: updated.id,
      });
      return updated;
    });
    return { financialParty: serializeParty(party) };
  });

  app.get('/sales/:id/costs', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };
    return database.withTenantTransaction(async (client) => {
      await loadSaleForCosts(client, context.tenantId, id, costReadScope());
      const rows = await client.query<SaleCostRow>(
        `SELECT c.id, c.sale_id, c.financial_party_id, fp.name AS financial_party_name,
                c.cost_type, c.description, c.amount, c.due_date, c.payable_id,
                c.created_by, c.created_at, c.updated_at
           FROM sale_cost_items c
           LEFT JOIN financial_parties fp ON fp.tenant_id = c.tenant_id AND fp.id = c.financial_party_id
          WHERE c.tenant_id = $1 AND c.sale_id = $2
          ORDER BY c.created_at, c.id`,
        [context.tenantId, id],
      );
      return { items: rows.rows.map(serializeCost) };
    });
  });

  app.post('/sales/:id/costs', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'sale_costs.create');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);
    const saleScope = can(context, 'sales.update_all')
      ? { all: true } as const
      : scopeFor(context, 'sales.update_all', 'sales.update_own');

    const created = await database.withTenantTransaction(async (client) => {
      const sale = await loadSaleForCosts(client, context.tenantId, id, saleScope);
      if (sale.status !== 'DRAFT') throw new ConflictError('Only DRAFT sales can receive new costs');
      const financialPartyId = optionalUuid(body, 'financial_party_id');
      await assertFinancialParty(client, context.tenantId, financialPartyId);
      const amount = requiredAmount(body, 'amount');
      if (amount <= 0) throw new ValidationError('Field amount must be greater than zero');
      const inserted = await client.query<SaleCostRow>(
        `INSERT INTO sale_cost_items (tenant_id, sale_id, financial_party_id, cost_type,
                                      description, amount, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, sale_id, financial_party_id,
           (SELECT name FROM financial_parties fp WHERE fp.tenant_id = sale_cost_items.tenant_id AND fp.id = sale_cost_items.financial_party_id) AS financial_party_name,
           cost_type, description, amount, due_date, payable_id, created_by, created_at, updated_at`,
        [
          context.tenantId,
          id,
          financialPartyId,
          requiredEnum(body, 'cost_type', COST_TYPES),
          requiredString(body, 'description', { max: 500 }),
          amount,
          optionalDate(body, 'due_date'),
          context.userId,
        ],
      );
      let cost = inserted.rows[0]!;
      await recalculateSaleCostTotals(client, context.tenantId, id);
      if (body.create_payable === true) {
        const payableId = await createPayableForCost(
          client,
          context.tenantId,
          cost,
          optionalUuid(body, 'category_id'),
        );
        cost = { ...cost, payable_id: payableId };
      } else if ('create_payable' in body && body.create_payable !== false) {
        throw new ValidationError('Field create_payable must be a boolean');
      }
      await recordAuditEvent(client, {
        eventType: 'SALE_COST_CREATED',
        entityType: 'sale_cost_item',
        entityId: cost.id,
        metadata: { sale_id: id, amount },
      });
      return cost;
    });
    reply.code(201);
    return { saleCost: serializeCost(created) };
  });

  app.post('/sales/:saleId/costs/:costId/payable', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'sale_costs.update');
    const { saleId, costId } = request.params as { saleId: string; costId: string };
    const body = parseObjectBody(request.body);
    const result = await database.withTenantTransaction(async (client) => {
      await loadSaleForCosts(client, context.tenantId, saleId, scopeFor(context, 'sales.update_all', 'sales.update_own'));
      const cost = await loadCost(client, context.tenantId, costId);
      if (cost.sale_id !== saleId) throw new NotFoundError('Sale cost not found');
      const payableId = await createPayableForCost(client, context.tenantId, cost, optionalUuid(body, 'category_id'));
      return { ...cost, payable_id: payableId };
    });
    reply.code(201);
    return { saleCost: serializeCost(result) };
  });
}
