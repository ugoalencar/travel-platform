import type {
  CheckpointType,
  OperationAssignment,
  OperationAssignmentRole,
  OperationCheckpoint,
  OperationCheckpointWithExpected,
  OperationalStaff,
  OperationalStaffCapability,
  TransportOperation,
} from '../../../packages/domain/types';
import { UserRole } from '../../../packages/domain/types';
import {
  ForbiddenError,
  getAgencyId,
  getTenantContext,
  getUserId,
} from '../../../packages/domain/tenant-context';
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
  arrival_confirmed_by_user_id: string | null;
  departure_confirmed_by_user_id: string | null;
  arrival_operational_staff_id: string | null;
  departure_operational_staff_id: string | null;
  notes: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

// Joined columns needed to derive expectedAt = departureAt + plannedOffsetMinutes
// at read time, without persisting a second source of truth (see
// 006_field_operations.sql decision notes).
interface CheckpointWithDerivationRow extends CheckpointRow {
  departure_at: string;
  planned_offset_minutes: number | null;
}

export interface CreateOperationInput {
  departureId: string;
}

export interface CreateOperationalStaffInput {
  userId?: string;
  name: string;
  phone?: string;
  email?: string;
  capabilities: OperationalStaffCapability[];
}

export interface CreateOperationAssignmentInput {
  operationId: string;
  operationalStaffId: string;
  role: OperationAssignmentRole;
  createdByUserId: string;
}

export interface OperationWithCheckpoints {
  operation: TransportOperation;
  checkpoints: OperationCheckpointWithExpected[];
}

interface OperationalStaffRow {
  id: string;
  agency_id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  capabilities: OperationalStaffCapability[] | string;
  created_at: string;
  updated_at: string;
}

interface OperationAssignmentRow {
  id: string;
  agency_id: string;
  operation_id: string;
  operational_staff_id: string;
  role: OperationAssignmentRole;
  created_by_user_id: string;
  created_at: string;
}

const OPERATION_COLUMNS = `id, agency_id, departure_id, created_at, updated_at`;
const CHECKPOINT_COLUMNS = `id, agency_id, operation_id, route_point_id, checkpoint_type,
              arrival_checked_at, departure_checked_at, arrival_confirmed_by_user_id,
              departure_confirmed_by_user_id, arrival_operational_staff_id,
              departure_operational_staff_id, notes, location, created_at, updated_at`;
const STAFF_COLUMNS = `os.id, os.agency_id, os.user_id, os.name, os.phone, os.email, os.active,
              COALESCE(array_agg(osc.capability ORDER BY osc.capability)
                FILTER (WHERE osc.capability IS NOT NULL), '{}') AS capabilities,
              os.created_at, os.updated_at`;
const ASSIGNMENT_COLUMNS = `id, agency_id, operation_id, operational_staff_id, role,
              created_by_user_id, created_at`;

export async function listOperations(database: DatabaseRuntime): Promise<TransportOperation[]> {
  const agencyId = getAgencyId();
  const context = getTenantContext();

  return database.withTenantTransaction(async (client) => {
    const staffId = await findOperationalStaffIdForUser(client, agencyId, context.userId);
    if (context.userRole === UserRole.AGENT && staffId !== null) {
      const result = await client.query<OperationRow>(
        `SELECT DISTINCT op.${OPERATION_COLUMNS.replaceAll(', ', ', op.')}
         FROM transport_operations op
         JOIN operation_assignments oa
           ON oa.agency_id = op.agency_id AND oa.operation_id = op.id
         WHERE op.agency_id = $1 AND oa.operational_staff_id = $2
         ORDER BY op.created_at DESC`,
        [agencyId, staffId],
      );
      return result.rows.map(toOperation);
    }

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
 * version (see 006_field_operations.sql).
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

export async function createOperationalStaff(
  database: DatabaseRuntime,
  data: CreateOperationalStaffInput,
): Promise<OperationalStaff> {
  const agencyId = getAgencyId();

  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }
  if (!Array.isArray(data.capabilities) || data.capabilities.length === 0) {
    throw new ValidationError('Field "capabilities" is required and must be a non-empty array');
  }

  return database.withTenantTransaction(async (client) => {
    const insert = await client.query<{ id: string }>(
      `INSERT INTO operational_staff (agency_id, user_id, name, phone, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [agencyId, data.userId ?? null, data.name.trim(), data.phone ?? null, data.email ?? null],
    );
    const staffId = insert.rows[0]?.id;
    if (!staffId) {
      throw new Error('OperationalStaff insert did not return a row');
    }

    for (const capability of [...new Set(data.capabilities)]) {
      await client.query(
        `INSERT INTO operational_staff_capabilities (agency_id, operational_staff_id, capability)
         VALUES ($1, $2, $3)`,
        [agencyId, staffId, capability],
      );
    }

    return loadOperationalStaff(client, agencyId, staffId);
  });
}

export async function createOperationAssignment(
  database: DatabaseRuntime,
  data: CreateOperationAssignmentInput,
): Promise<OperationAssignment> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await assertOperationExists(client, agencyId, data.operationId);
    await assertStaffHasCapability(client, agencyId, data.operationalStaffId, data.role);

    try {
      const result = await client.query<OperationAssignmentRow>(
        `INSERT INTO operation_assignments
           (agency_id, operation_id, operational_staff_id, role, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${ASSIGNMENT_COLUMNS}`,
        [
          agencyId,
          data.operationId,
          data.operationalStaffId,
          data.role,
          data.createdByUserId,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('OperationAssignment insert did not return a row');
      }
      return toAssignment(row);
    } catch (error: unknown) {
      throw mapUniqueViolation(error, 'An assignment already exists for this operation and role');
    }
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
  const userId = getUserId();
  const context = getTenantContext();

  return database.withTenantTransaction(async (client) => {
    const row = await loadCheckpointForOperation(client, agencyId, operationId, checkpointId);
    const staffId = await resolveConfirmationStaffId(client, agencyId, operationId, context.userRole, userId);

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

    // Compare-and-set: the WHERE clause's own `${column} IS NULL` guard is
    // what makes this atomic under real concurrency, not the earlier
    // read (`row.arrival_checked_at`/`row.departure_checked_at` above,
    // which only rejects a request that arrives after a prior
    // confirmation has already committed -- it cannot see a
    // still-in-flight concurrent transaction). Two simultaneous
    // confirmations both pass that early check, but only one of the two
    // UPDATEs can match `${column} IS NULL` once Postgres serializes
    // them; the loser's UPDATE affects zero rows and is treated as a
    // conflict below, exactly like the sequential duplicate-confirmation
    // case. No SELECT ... FOR UPDATE is needed because there is no
    // multi-row invariant to protect (unlike bookings.ts's capacity
    // engine) -- a single-row atomic predicate is sufficient here.
    const column = kind === 'ARRIVAL' ? 'arrival_checked_at' : 'departure_checked_at';
    const userColumn =
      kind === 'ARRIVAL' ? 'arrival_confirmed_by_user_id' : 'departure_confirmed_by_user_id';
    const staffColumn =
      kind === 'ARRIVAL' ? 'arrival_operational_staff_id' : 'departure_operational_staff_id';
    const result = await client.query<CheckpointRow>(
      `UPDATE operation_checkpoints
       SET ${column} = now(),
           ${userColumn} = $3,
           ${staffColumn} = $4,
           updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND ${column} IS NULL
       RETURNING ${CHECKPOINT_COLUMNS}`,
      [agencyId, checkpointId, userId, staffId],
    );
    const updated = result.rows[0];
    if (!updated) {
      throw new ConflictError(`This checkpoint's ${kind.toLowerCase()} was already confirmed`);
    }
    return toCheckpoint(updated);
  });
}

async function loadOperationalStaff(
  client: TenantTransactionClient,
  agencyId: string,
  staffId: string,
): Promise<OperationalStaff> {
  const result = await client.query<OperationalStaffRow>(
    `SELECT ${STAFF_COLUMNS}
     FROM operational_staff os
     LEFT JOIN operational_staff_capabilities osc
       ON osc.agency_id = os.agency_id AND osc.operational_staff_id = os.id
     WHERE os.agency_id = $1 AND os.id = $2
     GROUP BY os.id, os.agency_id, os.user_id, os.name, os.phone, os.email,
              os.active, os.created_at, os.updated_at`,
    [agencyId, staffId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError('Operational staff not found');
  }
  return toOperationalStaff(row);
}

async function findOperationalStaffIdForUser(
  client: TenantTransactionClient,
  agencyId: string,
  userId: string,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM operational_staff
     WHERE agency_id = $1 AND user_id = $2 AND active = true`,
    [agencyId, userId],
  );
  return result.rows[0]?.id ?? null;
}

async function resolveConfirmationStaffId(
  client: TenantTransactionClient,
  agencyId: string,
  operationId: string,
  role: UserRole,
  userId: string,
): Promise<string | null> {
  const staffId = await findOperationalStaffIdForUser(client, agencyId, userId);
  if (staffId === null || role !== UserRole.AGENT) {
    return staffId;
  }

  const assignment = await client.query(
    `SELECT 1 FROM operation_assignments
     WHERE agency_id = $1 AND operation_id = $2 AND operational_staff_id = $3`,
    [agencyId, operationId, staffId],
  );
  if (assignment.rows.length === 0) {
    throw new ForbiddenError('Operational staff is not assigned to this operation');
  }
  return staffId;
}

async function assertOperationExists(
  client: TenantTransactionClient,
  agencyId: string,
  operationId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM transport_operations WHERE agency_id = $1 AND id = $2`,
    [agencyId, operationId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Operation not found');
  }
}

async function assertStaffHasCapability(
  client: TenantTransactionClient,
  agencyId: string,
  staffId: string,
  role: OperationAssignmentRole,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM operational_staff os
     JOIN operational_staff_capabilities osc
       ON osc.agency_id = os.agency_id AND osc.operational_staff_id = os.id
     WHERE os.agency_id = $1 AND os.id = $2 AND os.active = true AND osc.capability = $3`,
    [agencyId, staffId, role],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Operational staff not found for assignment role');
  }
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
    ...(row.arrival_confirmed_by_user_id !== null
      ? { arrivalConfirmedByUserId: row.arrival_confirmed_by_user_id }
      : {}),
    ...(row.departure_confirmed_by_user_id !== null
      ? { departureConfirmedByUserId: row.departure_confirmed_by_user_id }
      : {}),
    ...(row.arrival_operational_staff_id !== null
      ? { arrivalOperationalStaffId: row.arrival_operational_staff_id }
      : {}),
    ...(row.departure_operational_staff_id !== null
      ? { departureOperationalStaffId: row.departure_operational_staff_id }
      : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.location !== null ? { location: row.location } : {}),
  };
}

function toOperationalStaff(row: OperationalStaffRow): OperationalStaff {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    active: row.active,
    capabilities: parseCapabilities(row.capabilities),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.user_id !== null ? { userId: row.user_id } : {}),
    ...(row.phone !== null ? { phone: row.phone } : {}),
    ...(row.email !== null ? { email: row.email } : {}),
  };
}

function parseCapabilities(
  capabilities: OperationalStaffCapability[] | string,
): OperationalStaffCapability[] {
  if (Array.isArray(capabilities)) {
    return capabilities;
  }
  return capabilities
    .replace(/^\{|\}$/g, '')
    .split(',')
    .filter(Boolean)
    .map((capability) => capability as OperationalStaffCapability);
}

function toAssignment(row: OperationAssignmentRow): OperationAssignment {
  return {
    id: row.id,
    agencyId: row.agency_id,
    operationId: row.operation_id,
    operationalStaffId: row.operational_staff_id,
    role: row.role,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
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
