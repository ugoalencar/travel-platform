/**
 * Per-user area grants (Navigable Pilot Flow track, 2026-09-15). See
 * infrastructure/migrations/064_agent_area_grants.sql for the full
 * rationale -- an admin-controlled, additive-on-top-of-role-floor grant,
 * orthogonal to (and never replacing) the fixed OWNER/ADMIN/MANAGER/
 * AGENT/VIEWER role hierarchy. A small, curated, hardcoded set of areas
 * -- not a generic permission builder.
 */

import { ForbiddenError, getAgencyId, getUserId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from './database';
import { NotFoundError } from './errors';

export const AREA_GRANT_VALUES = ['SALES', 'FINANCIAL'] as const;
export type AreaGrant = (typeof AREA_GRANT_VALUES)[number];

export function isAreaGrant(value: unknown): value is AreaGrant {
  return typeof value === 'string' && (AREA_GRANT_VALUES as readonly string[]).includes(value);
}

export async function listAreaGrants(database: DatabaseRuntime, userId: string): Promise<AreaGrant[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ area: AreaGrant }>(
      `SELECT area FROM agent_area_grants WHERE agency_id = $1 AND user_id = $2 ORDER BY area`,
      [agencyId, userId],
    );
    return result.rows.map((row) => row.area);
  });
}

/**
 * Replaces the full grant set for one user in one call -- simpler for a
 * checkbox-style admin UI than separate grant/revoke endpoints, and the
 * set is small (2 possible areas) so there's no meaningful cost to
 * always sending the whole desired state.
 */
export async function setAreaGrants(
  database: DatabaseRuntime,
  targetUserId: string,
  areas: AreaGrant[],
): Promise<AreaGrant[]> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();
  const grantedByUserId = getUserId();

  return database.withTenantTransaction(async (client) => {
    const targetResult = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE agency_id = $1 AND id = $2`,
      [agencyId, targetUserId],
    );
    if (targetResult.rows.length === 0) {
      throw new NotFoundError('Membro não encontrado');
    }

    await client.query(`DELETE FROM agent_area_grants WHERE agency_id = $1 AND user_id = $2`, [
      agencyId,
      targetUserId,
    ]);

    const uniqueAreas = Array.from(new Set(areas));
    for (const area of uniqueAreas) {
      await client.query(
        `INSERT INTO agent_area_grants (agency_id, user_id, area, granted_by_user_id)
         VALUES ($1, $2, $3, $4)`,
        [agencyId, targetUserId, area, grantedByUserId],
      );
    }

    return uniqueAreas;
  });
}

/** Returns the current user's own granted areas (self-scoped, no ADMIN
 * floor -- every authenticated user can read their own grants, needed
 * by the frontend to decide what to show in their own sidebar). */
export async function getMyAreaGrants(database: DatabaseRuntime): Promise<AreaGrant[]> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ area: AreaGrant }>(
      `SELECT area FROM agent_area_grants WHERE agency_id = $1 AND user_id = $2 ORDER BY area`,
      [agencyId, userId],
    );
    return result.rows.map((row) => row.area);
  });
}

/**
 * Role-floor check with a narrow, explicit exception: an AGENT who has
 * been granted `area` passes even though their role rank alone wouldn't
 * meet `minRole`. Every role at or above `minRole` already passes
 * regardless of grants (a MANAGER doesn't need a FINANCIAL grant to see
 * financial routes -- they already could). Intentionally NOT a generic
 * replacement for requireRole(): only wired into the two read-only
 * financial overview routes this pass actually scoped
 * (/financial/dashboard, /financial/summary) -- see the migration's own
 * comment for why the rest of financial.ts stays MANAGER/ADMIN-only.
 */
export async function requireRoleOrAreaGrant(
  database: DatabaseRuntime,
  minRole: UserRole,
  area: AreaGrant,
): Promise<void> {
  try {
    requireRole(minRole);
    return;
  } catch (error) {
    if (!(error instanceof ForbiddenError)) {
      throw error;
    }
  }

  requireRole(UserRole.AGENT);
  const grants = await getMyAreaGrants(database);
  if (!grants.includes(area)) {
    throw new ForbiddenError(`Requires ${minRole} role or an explicit ${area} area grant`);
  }
}
