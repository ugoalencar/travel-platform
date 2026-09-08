/**
 * Customer 360 -- travel requirements checklist.
 *
 * A narrow, operational checklist of what a traveler (the customer or one of
 * their dependents) needs for a trip -- valid passport, visa, vaccination,
 * insurance, authorization -- and whether it has been fulfilled. Deliberately
 * NOT a medical record: `type = VACINACAO` only tracks a required/fulfilled
 * flag plus an optional linked document, never health details.
 */

import type { TravelRequirement } from '../../../packages/domain/types';
import { TravelRequirementType, TravelerType } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

const REQUIREMENT_COLUMNS = `id, agency_id, customer_id, traveler_type, dependent_id, trip_id,
              destination, type, required, fulfilled, document_id, expiration_date, notes,
              created_at, updated_at, deleted_at`;

interface TravelRequirementRow {
  id: string;
  agency_id: string;
  customer_id: string;
  traveler_type: TravelerType;
  dependent_id: string | null;
  trip_id: string | null;
  destination: string | null;
  type: TravelRequirementType;
  required: boolean;
  fulfilled: boolean;
  document_id: string | null;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateTravelRequirementInput {
  customerId: string;
  travelerType?: TravelerType;
  dependentId?: string;
  tripId?: string;
  destination?: string;
  type: TravelRequirementType;
  required?: boolean;
  fulfilled?: boolean;
  documentId?: string;
  expirationDate?: string;
  notes?: string;
}

export interface UpdateTravelRequirementInput {
  destination?: string | null;
  required?: boolean;
  fulfilled?: boolean;
  documentId?: string | null;
  expirationDate?: string | null;
  notes?: string | null;
}

export async function listTravelRequirements(
  database: DatabaseRuntime,
  customerId: string,
): Promise<TravelRequirement[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelRequirementRow>(
      `SELECT ${REQUIREMENT_COLUMNS}
       FROM travel_requirements
       WHERE agency_id = $1 AND customer_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId, customerId],
    );

    return result.rows.map(toTravelRequirement);
  });
}

export async function getTravelRequirementById(
  database: DatabaseRuntime,
  id: string,
): Promise<TravelRequirement | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelRequirementRow>(
      `SELECT ${REQUIREMENT_COLUMNS}
       FROM travel_requirements
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toTravelRequirement(row) : null;
  });
}

export async function createTravelRequirement(
  database: DatabaseRuntime,
  data: CreateTravelRequirementInput,
): Promise<TravelRequirement> {
  const agencyId = getAgencyId();

  requireNonBlank(data.customerId, 'customerId');
  requireRequirementType(data.type);

  const travelerType = data.travelerType ?? TravelerType.CUSTOMER;
  if (travelerType === TravelerType.DEPENDENT && !data.dependentId) {
    throw new ValidationError('Field "dependentId" is required when travelerType is DEPENDENT');
  }
  if (travelerType === TravelerType.CUSTOMER && data.dependentId) {
    throw new ValidationError('Field "dependentId" must be omitted when travelerType is CUSTOMER');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelRequirementRow>(
      `INSERT INTO travel_requirements
         (agency_id, customer_id, traveler_type, dependent_id, trip_id, destination, type,
          required, fulfilled, document_id, expiration_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${REQUIREMENT_COLUMNS}`,
      [
        agencyId,
        data.customerId,
        travelerType,
        data.dependentId ?? null,
        data.tripId ?? null,
        data.destination ?? null,
        data.type,
        data.required ?? true,
        data.fulfilled ?? false,
        data.documentId ?? null,
        data.expirationDate ?? null,
        data.notes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Travel requirement insert did not return a row');
    }

    const requirement = toTravelRequirement(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_UPDATED,
      entityType: 'travel_requirement',
      entityId: requirement.id,
      metadata: { customerId: requirement.customerId, type: requirement.type },
    });

    return requirement;
  });
}

export async function updateTravelRequirement(
  database: DatabaseRuntime,
  id: string,
  data: UpdateTravelRequirementInput,
): Promise<TravelRequirement | null> {
  const agencyId = getAgencyId();

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const assign = (column: string, value: unknown): void => {
    fields.push(`${column} = $${++index}`);
    values.push(value);
  };

  if (data.destination !== undefined) assign('destination', data.destination);
  if (data.required !== undefined) assign('required', data.required);
  if (data.fulfilled !== undefined) assign('fulfilled', data.fulfilled);
  if (data.documentId !== undefined) assign('document_id', data.documentId);
  if (data.expirationDate !== undefined) assign('expiration_date', data.expirationDate);
  if (data.notes !== undefined) assign('notes', data.notes);

  if (fields.length === 0) {
    return getTravelRequirementById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelRequirementRow>(
      `UPDATE travel_requirements
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1} AND deleted_at IS NULL
       RETURNING ${REQUIREMENT_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const requirement = toTravelRequirement(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_UPDATED,
      entityType: 'travel_requirement',
      entityId: requirement.id,
      metadata: { customerId: requirement.customerId },
    });

    return requirement;
  });
}

export async function deleteTravelRequirement(
  database: DatabaseRuntime,
  id: string,
): Promise<TravelRequirement | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelRequirementRow>(
      `UPDATE travel_requirements
       SET deleted_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${REQUIREMENT_COLUMNS}`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const requirement = toTravelRequirement(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CUSTOMER_UPDATED,
      entityType: 'travel_requirement',
      entityId: requirement.id,
      metadata: { customerId: requirement.customerId, deleted: true },
    });

    return requirement;
  });
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function requireRequirementType(value: unknown): void {
  const allowed = Object.values(TravelRequirementType) as string[];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(`Field "type" must be one of: ${allowed.join(', ')}`);
  }
}

function toTravelRequirement(row: TravelRequirementRow): TravelRequirement {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    travelerType: row.traveler_type,
    type: row.type,
    required: row.required,
    fulfilled: row.fulfilled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.dependent_id !== null ? { dependentId: row.dependent_id } : {}),
    ...(row.trip_id !== null ? { tripId: row.trip_id } : {}),
    ...(row.destination !== null ? { destination: row.destination } : {}),
    ...(row.document_id !== null ? { documentId: row.document_id } : {}),
    ...(row.expiration_date !== null ? { expirationDate: new Date(row.expiration_date) } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}
