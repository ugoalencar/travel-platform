import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';

// Append-only audit helper shared by every Offer & Growth Engine domain
// module. Mirrors security.md's "Audit expectation" list: campaign
// activation, publication state changes, automation activation, coupon
// creation/redemption, entitlement changes, automation execution.
export interface RecordAuditLogInput {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  // Explicit override for the platform-scoped stopgap path (see
  // entitlements.ts), which runs OUTSIDE the ambient request tenant
  // context (no runWithTenantContext()/getTenantContext() available) --
  // it operates on an explicit target agencyId instead. Every ordinary
  // agency-scoped caller omits this and gets the ambient getAgencyId().
  agencyId?: string;
}

export async function recordAuditLog(
  client: TenantTransactionClient,
  input: RecordAuditLogInput,
): Promise<void> {
  const agencyId = input.agencyId ?? getAgencyId();
  await client.query(
    `INSERT INTO offer_growth_audit_log (agency_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      agencyId,
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function listAuditLog(
  database: DatabaseRuntime,
): Promise<
  Array<{
    id: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: unknown;
    createdAt: Date;
  }>
> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      actor_user_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      metadata: unknown;
      created_at: string;
    }>(
      `SELECT id, actor_user_id, action, entity_type, entity_id, metadata, created_at
       FROM offer_growth_audit_log
       WHERE agency_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [agencyId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    }));
  });
}
