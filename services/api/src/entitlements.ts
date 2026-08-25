// ============================================================
// Entitlements (platform layer) + the narrow platform-scoped write
// stopgap. See docs/offer-growth/entitlements.md and security.md.
//
// GENUINE ARCHITECTURE GAP (flagged per the Offer & Growth batch brief,
// section H): packages/domain/tenant-context.ts / types.ts define only
// agency-scoped UserRole (OWNER/ADMIN/MANAGER/AGENT/VIEWER). There is no
// platform-admin identity distinct from an agency's own OWNER anywhere
// in this codebase. entitlements.md is explicit that "Agency users
// cannot enable an entitlement via their own API" -- but with no real
// platform identity to gate on, this file cannot build a real Super
// Admin boundary. What it does instead:
//
//   - Reading an agency's own entitlements (listEntitlements) goes
//     through the NORMAL agency-authenticated path (protectedHooks +
//     tenant context), same as every other agency-scoped read.
//   - WRITING an entitlement goes through a completely separate code
//     path (setAgencyEntitlementViaPlatformStopgap) that:
//       1. is dual-gated exactly like ALLOW_DEV_AUTH (isDevAuthEnabled():
//          only reachable when NODE_ENV !== 'production' AND an explicit
//          env flag is set) so it can never be live in production by
//          default;
//       2. requires a separate shared-secret header
//          (x-platform-stopgap-key) that has nothing to do with any
//          agency JWT/session -- an agency OWNER/ADMIN's own credentials
//          cannot satisfy it;
//       3. uses PlatformDatabaseRuntime.withAgencyTransaction(), which
//          takes an EXPLICIT target agencyId rather than reading the
//          caller's ambient tenant context, so even if a caller reused
//          their own agency's session somehow, the route ignores it and
//          it is not how this function resolves which agency is written.
//
// This is explicitly a temporary stopgap, not a real security boundary,
// and is reported as a blocker requiring a human decision (a real
// platform-admin identity/table) in the batch final report.
// ============================================================

import type { PlatformDatabaseRuntime } from './database';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import { PlatformFeature, type AgencyEntitlementLimits } from '../../../packages/domain/types';
import { ForbiddenError as DomainForbiddenError } from '../../../packages/domain/tenant-context';
import { ValidationError } from './errors';
import { recordAuditLog } from './offer-growth-audit';

export class EntitlementError extends DomainForbiddenError {
  constructor(feature: PlatformFeature) {
    super(`Agency is not entitled to feature ${feature}`);
    this.name = 'EntitlementError';
  }
}

interface EntitlementRow {
  id: string;
  agency_id: string;
  feature: PlatformFeature;
  enabled: boolean;
  limits: AgencyEntitlementLimits;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface AgencyEntitlementView {
  id: string;
  agencyId: string;
  feature: PlatformFeature;
  enabled: boolean;
  limits: AgencyEntitlementLimits;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function listEntitlements(database: DatabaseRuntime): Promise<AgencyEntitlementView[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EntitlementRow>(
      `SELECT id, agency_id, feature, enabled, limits, updated_by, created_at, updated_at
       FROM agency_entitlements WHERE agency_id = $1 ORDER BY feature`,
      [agencyId],
    );
    return result.rows.map(toView);
  });
}

// Order of authorization per entitlements.md / security.md: entitlement
// check FIRST, then RBAC (requireRole()). Fails closed: no row, or a row
// with enabled = false, both deny.
export async function requireEntitlement(
  database: DatabaseRuntime,
  feature: PlatformFeature,
): Promise<AgencyEntitlementView> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction((client) => requireEntitlementInTransaction(client, agencyId, feature));
}

export async function requireEntitlementInTransaction(
  client: TenantTransactionClient,
  agencyId: string,
  feature: PlatformFeature,
): Promise<AgencyEntitlementView> {
  const result = await client.query<EntitlementRow>(
    `SELECT id, agency_id, feature, enabled, limits, updated_by, created_at, updated_at
     FROM agency_entitlements WHERE agency_id = $1 AND feature = $2`,
    [agencyId, feature],
  );
  const row = result.rows[0];
  if (!row || row.enabled !== true) {
    throw new EntitlementError(feature);
  }
  return toView(row);
}

// ------------------------------------------------------------
// Platform-scoped write stopgap (section H). Never registered behind
// protectedHooks / normal agency auth. See app.ts route registration
// and dev-auth.ts's isDevAuthEnabled() for the identical dual-gate
// pattern this reuses.
// ------------------------------------------------------------

export interface SetAgencyEntitlementInput {
  agencyId: string;
  feature: PlatformFeature;
  enabled: boolean;
  limits?: AgencyEntitlementLimits;
}

export async function setAgencyEntitlementViaPlatformStopgap(
  platformDatabase: PlatformDatabaseRuntime,
  input: SetAgencyEntitlementInput,
  actorLabel: string,
): Promise<AgencyEntitlementView> {
  validateSetEntitlementInput(input);

  return platformDatabase.withAgencyTransaction(input.agencyId, actorLabel, async (client) => {
    const result = await client.query<EntitlementRow>(
      `INSERT INTO agency_entitlements (agency_id, feature, enabled, limits, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (agency_id, feature)
       DO UPDATE SET enabled = EXCLUDED.enabled, limits = EXCLUDED.limits,
                      updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING id, agency_id, feature, enabled, limits, updated_by, created_at, updated_at`,
      [input.agencyId, input.feature, input.enabled, JSON.stringify(input.limits ?? {}), actorLabel],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Entitlement upsert did not return a row');

    await recordAuditLog(client, {
      agencyId: input.agencyId,
      action: 'entitlement.changed',
      entityType: 'AgencyEntitlement',
      entityId: row.id,
      metadata: { feature: input.feature, enabled: input.enabled, actor: actorLabel },
    });

    return toView(row);
  });
}

function validateSetEntitlementInput(input: SetAgencyEntitlementInput): void {
  if (typeof input.agencyId !== 'string' || input.agencyId.trim().length === 0) {
    throw new ValidationError('Field "agencyId" is required');
  }
  if (!Object.values(PlatformFeature).includes(input.feature)) {
    throw new ValidationError('Field "feature" must be a valid PlatformFeature');
  }
  if (typeof input.enabled !== 'boolean') {
    throw new ValidationError('Field "enabled" must be a boolean');
  }
}

function toView(row: EntitlementRow): AgencyEntitlementView {
  return {
    id: row.id,
    agencyId: row.agency_id,
    feature: row.feature,
    enabled: row.enabled,
    limits: row.limits ?? {},
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
