import type { CheckpointType, RoutePoint } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface RoutePointRow {
  id: string;
  agency_id: string;
  route_id: string;
  sequence: number;
  name: string;
  checkpoint_required: boolean;
  checkpoint_type: CheckpointType | null;
  planned_offset_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRoutePointInput {
  sequence: number;
  name: string;
  checkpointRequired?: boolean;
  checkpointType?: CheckpointType;
  plannedOffsetMinutes?: number;
  notes?: string;
}

export interface UpdateRoutePointInput {
  name?: string;
  checkpointRequired?: boolean;
  checkpointType?: CheckpointType | null;
  plannedOffsetMinutes?: number | null;
  notes?: string | null;
}

const ROUTE_POINT_COLUMNS = `id, agency_id, route_id, sequence, name, checkpoint_required,
              checkpoint_type, planned_offset_minutes, notes, created_at, updated_at`;

export async function listRoutePoints(
  database: DatabaseRuntime,
  routeId: string,
): Promise<RoutePoint[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RoutePointRow>(
      `SELECT ${ROUTE_POINT_COLUMNS} FROM route_points
       WHERE agency_id = $1 AND route_id = $2
       ORDER BY sequence ASC`,
      [agencyId, routeId],
    );
    return result.rows.map(toRoutePoint);
  });
}

export async function getRoutePointById(
  database: DatabaseRuntime,
  routeId: string,
  id: string,
): Promise<RoutePoint | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RoutePointRow>(
      `SELECT ${ROUTE_POINT_COLUMNS} FROM route_points
       WHERE agency_id = $1 AND route_id = $2 AND id = $3`,
      [agencyId, routeId, id],
    );
    const row = result.rows[0];
    return row ? toRoutePoint(row) : null;
  });
}

export async function createRoutePoint(
  database: DatabaseRuntime,
  routeId: string,
  data: CreateRoutePointInput,
): Promise<RoutePoint> {
  const agencyId = getAgencyId();

  validateCreateInput(data);

  return database.withTenantTransaction(async (client) => {
    await assertRouteBelongsToTenant(client, agencyId, routeId);

    try {
      const result = await client.query<RoutePointRow>(
        `INSERT INTO route_points
           (agency_id, route_id, sequence, name, checkpoint_required, checkpoint_type,
            planned_offset_minutes, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${ROUTE_POINT_COLUMNS}`,
        [
          agencyId,
          routeId,
          data.sequence,
          data.name,
          data.checkpointRequired ?? false,
          data.checkpointType ?? null,
          data.plannedOffsetMinutes ?? null,
          data.notes ?? null,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('RoutePoint insert did not return a row');
      }
      return toRoutePoint(row);
    } catch (error: unknown) {
      throw mapUniqueViolation(error);
    }
  });
}

export async function updateRoutePoint(
  database: DatabaseRuntime,
  routeId: string,
  id: string,
  data: UpdateRoutePointInput,
): Promise<RoutePoint | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await assertRouteBelongsToTenant(client, agencyId, routeId);

    const existing = await client.query<RoutePointRow>(
      `SELECT ${ROUTE_POINT_COLUMNS} FROM route_points
       WHERE agency_id = $1 AND route_id = $2 AND id = $3`,
      [agencyId, routeId, id],
    );
    const existingRow = existing.rows[0];
    if (!existingRow) {
      return null;
    }

    const nextCheckpointRequired = data.checkpointRequired ?? existingRow.checkpoint_required;
    const nextCheckpointType =
      data.checkpointType !== undefined ? data.checkpointType : existingRow.checkpoint_type;

    if (nextCheckpointRequired && !nextCheckpointType) {
      throw new ValidationError(
        'Field "checkpointType" is required when "checkpointRequired" is true',
      );
    }
    if (data.plannedOffsetMinutes !== undefined && data.plannedOffsetMinutes !== null) {
      if (data.plannedOffsetMinutes < 0) {
        throw new ValidationError('Field "plannedOffsetMinutes" must not be negative');
      }
    }
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new ValidationError('Field "name" must not be empty');
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 2;

    if (data.name !== undefined) {
      fields.push(`name = $${++index}`);
      values.push(data.name);
    }
    if (data.checkpointRequired !== undefined) {
      fields.push(`checkpoint_required = $${++index}`);
      values.push(data.checkpointRequired);
    }
    if (data.checkpointType !== undefined) {
      fields.push(`checkpoint_type = $${++index}::"CheckpointType"`);
      values.push(data.checkpointType);
    }
    if (data.plannedOffsetMinutes !== undefined) {
      fields.push(`planned_offset_minutes = $${++index}`);
      values.push(data.plannedOffsetMinutes);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${++index}`);
      values.push(data.notes);
    }

    if (fields.length === 0) {
      return toRoutePoint(existingRow);
    }

    const result = await client.query<RoutePointRow>(
      `UPDATE route_points SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND route_id = $2 AND id = $${index + 1}
       RETURNING ${ROUTE_POINT_COLUMNS}`,
      [agencyId, routeId, ...values, id],
    );

    const row = result.rows[0];
    return row ? toRoutePoint(row) : null;
  });
}

/**
 * Atomically rewrites the `sequence` of every RoutePoint in `orderedPointIds`
 * (first element becomes sequence 1, etc.) inside a single transaction.
 * Validates every id belongs to the given route/tenant first. Uses a
 * temporary high offset range for the intermediate write to avoid
 * colliding with the UNIQUE(agency_id, route_id, sequence) constraint
 * mid-update.
 */
export async function reorderRoutePoints(
  database: DatabaseRuntime,
  routeId: string,
  orderedPointIds: string[],
): Promise<RoutePoint[]> {
  const agencyId = getAgencyId();

  if (orderedPointIds.length === 0) {
    throw new ValidationError('Field "orderedPointIds" must not be empty');
  }
  const uniqueIds = new Set(orderedPointIds);
  if (uniqueIds.size !== orderedPointIds.length) {
    throw new ValidationError('Field "orderedPointIds" must not contain duplicate ids');
  }

  return database.withTenantTransaction(async (client) => {
    await assertRouteBelongsToTenant(client, agencyId, routeId);

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM route_points WHERE agency_id = $1 AND route_id = $2`,
      [agencyId, routeId],
    );
    const existingIds = new Set(existing.rows.map((row) => row.id));

    if (existingIds.size !== orderedPointIds.length) {
      throw new ValidationError(
        'Field "orderedPointIds" must include every RoutePoint on this route exactly once',
      );
    }
    for (const id of orderedPointIds) {
      if (!existingIds.has(id)) {
        throw new NotFoundError(`RoutePoint ${id} not found on this route`);
      }
    }

    // Temporary offset avoids UNIQUE(agency_id, route_id, sequence)
    // collisions while sequences are being rewritten.
    const temporaryOffset = orderedPointIds.length + 1000;
    for (let i = 0; i < orderedPointIds.length; i += 1) {
      await client.query(
        `UPDATE route_points SET sequence = $1, updated_at = now()
         WHERE agency_id = $2 AND route_id = $3 AND id = $4`,
        [temporaryOffset + i, agencyId, routeId, orderedPointIds[i]],
      );
    }
    for (let i = 0; i < orderedPointIds.length; i += 1) {
      await client.query(
        `UPDATE route_points SET sequence = $1, updated_at = now()
         WHERE agency_id = $2 AND route_id = $3 AND id = $4`,
        [i + 1, agencyId, routeId, orderedPointIds[i]],
      );
    }

    const result = await client.query<RoutePointRow>(
      `SELECT ${ROUTE_POINT_COLUMNS} FROM route_points
       WHERE agency_id = $1 AND route_id = $2
       ORDER BY sequence ASC`,
      [agencyId, routeId],
    );
    return result.rows.map(toRoutePoint);
  });
}

function validateCreateInput(data: CreateRoutePointInput): void {
  if (!Number.isInteger(data.sequence) || data.sequence <= 0) {
    throw new ValidationError('Field "sequence" must be a positive integer');
  }
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }
  if (data.checkpointRequired === true && !data.checkpointType) {
    throw new ValidationError(
      'Field "checkpointType" is required when "checkpointRequired" is true',
    );
  }
  if (data.plannedOffsetMinutes !== undefined && data.plannedOffsetMinutes < 0) {
    throw new ValidationError('Field "plannedOffsetMinutes" must not be negative');
  }
}

async function assertRouteBelongsToTenant(
  client: TenantTransactionClient,
  agencyId: string,
  routeId: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM routes WHERE agency_id = $1 AND id = $2`,
    [agencyId, routeId],
  );
  if (!result.rows[0]) {
    throw new NotFoundError('Route not found');
  }
}

function mapUniqueViolation(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  ) {
    return new ConflictError('A route point with this sequence already exists on this route');
  }

  return error;
}

function toRoutePoint(row: RoutePointRow): RoutePoint {
  return {
    id: row.id,
    agencyId: row.agency_id,
    routeId: row.route_id,
    sequence: row.sequence,
    name: row.name,
    checkpointRequired: row.checkpoint_required,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.checkpoint_type !== null ? { checkpointType: row.checkpoint_type } : {}),
    ...(row.planned_offset_minutes !== null
      ? { plannedOffsetMinutes: row.planned_offset_minutes }
      : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
