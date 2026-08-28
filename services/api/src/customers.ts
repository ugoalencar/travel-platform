import type { Customer } from '../../../packages/domain/types';
import type { Status } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface CustomerRow {
  id: string;
  agency_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  passport: string | null;
  address: Record<string, unknown> | null;
  notes: string | null;
  status: Status;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  address?: Record<string, unknown>;
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  address?: Record<string, unknown>;
  notes?: string;
}

export async function listCustomers(database: DatabaseRuntime): Promise<Customer[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerRow>(
      `SELECT id, agency_id, name, email, phone, cpf, passport, address, notes, status,
              deleted_at, created_at, updated_at
       FROM customers
       WHERE agency_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toCustomer);
  });
}

export async function getCustomerById(
  database: DatabaseRuntime,
  id: string,
): Promise<Customer | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerRow>(
      `SELECT id, agency_id, name, email, phone, cpf, passport, address, notes, status,
              deleted_at, created_at, updated_at
       FROM customers
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toCustomer(row) : null;
  });
}

export async function createCustomer(
  database: DatabaseRuntime,
  data: CreateCustomerInput,
): Promise<Customer> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    try {
      const result = await client.query<CustomerRow>(
        `INSERT INTO customers (agency_id, name, email, phone, cpf, passport, address, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, agency_id, name, email, phone, cpf, passport, address, notes, status,
                   deleted_at, created_at, updated_at`,
        [
          agencyId,
          data.name,
          data.email ?? null,
          data.phone ?? null,
          data.cpf ?? null,
          data.passport ?? null,
          data.address ? JSON.stringify(data.address) : null,
          data.notes ?? null,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Customer insert did not return a row');
      }
      const customer = toCustomer(row);
      await recordAuditEvent(client, {
        eventType: AuditEventType.CUSTOMER_CREATED,
        entityType: 'customer',
        entityId: customer.id,
      });
      return customer;
    } catch (error: unknown) {
      throw mapUniqueViolation(error);
    }
  });
}

export async function updateCustomer(
  database: DatabaseRuntime,
  id: string,
  data: UpdateCustomerInput,
): Promise<Customer | null> {
  const agencyId = getAgencyId();

  const fields: string[] = [];
  const values: unknown[] = [];
  const changedFields: string[] = [];
  let index = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${++index}`);
    values.push(data.name);
    changedFields.push('name');
  }
  if (data.email !== undefined) {
    fields.push(`email = $${++index}`);
    values.push(data.email);
    changedFields.push('email');
  }
  if (data.phone !== undefined) {
    fields.push(`phone = $${++index}`);
    values.push(data.phone);
    changedFields.push('phone');
  }
  if (data.cpf !== undefined) {
    fields.push(`cpf = $${++index}`);
    values.push(data.cpf);
    changedFields.push('cpf');
  }
  if (data.passport !== undefined) {
    fields.push(`passport = $${++index}`);
    values.push(data.passport);
    changedFields.push('passport');
  }
  if (data.address !== undefined) {
    fields.push(`address = $${++index}`);
    values.push(JSON.stringify(data.address));
    changedFields.push('address');
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${++index}`);
    values.push(data.notes);
    changedFields.push('notes');
  }

  if (fields.length === 0) {
    return getCustomerById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    try {
      const result = await client.query<CustomerRow>(
        `UPDATE customers
         SET ${fields.join(', ')}, updated_at = now()
         WHERE agency_id = $1 AND id = $${index + 1} AND deleted_at IS NULL
         RETURNING id, agency_id, name, email, phone, cpf, passport, address, notes, status,
                   deleted_at, created_at, updated_at`,
        [agencyId, ...values, id],
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }
      const customer = toCustomer(row);
      await recordAuditEvent(client, {
        eventType: AuditEventType.CUSTOMER_UPDATED,
        entityType: 'customer',
        entityId: customer.id,
        metadata: { fieldsChanged: changedFields },
      });
      return customer;
    } catch (error: unknown) {
      throw mapUniqueViolation(error);
    }
  });
}

function mapUniqueViolation(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  ) {
    return new ConflictError('A customer with this CPF or email already exists');
  }

  return error;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.email !== null ? { email: row.email } : {}),
    ...(row.phone !== null ? { phone: row.phone } : {}),
    ...(row.cpf !== null ? { cpf: row.cpf } : {}),
    ...(row.passport !== null ? { passport: row.passport } : {}),
    ...(row.address !== null ? { address: row.address } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}
