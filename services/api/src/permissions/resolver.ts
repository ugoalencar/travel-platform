/**
 * Single capability decision (SEC-01): restriction > grant > role.
 * Pure on purpose -- the data loading lives in user-permission-overrides.ts.
 */
import { UserRole } from '../../../../packages/domain/types';
import type { CatalogEntry } from './permission-catalog';

const RANK: Record<UserRole, number> = {
  [UserRole.OWNER]: 100,
  [UserRole.ADMIN]: 80,
  [UserRole.MANAGER]: 60,
  [UserRole.AGENT]: 40,
  [UserRole.VIEWER]: 20,
};

export interface CapabilityInput {
  role: UserRole;
  minRole: UserRole;
  entry: CatalogEntry | undefined;
  restrictedByRole: boolean;
  override: 'GRANT' | 'REVOKE' | null;
}

export function decideCapability(input: CapabilityInput): { allowed: boolean } {
  // Fail closed: a key outside the catalog is never allowed, whatever the role.
  if (input.entry === undefined) return { allowed: false };
  const meetsFloor = (RANK[input.role] ?? 0) >= (RANK[input.minRole] ?? Infinity);
  // OWNER/ADMIN can never be restricted (no lockout), but still need the floor.
  if (input.role === UserRole.OWNER || input.role === UserRole.ADMIN) {
    return { allowed: meetsFloor };
  }
  if (input.restrictedByRole || input.override === 'REVOKE') return { allowed: false };
  if (meetsFloor) return { allowed: true };
  const { entry } = input;
  if (
    input.override === 'GRANT' &&
    entry !== undefined &&
    entry.delegable &&
    !entry.mutation &&
    entry.grantableToRoles.includes(input.role)
  ) {
    return { allowed: true };
  }
  return { allowed: false };
}
