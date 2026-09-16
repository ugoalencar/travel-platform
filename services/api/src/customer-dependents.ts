/**
 * Customer 360 -- dependents and travel companions.
 *
 * Tenant-scoped, soft-deletable records describing the people a customer
 * habitually travels with. CPFs are stored for booking purposes but are never
 * emitted into audit metadata in the clear.
 */

import type { CustomerDependent } from '../../../packages/domain/types';
import { RelationshipType } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

const DEPENDENT_COLUMNS = `id, agency_id, customer_id, name, relationship_type, birth_date,
              cpf, nationality, notes, has_power_of_attorney, power_of_attorney_notes,
              created_at, updated_at, deleted_at`;

interface CustomerDependentRow {
  id: string;
  agency_id: string;
  customer_id: string;
  name: string;
  relationship_type: RelationshipType;
  birth_date: string | null;
  cpf: string | null;
  nationality: string | null;
  notes: string | null;
  has_power_of_attorney: boolean;
  power_of_attorney_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateDependentInput {
  customerId: string;
  name: string;
  relationshipType: RelationshipType;
  birthDate?: string;
  cpf?: string;
  nationality?: string;
  notes?: string;
  hasPowerOfAttorney?: boolean;
  powerOfAttorneyNotes?: string;
}

export interface UpdateDependentInput {
  name?: string;
  relationshipType?: RelationshipType;
  birthDate?: string | null;
  cpf?: string | null;
  nationality?: string | null;
  notes?: string | null;
  hasPowerOfAttorney?: boolean;
  powerOfAttorneyNotes?: string | null;
}

export async function listDependents(
  database: DatabaseRuntime,
  customerId: string,
): Promise<CustomerDependent[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDependentRow>(
      `SELECT ${DEPENDENT_COLUMNS}
       FROM customer_dependents
       WHERE agency_id = $1 AND customer_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId, customerId],
    );

    return result.rows.map(toCustomerDependent);
  });
}

export async function getDependentById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerDependent | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDependentRow>(
      `SELECT ${DEPENDENT_COLUMNS}
       FROM customer_dependents
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toCustomerDependent(row) : null;
  });
}

export async function createDependent(
  database: DatabaseRuntime,
  data: CreateDependentInput,
): Promise<CustomerDependent> {
  const agencyId = getAgencyId();

  requireNonBlank(data.customerId, 'customerId');
  requireNonBlank(data.name, 'name');
  requireRelationshipType(data.relationshipType);

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDependentRow>(
      `INSERT INTO customer_dependents
         (agency_id, customer_id, name, relationship_type, birth_date, cpf, nationality, notes,
          has_power_of_attorney, power_of_attorney_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${DEPENDENT_COLUMNS}`,
      [
        agencyId,
        data.customerId,
        data.name.trim(),
        data.relationshipType,
        data.birthDate ?? null,
        data.cpf ?? null,
        data.nationality ?? null,
        data.notes ?? null,
        data.hasPowerOfAttorney ?? false,
        data.powerOfAttorneyNotes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Customer dependent insert did not return a row');
    }

    const dependent = toCustomerDependent(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_DEPENDENT_CREATED,
      entityType: 'customer_dependent',
      entityId: dependent.id,
      // Deliberately no name/cpf: the entity id is enough to correlate.
      metadata: {
        customerId: dependent.customerId,
        relationshipType: dependent.relationshipType,
      },
    });

    return dependent;
  });
}

export async function updateDependent(
  database: DatabaseRuntime,
  id: string,
  data: UpdateDependentInput,
): Promise<CustomerDependent | null> {
  const agencyId = getAgencyId();

  if (data.name !== undefined) {
    requireNonBlank(data.name, 'name');
  }
  if (data.relationshipType !== undefined) {
    requireRelationshipType(data.relationshipType);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const changedFields: string[] = [];
  let index = 1;

  const assign = (column: string, value: unknown): void => {
    fields.push(`${column} = $${++index}`);
    values.push(value);
    changedFields.push(column);
  };

  if (data.name !== undefined) assign('name', data.name.trim());
  if (data.relationshipType !== undefined) assign('relationship_type', data.relationshipType);
  if (data.birthDate !== undefined) assign('birth_date', data.birthDate);
  if (data.cpf !== undefined) assign('cpf', data.cpf);
  if (data.nationality !== undefined) assign('nationality', data.nationality);
  if (data.notes !== undefined) assign('notes', data.notes);
  if (data.hasPowerOfAttorney !== undefined) assign('has_power_of_attorney', data.hasPowerOfAttorney);
  if (data.powerOfAttorneyNotes !== undefined) assign('power_of_attorney_notes', data.powerOfAttorneyNotes);

  if (fields.length === 0) {
    return getDependentById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDependentRow>(
      `UPDATE customer_dependents
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1} AND deleted_at IS NULL
       RETURNING ${DEPENDENT_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const dependent = toCustomerDependent(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_DEPENDENT_UPDATED,
      entityType: 'customer_dependent',
      entityId: dependent.id,
      metadata: { customerId: dependent.customerId, fieldsChanged: changedFields },
    });

    return dependent;
  });
}

/** Soft delete. The row is retained; only `deleted_at` is stamped. */
export async function deleteDependent(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerDependent | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDependentRow>(
      `UPDATE customer_dependents
       SET deleted_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${DEPENDENT_COLUMNS}`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const dependent = toCustomerDependent(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_DEPENDENT_DELETED,
      entityType: 'customer_dependent',
      entityId: dependent.id,
      metadata: { customerId: dependent.customerId },
    });

    return dependent;
  });
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function requireRelationshipType(value: unknown): void {
  const allowed = Object.values(RelationshipType) as string[];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(
      `Field "relationshipType" must be one of: ${allowed.join(', ')}`,
    );
  }
}

function toCustomerDependent(row: CustomerDependentRow): CustomerDependent {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    name: row.name,
    relationshipType: row.relationship_type,
    hasPowerOfAttorney: row.has_power_of_attorney,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.birth_date !== null ? { birthDate: new Date(row.birth_date) } : {}),
    ...(row.cpf !== null ? { cpf: row.cpf } : {}),
    ...(row.nationality !== null ? { nationality: row.nationality } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.power_of_attorney_notes !== null ? { powerOfAttorneyNotes: row.power_of_attorney_notes } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}
