import { describe, expect, it, vi } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import {
  AGENCY_A,
  CONTEXT_A,
  createFakeDatabase,
} from './helpers/fake-database';
import {
  getAgencyModules,
  requireAgencyModuleEnabled,
  setAgencyModuleEnabled,
} from '../src/agency-modules';

describe('agency module settings service', () => {
  it('defaults absent settings to enabled and scopes reads to the caller agency', async () => {
    const database = createFakeDatabase();

    const modules = await runWithTenantContext(CONTEXT_A, () => getAgencyModules(database));

    expect(modules.every((module) => module.enabled)).toBe(true);
    expect(database.queries.every((query) => query.values.includes(AGENCY_A))).toBe(true);
  });

  it('rejects direct API access when an optional module is disabled', async () => {
    const database = createFakeDatabase((query) => {
      if (query.text.includes('FROM agency_module_settings')) return [{ module_key: 'PESCADOR', enabled: false }];
      return undefined;
    });

    await expect(runWithTenantContext(CONTEXT_A, () => requireAgencyModuleEnabled(database, 'PESCADOR')))
      .rejects.toMatchObject({ code: 'MODULE_DISABLED' });
  });

  it('rejects disabling a prerequisite while a dependent module is still enabled', async () => {
    const database = createFakeDatabase((query) => {
      if (query.text.includes('FROM agency_module_settings')) {
        return [{ module_key: 'SOCIAL_PUBLISHING', enabled: true }];
      }
      return undefined;
    });

    await expect(runWithTenantContext(CONTEXT_A, () => setAgencyModuleEnabled(database, 'CAMPAIGNS', false)))
      .rejects.toMatchObject({ code: 'MODULE_DEPENDENCY_CONFLICT' });
    expect(database.find('INSERT INTO agency_module_settings')).toHaveLength(0);
  });

  it('does not allow agency administrators to enable a feature outside their entitlement', async () => {
    const database = createFakeDatabase();

    await expect(runWithTenantContext(CONTEXT_A, () => setAgencyModuleEnabled(database, 'PESCADOR', true)))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED' });
    expect(database.find('INSERT INTO agency_module_settings')).toHaveLength(0);
  });

  it('audits a setting mutation in the same tenant transaction', async () => {
    const database = createFakeDatabase();
    const auditSpy = vi.spyOn(database, 'withTenantTransaction');

    await runWithTenantContext(CONTEXT_A, () => setAgencyModuleEnabled(database, 'PIPELINE', false));

    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(database.find('INSERT INTO audit_logs')).toHaveLength(1);
    expect(database.findOne('INSERT INTO agency_module_settings').values).toContain(false);
  });
});
