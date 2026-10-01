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
  parseObjectBody,
  requiredString,
} from '../validation';
import { isValidCpf, normalizeCpf } from '../validation/cpf';

const MAX_PAGE_SIZE = 100;

interface CustomerRow {
  id: string;
  name: string;
  cpf: string | null;
  birth_date: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `id, name, cpf,
  to_char(birth_date, 'YYYY-MM-DD') AS birth_date,
  phone, whatsapp, email, zip_code, street, number, complement,
  neighborhood, city, state, notes, status,
  created_at, updated_at`;

function parseOptionalCpf(body: Record<string, unknown>): string | null {
  const raw = optionalString(body, 'cpf', { max: 14 });
  if (raw === null) return null;
  if (!isValidCpf(raw)) {
    throw new ValidationError('Field cpf must be a valid CPF');
  }
  return normalizeCpf(raw);
}

async function assertCpfAvailable(client: TenantClient, tenantId: string, cpf: string, excludeId?: string): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM customers WHERE tenant_id = $1 AND cpf = $2 AND ($3::uuid IS NULL OR id <> $3)`,
    [tenantId, cpf, excludeId ?? null],
  );
  if ((result.rowCount ?? 0) > 0) {
    throw new ConflictError('A customer with this CPF already exists');
  }
}

export function registerCustomerRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/customers', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));
    const search = query.search?.trim() || null;
    const status = optionalEnum({ status: query.status ?? null }, 'status', ['ACTIVE', 'INACTIVE'] as const);

    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [context.tenantId];
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      conditions.push(`(name ILIKE $${p} OR email ILIKE $${p} OR cpf LIKE $${p})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.join(' AND ');

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM customers WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<CustomerRow>(
        `SELECT ${SELECT_COLUMNS} FROM customers WHERE ${where}
          ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });
    return {
      items: result.items,
      page,
      pageSize,
      total: result.total,
    };
  });

  app.get('/customers/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };
    const result = await database.withTenantTransaction((client) =>
      client.query<CustomerRow>(
        `SELECT ${SELECT_COLUMNS} FROM customers WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      ),
    );
    const customer = result.rows[0];
    if (!customer) throw new NotFoundError('Customer not found');
    return { customer };
  });

  app.post('/customers', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const body = parseObjectBody(request.body);

    const name = requiredString(body, 'name', { max: 200 });
    const cpf = parseOptionalCpf(body);
    const birthDate = optionalDate(body, 'birth_date');
    const email = optionalString(body, 'email', { max: 254 });

    const customer = await database.withTenantTransaction(async (client) => {
      if (cpf) await assertCpfAvailable(client, context.tenantId, cpf);
      const result = await client.query<CustomerRow>(
        `INSERT INTO customers (tenant_id, name, cpf, birth_date, phone, whatsapp, email,
                                zip_code, street, number, complement, neighborhood, city, state, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING ${SELECT_COLUMNS}`,
        [
          context.tenantId,
          name,
          cpf,
          birthDate,
          optionalString(body, 'phone', { max: 40 }),
          optionalString(body, 'whatsapp', { max: 40 }),
          email,
          optionalString(body, 'zip_code', { max: 12 }),
          optionalString(body, 'street', { max: 200 }),
          optionalString(body, 'number', { max: 20 }),
          optionalString(body, 'complement', { max: 100 }),
          optionalString(body, 'neighborhood', { max: 100 }),
          optionalString(body, 'city', { max: 100 }),
          optionalString(body, 'state', { max: 50 }),
          optionalString(body, 'notes', { max: 2000 }),
        ],
      );
      const created = result.rows[0]!;
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.CUSTOMER_CREATED,
        entityType: 'customer',
        entityId: created.id,
      });
      await enqueueOutboxEvent(client, {
        eventType: 'CUSTOMER_CREATED',
        entityType: 'customer',
        entityId: created.id,
        payload: { name: created.name },
      });
      return created;
    });

    reply.code(201);
    return { customer };
  });

  app.patch('/customers/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);

    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];

    function set(column: string, value: unknown): void {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }

    const cpfProvided = 'cpf' in body;
    const cpfValue = cpfProvided ? parseOptionalCpf(body) : null;

    if ('name' in body) set('name', requiredString(body, 'name', { max: 200 }));
    if (cpfProvided) set('cpf', cpfValue);
    if ('birth_date' in body) set('birth_date', optionalDate(body, 'birth_date'));
    for (const field of [
      'phone',
      'whatsapp',
      'email',
      'zip_code',
      'street',
      'number',
      'complement',
      'neighborhood',
      'city',
      'state',
      'notes',
    ] as const) {
      if (field in body) set(field, optionalString(body, field, { max: field === 'notes' ? 2000 : 254 }));
    }
    if ('status' in body) {
      const status = optionalEnum(body, 'status', ['ACTIVE', 'INACTIVE'] as const);
      if (status === null) throw new ValidationError('Field status is required');
      set('status', status);
    }

    if (updates.length === 0) {
      throw new ValidationError('At least one field is required');
    }

    const customer = await database.withTenantTransaction(async (client) => {
      if (cpfProvided && cpfValue) await assertCpfAvailable(client, context.tenantId, cpfValue, id);
      updates.push('updated_at = now()');
      const result = await client.query<CustomerRow>(
        `UPDATE customers SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2
         RETURNING ${SELECT_COLUMNS}`,
        params,
      );
      const updated = result.rows[0];
      if (!updated) throw new NotFoundError('Customer not found');
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.CUSTOMER_UPDATED,
        entityType: 'customer',
        entityId: updated.id,
      });
      await enqueueOutboxEvent(client, {
        eventType: 'CUSTOMER_UPDATED',
        entityType: 'customer',
        entityId: updated.id,
        payload: { name: updated.name },
      });
      return updated;
    });

    return { customer };
  });

  app.delete('/customers/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const { id } = request.params as { id: string };

    await database.withTenantTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `UPDATE customers SET status = 'INACTIVE', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND status <> 'INACTIVE'
          RETURNING id`,
        [context.tenantId, id],
      );
      if (!result.rows[0]) throw new NotFoundError('Customer not found');
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.CUSTOMER_UPDATED,
        entityType: 'customer',
        entityId: id,
        metadata: { status: 'INACTIVE' },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'CUSTOMER_UPDATED',
        entityType: 'customer',
        entityId: id,
        payload: { status: 'INACTIVE' },
      });
    });

    return { ok: true };
  });
}
