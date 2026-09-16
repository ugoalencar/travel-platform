/**
 * Customer 360 -- dependents and travel companions.
 *
 * Tenant-scoped, soft-deletable records describing the people a customer
 * habitually travels with. CPFs are stored for booking purposes but are never
 * emitted into audit metadata in the clear.
 */

import type { Customer, CustomerDependent } from '../../../packages/domain/types';
import { RelationshipType } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { createCustomer, getCustomerById } from './customers';

const DEPENDENT_COLUMNS = `id, agency_id, customer_id, name, relationship_type, birth_date,
              cpf, nationality, notes, has_power_of_attorney, power_of_attorney_notes,
              converted_customer_id, created_at, updated_at, deleted_at`;

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
  converted_customer_id: string | null;
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
  /** Link an already-registered customer as this companion, instead of
   * creating a brand-new standalone dependent record -- avoids ending
   * up with two separate, conflicting customer records for the same
   * person later. name/cpf/nationality/birthDate are taken from that
   * customer's own record when this is set, ignoring any value passed
   * for those fields, so the two records can never drift apart on
   * identity data. Requested directly: "ele pode criar um acompanhante
   * novo ou atrelar um cliente como acompanhante para não gerar
   * conflito caso seja cliente." */
  existingCustomerId?: string;
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
  requireRelationshipType(data.relationshipType);

  let linkedCustomer: Customer | null = null;
  if (data.existingCustomerId) {
    if (data.existingCustomerId === data.customerId) {
      throw new ValidationError('A customer cannot be their own companion');
    }
    linkedCustomer = await getCustomerById(database, data.existingCustomerId);
    if (!linkedCustomer) {
      throw new NotFoundError('Customer not found');
    }
  } else {
    requireNonBlank(data.name, 'name');
  }

  // Identity fields come from the linked customer's own record when one
  // is attached, never from client input, so the two records can never
  // drift apart on name/cpf/nationality/birth date.
  const name = linkedCustomer ? linkedCustomer.name : data.name.trim();
  const birthDate = linkedCustomer
    ? (linkedCustomer.birthDate?.toISOString().slice(0, 10) ?? null)
    : (data.birthDate ?? null);
  const cpf = linkedCustomer ? (linkedCustomer.cpf ?? null) : (data.cpf ?? null);
  const nationality = linkedCustomer ? (linkedCustomer.nationality ?? null) : (data.nationality ?? null);

  return database.withTenantTransaction(async (client) => {
    let result;
    try {
      result = await client.query<CustomerDependentRow>(
        `INSERT INTO customer_dependents
           (agency_id, customer_id, name, relationship_type, birth_date, cpf, nationality, notes,
            has_power_of_attorney, power_of_attorney_notes, converted_customer_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${DEPENDENT_COLUMNS}`,
        [
          agencyId,
          data.customerId,
          name,
          data.relationshipType,
          birthDate,
          cpf,
          nationality,
          data.notes ?? null,
          data.hasPowerOfAttorney ?? false,
          data.powerOfAttorneyNotes ?? null,
          linkedCustomer?.id ?? null,
        ],
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('This customer is already linked as a companion elsewhere');
      }
      throw error;
    }

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

/**
 * Promotes a companion (never a minor -- CHILD dependents stay tied to
 * their guardian, never independently sold to) into a real, independent
 * `customers` row, so they can be found in Clientes/Propostas/Vendas/
 * Ofertas like any other customer. The original dependent record is
 * kept and linked via converted_customer_id, not deleted -- the
 * companion relationship to the original customer still matters for
 * trip planning even after they become a customer in their own right.
 *
 * Not atomic across the two inserts (createCustomer manages its own
 * transaction) -- if the link update below fails after the customer
 * was created, the customer row is simply left unlinked rather than
 * rolled back, same tradeoff every other multi-step flow in this
 * codebase (e.g. enrollment) already makes.
 */
export async function convertDependentToCustomer(
  database: DatabaseRuntime,
  dependentId: string,
): Promise<{ dependent: CustomerDependent; customer: Customer }> {
  const dependent = await getDependentById(database, dependentId);
  if (!dependent) {
    throw new NotFoundError('Dependent not found');
  }
  if (dependent.relationshipType === RelationshipType.CHILD) {
    throw new ValidationError('A minor dependent cannot be converted into a customer');
  }
  if (dependent.convertedCustomerId) {
    throw new ConflictError('This companion has already been converted into a customer');
  }

  const customer = await createCustomer(database, {
    name: dependent.name,
    ...(dependent.birthDate ? { birthDate: dependent.birthDate.toISOString().slice(0, 10) } : {}),
    ...(dependent.cpf ? { cpf: dependent.cpf } : {}),
    ...(dependent.nationality ? { nationality: dependent.nationality } : {}),
    notes: `Convertido(a) a partir do acompanhante de ${dependent.customerId}.`,
  });

  const agencyId = getAgencyId();
  const updated = await database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerDependentRow>(
      `UPDATE customer_dependents
       SET converted_customer_id = $1, updated_at = now()
       WHERE agency_id = $2 AND id = $3 AND deleted_at IS NULL
       RETURNING ${DEPENDENT_COLUMNS}`,
      [customer.id, agencyId, dependentId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('Dependent not found');
    }
    const linkedDependent = toCustomerDependent(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_DEPENDENT_UPDATED,
      entityType: 'customer_dependent',
      entityId: linkedDependent.id,
      metadata: { customerId: linkedDependent.customerId, fieldsChanged: ['converted_customer_id'] },
    });
    return linkedDependent;
  });

  return { dependent: updated, customer };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
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
    ...(row.converted_customer_id !== null ? { convertedCustomerId: row.converted_customer_id } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}
