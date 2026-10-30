import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { can, inScope, requirePermission, scopeCondition, scopeFor, type Scope } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import { getTenantContext } from '../tenant-context';
import {
  optionalDate,
  optionalEnum,
  optionalString,
  optionalUuid,
  parseObjectBody,
  requiredString,
} from '../validation';
import { isValidCpf, normalizeCpf } from '../validation/cpf';
import { normalizeCustomerCep } from '../cep';
import {
  assertCustomerFieldRules,
  listCustomerFieldSettings,
  parseFieldSettingsInput,
  saveCustomerFieldSettings,
} from '../customer-field-settings';

const MAX_PAGE_SIZE = 100;
const LOOKUP_DEFAULT_LIMIT = 10;
const LOOKUP_MAX_LIMIT = 20;

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
  responsible_seller_id: string | null;
  responsible_seller_name: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `id, name, cpf,
  to_char(birth_date, 'YYYY-MM-DD') AS birth_date,
  phone, whatsapp, email, zip_code, street, number, complement,
  neighborhood, city, state, notes, status, responsible_seller_id,
  (SELECT se.name FROM sellers se
    WHERE se.tenant_id = customers.tenant_id AND se.id = customers.responsible_seller_id) AS responsible_seller_name,
  created_at, updated_at`;

function readScope(): Scope {
  return scopeFor(getTenantContext(), 'customers.read_all', 'customers.read_own');
}

function updateScope(): Scope {
  return scopeFor(getTenantContext(), 'customers.update_all', 'customers.update_own');
}

/**
 * Loads a customer for update inside the caller's scope. Out of scope is
 * indistinguishable from missing (404), like another tenant's row.
 */
async function lockCustomerInScope(
  client: TenantClient,
  tenantId: string,
  id: string,
  scope: Scope,
): Promise<{ id: string; responsible_seller_id: string | null; zip_code: string | null }> {
  const result = await client.query<{ id: string; responsible_seller_id: string | null; zip_code: string | null }>(
    'SELECT id, responsible_seller_id, zip_code FROM customers WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
    [tenantId, id],
  );
  const row = result.rows[0];
  if (!row || !inScope(scope, row.responsible_seller_id)) throw new NotFoundError('Customer not found');
  return row;
}

async function assertSellerExists(client: TenantClient, tenantId: string, sellerId: string): Promise<void> {
  const result = await client.query('SELECT 1 FROM sellers WHERE tenant_id = $1 AND id = $2', [tenantId, sellerId]);
  if ((result.rowCount ?? 0) === 0) {
    throw new ValidationError('Field responsible_seller_id must reference an existing record of this tenant');
  }
}

/** Digits of a term typed as a CPF (dots, dashes and spaces allowed), else null. */
function cpfDigitsOf(term: string): string | null {
  if (!/^[\d\s.-]+$/.test(term)) return null;
  const digits = normalizeCpf(term);
  return digits.length > 0 ? digits : null;
}

function maskCpf(cpf: string | null): string | null {
  const digits = cpf ? normalizeCpf(cpf) : '';
  if (digits.length !== 11) return null;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

const LOOKUP_MIN_TERM_LENGTH = 2;
const LOOKUP_MIN_CPF_DIGITS = 4;

function parseLookupQuery(query: Record<string, string | string[] | undefined>): { term: string; limit: number } {
  if (query.q !== undefined && typeof query.q !== 'string') {
    throw new ValidationError('Query "q" must be sent only once');
  }
  const term = query.q?.trim() ?? '';
  if (term.length < LOOKUP_MIN_TERM_LENGTH) {
    throw new ValidationError(`Query "q" must have at least ${LOOKUP_MIN_TERM_LENGTH} characters`);
  }
  let limit = LOOKUP_DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^\d+$/.test(query.limit)) {
      throw new ValidationError('Query "limit" must be a positive integer');
    }
    limit = Math.min(LOOKUP_MAX_LIMIT, Math.max(1, Number(query.limit)));
  }
  return { term, limit };
}

/**
 * Appends the match for a lookup term and returns its SQL fragment. A CPF
 * (masked or not) matches by digits: exact for 11 digits, prefix for 4 to 10.
 * Anything else matches the name as a contains pattern.
 */
function lookupMatch(term: string, params: unknown[]): string {
  const digits = cpfDigitsOf(term);
  if (digits && digits.length === 11) {
    params.push(digits);
    return `cpf = $${params.length}`;
  }
  if (digits && digits.length >= LOOKUP_MIN_CPF_DIGITS) {
    params.push(`${digits}%`);
    return `cpf LIKE $${params.length}`;
  }
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  params.push(`%${escaped}%`);
  return `name ILIKE $${params.length}`;
}

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
    const scoped = scopeCondition(readScope(), 'responsible_seller_id', params);
    if (scoped) conditions.push(scoped);
    if (query.responsible_seller_id) {
      params.push(optionalUuid({ id: query.responsible_seller_id }, 'id'));
      conditions.push(`responsible_seller_id = $${params.length}`);
    }
    if (search) {
      // The stored CPF has no mask: a CPF typed with dots or dashes is
      // compared by its digits, as the lookup endpoint does.
      params.push(`%${search}%`, `%${cpfDigitsOf(search) ?? search}%`);
      const p = params.length;
      conditions.push(`(name ILIKE $${p - 1} OR email ILIKE $${p - 1} OR cpf LIKE $${p})`);
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

  // Search-as-you-type for the sale form: same data scope as the list, a
  // fixed small limit, and a minimal shape (no contact or address fields).
  // Registry + effective configuration of the registration form (any user; the server enforces it).
  app.get('/customers/field-settings', { preHandler: protectedHooks }, async () => ({
    fields: await listCustomerFieldSettings(database),
  }));

  app.put('/settings/customers/field-settings', { preHandler: protectedHooks }, async (request) => {
    // Administrator only, never delegable (same as Full): the permission alone is not enough.
    const context = getTenantContext();
    requirePermission(context, 'customers.fields_manage');
    if (!context.grantsAll && context.role !== 'ADMIN') {
      throw new ForbiddenError('Somente administradores configuram o cadastro de cliente');
    }
    const inputs = parseFieldSettingsInput(request.body);
    return { fields: await saveCustomerFieldSettings(database, inputs) };
  });

  app.get('/customers/lookup', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const scope = readScope();
    const { term, limit } = parseLookupQuery(query);

    const params: unknown[] = [context.tenantId];
    const conditions = ['tenant_id = $1'];
    const scoped = scopeCondition(scope, 'responsible_seller_id', params);
    if (scoped) conditions.push(scoped);
    conditions.push(lookupMatch(term, params));
    params.push(limit);

    const result = await database.withTenantTransaction((client) =>
      client.query<{ id: string; name: string; cpf: string | null; birth_date: string | null; status: string }>(
        `SELECT id, name, cpf, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, status
           FROM customers
          WHERE ${conditions.join(' AND ')}
          ORDER BY name
          LIMIT $${params.length}`,
        params,
      ),
    );

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        cpf_masked: maskCpf(row.cpf),
        birth_date: row.birth_date,
        status: row.status,
      })),
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
    if (!customer || !inScope(readScope(), customer.responsible_seller_id)) {
      throw new NotFoundError('Customer not found');
    }
    return { customer };
  });

  app.post('/customers', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'customers.create');
    const body = parseObjectBody(request.body);

    // Portfolio owner: the creator's own seller by default. Assigning
    // someone else's portfolio needs customers.update_all; an own-scoped
    // user without a linked seller could never see the customer again.
    const requestedResponsible = optionalUuid(body, 'responsible_seller_id');
    const responsibleSellerId = requestedResponsible ?? context.sellerId;
    if (requestedResponsible && requestedResponsible !== context.sellerId && !can(context, 'customers.update_all')) {
      throw new ForbiddenError('Assigning a customer to another seller requires customers.update_all');
    }
    if (!responsibleSellerId && !can(context, 'customers.read_all')) {
      throw new ForbiddenError('User is not linked to a seller');
    }

    const name = requiredString(body, 'name', { max: 200 });
    const cpf = parseOptionalCpf(body);
    const birthDate = optionalDate(body, 'birth_date');
    const email = optionalString(body, 'email', { max: 254 });

    const customer = await database.withTenantTransaction(async (client) => {
      await assertCustomerFieldRules(client, context.tenantId, body, 'create');
      if (cpf) await assertCpfAvailable(client, context.tenantId, cpf);
      if (requestedResponsible) await assertSellerExists(client, context.tenantId, requestedResponsible);
      const result = await client.query<CustomerRow>(
        `INSERT INTO customers (tenant_id, name, cpf, birth_date, phone, whatsapp, email,
                                zip_code, street, number, complement, neighborhood, city, state, notes,
                                responsible_seller_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING ${SELECT_COLUMNS}`,
        [
          context.tenantId,
          name,
          cpf,
          birthDate,
          optionalString(body, 'phone', { max: 40 }),
          optionalString(body, 'whatsapp', { max: 40 }),
          email,
          normalizeCustomerCep(optionalString(body, 'zip_code', { max: 12 })),
          optionalString(body, 'street', { max: 200 }),
          optionalString(body, 'number', { max: 20 }),
          optionalString(body, 'complement', { max: 100 }),
          optionalString(body, 'neighborhood', { max: 100 }),
          optionalString(body, 'city', { max: 100 }),
          optionalString(body, 'state', { max: 50 }),
          optionalString(body, 'notes', { max: 2000 }),
          responsibleSellerId,
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
    const scope = updateScope();
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
    const reassigning = 'responsible_seller_id' in body;
    const newResponsible = reassigning ? optionalUuid(body, 'responsible_seller_id') : null;
    if (reassigning) {
      if (!can(context, 'customers.update_all')) {
        throw new ForbiddenError('Reassigning a customer requires customers.update_all');
      }
      set('responsible_seller_id', newResponsible);
    }

    if (updates.length === 0 && !('zip_code' in body)) {
      throw new ValidationError('At least one field is required');
    }

    const customer = await database.withTenantTransaction(async (client) => {
      const current = await lockCustomerInScope(client, context.tenantId, id, scope);
      await assertCustomerFieldRules(client, context.tenantId, body, 'update');
      if ('zip_code' in body) set('zip_code', normalizeCustomerCep(optionalString(body, 'zip_code', { max: 254 }), current.zip_code));
      if (cpfProvided && cpfValue) await assertCpfAvailable(client, context.tenantId, cpfValue, id);
      if (newResponsible) await assertSellerExists(client, context.tenantId, newResponsible);
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
      if (reassigning && current.responsible_seller_id !== newResponsible) {
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.CUSTOMER_REASSIGNED,
          entityType: 'customer',
          entityId: updated.id,
          metadata: { from_seller_id: current.responsible_seller_id, to_seller_id: newResponsible },
        });
      }
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
    const scope = updateScope();
    const { id } = request.params as { id: string };

    await database.withTenantTransaction(async (client) => {
      await lockCustomerInScope(client, context.tenantId, id, scope);
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
