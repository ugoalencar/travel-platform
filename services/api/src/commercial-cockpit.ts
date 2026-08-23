import {
  CommercialStage,
  CommercialTaskType,
  type CommercialOpportunity,
  type CommercialTask,
  type CustomerInteraction,
  type InteractionChannel,
  type InteractionDirection,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError, ValidationError } from './errors';
import {
  listFollowUpsDueTodayForUser,
  listPostSaleCandidates,
  listProposalsWithNoResponse,
} from './commercial-queries';

// ============================================================
// ROW SHAPES
// ============================================================

interface OpportunityRow {
  id: string;
  agency_id: string;
  customer_id: string;
  wish_id: string | null;
  proposal_id: string | null;
  sale_id: string | null;
  responsible_user_id: string | null;
  destination: string | null;
  trip_date_from: string | null;
  trip_date_to: string | null;
  expected_value: string | null;
  stage: CommercialStage;
  next_action_at: string | null;
  last_interaction_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  agency_id: string;
  customer_id: string;
  opportunity_id: string | null;
  assigned_user_id: string;
  type: CommercialTaskType;
  title: string;
  due_at: string;
  completed_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

interface InteractionRow {
  id: string;
  agency_id: string;
  customer_id: string;
  opportunity_id: string | null;
  proposal_id: string | null;
  sale_id: string | null;
  user_id: string;
  channel: InteractionChannel;
  direction: InteractionDirection;
  occurred_at: string;
  summary: string;
  next_action_at: string | null;
  created_at: string;
}

const OPPORTUNITY_COLUMNS = `id, agency_id, customer_id, wish_id, proposal_id, sale_id,
  responsible_user_id, destination, trip_date_from, trip_date_to, expected_value, stage,
  next_action_at, last_interaction_at, lost_reason, created_at, updated_at`;

const TASK_COLUMNS = `id, agency_id, customer_id, opportunity_id, assigned_user_id, type,
  title, due_at, completed_at, notes, created_by, created_at`;

const INTERACTION_COLUMNS = `id, agency_id, customer_id, opportunity_id, proposal_id, sale_id,
  user_id, channel, direction, occurred_at, summary, next_action_at, created_at`;

function toOpportunity(row: OpportunityRow): CommercialOpportunity {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    stage: row.stage,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.wish_id !== null ? { wishId: row.wish_id } : {}),
    ...(row.proposal_id !== null ? { proposalId: row.proposal_id } : {}),
    ...(row.sale_id !== null ? { saleId: row.sale_id } : {}),
    ...(row.responsible_user_id !== null ? { responsibleUserId: row.responsible_user_id } : {}),
    ...(row.destination !== null ? { destination: row.destination } : {}),
    ...(row.trip_date_from !== null ? { tripDateFrom: new Date(row.trip_date_from) } : {}),
    ...(row.trip_date_to !== null ? { tripDateTo: new Date(row.trip_date_to) } : {}),
    ...(row.expected_value !== null ? { expectedValue: Number(row.expected_value) } : {}),
    ...(row.next_action_at !== null ? { nextActionAt: new Date(row.next_action_at) } : {}),
    ...(row.last_interaction_at !== null
      ? { lastInteractionAt: new Date(row.last_interaction_at) }
      : {}),
    ...(row.lost_reason !== null ? { lostReason: row.lost_reason } : {}),
  };
}

function toTask(row: TaskRow): CommercialTask {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    assignedUserId: row.assigned_user_id,
    type: row.type,
    title: row.title,
    dueAt: new Date(row.due_at),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    ...(row.opportunity_id !== null ? { opportunityId: row.opportunity_id } : {}),
    ...(row.completed_at !== null ? { completedAt: new Date(row.completed_at) } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

function toInteraction(row: InteractionRow): CustomerInteraction {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    userId: row.user_id,
    channel: row.channel,
    direction: row.direction,
    occurredAt: new Date(row.occurred_at),
    summary: row.summary,
    createdAt: new Date(row.created_at),
    ...(row.opportunity_id !== null ? { opportunityId: row.opportunity_id } : {}),
    ...(row.proposal_id !== null ? { proposalId: row.proposal_id } : {}),
    ...(row.sale_id !== null ? { saleId: row.sale_id } : {}),
    ...(row.next_action_at !== null ? { nextActionAt: new Date(row.next_action_at) } : {}),
  };
}

// ============================================================
// SHARED PAGINATION
// ============================================================

export interface Pagination {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// limit/offset pagination, default limit 50, capped at 200 to bound any
// single query regardless of caller-supplied value.
export function parsePagination(query: Record<string, unknown>): Pagination {
  const rawLimit = query.limit;
  const rawOffset = query.offset;

  let limit = DEFAULT_LIMIT;
  if (typeof rawLimit === 'string' && rawLimit.trim().length > 0) {
    const parsed = Number(rawLimit);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ValidationError('Query parameter "limit" must be a positive number');
    }
    limit = Math.min(Math.trunc(parsed), MAX_LIMIT);
  }

  let offset = 0;
  if (typeof rawOffset === 'string' && rawOffset.trim().length > 0) {
    const parsed = Number(rawOffset);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new ValidationError('Query parameter "offset" must be a non-negative number');
    }
    offset = Math.trunc(parsed);
  }

  return { limit, offset };
}

// ============================================================
// TENANT-SAFE FK VALIDATION (mirrors createWish's customer-existence
// check pattern -- never trust a caller-supplied foreign id without a
// same-agency existence check first, whether it's a customer, a
// responsible user, or an assigned user).
// ============================================================

async function assertCustomerInAgency(
  client: TenantTransactionClient,
  agencyId: string,
  customerId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM customers WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [agencyId, customerId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Customer not found');
  }
}

// Assigned/responsible user spoofing guard: the user id must belong to
// the SAME agency as the caller's tenant context, validated server-side
// before it is ever accepted, never inferred from client-controlled data.
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

async function assertNullableRefInAgency(
  client: TenantTransactionClient,
  agencyId: string,
  table: 'wishes' | 'proposals' | 'sales' | 'commercial_opportunities',
  id: string | undefined,
): Promise<void> {
  if (id === undefined) {
    return;
  }
  const result = await client.query(`SELECT 1 FROM ${table} WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    id,
  ]);
  if (result.rows.length === 0) {
    throw new ValidationError(`Referenced ${table} row not found in this agency`);
  }
}

// ============================================================
// OPPORTUNITIES
// ============================================================

export interface OpportunityFilters {
  stage?: CommercialStage;
  responsibleUserId?: string;
  customerId?: string;
  destination?: string;
  tripDateFrom?: string;
  tripDateTo?: string;
  hasProposal?: boolean;
  hasSale?: boolean;
  nextActionFrom?: string;
  nextActionTo?: string;
  overdue?: boolean;
}

export interface CreateOpportunityInput {
  customerId: string;
  wishId?: string;
  proposalId?: string;
  saleId?: string;
  responsibleUserId?: string;
  destination?: string;
  tripDateFrom?: string;
  tripDateTo?: string;
  expectedValue?: number;
  stage?: CommercialStage;
  nextActionAt?: string;
}

// Mass-assignment-safe: only these named, allow-listed fields are ever
// read off the PATCH body. agencyId/customerId/id are never accepted
// here -- they cannot be changed after creation via this input type.
export interface UpdateOpportunityInput {
  stage?: CommercialStage;
  responsibleUserId?: string | null;
  nextActionAt?: string | null;
  lostReason?: string | null;
  expectedValue?: number | null;
  destination?: string | null;
  tripDateFrom?: string | null;
  tripDateTo?: string | null;
}

export async function listOpportunities(
  database: DatabaseRuntime,
  filters: OpportunityFilters,
  pagination: Pagination,
): Promise<{ opportunities: CommercialOpportunity[]; total: number }> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const { where, values } = buildOpportunityWhere(agencyId, filters);

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM commercial_opportunities WHERE ${where}`,
      values,
    );

    const result = await client.query<OpportunityRow>(
      `SELECT ${OPPORTUNITY_COLUMNS}
       FROM commercial_opportunities
       WHERE ${where}
       ORDER BY updated_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    );

    return {
      opportunities: result.rows.map(toOpportunity),
      total: Number(countResult.rows[0]?.count ?? '0'),
    };
  });
}

function buildOpportunityWhere(
  agencyId: string,
  filters: OpportunityFilters,
): { where: string; values: unknown[] } {
  const clauses: string[] = ['agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.stage !== undefined) {
    values.push(filters.stage);
    clauses.push(`stage = $${values.length}`);
  }
  if (filters.responsibleUserId !== undefined) {
    values.push(filters.responsibleUserId);
    clauses.push(`responsible_user_id = $${values.length}`);
  }
  if (filters.customerId !== undefined) {
    values.push(filters.customerId);
    clauses.push(`customer_id = $${values.length}`);
  }
  if (filters.destination !== undefined) {
    values.push(`%${filters.destination}%`);
    clauses.push(`destination ILIKE $${values.length}`);
  }
  if (filters.tripDateFrom !== undefined) {
    values.push(filters.tripDateFrom);
    clauses.push(`(trip_date_to IS NULL OR trip_date_to >= $${values.length})`);
  }
  if (filters.tripDateTo !== undefined) {
    values.push(filters.tripDateTo);
    clauses.push(`(trip_date_from IS NULL OR trip_date_from <= $${values.length})`);
  }
  if (filters.hasProposal === true) {
    clauses.push('proposal_id IS NOT NULL');
  } else if (filters.hasProposal === false) {
    clauses.push('proposal_id IS NULL');
  }
  if (filters.hasSale === true) {
    clauses.push('sale_id IS NOT NULL');
  } else if (filters.hasSale === false) {
    clauses.push('sale_id IS NULL');
  }
  if (filters.nextActionFrom !== undefined) {
    values.push(filters.nextActionFrom);
    clauses.push(`next_action_at >= $${values.length}`);
  }
  if (filters.nextActionTo !== undefined) {
    values.push(filters.nextActionTo);
    clauses.push(`next_action_at <= $${values.length}`);
  }
  if (filters.overdue === true) {
    clauses.push(`next_action_at < now() AND stage NOT IN ('WON', 'LOST')`);
  }

  return { where: clauses.join(' AND '), values };
}

export async function getOpportunityById(
  database: DatabaseRuntime,
  id: string,
): Promise<CommercialOpportunity | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OpportunityRow>(
      `SELECT ${OPPORTUNITY_COLUMNS} FROM commercial_opportunities WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toOpportunity(row) : null;
  });
}

export async function createOpportunity(
  database: DatabaseRuntime,
  data: CreateOpportunityInput,
): Promise<CommercialOpportunity> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await assertCustomerInAgency(client, agencyId, data.customerId);
    await assertNullableRefInAgency(client, agencyId, 'wishes', data.wishId);
    await assertNullableRefInAgency(client, agencyId, 'proposals', data.proposalId);
    await assertNullableRefInAgency(client, agencyId, 'sales', data.saleId);
    if (data.responsibleUserId !== undefined) {
      await assertUserInAgency(client, agencyId, data.responsibleUserId);
    }

    const result = await client.query<OpportunityRow>(
      `INSERT INTO commercial_opportunities
         (agency_id, customer_id, wish_id, proposal_id, sale_id, responsible_user_id,
          destination, trip_date_from, trip_date_to, expected_value, stage, next_action_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${OPPORTUNITY_COLUMNS}`,
      [
        agencyId,
        data.customerId,
        data.wishId ?? null,
        data.proposalId ?? null,
        data.saleId ?? null,
        data.responsibleUserId ?? null,
        data.destination ?? null,
        data.tripDateFrom ?? null,
        data.tripDateTo ?? null,
        data.expectedValue ?? null,
        data.stage ?? CommercialStage.PROSPECTING,
        data.nextActionAt ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Opportunity insert did not return a row');
    }
    return toOpportunity(row);
  });
}

export async function updateOpportunity(
  database: DatabaseRuntime,
  id: string,
  data: UpdateOpportunityInput,
): Promise<CommercialOpportunity | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    if (data.responsibleUserId !== undefined && data.responsibleUserId !== null) {
      await assertUserInAgency(client, agencyId, data.responsibleUserId);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (data.stage !== undefined) {
      fields.push(`stage = $${++index}`);
      values.push(data.stage);
      // Any stage change counts as commercial interaction activity for
      // "last interaction" purposes at the cockpit level.
      fields.push(`last_interaction_at = now()`);
    }
    if (data.responsibleUserId !== undefined) {
      fields.push(`responsible_user_id = $${++index}`);
      values.push(data.responsibleUserId);
    }
    if (data.nextActionAt !== undefined) {
      fields.push(`next_action_at = $${++index}`);
      values.push(data.nextActionAt);
    }
    if (data.lostReason !== undefined) {
      fields.push(`lost_reason = $${++index}`);
      values.push(data.lostReason);
    }
    if (data.expectedValue !== undefined) {
      fields.push(`expected_value = $${++index}`);
      values.push(data.expectedValue);
    }
    if (data.destination !== undefined) {
      fields.push(`destination = $${++index}`);
      values.push(data.destination);
    }
    if (data.tripDateFrom !== undefined) {
      fields.push(`trip_date_from = $${++index}`);
      values.push(data.tripDateFrom);
    }
    if (data.tripDateTo !== undefined) {
      fields.push(`trip_date_to = $${++index}`);
      values.push(data.tripDateTo);
    }

    if (fields.length === 0) {
      const existing = await client.query<OpportunityRow>(
        `SELECT ${OPPORTUNITY_COLUMNS} FROM commercial_opportunities WHERE agency_id = $1 AND id = $2`,
        [agencyId, id],
      );
      const row = existing.rows[0];
      return row ? toOpportunity(row) : null;
    }

    const result = await client.query<OpportunityRow>(
      `UPDATE commercial_opportunities
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${OPPORTUNITY_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    return row ? toOpportunity(row) : null;
  });
}

// ============================================================
// TASKS (FOLLOW-UPS)
// ============================================================

export interface TaskFilters {
  customerId?: string;
  assignedUserId?: string;
  opportunityId?: string;
  pending?: boolean;
  dueFrom?: string;
  dueTo?: string;
  overdue?: boolean;
}

export interface CreateTaskInput {
  customerId: string;
  opportunityId?: string;
  assignedUserId: string;
  type?: CommercialTaskType;
  title: string;
  dueAt: string;
  notes?: string;
}

export interface UpdateTaskInput {
  assignedUserId?: string;
  title?: string;
  dueAt?: string;
  completedAt?: string | null;
  notes?: string | null;
}

export async function listTasks(
  database: DatabaseRuntime,
  filters: TaskFilters,
  pagination: Pagination,
): Promise<{ tasks: CommercialTask[]; total: number }> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const clauses: string[] = ['agency_id = $1'];
    const values: unknown[] = [agencyId];

    if (filters.customerId !== undefined) {
      values.push(filters.customerId);
      clauses.push(`customer_id = $${values.length}`);
    }
    if (filters.assignedUserId !== undefined) {
      values.push(filters.assignedUserId);
      clauses.push(`assigned_user_id = $${values.length}`);
    }
    if (filters.opportunityId !== undefined) {
      values.push(filters.opportunityId);
      clauses.push(`opportunity_id = $${values.length}`);
    }
    if (filters.pending === true) {
      clauses.push('completed_at IS NULL');
    } else if (filters.pending === false) {
      clauses.push('completed_at IS NOT NULL');
    }
    if (filters.dueFrom !== undefined) {
      values.push(filters.dueFrom);
      clauses.push(`due_at >= $${values.length}`);
    }
    if (filters.dueTo !== undefined) {
      values.push(filters.dueTo);
      clauses.push(`due_at <= $${values.length}`);
    }
    if (filters.overdue === true) {
      clauses.push('completed_at IS NULL AND due_at < now()');
    }

    const where = clauses.join(' AND ');

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM commercial_tasks WHERE ${where}`,
      values,
    );

    const result = await client.query<TaskRow>(
      `SELECT ${TASK_COLUMNS} FROM commercial_tasks
       WHERE ${where}
       ORDER BY due_at ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    );

    return { tasks: result.rows.map(toTask), total: Number(countResult.rows[0]?.count ?? '0') };
  });
}

export async function getTaskById(database: DatabaseRuntime, id: string): Promise<CommercialTask | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TaskRow>(
      `SELECT ${TASK_COLUMNS} FROM commercial_tasks WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toTask(row) : null;
  });
}

export async function createTask(
  database: DatabaseRuntime,
  createdBy: string,
  data: CreateTaskInput,
): Promise<CommercialTask> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await assertCustomerInAgency(client, agencyId, data.customerId);
    await assertUserInAgency(client, agencyId, data.assignedUserId);
    await assertUserInAgency(client, agencyId, createdBy);
    await assertNullableRefInAgency(client, agencyId, 'commercial_opportunities', data.opportunityId);

    const result = await client.query<TaskRow>(
      `INSERT INTO commercial_tasks
         (agency_id, customer_id, opportunity_id, assigned_user_id, type, title, due_at, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${TASK_COLUMNS}`,
      [
        agencyId,
        data.customerId,
        data.opportunityId ?? null,
        data.assignedUserId,
        data.type ?? CommercialTaskType.FOLLOW_UP,
        data.title,
        data.dueAt,
        data.notes ?? null,
        createdBy,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Task insert did not return a row');
    }
    return toTask(row);
  });
}

export async function updateTask(
  database: DatabaseRuntime,
  id: string,
  data: UpdateTaskInput,
): Promise<CommercialTask | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    if (data.assignedUserId !== undefined) {
      await assertUserInAgency(client, agencyId, data.assignedUserId);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (data.assignedUserId !== undefined) {
      fields.push(`assigned_user_id = $${++index}`);
      values.push(data.assignedUserId);
    }
    if (data.title !== undefined) {
      fields.push(`title = $${++index}`);
      values.push(data.title);
    }
    if (data.dueAt !== undefined) {
      fields.push(`due_at = $${++index}`);
      values.push(data.dueAt);
    }
    if (data.completedAt !== undefined) {
      fields.push(`completed_at = $${++index}`);
      values.push(data.completedAt);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${++index}`);
      values.push(data.notes);
    }

    if (fields.length === 0) {
      const existing = await client.query<TaskRow>(
        `SELECT ${TASK_COLUMNS} FROM commercial_tasks WHERE agency_id = $1 AND id = $2`,
        [agencyId, id],
      );
      const row = existing.rows[0];
      return row ? toTask(row) : null;
    }

    const result = await client.query<TaskRow>(
      `UPDATE commercial_tasks
       SET ${fields.join(', ')}
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${TASK_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    return row ? toTask(row) : null;
  });
}

// ============================================================
// INTERACTIONS (read/create only, no edit -- per brief)
// ============================================================

export interface InteractionFilters {
  customerId?: string;
  opportunityId?: string;
}

export interface CreateInteractionInput {
  customerId: string;
  opportunityId?: string;
  proposalId?: string;
  saleId?: string;
  channel: InteractionChannel;
  direction: InteractionDirection;
  occurredAt?: string;
  summary: string;
  nextActionAt?: string;
}

export async function listInteractions(
  database: DatabaseRuntime,
  filters: InteractionFilters,
  pagination: Pagination,
): Promise<{ interactions: CustomerInteraction[]; total: number }> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const clauses: string[] = ['agency_id = $1'];
    const values: unknown[] = [agencyId];

    if (filters.customerId !== undefined) {
      values.push(filters.customerId);
      clauses.push(`customer_id = $${values.length}`);
    }
    if (filters.opportunityId !== undefined) {
      values.push(filters.opportunityId);
      clauses.push(`opportunity_id = $${values.length}`);
    }

    const where = clauses.join(' AND ');

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM customer_interactions WHERE ${where}`,
      values,
    );

    const result = await client.query<InteractionRow>(
      `SELECT ${INTERACTION_COLUMNS} FROM customer_interactions
       WHERE ${where}
       ORDER BY occurred_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset],
    );

    return {
      interactions: result.rows.map(toInteraction),
      total: Number(countResult.rows[0]?.count ?? '0'),
    };
  });
}

export async function createInteraction(
  database: DatabaseRuntime,
  userId: string,
  data: CreateInteractionInput,
): Promise<CustomerInteraction> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await assertCustomerInAgency(client, agencyId, data.customerId);
    await assertUserInAgency(client, agencyId, userId);
    await assertNullableRefInAgency(client, agencyId, 'commercial_opportunities', data.opportunityId);
    await assertNullableRefInAgency(client, agencyId, 'proposals', data.proposalId);
    await assertNullableRefInAgency(client, agencyId, 'sales', data.saleId);

    const result = await client.query<InteractionRow>(
      `INSERT INTO customer_interactions
         (agency_id, customer_id, opportunity_id, proposal_id, sale_id, user_id, channel, direction,
          occurred_at, summary, next_action_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10, $11)
       RETURNING ${INTERACTION_COLUMNS}`,
      [
        agencyId,
        data.customerId,
        data.opportunityId ?? null,
        data.proposalId ?? null,
        data.saleId ?? null,
        userId,
        data.channel,
        data.direction,
        data.occurredAt ?? null,
        data.summary,
        data.nextActionAt ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Interaction insert did not return a row');
    }

    // Logging an interaction updates the opportunity's "last interaction"
    // timestamp when one is linked -- read-model convenience only, never
    // touches stage.
    if (data.opportunityId !== undefined) {
      await client.query(
        `UPDATE commercial_opportunities SET last_interaction_at = now()
         WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.opportunityId],
      );
    }

    return toInteraction(row);
  });
}

// ============================================================
// GLOBAL CUSTOMER SEARCH
// Same tail-masking convention as the Customer Portal profile route
// (services/api/src/customer-portal.ts maskTail) for cpf/passport.
// ============================================================

export interface CustomerSearchResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfMasked: string | null;
  passportMasked: string | null;
}

interface CustomerSearchRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  passport: string | null;
}

export async function searchCustomers(
  database: DatabaseRuntime,
  query: string,
  pagination: Pagination,
): Promise<CustomerSearchResult[]> {
  const agencyId = getAgencyId();
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Query parameter "q" is required and must be non-empty');
  }

  return database.withTenantTransaction(async (client) => {
    const like = `%${trimmed}%`;
    const result = await client.query<CustomerSearchRow>(
      `SELECT id, name, email, phone, cpf, passport
       FROM customers
       WHERE agency_id = $1 AND deleted_at IS NULL
         AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2 OR cpf ILIKE $2 OR passport ILIKE $2)
       ORDER BY name ASC
       LIMIT $3 OFFSET $4`,
      [agencyId, like, pagination.limit, pagination.offset],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      cpfMasked: maskTail(row.cpf),
      passportMasked: maskTail(row.passport),
    }));
  });
}

// Identical masking rule to customer-portal.ts's maskTail: keep only the
// last 3 characters, mask everything before that with '*'.
function maskTail(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const digitsOnly = value.replace(/\s+/g, '');
  if (digitsOnly.length <= 3) {
    return '*'.repeat(digitsOnly.length);
  }
  const tail = digitsOnly.slice(-3);
  return `${'*'.repeat(digitsOnly.length - 3)}${tail}`;
}

// ============================================================
// TRAVEL DATE SEARCH
// Operational (Booking/ScheduledDeparture) vs commercial (Trip) dates
// kept in clearly separate fields, never merged into one concept.
// ============================================================

export interface TravelSearchResult {
  operational: Array<{
    bookingId: string;
    customerId: string;
    departureAt: string;
    originDestination: string;
  }>;
  commercial: Array<{
    tripId: string;
    customerId: string;
    destination: string;
    startDate: string;
    endDate: string;
  }>;
}

export async function travelSearch(
  database: DatabaseRuntime,
  range: 'today' | 'week' | '30d',
  destination?: string,
): Promise<TravelSearchResult> {
  const agencyId = getAgencyId();
  const interval = range === 'today' ? '1 day' : range === 'week' ? '7 days' : '30 days';

  return database.withTenantTransaction(async (client) => {
    const destinationClause = destination !== undefined ? 'AND r.destination ILIKE $2' : '';
    const operationalValues: unknown[] = destination !== undefined ? [agencyId, `%${destination}%`] : [agencyId];

    const operational = await client.query<{
      bookingId: string;
      customerId: string;
      departureAt: string;
      originDestination: string;
    }>(
      `SELECT b.id AS "bookingId", b.booker_customer_id AS "customerId",
              sd.departure_at::text AS "departureAt",
              r.origin || ' -> ' || r.destination AS "originDestination"
       FROM bookings b
       JOIN scheduled_departures sd ON sd.agency_id = b.agency_id AND sd.id = b.outbound_departure_id
       JOIN transport_products tp ON tp.agency_id = sd.agency_id AND tp.id = sd.product_id
       JOIN routes r ON r.agency_id = tp.agency_id AND r.id = tp.outbound_route_id
       WHERE b.agency_id = $1
         AND sd.departure_at BETWEEN now() AND now() + INTERVAL '${interval}'
         ${destinationClause}
       ORDER BY sd.departure_at ASC`,
      operationalValues,
    );

    const commercialDestinationClause = destination !== undefined ? 'AND t.destination ILIKE $2' : '';
    const commercialValues: unknown[] = destination !== undefined ? [agencyId, `%${destination}%`] : [agencyId];

    const commercial = await client.query<{
      tripId: string;
      customerId: string;
      destination: string;
      startDate: string;
      endDate: string;
    }>(
      `SELECT t.id AS "tripId", t.customer_id AS "customerId", t.destination,
              t.start_date::text AS "startDate", t.end_date::text AS "endDate"
       FROM trips t
       WHERE t.agency_id = $1
         AND t.status NOT IN ('CANCELLED')
         AND t.start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${interval}'
         ${commercialDestinationClause}
       ORDER BY t.start_date ASC`,
      commercialValues,
    );

    return { operational: operational.rows, commercial: commercial.rows };
  });
}

// ============================================================
// MANAGER DASHBOARD AGGREGATE
// Every number below comes from a real query against real tables --
// no invented/estimated figures.
// ============================================================

export interface DashboardSummary {
  openOpportunitiesCount: number;
  followUpsDueTodayCount: number;
  overdueFollowUpsCount: number;
  proposalsWaitingCount: number;
  openProposalValueSum: string;
  salesThisMonthCount: number;
  salesThisMonthTotal: string;
  upcomingTripsCount: number;
  postSalePendingCount: number;
}

export async function getDashboardSummary(database: DatabaseRuntime, userId: string): Promise<DashboardSummary> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const openOpportunities = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM commercial_opportunities
       WHERE agency_id = $1 AND stage NOT IN ('WON', 'LOST')`,
      [agencyId],
    );

    const followUpsToday = await listFollowUpsDueTodayForUser(client, agencyId, userId);

    const overdueFollowUps = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM commercial_tasks
       WHERE agency_id = $1 AND completed_at IS NULL AND due_at < now()`,
      [agencyId],
    );

    const proposalsWaiting = await listProposalsWithNoResponse(client, agencyId);
    const openProposalValue = await client.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(p.total), 0)::text AS sum
       FROM proposals p
       WHERE p.agency_id = $1 AND p.status = 'SENT'
         AND NOT EXISTS (
           SELECT 1 FROM commercial_opportunities co
           WHERE co.agency_id = p.agency_id AND co.proposal_id = p.id AND co.stage IN ('WON', 'LOST')
         )`,
      [agencyId],
    );

    const salesThisMonth = await client.query<{ count: string; sum: string | null }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(total), 0)::text AS sum
       FROM sales
       WHERE agency_id = $1
         AND created_at >= date_trunc('month', now())
         AND created_at < date_trunc('month', now()) + INTERVAL '1 month'`,
      [agencyId],
    );

    const upcomingTrips = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM trips
       WHERE agency_id = $1 AND status NOT IN ('CANCELLED', 'COMPLETED')
         AND start_date >= CURRENT_DATE`,
      [agencyId],
    );

    const postSalePending = await listPostSaleCandidates(client, agencyId);

    return {
      openOpportunitiesCount: Number(openOpportunities.rows[0]?.count ?? '0'),
      followUpsDueTodayCount: followUpsToday.length,
      overdueFollowUpsCount: Number(overdueFollowUps.rows[0]?.count ?? '0'),
      proposalsWaitingCount: proposalsWaiting.length,
      openProposalValueSum: openProposalValue.rows[0]?.sum ?? '0',
      salesThisMonthCount: Number(salesThisMonth.rows[0]?.count ?? '0'),
      salesThisMonthTotal: salesThisMonth.rows[0]?.sum ?? '0',
      upcomingTripsCount: Number(upcomingTrips.rows[0]?.count ?? '0'),
      postSalePendingCount: postSalePending.length,
    };
  });
}

export {
  listFollowUpsDueTodayForUser,
  listPostSaleCandidates,
  listProposalsWithNoResponse,
} from './commercial-queries';
