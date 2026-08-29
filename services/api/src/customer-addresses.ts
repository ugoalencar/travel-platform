/**
 * Customer 360 -- structured customer addresses.
 *
 * Replaces the legacy free-form `customers.address` JSON blob with a
 * tenant-scoped, soft-deletable table supporting multiple addresses per
 * customer and exactly one primary address.
 */

import type { CustomerAddress } from '../../../packages/domain/types';
import { AddressType } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

const ADDRESS_COLUMNS = `id, agency_id, customer_id, type, is_primary, cep, street, number,
              complement, district, city, state, country, created_at, updated_at, deleted_at`;

interface CustomerAddressRow {
  id: string;
  agency_id: string;
  customer_id: string;
  type: AddressType;
  is_primary: boolean;
  cep: string | null;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  country: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateAddressInput {
  customerId: string;
  type?: AddressType;
  isPrimary?: boolean;
  cep?: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  country?: string;
}

export interface UpdateAddressInput {
  type?: AddressType;
  isPrimary?: boolean;
  cep?: string | null;
  street?: string;
  number?: string;
  complement?: string | null;
  district?: string;
  city?: string;
  state?: string;
  country?: string;
}

export async function listAddresses(
  database: DatabaseRuntime,
  customerId: string,
): Promise<CustomerAddress[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerAddressRow>(
      `SELECT ${ADDRESS_COLUMNS}
       FROM customer_addresses
       WHERE agency_id = $1 AND customer_id = $2 AND deleted_at IS NULL
       ORDER BY is_primary DESC, created_at DESC`,
      [agencyId, customerId],
    );

    return result.rows.map(toCustomerAddress);
  });
}

export async function getAddressById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerAddress | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerAddressRow>(
      `SELECT ${ADDRESS_COLUMNS}
       FROM customer_addresses
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toCustomerAddress(row) : null;
  });
}

export async function createAddress(
  database: DatabaseRuntime,
  data: CreateAddressInput,
): Promise<CustomerAddress> {
  const agencyId = getAgencyId();
  validateCreateInput(data);

  const isPrimary = data.isPrimary ?? false;

  return database.withTenantTransaction(async (client) => {
    if (isPrimary) {
      await demoteExistingPrimary(client, agencyId, data.customerId);
    }

    const result = await client.query<CustomerAddressRow>(
      `INSERT INTO customer_addresses
         (agency_id, customer_id, type, is_primary, cep, street, number, complement,
          district, city, state, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${ADDRESS_COLUMNS}`,
      [
        agencyId,
        data.customerId,
        data.type ?? AddressType.RESIDENTIAL,
        isPrimary,
        data.cep ?? null,
        data.street.trim(),
        data.number.trim(),
        data.complement ?? null,
        data.district.trim(),
        data.city.trim(),
        data.state.trim(),
        data.country ?? 'Brazil',
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Customer address insert did not return a row');
    }

    const address = toCustomerAddress(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_ADDRESS_CREATED,
      entityType: 'customer_address',
      entityId: address.id,
      metadata: { customerId: address.customerId, isPrimary: address.isPrimary },
    });

    return address;
  });
}

export async function updateAddress(
  database: DatabaseRuntime,
  id: string,
  data: UpdateAddressInput,
): Promise<CustomerAddress | null> {
  const agencyId = getAgencyId();
  validateUpdateInput(data);

  const fields: string[] = [];
  const values: unknown[] = [];
  const changedFields: string[] = [];
  let index = 1;

  const assign = (column: string, value: unknown): void => {
    fields.push(`${column} = $${++index}`);
    values.push(value);
    changedFields.push(column);
  };

  if (data.type !== undefined) assign('type', data.type);
  if (data.isPrimary !== undefined) assign('is_primary', data.isPrimary);
  if (data.cep !== undefined) assign('cep', data.cep);
  if (data.street !== undefined) assign('street', data.street.trim());
  if (data.number !== undefined) assign('number', data.number.trim());
  if (data.complement !== undefined) assign('complement', data.complement);
  if (data.district !== undefined) assign('district', data.district.trim());
  if (data.city !== undefined) assign('city', data.city.trim());
  if (data.state !== undefined) assign('state', data.state.trim());
  if (data.country !== undefined) assign('country', data.country.trim());

  if (fields.length === 0) {
    return getAddressById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    if (data.isPrimary === true) {
      const existing = await client.query<{ customer_id: string }>(
        `SELECT customer_id FROM customer_addresses
         WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [agencyId, id],
      );
      const owner = existing.rows[0];
      if (!owner) {
        return null;
      }
      await demoteExistingPrimary(client, agencyId, owner.customer_id, id);
    }

    const result = await client.query<CustomerAddressRow>(
      `UPDATE customer_addresses
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1} AND deleted_at IS NULL
       RETURNING ${ADDRESS_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const address = toCustomerAddress(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_ADDRESS_UPDATED,
      entityType: 'customer_address',
      entityId: address.id,
      metadata: { customerId: address.customerId, fieldsChanged: changedFields },
    });

    return address;
  });
}

/** Soft delete. The row is retained; only `deleted_at` is stamped. */
export async function deleteAddress(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerAddress | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerAddressRow>(
      `UPDATE customer_addresses
       SET deleted_at = now(), is_primary = false, updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${ADDRESS_COLUMNS}`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const address = toCustomerAddress(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_ADDRESS_DELETED,
      entityType: 'customer_address',
      entityId: address.id,
      metadata: { customerId: address.customerId },
    });

    return address;
  });
}

/**
 * Clear the current primary flag for a customer so a new primary can be set.
 *
 * The database enforces one primary per customer via a partial unique index;
 * demoting first keeps the enforcement from turning a legitimate "make this
 * one primary" request into a constraint violation.
 */
async function demoteExistingPrimary(
  client: TenantTransactionClient,
  agencyId: string,
  customerId: string,
  exceptId?: string,
): Promise<void> {
  await client.query(
    `UPDATE customer_addresses
     SET is_primary = false, updated_at = now()
     WHERE agency_id = $1 AND customer_id = $2 AND is_primary = true
       AND deleted_at IS NULL AND ($3::text IS NULL OR id <> $3)`,
    [agencyId, customerId, exceptId ?? null],
  );
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function validateCreateInput(data: CreateAddressInput): void {
  requireNonBlank(data.customerId, 'customerId');
  requireNonBlank(data.street, 'street');
  requireNonBlank(data.number, 'number');
  requireNonBlank(data.district, 'district');
  requireNonBlank(data.city, 'city');
  requireNonBlank(data.state, 'state');
}

function validateUpdateInput(data: UpdateAddressInput): void {
  for (const field of ['street', 'number', 'district', 'city', 'state'] as const) {
    const value = data[field];
    if (value !== undefined) {
      requireNonBlank(value, field);
    }
  }
}

function toCustomerAddress(row: CustomerAddressRow): CustomerAddress {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    type: row.type,
    isPrimary: row.is_primary,
    street: row.street,
    number: row.number,
    district: row.district,
    city: row.city,
    state: row.state,
    country: row.country,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.cep !== null ? { cep: row.cep } : {}),
    ...(row.complement !== null ? { complement: row.complement } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}
