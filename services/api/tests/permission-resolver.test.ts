import { describe, expect, it } from 'vitest';
import { UserRole } from '../../../packages/domain/types';
import {
  CATALOG,
  findCatalogEntry,
  NEVER_DELEGABLE_KEYS,
} from '../src/permissions/permission-catalog';
import { decideCapability } from '../src/permissions/resolver';

const entry = (resource: string, action: string) => {
  const found = findCatalogEntry(resource, action);
  if (!found) throw new Error(`missing catalog entry ${resource}:${action}`);
  return found;
};

describe('permission catalog', () => {
  it('only reads are delegable in v1, and only to AGENT', () => {
    for (const item of CATALOG) {
      if (!item.delegable) continue;
      expect(item.mutation).toBe(false);
      expect(item.grantableToRoles).toEqual([UserRole.AGENT]);
    }
  });

  it('never delegates user, permission, backup, dashboard, security or field management', () => {
    for (const key of NEVER_DELEGABLE_KEYS) {
      const [resource, action] = key.split(':') as [string, string];
      const found = findCatalogEntry(resource, action);
      if (found) expect(found.delegable).toBe(false);
    }
    expect(entry('customers', 'fields_manage').delegable).toBe(false);
    expect(entry('catalog', 'manage').delegable).toBe(false);
    expect(entry('customers', 'fields_manage').minRole).toBe(UserRole.ADMIN);
  });

  it('keeps the legacy restriction keys valid', () => {
    for (const [resource, action] of [
      ['customers', 'read'], ['financial', 'view'], ['employees', 'view'], ['air-services', 'create'],
    ] as const) {
      expect(findCatalogEntry(resource, action)).toBeDefined();
    }
  });

  it('only enforced keys accept a REVOKE (the server must really apply it)', () => {
    const enforced = CATALOG.filter((item) => item.enforced).map((item) => `${item.resource}:${item.action}`);
    // Only the financial area routes call the bridge today; sales reads are role-floor only.
    expect(enforced.sort()).toEqual(
      CATALOG.filter((item) => item.areaGrant && item.resource === 'financial')
        .map((item) => `${item.resource}:${item.action}`)
        .sort(),
    );
    expect(entry('customers', 'read').enforced).toBe(false);
    expect(entry('sales', 'sales.read').enforced).toBe(false);
  });

  it('has unique keys and every legacy area grant maps to exactly one entry', () => {
    const keys = CATALOG.map((item) => `${item.resource}:${item.action}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CATALOG.filter((item) => item.areaGrant).length).toBe(12);
  });
});

describe('decideCapability (restriction > grant > role)', () => {
  const base = {
    minRole: UserRole.MANAGER,
    entry: () => entry('financial', 'receivables.read'),
  };
  const run = (
    role: UserRole,
    extra: Partial<{ restrictedByRole: boolean; override: 'GRANT' | 'REVOKE' | null; entry: ReturnType<typeof findCatalogEntry> }> = {},
  ) =>
    decideCapability({
      role,
      minRole: base.minRole,
      entry: 'entry' in extra ? extra.entry : base.entry(),
      restrictedByRole: extra.restrictedByRole ?? false,
      override: extra.override ?? null,
    }).allowed;

  it('allows when the role floor is met', () => {
    expect(run(UserRole.MANAGER)).toBe(true);
  });
  it('denies a lower role without an override', () => {
    expect(run(UserRole.AGENT)).toBe(false);
  });
  it('lets a delegable GRANT fill a missing role floor for an AGENT', () => {
    expect(run(UserRole.AGENT, { override: 'GRANT' })).toBe(true);
  });
  it('never grants to VIEWER', () => {
    expect(run(UserRole.VIEWER, { override: 'GRANT' })).toBe(false);
  });
  it('ignores a GRANT on a non-delegable key', () => {
    expect(
      run(UserRole.AGENT, { override: 'GRANT', entry: entry('customers', 'fields_manage') }),
    ).toBe(false);
  });
  it('denies a key outside the catalog even when the role floor would suffice (fail closed)', () => {
    expect(run(UserRole.MANAGER, { entry: undefined })).toBe(false);
    expect(run(UserRole.ADMIN, { entry: undefined })).toBe(false);
  });
  it('ignores a GRANT for a key outside the catalog (fail closed)', () => {
    expect(run(UserRole.AGENT, { override: 'GRANT', entry: undefined })).toBe(false);
  });
  it('restriction by role beats a GRANT', () => {
    expect(run(UserRole.AGENT, { override: 'GRANT', restrictedByRole: true })).toBe(false);
  });
  it('REVOKE beats a sufficient role', () => {
    expect(run(UserRole.MANAGER, { override: 'REVOKE' })).toBe(false);
  });
  it('restriction by role beats a sufficient role', () => {
    expect(run(UserRole.MANAGER, { restrictedByRole: true })).toBe(false);
  });
  it('OWNER and ADMIN are never restricted and never need overrides', () => {
    for (const role of [UserRole.OWNER, UserRole.ADMIN]) {
      expect(run(role, { restrictedByRole: true, override: 'REVOKE' })).toBe(true);
    }
  });
  it('a GRANT does not turn a mutation into an allowed action', () => {
    expect(
      run(UserRole.AGENT, { override: 'GRANT', entry: entry('air-services', 'create') }),
    ).toBe(false);
  });
});
