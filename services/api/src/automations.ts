import { randomUUID } from 'node:crypto';
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import {
  AutomationActionType,
  AutomationStatus,
  AutomationTrigger,
  CouponType,
  EngagementType,
  type Automation,
  type AutomationAction,
  type AutomationExecution,
  type ConnectorEvent,
} from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { recordAuditLog } from './offer-growth-audit';
import { insertEngagement } from './engagements';
import { insertCoupon, insertGrant } from './coupons';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const DEDUP_NONE = '__none__';

// Minimal contract this engine needs from a connector for action
// execution -- a real per-provider connector would implement this
// differently; the InternalMockConnector implements it directly. See
// connectors/mock-connector.ts.
export interface AutomationActionConnector {
  sendAction(input: {
    type: 'PUBLIC_REPLY' | 'PRIVATE_MESSAGE';
    externalUserId?: string;
    message: string;
  }): Promise<{ externalRef: string }>;
}

interface AutomationRow {
  id: string;
  agency_id: string;
  name: string;
  trigger: AutomationTrigger;
  status: AutomationStatus;
  channel: string | null;
  campaign_id: string | null;
  publication_id: string | null;
  keyword: string | null;
  case_sensitive: boolean;
  actions: AutomationAction[];
  valid_from: string | null;
  valid_until: string | null;
  cooldown_seconds: number;
  max_executions: number | null;
  max_executions_per_external_user: number | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAutomationInput {
  name: string;
  trigger: AutomationTrigger;
  channel?: string;
  campaignId?: string;
  publicationId?: string;
  keyword?: string;
  caseSensitive?: boolean;
  actions: AutomationAction[];
  validFrom?: Date;
  validUntil?: Date;
  cooldownSeconds?: number;
  maxExecutions?: number;
  maxExecutionsPerExternalUser?: number;
}

const COLUMNS = `id, agency_id, name, trigger, status, channel, campaign_id, publication_id, keyword,
  case_sensitive, actions, valid_from, valid_until, cooldown_seconds, max_executions,
  max_executions_per_external_user, created_by_user_id, created_at, updated_at`;

export async function listAutomations(database: DatabaseRuntime): Promise<Automation[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AutomationRow>(
      `SELECT ${COLUMNS} FROM automations WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toAutomation);
  });
}

export async function getAutomationById(database: DatabaseRuntime, id: string): Promise<Automation> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction((client) => loadAutomation(client, agencyId, id));
}

export async function createAutomation(
  database: DatabaseRuntime,
  data: CreateAutomationInput,
): Promise<Automation> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  validateCreateInput(data);

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AutomationRow>(
      `INSERT INTO automations
         (agency_id, name, trigger, channel, campaign_id, publication_id, keyword, case_sensitive,
          actions, valid_from, valid_until, cooldown_seconds, max_executions,
          max_executions_per_external_user, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${COLUMNS}`,
      [
        agencyId,
        data.name,
        data.trigger,
        data.channel ?? null,
        data.campaignId ?? null,
        data.publicationId ?? null,
        data.keyword ?? null,
        data.caseSensitive ?? false,
        JSON.stringify(data.actions ?? []),
        data.validFrom ?? null,
        data.validUntil ?? null,
        data.cooldownSeconds ?? 0,
        data.maxExecutions ?? null,
        data.maxExecutionsPerExternalUser ?? null,
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Automation insert did not return a row');

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'automation.created',
      entityType: 'Automation',
      entityId: row.id,
      metadata: { trigger: row.trigger },
    });

    return toAutomation(row);
  });
}

// Activation is the only transition gated by entitlement.activate RBAC
// at the route layer (see app.ts) -- this function just performs the
// status write + audit once authorized.
export async function setAutomationStatus(
  database: DatabaseRuntime,
  id: string,
  toStatus: AutomationStatus,
): Promise<Automation> {
  const agencyId = getAgencyId();
  const userId = getUserId();

  if (!Object.values(AutomationStatus).includes(toStatus)) {
    throw new ValidationError('Field "status" must be a valid AutomationStatus');
  }

  return database.withTenantTransaction(async (client) => {
    const current = await lockAutomation(client, agencyId, id);
    if (current.status === toStatus) return current;

    const result = await client.query<AutomationRow>(
      `UPDATE automations SET status = $3, updated_at = now() WHERE agency_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
      [agencyId, id, toStatus],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Automation status update did not return a row');

    await recordAuditLog(client, {
      actorUserId: userId,
      action: toStatus === AutomationStatus.ACTIVE ? 'automation.activated' : 'automation.status_changed',
      entityType: 'Automation',
      entityId: row.id,
      metadata: { from: current.status, to: toStatus },
    });

    return toAutomation(row);
  });
}

export interface ProcessConnectorEventContext {
  campaignId?: string;
  publicationId?: string;
  offerId?: string;
}

export interface AutomationExecutionOutcome {
  automationId: string;
  deduped: boolean;
  skippedReason?: 'cooldown' | 'max_executions' | 'max_executions_per_user';
  executionId?: string;
  createdOpportunityId?: string;
  createdCouponId?: string;
}

export interface ProcessConnectorEventResult {
  engagementId: string;
  executions: AutomationExecutionOutcome[];
}

// The single entry point that turns a normalized ConnectorEvent (from
// any ChannelConnector) into: a real Engagement row, then evaluates
// COMMENT_KEYWORD / DIRECT_MESSAGE_KEYWORD automations, with structural
// dedup via automation_executions' unique constraint. See
// docs/offer-growth/automation-engine.md's flow diagram.
export async function processConnectorEvent(
  database: DatabaseRuntime,
  connector: AutomationActionConnector,
  event: ConnectorEvent,
  context: ProcessConnectorEventContext = {},
): Promise<ProcessConnectorEventResult> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const engagement = await insertEngagement(client, agencyId, {
      type: event.type,
      channel: event.channel,
      occurredAt: event.occurredAt,
      ...(context.campaignId !== undefined ? { campaignId: context.campaignId } : {}),
      ...(context.publicationId !== undefined ? { publicationId: context.publicationId } : {}),
      ...(context.offerId !== undefined ? { offerId: context.offerId } : {}),
      ...(event.externalUserId !== undefined ? { externalUserId: event.externalUserId } : {}),
      ...(event.content !== undefined ? { content: event.content } : {}),
      ...(event.rawPayload !== undefined ? { rawPayload: event.rawPayload } : {}),
    });

    const trigger = triggerForEngagementType(event.type);
    const executions: AutomationExecutionOutcome[] = [];

    if (!trigger || !event.content) {
      return { engagementId: engagement.id, executions };
    }

    const candidates = await client.query<AutomationRow>(
      `SELECT ${COLUMNS} FROM automations
       WHERE agency_id = $1 AND status = 'ACTIVE' AND trigger = $2
         AND (channel IS NULL OR channel = $3)
         AND (campaign_id IS NULL OR campaign_id = $4)
         AND (publication_id IS NULL OR publication_id = $5)
         AND (valid_from IS NULL OR valid_from <= now())
         AND (valid_until IS NULL OR valid_until >= now())`,
      [agencyId, trigger, event.channel, context.campaignId ?? null, context.publicationId ?? null],
    );

    for (const automationRow of candidates.rows) {
      if (!keywordMatches(automationRow.keyword, automationRow.case_sensitive, event.content)) {
        continue;
      }

      const outcome = await tryExecuteAutomation(
        client,
        connector,
        agencyId,
        automationRow,
        engagement.id,
        event,
        context,
      );
      executions.push(outcome);
    }

    return { engagementId: engagement.id, executions };
  });
}

async function tryExecuteAutomation(
  client: TenantTransactionClient,
  connector: AutomationActionConnector,
  agencyId: string,
  automation: AutomationRow,
  engagementId: string,
  event: ConnectorEvent,
  context: ProcessConnectorEventContext,
): Promise<AutomationExecutionOutcome> {
  const externalUserId = event.externalUserId ?? DEDUP_NONE;
  const publicationId = context.publicationId ?? DEDUP_NONE;
  const normalizedKeyword = normalizeKeyword(automation.keyword ?? '', automation.case_sensitive);

  // Cooldown: last execution for (automation, externalUserId) within
  // cooldown_seconds.
  if (automation.cooldown_seconds > 0 && externalUserId !== DEDUP_NONE) {
    const lastExecution = await client.query<{ executed_at: string }>(
      `SELECT executed_at FROM automation_executions
       WHERE agency_id = $1 AND automation_id = $2 AND external_user_id = $3
       ORDER BY executed_at DESC LIMIT 1`,
      [agencyId, automation.id, externalUserId],
    );
    const last = lastExecution.rows[0];
    if (last) {
      const elapsedSeconds = (Date.now() - new Date(last.executed_at).getTime()) / 1000;
      if (elapsedSeconds < automation.cooldown_seconds) {
        return { automationId: automation.id, deduped: false, skippedReason: 'cooldown' };
      }
    }
  }

  if (automation.max_executions !== null) {
    const total = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM automation_executions WHERE agency_id = $1 AND automation_id = $2`,
      [agencyId, automation.id],
    );
    if (Number(total.rows[0]?.count ?? 0) >= automation.max_executions) {
      return { automationId: automation.id, deduped: false, skippedReason: 'max_executions' };
    }
  }

  if (automation.max_executions_per_external_user !== null && externalUserId !== DEDUP_NONE) {
    const perUser = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM automation_executions
       WHERE agency_id = $1 AND automation_id = $2 AND external_user_id = $3`,
      [agencyId, automation.id, externalUserId],
    );
    if (Number(perUser.rows[0]?.count ?? 0) >= automation.max_executions_per_external_user) {
      return { automationId: automation.id, deduped: false, skippedReason: 'max_executions_per_user' };
    }
  }

  // Structural dedup: real UNIQUE constraint on automation_executions,
  // not just an application-level check -- concurrent duplicate webhook
  // deliveries are structurally impossible to double-process (same
  // discipline as the Field Operations checkpoint TOCTOU fix).
  let executionId: string;
  try {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO automation_executions
         (agency_id, automation_id, engagement_id, channel, external_user_id, normalized_keyword, publication_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [agencyId, automation.id, engagementId, event.channel, externalUserId, normalizedKeyword, publicationId],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('AutomationExecution insert did not return a row');
    executionId = row.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      await recordAuditLog(client, {
        action: 'automation.execution_deduped',
        entityType: 'Automation',
        entityId: automation.id,
        metadata: { externalUserId, normalizedKeyword, publicationId },
      });
      return { automationId: automation.id, deduped: true };
    }
    throw error;
  }

  const outcome: AutomationExecutionOutcome = { automationId: automation.id, deduped: false, executionId };
  let opportunityId: string | undefined;
  let couponId: string | undefined;

  for (const action of automation.actions ?? []) {
    switch (action.type) {
      case AutomationActionType.PUBLIC_REPLY:
      case AutomationActionType.PRIVATE_MESSAGE: {
        await executeReplyAction(client, connector, agencyId, automation, engagementId, context, event, action);
        break;
      }
      case AutomationActionType.CREATE_COUPON: {
        const template = action.couponTemplate;
        const expiresAt = template.expiresInDays
          ? new Date(Date.now() + template.expiresInDays * 24 * 60 * 60 * 1000)
          : undefined;
        const coupon = await insertCoupon(client, agencyId, automation.created_by_user_id, {
          code: generateCouponCode(automation.name),
          name: template.name,
          type: template.type as CouponType,
          ...(template.value !== undefined ? { value: template.value } : {}),
          ...(template.benefitDescription !== undefined ? { benefitDescription: template.benefitDescription } : {}),
          ...(expiresAt !== undefined ? { expiresAt } : {}),
          ...(template.maxUses !== undefined ? { maxUses: template.maxUses } : {}),
          ...(template.maxUsesPerCustomer !== undefined ? { maxUsesPerCustomer: template.maxUsesPerCustomer } : {}),
          ...(automation.campaign_id !== null ? { campaignId: automation.campaign_id } : {}),
        });
        couponId = coupon.id;
        outcome.createdCouponId = coupon.id;
        break;
      }
      case AutomationActionType.SEND_COUPON: {
        const targetCouponId = action.couponId ?? couponId;
        if (!targetCouponId) break;
        const grantPublicationId = automation.publication_id ?? context.publicationId;
        await insertGrant(client, agencyId, {
          couponId: targetCouponId,
          automationId: automation.id,
          deliveryChannel: action.deliveryChannel ?? event.channel,
          ...(automation.campaign_id !== null ? { campaignId: automation.campaign_id } : {}),
          ...(grantPublicationId !== undefined && grantPublicationId !== null
            ? { publicationId: grantPublicationId }
            : {}),
          ...(event.externalUserId !== undefined ? { externalUserId: event.externalUserId } : {}),
        });
        break;
      }
      case AutomationActionType.CREATE_OPPORTUNITY: {
        const customerId = await resolveOrCreateCustomerForExternalUser(client, agencyId, event);
        const pipelineStage = await resolvePipelineStage(client, agencyId, action.pipelineId, action.stageId);
        const created = await client.query<{ id: string }>(
          `INSERT INTO commercial_opportunities
             (agency_id, customer_id, pipeline_id, stage_id, source_channel, campaign_id,
              publication_id, offer_id, automation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            agencyId,
            customerId,
            pipelineStage.pipelineId,
            pipelineStage.stageId,
            event.channel,
            automation.campaign_id ?? context.campaignId ?? null,
            automation.publication_id ?? context.publicationId ?? null,
            context.offerId ?? null,
            automation.id,
          ],
        );
        opportunityId = created.rows[0]?.id;
        if (opportunityId !== undefined) {
          outcome.createdOpportunityId = opportunityId;
        }
        if (opportunityId) {
          await client.query(`UPDATE engagements SET opportunity_id = $3 WHERE agency_id = $1 AND id = $2`, [
            agencyId,
            engagementId,
            opportunityId,
          ]);
        }
        break;
      }
      case AutomationActionType.ASSIGN_AGENT: {
        if (!opportunityId) break;
        await client.query(
          `UPDATE commercial_opportunities SET responsible_user_id = $3 WHERE agency_id = $1 AND id = $2`,
          [agencyId, opportunityId, action.userId],
        );
        break;
      }
      case AutomationActionType.CREATE_FOLLOWUP: {
        if (!opportunityId || !automation.created_by_user_id) break;
        const dueAt = new Date(Date.now() + (action.dueInHours ?? 24) * 60 * 60 * 1000);
        const oppCustomer = await client.query<{ customer_id: string }>(
          `SELECT customer_id FROM commercial_opportunities WHERE agency_id = $1 AND id = $2`,
          [agencyId, opportunityId],
        );
        const customerId = oppCustomer.rows[0]?.customer_id;
        if (!customerId) break;
        await client.query(
          `INSERT INTO commercial_tasks (agency_id, customer_id, opportunity_id, assigned_user_id, type, title, due_at, created_by)
           VALUES ($1, $2, $3, $4, 'FOLLOW_UP', $5, $6, $4)`,
          [agencyId, customerId, opportunityId, automation.created_by_user_id, action.title, dueAt],
        );
        break;
      }
      default:
        break;
    }
  }

  await client.query(`UPDATE automation_executions SET result = $3 WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    executionId,
    JSON.stringify({ opportunityId, couponId }),
  ]);

  await recordAuditLog(client, {
    action: 'automation.executed',
    entityType: 'Automation',
    entityId: automation.id,
    metadata: { executionId, opportunityId, couponId, externalUserId },
  });

  return outcome;
}

async function executeReplyAction(
  client: TenantTransactionClient,
  connector: AutomationActionConnector,
  agencyId: string,
  automation: AutomationRow,
  engagementId: string,
  context: ProcessConnectorEventContext,
  event: ConnectorEvent,
  action: Extract<AutomationAction, { type: AutomationActionType.PUBLIC_REPLY | AutomationActionType.PRIVATE_MESSAGE }>,
): Promise<void> {
  const connectorActionType = action.type;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO connector_actions
       (agency_id, channel, type, automation_id, publication_id, engagement_id, external_user_id, payload, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
     RETURNING id`,
    [
      agencyId,
      event.channel,
      connectorActionType,
      automation.id,
      context.publicationId ?? automation.publication_id ?? null,
      engagementId,
      event.externalUserId ?? null,
      JSON.stringify({ message: action.message }),
    ],
  );
  const actionId = inserted.rows[0]?.id;
  if (!actionId) return;

  try {
    const sent = await connector.sendAction({
      type: connectorActionType,
      message: action.message,
      ...(event.externalUserId !== undefined ? { externalUserId: event.externalUserId } : {}),
    });
    await client.query(
      `UPDATE connector_actions SET status = 'SENT', external_ref = $3, sent_at = now() WHERE agency_id = $1 AND id = $2`,
      [agencyId, actionId, sent.externalRef],
    );
  } catch (error) {
    await client.query(
      `UPDATE connector_actions SET status = 'FAILED', error_message = $3 WHERE agency_id = $1 AND id = $2`,
      [agencyId, actionId, error instanceof Error ? error.message : 'unknown error'],
    );
  }
}

async function resolveOrCreateCustomerForExternalUser(
  client: TenantTransactionClient,
  agencyId: string,
  event: ConnectorEvent,
): Promise<string> {
  // V1 pragmatic decision (documented, not a silent guess): an
  // automation-created opportunity requires a Customer row (real FK).
  // When the engaging identity is only an opaque external-id (typical
  // for a social comment/DM), a lightweight lead Customer record is
  // created so the opportunity/attribution chain has something real to
  // point at, rather than inventing a nullable-customer opportunity
  // shape not supported by the existing commercial_opportunities table.
  const externalUserId = event.externalUserId ?? `unknown-${randomUUID()}`;
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM customers WHERE agency_id = $1 AND notes = $2 LIMIT 1`,
    [agencyId, `external-lead:${event.channel}:${externalUserId}`],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await client.query<{ id: string }>(
    `INSERT INTO customers (agency_id, name, notes) VALUES ($1, $2, $3) RETURNING id`,
    [agencyId, `Lead ${event.channel} ${externalUserId}`, `external-lead:${event.channel}:${externalUserId}`],
  );
  const id = created.rows[0]?.id;
  if (!id) throw new Error('Failed to create lead customer for automation-created opportunity');
  return id;
}

async function resolvePipelineStage(
  client: TenantTransactionClient,
  agencyId: string,
  pipelineId: string | undefined,
  stageId: string | undefined,
): Promise<{ pipelineId: string; stageId: string }> {
  if (pipelineId && stageId) {
    return { pipelineId, stageId };
  }

  const pipeline = await client.query<{ id: string }>(
    `SELECT id FROM pipelines WHERE agency_id = $1 AND active = true ORDER BY created_at ASC LIMIT 1`,
    [agencyId],
  );
  const resolvedPipelineId = pipeline.rows[0]?.id;
  if (!resolvedPipelineId) {
    throw new ConflictError('No active Pipeline exists for this agency to attach automation-created opportunities to');
  }

  const stage = await client.query<{ id: string }>(
    `SELECT id FROM pipeline_stages WHERE agency_id = $1 AND pipeline_id = $2 ORDER BY sequence ASC LIMIT 1`,
    [agencyId, resolvedPipelineId],
  );
  const resolvedStageId = stage.rows[0]?.id;
  if (!resolvedStageId) {
    throw new ConflictError('No PipelineStage exists for the resolved Pipeline');
  }

  return { pipelineId: resolvedPipelineId, stageId: resolvedStageId };
}

function generateCouponCode(automationName: string): string {
  const slug = automationName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return `${slug || 'COUPON'}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function triggerForEngagementType(type: EngagementType): AutomationTrigger | null {
  if (type === EngagementType.COMMENT) return AutomationTrigger.COMMENT_KEYWORD;
  if (type === EngagementType.MESSAGE) return AutomationTrigger.DIRECT_MESSAGE_KEYWORD;
  return null;
}

// Case-normalize keyword matching (lowercase+trim minimum, respecting
// the case-sensitivity flag) per automation-engine.md.
function normalizeKeyword(keyword: string, caseSensitive: boolean): string {
  const trimmed = keyword.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function keywordMatches(keyword: string | null, caseSensitive: boolean, content: string): boolean {
  if (!keyword || keyword.trim().length === 0) return false;
  const normalizedKeyword = normalizeKeyword(keyword, caseSensitive);
  const normalizedContent = caseSensitive ? content : content.toLowerCase();
  return normalizedContent.includes(normalizedKeyword);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

async function loadAutomation(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Automation> {
  const result = await client.query<AutomationRow>(
    `SELECT ${COLUMNS} FROM automations WHERE agency_id = $1 AND id = $2`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Automation not found');
  return toAutomation(row);
}

async function lockAutomation(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Automation> {
  const result = await client.query<AutomationRow>(
    `SELECT ${COLUMNS} FROM automations WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Automation not found');
  return toAutomation(row);
}

function validateCreateInput(data: CreateAutomationInput): void {
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required');
  }
  if (!Object.values(AutomationTrigger).includes(data.trigger)) {
    throw new ValidationError('Field "trigger" must be a valid AutomationTrigger');
  }
  if (
    (data.trigger === AutomationTrigger.COMMENT_KEYWORD ||
      data.trigger === AutomationTrigger.DIRECT_MESSAGE_KEYWORD) &&
    (!data.keyword || data.keyword.trim().length === 0)
  ) {
    throw new ValidationError('Keyword automations require a non-empty "keyword"');
  }
  if (!Array.isArray(data.actions) || data.actions.length === 0) {
    throw new ValidationError('Field "actions" must be a non-empty array');
  }
}

function toAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    trigger: row.trigger,
    status: row.status,
    caseSensitive: row.case_sensitive,
    actions: row.actions ?? [],
    cooldownSeconds: row.cooldown_seconds,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.channel !== null ? { channel: row.channel } : {}),
    ...(row.campaign_id !== null ? { campaignId: row.campaign_id } : {}),
    ...(row.publication_id !== null ? { publicationId: row.publication_id } : {}),
    ...(row.keyword !== null ? { keyword: row.keyword } : {}),
    ...(row.valid_from !== null ? { validFrom: new Date(row.valid_from) } : {}),
    ...(row.valid_until !== null ? { validUntil: new Date(row.valid_until) } : {}),
    ...(row.max_executions !== null ? { maxExecutions: row.max_executions } : {}),
    ...(row.max_executions_per_external_user !== null
      ? { maxExecutionsPerExternalUser: row.max_executions_per_external_user }
      : {}),
    ...(row.created_by_user_id !== null ? { createdByUserId: row.created_by_user_id } : {}),
  };
}

export type { AutomationExecution };
