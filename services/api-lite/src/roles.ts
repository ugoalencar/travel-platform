import { ForbiddenError, UnauthorizedError } from './errors';

/**
 * Travel Lite role model. Deliberately smaller than the Travel Platform
 * hierarchy: ADMIN > MANAGER > OPERATOR (equivalent to "AGENT" in the main
 * platform) > VIEWER. Mapping in docs/travel-lite/INTEGRATION-MAPPING.md.
 */
export const LITE_ROLES = ['VIEWER', 'OPERATOR', 'MANAGER', 'ADMIN'] as const;
export type LiteRole = (typeof LITE_ROLES)[number];

const ROLE_HIERARCHY: Record<LiteRole, number> = {
  VIEWER: 20,
  OPERATOR: 40,
  MANAGER: 60,
  ADMIN: 80,
};

export function isLiteRole(value: unknown): value is LiteRole {
  return typeof value === 'string' && (LITE_ROLES as readonly string[]).includes(value);
}

export function hasAtLeastRole(actual: LiteRole, minimum: LiteRole): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[minimum];
}

export interface RoleGuardContext {
  role: LiteRole;
}

/**
 * Throws 401 when there is no context at all, 403 when the role is below
 * the minimum. Call inside a request (tenant context established).
 */
export function requireRole(context: RoleGuardContext | undefined, minimum: LiteRole): void {
  if (!context) {
    throw new UnauthorizedError();
  }
  if (!hasAtLeastRole(context.role, minimum)) {
    throw new ForbiddenError(`Requires role ${minimum} or higher`);
  }
}
