/**
 * CustomerSegment CRUD (persists RULES, never a frozen member list --
 * see customer-segmentation.ts for the query engine that recomputes
 * membership on every read).
 */

import type { CustomerSegment, CustomerSegmentScope } from '../../../packages/domain/types';
import {
  ForbiddenError,
  getAgencyId,
  getTenantContext,
  getUserId,
} from '../../../packages/domain/tenant-context';

function getUserRole() {
  return getTenantContext().userRole;
}
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { validateFilterDefinition } from './customer-segmentation';

interface CustomerSegmentRow {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  scope: CustomerSegmentScope;
  owner_employee_id: string | null;
  is_shared: boolean;
  filter_definition: unknown;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

const SEGMENT_COLUMNS = `id, agency_id, name, description, scope, owner_employee_id, is_shared,
  filter_definition, created_by_user_id, created_at, updated_at, archived_at`;

function toSegment(row: CustomerSegmentRow): CustomerSegment {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    scope: row.scope,
    isShared: row.is_shared,
    filterDefinition: row.filter_definition,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    description: row.description ?? undefined,
    ownerEmployeeId: row.owner_employee_id ?? undefined,
    archivedAt: row.archived_at !== null ? new Date(row.archived_at) : undefined,
  };
}

export interface CreateCustomerSegmentInput {
  name: string;
  description?: string;
  scope: CustomerSegmentScope;
  filterDefinition: unknown;
}

export interface UpdateCustomerSegmentInput {
  name?: string;
  description?: string;
  scope?: CustomerSegmentScope;
  filterDefinition?: unknown;
}

// RBAC (audited matrix -- packages/domain/tenant-context.ts ROLE_HIERARCHY):
// OWNER/ADMIN/MANAGER may create SHARED segments; AGENT may only create
// PERSONAL segments (never SHARED) -- enforced here, not just in the UI.
function assertCanCreateScope(scope: CustomerSegmentScope): void {
  const role = getUserRole();
  const canShare = role === UserRole.OWNER || role === UserRole.ADMIN || role === UserRole.MANAGER;
  if (scope === 'SHARED' && !canShare) {
    throw new ForbiddenError('Only OWNER, ADMIN or MANAGER may create shared segments');
  }
}

export async function createCustomerSegment(
  database: DatabaseRuntime,
  employeeId: string | undefined,
  input: CreateCustomerSegmentInput,
): Promise<CustomerSegment> {
  const agencyId = getAgencyId();
  const userId = getUserId();

  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required');
  }
  if (input.scope !== 'PERSONAL' && input.scope !== 'SHARED') {
    throw new ValidationError('Field "scope" must be PERSONAL or SHARED');
  }
  assertCanCreateScope(input.scope);
  const filterDefinition = validateFilterDefinition(input.filterDefinition);

  return database.withTenantTransaction(async (client) => {
    if (employeeId !== undefined) {
      await assertEmployeeInAgency(client, agencyId, employeeId);
    }

    const result = await client.query<CustomerSegmentRow>(
      `INSERT INTO customer_segments
         (agency_id, name, description, scope, owner_employee_id, is_shared, filter_definition, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING ${SEGMENT_COLUMNS}`,
      [
        agencyId,
        input.name.trim(),
        input.description ?? null,
        input.scope,
        employeeId ?? null,
        input.scope === 'SHARED',
        JSON.stringify(filterDefinition),
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Segment insert did not return a row');
    }
    const segment = toSegment(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.SEGMENT_CREATED,
      entityType: 'customer_segment',
      entityId: segment.id,
      metadata: { status: input.scope },
    });
    return segment;
  });
}

export interface ListCustomerSegmentsFilters {
  includeArchived?: boolean;
}

// Visibility: PERSONAL segments are visible only to their creator (or
// admin-tier roles, matching the spec's "visível apenas ao criador e
// admins adequados"); SHARED segments are visible to the whole team.
export async function listCustomerSegments(
  database: DatabaseRuntime,
  filters: ListCustomerSegmentsFilters = {},
): Promise<CustomerSegment[]> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  const role = getUserRole();
  const isAdminTier = role === UserRole.OWNER || role === UserRole.ADMIN || role === UserRole.MANAGER;

  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (!filters.includeArchived) {
    conditions.push('archived_at IS NULL');
  }

  if (!isAdminTier) {
    values.push(userId);
    conditions.push(`(scope = 'SHARED' OR created_by_user_id = $${values.length})`);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerSegmentRow>(
      `SELECT ${SEGMENT_COLUMNS} FROM customer_segments
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC`,
      values,
    );
    return result.rows.map(toSegment);
  });
}

export async function getCustomerSegmentById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerSegment | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerSegmentRow>(
      `SELECT ${SEGMENT_COLUMNS} FROM customer_segments WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row || !canView(row)) {
      return null;
    }
    return toSegment(row);
  });
}

// Read-visibility check: an inaccessible PERSONAL segment behaves as if
// it does not exist (returns null), matching listCustomerSegments'
// filtering rather than surfacing a distinguishable 403/404 signal.
function canView(row: CustomerSegmentRow): boolean {
  if (row.scope === 'SHARED') {
    return true;
  }
  const role = getUserRole();
  const isAdminTier = role === UserRole.OWNER || role === UserRole.ADMIN || role === UserRole.MANAGER;
  return isAdminTier || row.created_by_user_id === getUserId();
}

export async function updateCustomerSegment(
  database: DatabaseRuntime,
  id: string,
  input: UpdateCustomerSegmentInput,
): Promise<CustomerSegment | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const existingResult = await client.query<CustomerSegmentRow>(
      `SELECT ${SEGMENT_COLUMNS} FROM customer_segments WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      return null;
    }
    assertCanEdit(existing);

    const fields: string[] = [];
    const values: unknown[] = [];
    const changedFields: string[] = [];
    let index = 2;

    if (input.name !== undefined) {
      if (input.name.trim().length === 0) {
        throw new ValidationError('Field "name" must not be blank');
      }
      fields.push(`name = $${++index}`);
      values.push(input.name.trim());
      changedFields.push('name');
    }
    if (input.description !== undefined) {
      fields.push(`description = $${++index}`);
      values.push(input.description);
      changedFields.push('description');
    }
    let nextScope: CustomerSegmentScope = existing.scope;
    if (input.scope !== undefined) {
      if (input.scope !== 'PERSONAL' && input.scope !== 'SHARED') {
        throw new ValidationError('Field "scope" must be PERSONAL or SHARED');
      }
      assertCanCreateScope(input.scope);
      nextScope = input.scope;
      fields.push(`scope = $${++index}`);
      values.push(input.scope);
      fields.push(`is_shared = $${++index}`);
      values.push(input.scope === 'SHARED');
      changedFields.push('scope');
    }
    if (input.filterDefinition !== undefined) {
      const filterDefinition = validateFilterDefinition(input.filterDefinition);
      fields.push(`filter_definition = $${++index}::jsonb`);
      values.push(JSON.stringify(filterDefinition));
      changedFields.push('filterDefinition');
    }

    if (fields.length === 0) {
      return toSegment(existing);
    }

    const result = await client.query<CustomerSegmentRow>(
      `UPDATE customer_segments
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${SEGMENT_COLUMNS}`,
      [agencyId, id, ...values],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const segment = toSegment(row);
    await recordAuditEvent(client, {
      eventType: nextScope === 'SHARED' && existing.scope !== 'SHARED'
        ? AuditEventType.SEGMENT_SHARED
        : AuditEventType.SEGMENT_UPDATED,
      entityType: 'customer_segment',
      entityId: segment.id,
      metadata: { fieldsChanged: changedFields },
    });
    return segment;
  });
}

export async function archiveCustomerSegment(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerSegment | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const existingResult = await client.query<CustomerSegmentRow>(
      `SELECT ${SEGMENT_COLUMNS} FROM customer_segments WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      return null;
    }
    assertCanEdit(existing);

    const result = await client.query<CustomerSegmentRow>(
      `UPDATE customer_segments SET archived_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${SEGMENT_COLUMNS}`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const segment = toSegment(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.SEGMENT_ARCHIVED,
      entityType: 'customer_segment',
      entityId: segment.id,
    });
    return segment;
  });
}

// Edit permission: creator, or admin-tier roles. A PERSONAL segment
// belonging to another AGENT is invisible (assertCanView) long before
// this check would run, but this defends updateCustomerSegment/
// archiveCustomerSegment directly too.
function assertCanEdit(row: CustomerSegmentRow): void {
  const role = getUserRole();
  const isAdminTier = role === UserRole.OWNER || role === UserRole.ADMIN || role === UserRole.MANAGER;
  if (isAdminTier || row.created_by_user_id === getUserId()) {
    return;
  }
  throw new ForbiddenError('You do not have permission to edit this segment');
}

async function assertEmployeeInAgency(
  client: TenantTransactionClient,
  agencyId: string,
  employeeId: string,
): Promise<void> {
  const result = await client.query(`SELECT 1 FROM employees WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    employeeId,
  ]);
  if (result.rows.length === 0) {
    throw new ValidationError('Employee does not belong to this agency');
  }
}
