// ============================================================
// FEATURE FLAGS (ops/release hardening -- Wave 2, Agent 01)
// ============================================================
// A minimal, real feature-flag mechanism backed by the `feature_flags` /
// `feature_flag_audit` tables (see infrastructure/migrations/
// 033_landing_page_and_flags.sql -- the schema already existed; nothing
// here invents new columns).
//
// IMPORTANT: a feature flag is a KILL SWITCH, not an authorization
// mechanism. isFeatureEnabled() only ever gates whether a code path runs
// -- callers MUST still perform their normal RBAC checks
// (requireRole()/requirePlatformRole()) independently. Never call this
// function in place of an auth check.
//
// Scope resolution implemented here: GLOBAL (applies to everyone) and
// TENANT_ID (applies only when the caller passes a matching tenantId).
// PLAN_ID/USER_ID scoped rows are supported for storage/toggling but are
// deliberately treated as "not enabled" by isFeatureEnabled() until a
// caller exists that can resolve plan/user membership -- silently
// guessing that resolution would be worse than failing closed.
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError } from './errors';

export interface FeatureFlagRecord {
  id: string;
  name: string;
  description: string | null;
  scope: 'GLOBAL' | 'PLAN_ID' | 'TENANT_ID' | 'USER_ID';
  targetId: string | null;
  percentageRollout: number | null;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface FeatureFlagRow {
  id: string;
  name: string;
  description: string | null;
  scope: FeatureFlagRecord['scope'];
  target_id: string | null;
  percentage_rollout: number | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: FeatureFlagRow): FeatureFlagRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    targetId: row.target_id,
    percentageRollout: row.percentage_rollout,
    enabled: row.enabled,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function withPlatform<T>(
  database: DatabaseRuntime,
  operation: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  return database.withPlatformTransaction(operation);
}

export async function listFeatureFlags(database: DatabaseRuntime): Promise<FeatureFlagRecord[]> {
  return withPlatform(database, async (client) => {
    const result = await client.query<FeatureFlagRow>(
      `SELECT id, name, description, scope, target_id, percentage_rollout, enabled, config, created_at, updated_at
         FROM feature_flags
        ORDER BY name`,
    );
    return result.rows.map(mapRow);
  });
}

export async function getFeatureFlag(
  database: DatabaseRuntime,
  name: string,
): Promise<FeatureFlagRecord | null> {
  return withPlatform(database, async (client) => {
    const result = await client.query<FeatureFlagRow>(
      `SELECT id, name, description, scope, target_id, percentage_rollout, enabled, config, created_at, updated_at
         FROM feature_flags
        WHERE name = $1`,
      [name],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  });
}

/**
 * Kill-switch read. Returns whether `name` is currently enabled for the
 * given (optional) tenant. Never throws for an unknown flag name -- an
 * unrecognized or not-yet-created flag is treated as disabled (fail
 * closed on new/experimental functionality, not fail open).
 *
 * This is NOT an authorization check. Do not use it to decide whether a
 * request is allowed; use it only to decide whether an already-authorized
 * code path is currently rolled out.
 */
export async function isFeatureEnabled(
  database: DatabaseRuntime,
  name: string,
  options: { tenantId?: string } = {},
): Promise<boolean> {
  const flag = await getFeatureFlag(database, name);
  if (!flag || !flag.enabled) {
    return false;
  }

  if (flag.scope === 'GLOBAL') {
    return true;
  }

  if (flag.scope === 'TENANT_ID') {
    return options.tenantId !== undefined && flag.targetId === options.tenantId;
  }

  // PLAN_ID / USER_ID scoped flags: no resolver wired up yet. Fail closed
  // rather than guessing a match.
  return false;
}

export interface ToggleFeatureFlagInput {
  enabled: boolean;
  changedBy: string;
}

/**
 * Admin-only kill-switch write. Flips `enabled` and writes one
 * feature_flag_audit row per call (even a no-op toggle, e.g. turning an
 * already-enabled flag on again, is recorded -- callers/route handlers
 * are the audit trail's source of truth for "who touched this and when",
 * not just "what changed").
 */
export async function setFeatureFlagEnabled(
  database: DatabaseRuntime,
  name: string,
  input: ToggleFeatureFlagInput,
): Promise<FeatureFlagRecord> {
  return withPlatform(database, async (client) => {
    const existing = await client.query<{ id: string; enabled: boolean }>(
      `SELECT id, enabled FROM feature_flags WHERE name = $1`,
      [name],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFoundError(`Feature flag "${name}" not found`);
    }

    await client.query(
      `UPDATE feature_flags SET enabled = $2, updated_at = now() WHERE id = $1`,
      [row.id, input.enabled],
    );

    await client.query(
      `INSERT INTO feature_flag_audit (feature_flag_id, action, old_value, new_value, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        row.id,
        input.enabled ? 'ENABLED' : 'DISABLED',
        JSON.stringify({ enabled: row.enabled }),
        JSON.stringify({ enabled: input.enabled }),
        input.changedBy,
      ],
    );

    const updated = await client.query<FeatureFlagRow>(
      `SELECT id, name, description, scope, target_id, percentage_rollout, enabled, config, created_at, updated_at
         FROM feature_flags
        WHERE id = $1`,
      [row.id],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) {
      throw new NotFoundError(`Feature flag "${name}" not found`);
    }
    return mapRow(updatedRow);
  });
}

/** Known flag names from RELEASE_UPDATE_STRATEGY.md -- documentation only,
 * not an enforced allow-list (new flags can still be created directly in
 * the table / via migrations without editing this file). */
export const KNOWN_FEATURE_FLAGS = [
  'OCR_DOCUMENTS',
  'DIGITAL_SIGNATURES',
  'PARTNER_PORTAL',
  'UPSELL_ENGINE',
  'INSURANCE',
  'MARKETING_AUTOMATIONS',
] as const;
