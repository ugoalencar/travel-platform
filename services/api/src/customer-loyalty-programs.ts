/**
 * Customer 360 -- loyalty (frequent-traveler) programs.
 *
 * Tenant-scoped, soft-deletable records for airline/hotel/car-rental
 * frequent-traveler numbers, belonging to either the customer or one of
 * their dependents. Follows the same shape as customer-addresses.ts /
 * customer-dependents.ts. Member numbers are not masked in audit metadata
 * (they are not government identity documents), but this file still routes
 * everything through recordAuditEvent for a consistent trail.
 */

import type { CustomerLoyaltyProgram } from '../../../packages/domain/types';
import { LoyaltyProgramType } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

const LOYALTY_COLUMNS = `id, agency_id, customer_id, dependent_id, program_type, program_name,
              member_number, tier, notes, created_at, updated_at, deleted_at`;

interface CustomerLoyaltyProgramRow {
  id: string;
  agency_id: string;
  customer_id: string;
  dependent_id: string | null;
  program_type: LoyaltyProgramType;
  program_name: string;
  member_number: string;
  tier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateLoyaltyProgramInput {
  customerId: string;
  dependentId?: string;
  programType?: LoyaltyProgramType;
  programName: string;
  memberNumber: string;
  tier?: string;
  notes?: string;
}

export interface UpdateLoyaltyProgramInput {
  programType?: LoyaltyProgramType;
  programName?: string;
  memberNumber?: string;
  tier?: string | null;
  notes?: string | null;
}

export async function listLoyaltyPrograms(
  database: DatabaseRuntime,
  customerId: string,
): Promise<CustomerLoyaltyProgram[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerLoyaltyProgramRow>(
      `SELECT ${LOYALTY_COLUMNS}
       FROM customer_loyalty_programs
       WHERE agency_id = $1 AND customer_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId, customerId],
    );

    return result.rows.map(toCustomerLoyaltyProgram);
  });
}

export async function getLoyaltyProgramById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerLoyaltyProgram | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerLoyaltyProgramRow>(
      `SELECT ${LOYALTY_COLUMNS}
       FROM customer_loyalty_programs
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toCustomerLoyaltyProgram(row) : null;
  });
}

export async function createLoyaltyProgram(
  database: DatabaseRuntime,
  data: CreateLoyaltyProgramInput,
): Promise<CustomerLoyaltyProgram> {
  const agencyId = getAgencyId();

  requireNonBlank(data.customerId, 'customerId');
  requireNonBlank(data.programName, 'programName');
  requireNonBlank(data.memberNumber, 'memberNumber');
  if (data.programType !== undefined) {
    requireProgramType(data.programType);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerLoyaltyProgramRow>(
      `INSERT INTO customer_loyalty_programs
         (agency_id, customer_id, dependent_id, program_type, program_name, member_number,
          tier, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${LOYALTY_COLUMNS}`,
      [
        agencyId,
        data.customerId,
        data.dependentId ?? null,
        data.programType ?? LoyaltyProgramType.OUTRO,
        data.programName.trim(),
        data.memberNumber.trim(),
        data.tier ?? null,
        data.notes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Customer loyalty program insert did not return a row');
    }

    const program = toCustomerLoyaltyProgram(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_LOYALTY_PROGRAM_CREATED,
      entityType: 'customer_loyalty_program',
      entityId: program.id,
      metadata: { customerId: program.customerId, programType: program.programType },
    });

    return program;
  });
}

export async function updateLoyaltyProgram(
  database: DatabaseRuntime,
  id: string,
  data: UpdateLoyaltyProgramInput,
): Promise<CustomerLoyaltyProgram | null> {
  const agencyId = getAgencyId();

  if (data.programName !== undefined) {
    requireNonBlank(data.programName, 'programName');
  }
  if (data.memberNumber !== undefined) {
    requireNonBlank(data.memberNumber, 'memberNumber');
  }
  if (data.programType !== undefined) {
    requireProgramType(data.programType);
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

  if (data.programType !== undefined) assign('program_type', data.programType);
  if (data.programName !== undefined) assign('program_name', data.programName.trim());
  if (data.memberNumber !== undefined) assign('member_number', data.memberNumber.trim());
  if (data.tier !== undefined) assign('tier', data.tier);
  if (data.notes !== undefined) assign('notes', data.notes);

  if (fields.length === 0) {
    return getLoyaltyProgramById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerLoyaltyProgramRow>(
      `UPDATE customer_loyalty_programs
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1} AND deleted_at IS NULL
       RETURNING ${LOYALTY_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const program = toCustomerLoyaltyProgram(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_LOYALTY_PROGRAM_UPDATED,
      entityType: 'customer_loyalty_program',
      entityId: program.id,
      metadata: { customerId: program.customerId, fieldsChanged: changedFields },
    });

    return program;
  });
}

/** Soft delete. The row is retained; only `deleted_at` is stamped. */
export async function deleteLoyaltyProgram(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerLoyaltyProgram | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerLoyaltyProgramRow>(
      `UPDATE customer_loyalty_programs
       SET deleted_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${LOYALTY_COLUMNS}`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const program = toCustomerLoyaltyProgram(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_LOYALTY_PROGRAM_DELETED,
      entityType: 'customer_loyalty_program',
      entityId: program.id,
      metadata: { customerId: program.customerId },
    });

    return program;
  });
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function requireProgramType(value: unknown): void {
  const allowed = Object.values(LoyaltyProgramType) as string[];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(`Field "programType" must be one of: ${allowed.join(', ')}`);
  }
}

function toCustomerLoyaltyProgram(row: CustomerLoyaltyProgramRow): CustomerLoyaltyProgram {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    programType: row.program_type,
    programName: row.program_name,
    memberNumber: row.member_number,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.dependent_id !== null ? { dependentId: row.dependent_id } : {}),
    ...(row.tier !== null ? { tier: row.tier } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}
