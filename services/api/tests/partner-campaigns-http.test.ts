import { afterEach, describe, expect, it } from 'vitest';
import { UserRole } from '../../../packages/domain/types';
import { buildApp } from '../src/app';
import type { AuthenticatedPrincipal } from '../src/auth';
import type { DatabaseRuntime, TenantTransactionClient } from '../src/database';

const agencyAId = '10000000-0000-4000-8000-000000000003';
const userAId = '11000000-0000-4000-8000-000000000003';

const principals: Record<string, AuthenticatedPrincipal> = {
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'viewer@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'agent@example.test' },
};

describe('Partner Campaigns HTTP RBAC', () => {
  const database = createFailIfReachedDatabase();
  let tenantTransactionCalls = 0;

  afterEach(() => {
    tenantTransactionCalls = 0;
  });

  it('requires authentication before listing partner campaigns', async () => {
    const app = buildTestApp(database);

    const response = await app.inject({ method: 'GET', url: '/partner-campaigns' });

    expect(response.statusCode).toBe(401);
    expect(tenantTransactionCalls).toBe(0);
    await app.close();
  });

  it('allows VIEWER to reach read authorization but blocks campaign writes with 403', async () => {
    const app = buildTestApp(database);

    const createCampaign = await app.inject({
      method: 'POST',
      url: '/partner-campaigns',
      headers: { 'x-test-principal': 'viewer' },
      payload: { partnerId: 'partner-1', name: 'Campanha bloqueada' },
    });
    const createPartner = await app.inject({
      method: 'POST',
      url: '/partner-campaign-partners',
      headers: { 'x-test-principal': 'viewer' },
      payload: { name: 'Parceiro bloqueado' },
    });

    expect(createCampaign.statusCode).toBe(403);
    expect(createPartner.statusCode).toBe(403);
    expect(tenantTransactionCalls).toBe(0);
    await app.close();
  });

  it('blocks AGENT from manager-only campaign status transitions with 403', async () => {
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/partner-campaigns/campaign-1/status',
      headers: { 'x-test-principal': 'agent' },
      payload: { status: 'ACTIVE' },
    });

    expect(response.statusCode).toBe(403);
    expect(tenantTransactionCalls).toBe(0);
    await app.close();
  });
  function createFailIfReachedDatabase(): DatabaseRuntime {
    return {
      withTenantTransaction<T>(
        operation: (client: TenantTransactionClient) => Promise<T>,
      ): Promise<T> {
        void operation;
        tenantTransactionCalls += 1;
        return Promise.reject(new Error('Partner Campaigns HTTP RBAC test should not reach tenant database access'));
      },
      withPlatformTransaction<T>(
        operation: (client: TenantTransactionClient) => Promise<T>,
      ): Promise<T> {
        void operation;
        return Promise.reject(new Error('Unexpected platform database access'));
      },
    };
  }
});

function buildTestApp(database: DatabaseRuntime) {
  return buildApp({
    authProvider: {
      authenticate(request) {
        const key = request.headers['x-test-principal'];
        return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
      },
    },
    validateUserAgencyAccess(userId, agencyId) {
      return Promise.resolve(userId === userAId && agencyId === agencyAId);
    },
    database,
  });
}
