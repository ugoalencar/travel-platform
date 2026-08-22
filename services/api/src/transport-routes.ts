import type { Route } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';

interface RouteRow {
  id: string;
  agency_id: string;
  origin: string;
  destination: string;
  estimated_duration: number | null;
  distance: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRouteInput {
  origin: string;
  destination: string;
  estimatedDuration?: number;
  distance?: number;
  notes?: string;
  active?: boolean;
}

export interface UpdateRouteInput {
  origin?: string;
  destination?: string;
  estimatedDuration?: number;
  distance?: number;
  notes?: string;
  active?: boolean;
}

const ROUTE_COLUMNS = `id, agency_id, origin, destination, estimated_duration, distance, notes, active,
              created_at, updated_at`;

export async function listRoutes(database: DatabaseRuntime): Promise<Route[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RouteRow>(
      `SELECT ${ROUTE_COLUMNS} FROM routes WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toRoute);
  });
}

export async function getRouteById(database: DatabaseRuntime, id: string): Promise<Route | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RouteRow>(
      `SELECT ${ROUTE_COLUMNS} FROM routes WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toRoute(row) : null;
  });
}

export async function createRoute(
  database: DatabaseRuntime,
  data: CreateRouteInput,
): Promise<Route> {
  const agencyId = getAgencyId();

  if (data.origin.trim().length === 0) {
    throw new ValidationError('Field "origin" must not be empty');
  }
  if (data.destination.trim().length === 0) {
    throw new ValidationError('Field "destination" must not be empty');
  }
  if (data.estimatedDuration !== undefined && data.estimatedDuration < 0) {
    throw new ValidationError('Field "estimatedDuration" must not be negative');
  }
  if (data.distance !== undefined && data.distance < 0) {
    throw new ValidationError('Field "distance" must not be negative');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RouteRow>(
      `INSERT INTO routes (agency_id, origin, destination, estimated_duration, distance, notes, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${ROUTE_COLUMNS}`,
      [
        agencyId,
        data.origin,
        data.destination,
        data.estimatedDuration ?? null,
        data.distance ?? null,
        data.notes ?? null,
        data.active ?? true,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Route insert did not return a row');
    }
    return toRoute(row);
  });
}

export async function updateRoute(
  database: DatabaseRuntime,
  id: string,
  data: UpdateRouteInput,
): Promise<Route | null> {
  const agencyId = getAgencyId();

  if (data.origin !== undefined && data.origin.trim().length === 0) {
    throw new ValidationError('Field "origin" must not be empty');
  }
  if (data.destination !== undefined && data.destination.trim().length === 0) {
    throw new ValidationError('Field "destination" must not be empty');
  }
  if (data.estimatedDuration !== undefined && data.estimatedDuration < 0) {
    throw new ValidationError('Field "estimatedDuration" must not be negative');
  }
  if (data.distance !== undefined && data.distance < 0) {
    throw new ValidationError('Field "distance" must not be negative');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (data.origin !== undefined) {
    fields.push(`origin = $${++index}`);
    values.push(data.origin);
  }
  if (data.destination !== undefined) {
    fields.push(`destination = $${++index}`);
    values.push(data.destination);
  }
  if (data.estimatedDuration !== undefined) {
    fields.push(`estimated_duration = $${++index}`);
    values.push(data.estimatedDuration);
  }
  if (data.distance !== undefined) {
    fields.push(`distance = $${++index}`);
    values.push(data.distance);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${++index}`);
    values.push(data.notes);
  }
  if (data.active !== undefined) {
    fields.push(`active = $${++index}`);
    values.push(data.active);
  }

  if (fields.length === 0) {
    return getRouteById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RouteRow>(
      `UPDATE routes SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${ROUTE_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    return row ? toRoute(row) : null;
  });
}

function toRoute(row: RouteRow): Route {
  return {
    id: row.id,
    agencyId: row.agency_id,
    origin: row.origin,
    destination: row.destination,
    active: row.active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.estimated_duration !== null ? { estimatedDuration: row.estimated_duration } : {}),
    ...(row.distance !== null ? { distance: Number(row.distance) } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
