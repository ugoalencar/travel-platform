import { afterEach, describe, expect, it } from 'vitest';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { buildApp } from '../src/app';
import { createFakeDatabase, AGENCY_A, USER_A } from './helpers/fake-database';

const owner: AuthenticatedPrincipal = { userId: USER_A, agencyId: AGENCY_A, role: UserRole.OWNER, email: 'owner@example.test' };
const admin: AuthenticatedPrincipal = { ...owner, role: UserRole.ADMIN };
const agent: AuthenticatedPrincipal = { ...owner, role: UserRole.AGENT };
const known = { owner, admin, agent };
const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

function createApp(role: 'owner' | 'admin' | 'agent', disabledModule: string | false = false) {
  const database = createFakeDatabase((query) => {
    if (query.text.includes('FROM agency_module_settings') && disabledModule) {
      return [{ module_key: disabledModule, enabled: false }];
    }
    return undefined;
  });
  const app = buildApp({
    database,
    authProvider: { authenticate: (request) => Promise.resolve(request.headers.authorization ? known[role] : null) },
    validateUserAgencyAccess: () => Promise.resolve(true),
  });
  apps.push(app);
  return { app, database };
}

describe('agency module settings HTTP', () => {
  it('lists the full catalog enabled by default without letting the client choose agencyId', async () => {
    const { app } = createApp('admin');
    const response = await app.inject({ method: 'GET', url: '/settings/modules', headers: { authorization: 'test' } });

    expect(response.statusCode).toBe(200);
    const modules = (JSON.parse(response.body) as { modules: Array<{ key: string; enabled: boolean }> }).modules;
    expect(modules.length).toBeGreaterThan(5);
    expect(modules.every((module) => module.enabled)).toBe(true);
  });

  it.each(['owner', 'admin'] as const)('%s can disable an optional module', async (role) => {
    const { app, database } = createApp(role);
    const response = await app.inject({
      method: 'PATCH', url: '/settings/modules/PIPELINE', headers: { authorization: 'test' }, payload: { enabled: false },
    });

    expect(response.statusCode).toBe(200);
    expect(database.findOne('INSERT INTO agency_module_settings').values).toContain(AGENCY_A);
  });

  it('denies a lower role and rejects tenant identifiers in the request body', async () => {
    const { app: lowerRoleApp } = createApp('agent');
    const { app: adminApp } = createApp('admin');
    const denied = await lowerRoleApp.inject({ method: 'PATCH', url: '/settings/modules/PIPELINE', headers: { authorization: 'test' }, payload: { enabled: false } });
    const agencyOverride = await adminApp.inject({ method: 'PATCH', url: '/settings/modules/PIPELINE', headers: { authorization: 'test' }, payload: { enabled: false, agencyId: 'other-tenant' } });

    expect(denied.statusCode).toBe(403);
    expect(agencyOverride.statusCode).toBe(400);
  });

  it('blocks direct API calls to a disabled module before its domain handler', async () => {
    const { app } = createApp('admin', 'PESCADOR');
    const response = await app.inject({ method: 'GET', url: '/pescador/captures', headers: { authorization: 'test' } });

    expect(response.statusCode).toBe(403);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('MODULE_DISABLED');
  });

  it('blocks API subroutes that belong to pipeline, travel operations and insurance modules', async () => {
    for (const { method, path, module } of [
      { method: 'GET', path: '/commercial/pipelines', module: 'PIPELINE' },
      { method: 'POST', path: '/air-services', module: 'TRAVEL_OPERATIONS' },
      { method: 'GET', path: '/operations/passengers', module: 'TRAVEL_OPERATIONS' },
      { method: 'GET', path: '/insurance/products', module: 'INSURANCE' },
    ] as const) {
      const { app } = createApp('admin', module);
      const response = method === 'POST'
        ? await app.inject({ method: 'POST', url: path, headers: { authorization: 'test' }, payload: {} })
        : await app.inject({ method: 'GET', url: path, headers: { authorization: 'test' } });
      expect(response.statusCode, path).toBe(403);
      expect((JSON.parse(response.body) as { code: string }).code, path).toBe('MODULE_DISABLED');
    }
  });
});
