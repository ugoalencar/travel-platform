import type {
  CheckpointType,
  OperationCheckpoint,
  OperationCheckpointWithExpected,
  TransportOperation,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface OperationRow {
  id: string;
  agency_id: string;
  departure_id: string;
  created_at: string;
  updated_at: string;
}

interface CheckpointRow {
  id: string;
  agency_id: string;
  operation_id: string;
  route_point_id: string;
  checkpoint_type: CheckpointType;
  arrival_checked_at: string | null;
  departure_checked_at: string | null;
  notes: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

// Joined columns needed to derive expectedAt = departureAt + plannedOffsetMinutes
// at read time, without persisting a second source of truth (see
// 005_field_operations.sql decision notes).
interface CheckpointWithDerivationRow extends CheckpointRow {
  departure_at: string;
  planned_offset_minutes: number | null;
}

export interface CreateOperationInput {
  departureId: string;
}

export interface OperationWithCheckpoints {
  operation: TransportOperation;
  checkpoints: OperationCheckpointWithExpected[];
}

const OPERATION_COLUMNS = `id, agency_id, departure_id, created_at, updated_at`;
const CHECKPOINT_COLUMNS = `id, agency_id, operation_id, route_point_id, checkpoint_type,
              arrival_checked_at, departure_checked_at, notes, location, created_at, updated_at`;

export async function listOperations(database: DatabaseRuntime): Promise<TransportOperation[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OperationRow>(
      `SELECT ${OPERATION_COLUMNS} FROM transport_operations
       WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toOperation);
  });
}

export async function getOperationById(
  database: DatabaseRuntime,
  id: string,
): Promise<OperationWithCheckpoints | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const operationResult = await client.query<OperationRow>(
      `SELECT ${OPERATION_COLUMNS} FROM transport_operations WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const operationRow = operationResult.rows[0];
    if (!operationRow) {
      return null;
    }

    const checkpointsResult = await client.query<CheckpointWithDerivationRow>(
      `SELECT oc.id, oc.agency_id, oc.operation_id, oc.route_point_id, oc.checkpoint_type,
              oc.arrival_checked_at, oc.departure_checked_at, oc.notes, oc.location,
              oc.created_at, oc.updated_at,
              sd.departure_at, rp.planned_offset_minutes
       FROM operation_checkpoints oc
       JOIN transport_operations op ON op.agency_id = oc.agency_id AND op.id = oc.operation_id
       JOIN scheduled_departures sd ON sd.agency_id = op.agency_id AND sd.id = op.departure_id
       JOIN route_points rp ON rp.agency_id = oc.agency_id AND rp.id = oc.route_point_id
       WHERE oc.agency_id = $1 AND oc.operation_id = $2
       ORDER BY rp.sequence ASC`,
      [agencyId, id],
    );

    return {
      operation: toOperation(operationRow),
      checkpoints: checkpointsResult.rows.map(toCheckpointWithExpected),
    };
  });
}

/**
 * Creates a TransportOperation for a ScheduledDeparture and, in the
 * SAME transaction, generates one OperationCheckpoint for every
 * RoutePoint on the departure's product's OUTBOUND route where
 * checkpointRequired = true (snapshotting each RoutePoint's
 * checkpointType). RoutePoints with checkpointRequired = false
 * generate nothing. Return-route operations are out of scope for this
 * version (see 005_field_operations.sql).
 */
export async function createOperation(
  database: DatabaseRuntime,
  data: CreateOperationInput,
): Promise<OperationWithCheckpoints> {
  const agencyId = getAgencyId();

  if (typeof data.departureId !== 'string' || data.departureId.trim().length === 0) {
    throw new ValidationError('Field "departureId" is required and must be a non-empty string');
  }

  return database.withTenantTransaction(async (client) => {
    const departureResult = await client.query<{ outbound_route_id: string }>(
      `SELECT tp.outbound_route_id
       FROM scheduled_departures sd
       JOIN transport_products tp ON tp.agency_id = sd.agency_id AND tp.id = sd.product_id
       WHERE sd.agency_id = $1 AND sd.id = $2`,
      [agencyId, data.departureId],
    );
    const departureRow = departureResult.rows[0];
    if (!departureRow) {
      throw new NotFoundError('Scheduled departure not found');
    }

    let operationRow: OperationRow;
    try {
      const insertResult = await client.query<OperationRow>(
        `INSERT INTO transport_operations (agency_id, departure_id)
         VALUES ($1, $2)
         RETURNING ${OPERATION_COLUMNS}`,
        [agencyId, data.departureId],
      );
      const row = insertResult.rows[0];
      if (!row) {
        throw new Error('TransportOperation insert did not return a row');
      }
      operationRow = row;
    } catch (error: unknown) {
      throw mapUniqueViolation(error, 'An operation already exists for this departure');
    }

    const monitoredPoints = await client.query<{ id: string; checkpoint_type: CheckpointType }>(
      `SELECT id, checkpoint_type FROM route_points
       WHERE agency_id = $1 AND route_id = $2 AND checkpoint_required = true
       ORDER BY sequence ASC`,
      [agencyId, departureRow.outbound_route_id],
    );

    for (const point of monitoredPoints.rows) {
      await client.query(
        `INSERT INTO operation_checkpoints (agency_id, operation_id, route_point_id, checkpoint_type)
         VALUES ($1, $2, $3, $4)`,
        [agencyId, operationRow.id, point.id, point.checkpoint_type],
      );
    }

    const checkpointsResult = await client.query<CheckpointWithDerivationRow>(
      `SELECT oc.id, oc.agency_id, oc.operation_id, oc.route_point_id, oc.checkpoint_type,
              oc.arrival_checked_at, oc.departure_checked_at, oc.notes, oc.location,
              oc.created_at, oc.updated_at,
              sd.departure_at, rp.planned_offset_minutes
       FROM operation_checkpoints oc
       JOIN transport_operations op ON op.agency_id = oc.agency_id AND op.id = oc.operation_id
       JOIN scheduled_departures sd ON sd.agency_id = op.agency_id AND sd.id = op.departure_id
       JOIN route_points rp ON rp.agency_id = oc.agency_id AND rp.id = oc.route_point_id
       WHERE oc.agency_id = $1 AND oc.operation_id = $2
       ORDER BY rp.sequence ASC`,
      [agencyId, operationRow.id],
    );

    return {
      operation: toOperation(operationRow),
      checkpoints: checkpointsResult.rows.map(toCheckpointWithExpected),
    };
  });
}

/**
 * Idempotent-safe: rejects a second confirmation of the same type with
 * a clean ConflictError, rather than silently overwriting a real first
 * confirmation time. Server always stamps now() -- the client can
 * never supply a confirmation timestamp.
 */
export async function confirmArrival(
  database: DatabaseRuntime,
  operationId: string,
  checkpointId: string,
): Promise<OperationCheckpoint> {
  return confirmCheckpoint(database, operationId, checkpointId, 'ARRIVAL');
}

export async function confirmDeparture(
  database: DatabaseRuntime,
  operationId: string,
  checkpointId: string,
): Promise<OperationCheckpoint> {
  return confirmCheckpoint(database, operationId, checkpointId, 'DEPARTURE');
}

async function confirmCheckpoint(
  database: DatabaseRuntime,
  operationId: string,
  checkpointId: string,
  kind: 'ARRIVAL' | 'DEPARTURE',
): Promise<OperationCheckpoint> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const row = await loadCheckpointForOperation(client, agencyId, operationId, checkpointId);

    const allowedTypes = kind === 'ARRIVAL' ? ['ARRIVAL', 'BOTH'] : ['DEPARTURE', 'BOTH'];
    if (!allowedTypes.includes(row.checkpoint_type)) {
      throw new ValidationError(
        `Checkpoint of type "${row.checkpoint_type}" does not accept a ${kind.toLowerCase()} confirmation`,
      );
    }

    const alreadyConfirmed =
      kind === 'ARRIVAL' ? row.arrival_checked_at !== null : row.departure_checked_at !== null;
    if (alreadyConfirmed) {
      throw new ConflictError(`This checkpoint's ${kind.toLowerCase()} was already confirmed`);
    }

    const column = kind === 'ARRIVAL' ? 'arrival_checked_at' : 'departure_checked_at';
    const result = await client.query<CheckpointRow>(
      `UPDATE operation_checkpoints SET ${column} = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${CHECKPOINT_COLUMNS}`,
      [agencyId, checkpointId],
    );
    const updated = result.rows[0];
    if (!updated) {
      throw new Error('OperationCheckpoint update did not return a row');
    }
    return toCheckpoint(updated);
  });
}

async function loadCheckpointForOperation(
  client: TenantTransactionClient,
  agencyId: string,
  operationId: string,
  checkpointId: string,
): Promise<CheckpointRow> {
  const operationCheck = await client.query(
    `SELECT 1 FROM transport_operations WHERE agency_id = $1 AND id = $2`,
    [agencyId, operationId],
  );
  if (operationCheck.rows.length === 0) {
    throw new NotFoundError('Operation not found');
  }

  const result = await client.query<CheckpointRow>(
    `SELECT ${CHECKPOINT_COLUMNS} FROM operation_checkpoints
     WHERE agency_id = $1 AND operation_id = $2 AND id = $3`,
    [agencyId, operationId, checkpointId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError('Checkpoint not found');
  }
  return row;
}

function mapUniqueViolation(error: unknown, message: string): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  ) {
    return new ConflictError(message);
  }
  return error;
}

function toOperation(row: OperationRow): TransportOperation {
  return {
    id: row.id,
    agencyId: row.agency_id,
    departureId: row.departure_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toCheckpoint(row: CheckpointRow): OperationCheckpoint {
  return {
    id: row.id,
    agencyId: row.agency_id,
    operationId: row.operation_id,
    routePointId: row.route_point_id,
    checkpointType: row.checkpoint_type,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.arrival_checked_at !== null ? { arrivalCheckedAt: new Date(row.arrival_checked_at) } : {}),
    ...(row.departure_checked_at !== null
      ? { departureCheckedAt: new Date(row.departure_checked_at) }
      : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.location !== null ? { location: row.location } : {}),
  };
}

function toCheckpointWithExpected(row: CheckpointWithDerivationRow): OperationCheckpointWithExpected {
  const base = toCheckpoint(row);
  if (row.planned_offset_minutes === null) {
    return base;
  }
  const departureAt = new Date(row.departure_at);
  const expectedAt = new Date(departureAt.getTime() + row.planned_offset_minutes * 60_000);
  return { ...base, expectedAt };
}
