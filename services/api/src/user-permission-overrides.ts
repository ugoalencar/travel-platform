/**
 * Per-user permission overrides (SEC-01, ADR-009): GRANT/REVOKE on top of
 * the role hierarchy. Precedence restriction > grant > role is implemented
 * by permissions/resolver.ts; this module only loads/saves data and applies
 * the anti-escalation rules. The UI is never the barrier.
 */
import {
  ForbiddenError,
  getAgencyId,
  getTenantContext,
  getUserId,
  requireRole,
} from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError, ValidationError } from './errors';
import { CATALOG, findCatalogEntry, type CatalogEntry } from './permissions/permission-catalog';
import { decideCapability } from './permissions/resolver';

export type OverrideEffect = 'GRANT' | 'REVOKE';

export interface OverrideInput {
  resource: string;
  action: string;
  effect: OverrideEffect;
  reason: string;
}

export interface UserPermissionOverride extends OverrideInput {
  createdAt: string;
  createdByUserId: string;
}

const REVOKABLE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.MANAGER,
  UserRole.AGENT,
  UserRole.VIEWER,
]);
const MAX_OVERRIDES = 60;

const pairKey = (item: { resource: string; action: string }) => `${item.resource}:${item.action}`;
const fullKey = (item: { resource: string; action: string; effect: string }) =>
  `${pairKey(item)}:${item.effect}`;

export function parseOverrideInput(body: unknown): OverrideInput[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Corpo inválido');
  }
  if (Object.keys(body).some((key) => key !== 'overrides')) {
    throw new ValidationError('Campos não permitidos no corpo');
  }
  const list = (body as { overrides?: unknown }).overrides;
  if (!Array.isArray(list) || list.length > MAX_OVERRIDES) {
    throw new ValidationError('overrides deve ser uma lista de até 60 itens');
  }
  return list.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ValidationError('Override inválido');
    }
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) => !['resource', 'action', 'effect', 'reason'].includes(key))) {
      throw new ValidationError('Campos não permitidos no override');
    }
    const { resource, action, effect, reason } = item;
    if (typeof resource !== 'string' || typeof action !== 'string') {
      throw new ValidationError('resource e action são obrigatórios');
    }
    if (effect !== 'GRANT' && effect !== 'REVOKE') {
      throw new ValidationError('effect deve ser GRANT ou REVOKE');
    }
    if (typeof reason !== 'string' || reason.trim().length < 1 || reason.trim().length > 120) {
      throw new ValidationError('reason é obrigatório (1 a 120 caracteres)');
    }
    return { resource, action, effect, reason: reason.trim() };
  });
}

async function loadOverrides(
  client: TenantTransactionClient,
  userId: string,
): Promise<UserPermissionOverride[]> {
  const result = await client.query<{
    resource: string;
    action: string;
    effect: OverrideEffect;
    reason: string;
    created_at: string;
    created_by_user_id: string;
  }>(
    `SELECT resource, action, effect, reason, created_at, created_by_user_id
       FROM user_permission_overrides
      WHERE agency_id = $1 AND user_id = $2 ORDER BY resource, action`,
    [getAgencyId(), userId],
  );
  return result.rows.map((row) => ({
    resource: row.resource,
    action: row.action,
    effect: row.effect,
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
    createdByUserId: row.created_by_user_id,
  }));
}

async function requireTarget(
  client: TenantTransactionClient,
  targetUserId: string,
  lock: boolean,
): Promise<UserRole> {
  const target = await client.query<{ role: UserRole }>(
    `SELECT role FROM users WHERE agency_id = $1 AND id = $2 AND status = 'ACTIVE'${lock ? ' FOR UPDATE' : ''}`,
    [getAgencyId(), targetUserId],
  );
  const row = target.rows[0];
  if (!row) throw new NotFoundError('Membro não encontrado');
  return row.role;
}

export async function listUserPermissionOverrides(
  database: DatabaseRuntime,
  targetUserId: string,
): Promise<UserPermissionOverride[]> {
  requireRole(UserRole.ADMIN);
  return database.withTenantTransaction(async (client) => {
    await requireTarget(client, targetUserId, false);
    return loadOverrides(client, targetUserId);
  });
}

export async function setUserPermissionOverrides(
  database: DatabaseRuntime,
  targetUserId: string,
  overrides: OverrideInput[],
): Promise<UserPermissionOverride[]> {
  requireRole(UserRole.ADMIN);
  const actor = getTenantContext();
  if (targetUserId === actor.userId) {
    throw new ForbiddenError('Não é possível alterar as próprias permissões');
  }
  const seen = new Set<string>();
  for (const item of overrides) {
    if (seen.has(pairKey(item))) throw new ValidationError(`Chave duplicada: ${pairKey(item)}`);
    seen.add(pairKey(item));
  }

  return database.withTenantTransaction(async (client) => {
    const targetRole = await requireTarget(client, targetUserId, true);
    if (targetRole === UserRole.OWNER || targetRole === UserRole.ADMIN) {
      throw new ForbiddenError('OWNER e ADMIN não admitem permissões individuais');
    }
    for (const item of overrides) {
      const entry = findCatalogEntry(item.resource, item.action);
      if (!entry) throw new ValidationError(`Permissão fora do catálogo: ${pairKey(item)}`);
      if (item.effect === 'REVOKE') {
        if (!REVOKABLE_ROLES.has(targetRole)) {
          throw new ValidationError('Papel do usuário não admite REVOKE');
        }
        if (!entry.enforced) {
          throw new ValidationError(`Bloqueio individual ainda não é aplicado pelo servidor para: ${pairKey(item)}`);
        }
        continue;
      }
      if (!entry.delegable || entry.mutation) {
        throw new ValidationError(`Permissão não delegável: ${pairKey(item)}`);
      }
      if (!entry.grantableToRoles.includes(targetRole)) {
        throw new ValidationError('GRANT só é permitido para usuários com papel AGENT');
      }
      // Anti-escalation: the actor may only grant what the actor can do.
      const actorAllowed = decideCapability({
        role: actor.userRole,
        minRole: entry.minRole,
        entry,
        restrictedByRole: false,
        override: null,
      }).allowed;
      if (!actorAllowed) {
        throw new ForbiddenError('Você não pode conceder uma permissão que não possui');
      }
    }

    const before = await loadOverrides(client, targetUserId);
    // A change is a different key, effect OR reason (a reason-only edit must persist and be audited).
    const beforeEntries = new Map(before.map((item) => [fullKey(item), item.reason]));
    const afterEntries = new Map(overrides.map((item) => [fullKey(item), item.reason]));
    const changes: Array<{ mark: '+' | '-'; key: string; reason: string }> = [];
    for (const [key, reasonText] of afterEntries) {
      if (beforeEntries.get(key) !== reasonText) changes.push({ mark: '+', key, reason: reasonText });
    }
    for (const [key, reasonText] of beforeEntries) {
      if (afterEntries.get(key) !== reasonText) changes.push({ mark: '-', key, reason: reasonText });
    }
    if (changes.length > 0) {
      await client.query(
        `DELETE FROM user_permission_overrides WHERE agency_id = $1 AND user_id = $2`,
        [getAgencyId(), targetUserId],
      );
      for (const item of overrides) {
        await client.query(
          `INSERT INTO user_permission_overrides
             (agency_id, user_id, resource, action, effect, reason, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [getAgencyId(), targetUserId, item.resource, item.action, item.effect, item.reason, getUserId()],
        );
      }
      // The audit sanitizer keeps only allow-listed keys: one event per added (+) / removed (-) key,
      // with the stated reason in `reasonCode` (reasons are capped at 120 chars, so nothing is truncated).
      for (const change of changes) {
        await recordAuditEvent(client, {
          eventType: AuditEventType.USER_PERMISSION_OVERRIDES_CHANGED,
          entityType: 'user',
          entityId: targetUserId,
          required: true,
          metadata: { fieldsChanged: [`${change.mark}${change.key}`], reasonCode: change.reason },
        });
      }
    }
    return loadOverrides(client, targetUserId);
  });
}

export interface EffectivePermission {
  resource: string;
  action: string;
  allowed: boolean;
}

/** Effective permissions of the caller for every catalog key (for the UI; never the barrier). */
export async function getMyPermissions(database: DatabaseRuntime): Promise<EffectivePermission[]> {
  const { userRole } = getTenantContext();
  return database.withTenantTransaction(async (client) => {
    const restricted = await client.query<{ resource: string; action: string }>(
      `SELECT resource, action FROM permission_restrictions WHERE agency_id = $1 AND role = $2`,
      [getAgencyId(), userRole],
    );
    const mine = await loadOverrides(client, getUserId());
    const legacy = await client.query<{ area: string }>(
      `SELECT area FROM agent_area_grants WHERE agency_id = $1 AND user_id = $2`,
      [getAgencyId(), getUserId()],
    );
    const legacyAreas = new Set(legacy.rows.map((row) => row.area));
    const restrictedKeys = new Set(restricted.rows.map(pairKey));
    const overrideByKey = new Map(mine.map((item) => [pairKey(item), item.effect]));
    return CATALOG.map((entry) => {
      const input = {
        role: userRole,
        minRole: entry.minRole,
        entry,
        restrictedByRole: restrictedKeys.has(pairKey(entry)),
        override: overrideByKey.get(pairKey(entry)) ?? null,
      };
      // Same rule as the area-grant bridge: a legacy grant allows unless a restriction/REVOKE blocks.
      const blocked = input.restrictedByRole || input.override === 'REVOKE';
      const legacyAllowed =
        entry.areaGrant !== undefined && legacyAreas.has(entry.areaGrant) && userRole === UserRole.AGENT && !blocked;
      return {
        resource: entry.resource,
        action: entry.action,
        allowed: decideCapability(input).allowed || legacyAllowed,
      };
    });
  });
}

/**
 * Route-boundary check using the full decision. Fails closed: a catalog miss
 * or any read error denies. `minRole` is the floor the route already enforces.
 */
export async function requireCapability(
  database: DatabaseRuntime,
  resource: string,
  action: string,
  minRole: UserRole,
): Promise<void> {
  const entry: CatalogEntry | undefined = findCatalogEntry(resource, action);
  const { userRole } = getTenantContext();
  const allowed = await database.withTenantTransaction(async (client) => {
    const restricted = await client.query(
      `SELECT 1 FROM permission_restrictions
        WHERE agency_id = $1 AND role = $2 AND resource = $3 AND action = $4 LIMIT 1`,
      [getAgencyId(), userRole, resource, action],
    );
    const mine = (await loadOverrides(client, getUserId())).find(
      (item) => item.resource === resource && item.action === action,
    );
    return decideCapability({
      role: userRole,
      minRole,
      entry,
      restrictedByRole: restricted.rows.length > 0,
      override: mine?.effect ?? null,
    }).allowed;
  });
  if (!allowed) throw new ForbiddenError(`Ação não permitida: ${resource}:${action}`);
}

/**
 * Bridge for the legacy area-grant routes: restriction/REVOKE deny, a
 * floor or delegable GRANT allows, anything else defers to the legacy
 * `agent_area_grants` check.
 */
export async function decideForAreaGrant(
  database: DatabaseRuntime,
  minRole: UserRole,
  entry: CatalogEntry,
): Promise<'ALLOW' | 'DENY' | 'NO_OPINION'> {
  const { userRole } = getTenantContext();
  return database.withTenantTransaction(async (client) => {
    const restricted = await client.query(
      `SELECT 1 FROM permission_restrictions
        WHERE agency_id = $1 AND role = $2 AND resource = $3 AND action = $4 LIMIT 1`,
      [getAgencyId(), userRole, entry.resource, entry.action],
    );
    const mine = (await loadOverrides(client, getUserId())).find(
      (item) => item.resource === entry.resource && item.action === entry.action,
    );
    const input = {
      role: userRole,
      minRole,
      entry,
      restrictedByRole: restricted.rows.length > 0,
      override: mine?.effect ?? null,
    };
    if (decideCapability(input).allowed) return 'ALLOW';
    const blocked =
      userRole !== UserRole.OWNER &&
      userRole !== UserRole.ADMIN &&
      (input.restrictedByRole || input.override === 'REVOKE');
    return blocked ? 'DENY' : 'NO_OPINION';
  });
}
