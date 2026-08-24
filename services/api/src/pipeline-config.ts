import {
  PipelineStageVisualLevel,
  type Pipeline,
  type PipelineAccess,
  type PipelineStage,
  type PipelineStageColor,
} from '../../../packages/domain/types';
import { ForbiddenError, getAgencyId, getTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError, ValidationError } from './errors';

// ============================================================
// ROW SHAPES
// ============================================================

interface PipelineRow {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  active: boolean;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface PipelineStageRow {
  id: string;
  agency_id: string;
  pipeline_id: string;
  name: string;
  sequence: number;
  color_key: PipelineStageColor;
  visual_level: PipelineStageVisualLevel;
  active: boolean;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface PipelineAccessRow {
  id: string;
  agency_id: string;
  pipeline_id: string;
  user_id: string;
  created_at: string;
}

const PIPELINE_COLUMNS = `id, agency_id, name, description, active, notifications_enabled, created_at, updated_at`;
const STAGE_COLUMNS = `id, agency_id, pipeline_id, name, sequence, color_key, visual_level, active, notifications_enabled, created_at, updated_at`;
const ACCESS_COLUMNS = `id, agency_id, pipeline_id, user_id, created_at`;

function toPipeline(row: PipelineRow): Pipeline {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    active: row.active,
    notificationsEnabled: row.notifications_enabled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
  };
}

function toStage(row: PipelineStageRow): PipelineStage {
  return {
    id: row.id,
    agencyId: row.agency_id,
    pipelineId: row.pipeline_id,
    name: row.name,
    sequence: row.sequence,
    colorKey: row.color_key,
    visualLevel: row.visual_level,
    active: row.active,
    notificationsEnabled: row.notifications_enabled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toAccess(row: PipelineAccessRow): PipelineAccess {
  return {
    id: row.id,
    agencyId: row.agency_id,
    pipelineId: row.pipeline_id,
    userId: row.user_id,
    createdAt: new Date(row.created_at),
  };
}

// ============================================================
// ACCESS ENFORCEMENT ("default open until restricted")
//
// A pipeline with ZERO pipeline_access rows is visible to any agency
// staff member. Once at least one pipeline_access row exists for a
// pipeline, only OWNER/ADMIN (whose role already grants agency-wide
// visibility) plus users with an explicit pipeline_access row may see
// it. This is a deliberate design choice (not the obvious default) so
// that a newly created pipeline with no access rows configured yet does
// not lock everyone out by default -- the Admin opts INTO restriction by
// granting access to specific users. See PipelineAccess doc comment in
// packages/domain/types.ts.
// ============================================================

// Returns true if the current tenant-context user may see this pipeline.
export async function canAccessPipeline(
  client: TenantTransactionClient,
  agencyId: string,
  pipelineId: string,
): Promise<boolean> {
  const context = getTenantContext();

  if (context.userRole === UserRole.OWNER || context.userRole === UserRole.ADMIN) {
    return true;
  }

  const accessRows = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM pipeline_access WHERE agency_id = $1 AND pipeline_id = $2`,
    [agencyId, pipelineId],
  );
  const totalGrants = Number(accessRows.rows[0]?.count ?? '0');
  if (totalGrants === 0) {
    // Unrestricted: no grants configured at all for this pipeline yet.
    return true;
  }

  const ownGrant = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM pipeline_access
     WHERE agency_id = $1 AND pipeline_id = $2 AND user_id = $3`,
    [agencyId, pipelineId, context.userId],
  );
  return Number(ownGrant.rows[0]?.count ?? '0') > 0;
}

export async function assertCanAccessPipeline(
  client: TenantTransactionClient,
  agencyId: string,
  pipelineId: string,
): Promise<void> {
  const allowed = await canAccessPipeline(client, agencyId, pipelineId);
  if (!allowed) {
    throw new ForbiddenError('You do not have access to this pipeline');
  }
}

// Returns the list of pipeline_id values the current user may see, used
// to scope any opportunities-list/dashboard/agenda query that is NOT
// already filtered down to one explicit pipelineId. OWNER/ADMIN get every
// pipeline id in the agency (their role already grants full visibility).
export async function resolveVisiblePipelineIds(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<string[]> {
  const context = getTenantContext();

  const allPipelines = await client.query<{ id: string }>(
    `SELECT id FROM pipelines WHERE agency_id = $1`,
    [agencyId],
  );
  const allIds = allPipelines.rows.map((r) => r.id);

  if (context.userRole === UserRole.OWNER || context.userRole === UserRole.ADMIN) {
    return allIds;
  }

  const restricted = await client.query<{ pipeline_id: string }>(
    `SELECT DISTINCT pipeline_id FROM pipeline_access WHERE agency_id = $1`,
    [agencyId],
  );
  const restrictedIds = new Set(restricted.rows.map((r) => r.pipeline_id));

  const ownGrants = await client.query<{ pipeline_id: string }>(
    `SELECT pipeline_id FROM pipeline_access WHERE agency_id = $1 AND user_id = $2`,
    [agencyId, context.userId],
  );
  const ownIds = new Set(ownGrants.rows.map((r) => r.pipeline_id));

  return allIds.filter((id) => !restrictedIds.has(id) || ownIds.has(id));
}

// RBAC gate for pipeline/stage/access CONFIGURATION writes only (create/
// edit pipeline, create/edit/reorder/color stage, grant/revoke access).
// Reading opportunities remains open to any authenticated staff role per
// the existing VIEWER-read pattern; only the pipeline-visibility check
// above gates that.
export function requirePipelineAdmin(): void {
  const context = getTenantContext();
  if (context.userRole !== UserRole.OWNER && context.userRole !== UserRole.ADMIN) {
    throw new ForbiddenError('Requires ADMIN role or higher to configure pipelines');
  }
}

async function assertUserInAgency(
  client: TenantTransactionClient,
  agencyId: string,
  userId: string,
): Promise<void> {
  const result = await client.query(`SELECT 1 FROM users WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    userId,
  ]);
  if (result.rows.length === 0) {
    throw new ValidationError('User does not belong to this agency');
  }
}

// ============================================================
// PIPELINES
// ============================================================

export interface CreatePipelineInput {
  name: string;
  description?: string;
  notificationsEnabled?: boolean;
}

export interface UpdatePipelineInput {
  name?: string;
  description?: string | null;
  active?: boolean;
  notificationsEnabled?: boolean;
}

export async function listPipelines(database: DatabaseRuntime): Promise<Pipeline[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const visibleIds = await resolveVisiblePipelineIds(client, agencyId);
    if (visibleIds.length === 0) {
      return [];
    }
    const result = await client.query<PipelineRow>(
      `SELECT ${PIPELINE_COLUMNS} FROM pipelines WHERE agency_id = $1 AND id = ANY($2::text[]) ORDER BY name ASC`,
      [agencyId, visibleIds],
    );
    return result.rows.map(toPipeline);
  });
}

export async function getPipelineById(database: DatabaseRuntime, id: string): Promise<Pipeline | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await assertCanAccessPipeline(client, agencyId, id);
    const result = await client.query<PipelineRow>(
      `SELECT ${PIPELINE_COLUMNS} FROM pipelines WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toPipeline(row) : null;
  });
}

export async function createPipeline(
  database: DatabaseRuntime,
  data: CreatePipelineInput,
): Promise<Pipeline> {
  const agencyId = getAgencyId();
  requirePipelineAdmin();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PipelineRow>(
      `INSERT INTO pipelines (agency_id, name, description, notifications_enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PIPELINE_COLUMNS}`,
      [agencyId, data.name, data.description ?? null, data.notificationsEnabled ?? false],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Pipeline insert did not return a row');
    }
    return toPipeline(row);
  });
}

export async function updatePipeline(
  database: DatabaseRuntime,
  id: string,
  data: UpdatePipelineInput,
): Promise<Pipeline | null> {
  const agencyId = getAgencyId();
  requirePipelineAdmin();

  return database.withTenantTransaction(async (client) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${++index}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${++index}`);
      values.push(data.description);
    }
    if (data.active !== undefined) {
      fields.push(`active = $${++index}`);
      values.push(data.active);
    }
    if (data.notificationsEnabled !== undefined) {
      fields.push(`notifications_enabled = $${++index}`);
      values.push(data.notificationsEnabled);
    }

    if (fields.length === 0) {
      const existing = await client.query<PipelineRow>(
        `SELECT ${PIPELINE_COLUMNS} FROM pipelines WHERE agency_id = $1 AND id = $2`,
        [agencyId, id],
      );
      const row = existing.rows[0];
      return row ? toPipeline(row) : null;
    }

    const result = await client.query<PipelineRow>(
      `UPDATE pipelines SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${PIPELINE_COLUMNS}`,
      [agencyId, ...values, id],
    );
    const row = result.rows[0];
    return row ? toPipeline(row) : null;
  });
}

// ============================================================
// STAGES
// ============================================================

export interface CreateStageInput {
  name: string;
  sequence: number;
  colorKey: PipelineStageColor;
  visualLevel?: PipelineStageVisualLevel;
  notificationsEnabled?: boolean;
}

export interface UpdateStageInput {
  name?: string;
  sequence?: number;
  colorKey?: PipelineStageColor;
  visualLevel?: PipelineStageVisualLevel;
  active?: boolean;
  notificationsEnabled?: boolean;
}

export async function listStages(database: DatabaseRuntime, pipelineId: string): Promise<PipelineStage[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await assertCanAccessPipeline(client, agencyId, pipelineId);
    const result = await client.query<PipelineStageRow>(
      `SELECT ${STAGE_COLUMNS} FROM pipeline_stages
       WHERE agency_id = $1 AND pipeline_id = $2
       ORDER BY sequence ASC`,
      [agencyId, pipelineId],
    );
    return result.rows.map(toStage);
  });
}

async function assertPipelineExists(
  client: TenantTransactionClient,
  agencyId: string,
  pipelineId: string,
): Promise<void> {
  const result = await client.query(`SELECT 1 FROM pipelines WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    pipelineId,
  ]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Pipeline not found');
  }
}

export async function createStage(
  database: DatabaseRuntime,
  pipelineId: string,
  data: CreateStageInput,
): Promise<PipelineStage> {
  const agencyId = getAgencyId();
  requirePipelineAdmin();

  return database.withTenantTransaction(async (client) => {
    await assertPipelineExists(client, agencyId, pipelineId);

    const result = await client.query<PipelineStageRow>(
      `INSERT INTO pipeline_stages
         (agency_id, pipeline_id, name, sequence, color_key, visual_level, notifications_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${STAGE_COLUMNS}`,
      [
        agencyId,
        pipelineId,
        data.name,
        data.sequence,
        data.colorKey,
        data.visualLevel ?? PipelineStageVisualLevel.NORMAL,
        data.notificationsEnabled ?? false,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Stage insert did not return a row');
    }
    return toStage(row);
  });
}

// Soft-disable only: no hard delete route exists for a stage. Setting
// active=false on a stage that still has opportunities assigned to it is
// blocked with a clear error naming the count, so no opportunity is ever
// silently orphaned. A disabled stage keeps displaying its existing cards
// read-only in the Kanban; it is simply excluded from "create new
// opportunity in this stage" pickers (frontend concern).
export async function updateStage(
  database: DatabaseRuntime,
  pipelineId: string,
  stageId: string,
  data: UpdateStageInput,
): Promise<PipelineStage | null> {
  const agencyId = getAgencyId();
  requirePipelineAdmin();

  return database.withTenantTransaction(async (client) => {
    await assertPipelineExists(client, agencyId, pipelineId);

    if (data.active === false) {
      const inUse = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM commercial_opportunities
         WHERE agency_id = $1 AND stage_id = $2`,
        [agencyId, stageId],
      );
      const count = Number(inUse.rows[0]?.count ?? '0');
      if (count > 0) {
        throw new ValidationError(
          `Cannot deactivate this stage: ${count} opportunity(ies) are still assigned to it`,
        );
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 2;

    if (data.name !== undefined) {
      fields.push(`name = $${++index}`);
      values.push(data.name);
    }
    if (data.sequence !== undefined) {
      fields.push(`sequence = $${++index}`);
      values.push(data.sequence);
    }
    if (data.colorKey !== undefined) {
      fields.push(`color_key = $${++index}`);
      values.push(data.colorKey);
    }
    if (data.visualLevel !== undefined) {
      fields.push(`visual_level = $${++index}`);
      values.push(data.visualLevel);
    }
    if (data.active !== undefined) {
      fields.push(`active = $${++index}`);
      values.push(data.active);
    }
    if (data.notificationsEnabled !== undefined) {
      fields.push(`notifications_enabled = $${++index}`);
      values.push(data.notificationsEnabled);
    }

    if (fields.length === 0) {
      const existing = await client.query<PipelineStageRow>(
        `SELECT ${STAGE_COLUMNS} FROM pipeline_stages WHERE agency_id = $1 AND pipeline_id = $2 AND id = $3`,
        [agencyId, pipelineId, stageId],
      );
      const row = existing.rows[0];
      return row ? toStage(row) : null;
    }

    const result = await client.query<PipelineStageRow>(
      `UPDATE pipeline_stages SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND pipeline_id = $2 AND id = $${index + 1}
       RETURNING ${STAGE_COLUMNS}`,
      [agencyId, pipelineId, ...values, stageId],
    );
    const row = result.rows[0];
    return row ? toStage(row) : null;
  });
}

// ============================================================
// ACCESS GRANTS
// ============================================================

export async function listPipelineAccess(
  database: DatabaseRuntime,
  pipelineId: string,
): Promise<PipelineAccess[]> {
  const agencyId = getAgencyId();
  requirePipelineAdmin();

  return database.withTenantTransaction(async (client) => {
    await assertPipelineExists(client, agencyId, pipelineId);
    const result = await client.query<PipelineAccessRow>(
      `SELECT ${ACCESS_COLUMNS} FROM pipeline_access WHERE agency_id = $1 AND pipeline_id = $2`,
      [agencyId, pipelineId],
    );
    return result.rows.map(toAccess);
  });
}

export async function grantPipelineAccess(
  database: DatabaseRuntime,
  pipelineId: string,
  userId: string,
): Promise<PipelineAccess> {
  const agencyId = getAgencyId();
  requirePipelineAdmin();

  return database.withTenantTransaction(async (client) => {
    await assertPipelineExists(client, agencyId, pipelineId);
    // Mass-assignment / spoofing guard: userId must belong to the same
    // agency, validated server-side, exactly like responsibleUserId in
    // commercial-cockpit.ts.
    await assertUserInAgency(client, agencyId, userId);

    const result = await client.query<PipelineAccessRow>(
      `INSERT INTO pipeline_access (agency_id, pipeline_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (agency_id, pipeline_id, user_id) DO UPDATE SET agency_id = EXCLUDED.agency_id
       RETURNING ${ACCESS_COLUMNS}`,
      [agencyId, pipelineId, userId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Pipeline access insert did not return a row');
    }
    return toAccess(row);
  });
}

export async function revokePipelineAccess(
  database: DatabaseRuntime,
  pipelineId: string,
  userId: string,
): Promise<void> {
  const agencyId = getAgencyId();
  requirePipelineAdmin();

  return database.withTenantTransaction(async (client) => {
    await assertPipelineExists(client, agencyId, pipelineId);
    await client.query(
      `DELETE FROM pipeline_access WHERE agency_id = $1 AND pipeline_id = $2 AND user_id = $3`,
      [agencyId, pipelineId, userId],
    );
  });
}
