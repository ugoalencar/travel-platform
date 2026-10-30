import { describe, expect, it } from 'vitest';
import {
  AGENCY_MODULE_CATALOG,
  getAgencyModule,
  getDisablingBlockers,
  isAgencyModuleEnabled,
  resolveAgencyModuleForPath,
  validateAgencyModuleCatalog,
} from '../src/agency-modules';
import { registerAllRoutes } from '../src/route-inventory';
import { clearRouteRegistry, getRegisteredRoutes } from '../src/route-classification';

describe('agency module catalog', () => {
  it('keeps the essential workspace locked and enabled', () => {
    const core = getAgencyModule('CORE');

    expect(core).toMatchObject({ key: 'CORE', essential: true });
    expect(() => getDisablingBlockers('CORE', new Set())).toThrow(/essential/i);
  });

  it('defaults every agency module to enabled and honors an explicit disable', () => {
    expect(isAgencyModuleEnabled('PIPELINE', {})).toBe(true);
    expect(isAgencyModuleEnabled('PIPELINE', { PIPELINE: false })).toBe(false);
  });

  it('maps direct API and UI paths to one owning module', () => {
    expect(resolveAgencyModuleForPath('/commercial/opportunities/123')).toBe('PIPELINE');
    expect(resolveAgencyModuleForPath('/commercial/dashboard')).toBe('CORE');
    expect(resolveAgencyModuleForPath('/commercial/reports/bookings')).toBe('CORE');
    expect(resolveAgencyModuleForPath('/pescador/captures')).toBe('PESCADOR');
    expect(resolveAgencyModuleForPath('/sales/import')).toBe('SALES_IMPORT');
    expect(resolveAgencyModuleForPath('/imports/sales/confirm')).toBe('SALES_IMPORT');
    expect(resolveAgencyModuleForPath('/tasks/123')).toBe('PIPELINE');
    expect(resolveAgencyModuleForPath('/contracts/documents')).toBe('CORE');
    expect(resolveAgencyModuleForPath('/trips/123')).toBe('CORE');
    expect(resolveAgencyModuleForPath('/bookings/123')).toBe('CORE');
    expect(resolveAgencyModuleForPath('/air-services')).toBe('TRAVEL_OPERATIONS');
    expect(resolveAgencyModuleForPath('/customers/123')).toBe('CORE');
  });

  it('blocks disabling a prerequisite while an enabled dependent uses it', () => {
    expect(getDisablingBlockers('CAMPAIGNS', new Set(['SOCIAL_PUBLISHING']))).toEqual([
      'SOCIAL_PUBLISHING',
    ]);
    expect(getDisablingBlockers('CAMPAIGNS', new Set())).toEqual([]);
  });

  it('validates unique keys, route ownership, and an acyclic dependency graph', () => {
    expect(() => validateAgencyModuleCatalog(AGENCY_MODULE_CATALOG)).not.toThrow();
    expect(() =>
      validateAgencyModuleCatalog([
        { key: 'PIPELINE', label: 'Pipeline', description: '', essential: false, dependencies: ['CAMPAIGNS'], apiPrefixes: ['/pipeline'], uiPrefixes: ['/pipeline'] },
        { key: 'CAMPAIGNS', label: 'Campanhas', description: '', essential: false, dependencies: ['PIPELINE'], apiPrefixes: ['/campaigns'], uiPrefixes: ['/campaigns'] },
      ]),
    ).toThrow(/cycle/i);
  });

  it('registers module settings endpoints in the authenticated security inventory', () => {
    clearRouteRegistry();
    registerAllRoutes();
    const routes = getRegisteredRoutes();
    expect(routes.find((route) => route.method === 'GET' && route.path === '/settings/modules'))
      .toMatchObject({ authPipeline: 'protectedHooks' });
    expect(routes.find((route) => route.method === 'PATCH' && route.path === '/settings/modules/:key'))
      .toMatchObject({ authPipeline: 'protectedHooks', role: 'ADMIN' });
    clearRouteRegistry();
  });
});
