import { describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import { buildApp } from '../src/app';
import type { DatabaseRuntime, TenantTransactionClient } from '../src/database';
import { PlatformUserRole } from '../../../packages/domain/types';

interface FakeFlagState {
  id: string;
  name: string;
  description: string | null;
  scope: 'GLOBAL' | 'TENANT_ID' | 'PLAN_ID' | 'USER_ID';
  target_id: string | null;
  percentage_rollout: number | null;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface FeatureFlagsListResponse {
  flags: Array<{ name: string }>;
}

interface FeatureFlagToggleResponse {
  flag: { enabled: boolean };
}

function asQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows } as QueryResult<T>;
}

function buildFakeDatabase(flags: FakeFlagState[]) {
  const auditRows: unknown[][] = [];

  const client: TenantTransactionClient = {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<QueryResult<T>> {
      const sql = text.trim();
      if (sql.includes('ORDER BY name')) {
        return Promise.resolve(asQueryResult([...flags] as unknown as T[]));
      }
      if (sql.startsWith('SELECT') && sql.includes('WHERE name = $1')) {
        const row = flags.find((f) => f.name === values[0]);
        return Promise.resolve(asQueryResult((row ? [{ ...row }] : []) as unknown as T[]));
      }
      if (sql.startsWith('UPDATE feature_flags')) {
        const [id, enabled] = values as [string, boolean];
        const row = flags.find((f) => f.id === id);
        if (row) row.enabled = enabled;
        return Promise.resolve(asQueryResult([] as T[]));
      }
      if (sql.startsWith('INSERT INTO feature_flag_audit')) {
        auditRows.push([...values]);
        return Promise.resolve(asQueryResult([] as T[]));
      }
      if (sql.startsWith('SELECT id, name') && sql.includes('WHERE id = $1')) {
        const row = flags.find((f) => f.id === values[0]);
        return Promise.resolve(asQueryResult((row ? [{ ...row }] : []) as unknown as T[]));
      }
      return Promise.reject(new Error(`Unexpected query: ${sql}`));
    },
  };

  const database: DatabaseRuntime = {
    withTenantTransaction: () => {
      throw new Error('platform feature-flag routes must not use withTenantTransaction');
    },
    withPlatformTransaction: (operation) => operation(client),
  };

  return { database, auditRows };
}

function makeFlag(overrides: Partial<FakeFlagState> = {}): FakeFlagState {
  return {
    id: 'flag-1',
    name: 'OCR_DOCUMENTS',
    description: null,
    scope: 'GLOBAL',
    target_id: null,
    percentage_rollout: null,
    enabled: false,
    config: {},
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildTestApp(database: DatabaseRuntime) {
  return buildApp({
    authProvider: { authenticate: () => Promise.resolve(null) },
    validateUserAgencyAccess: () => Promise.resolve(false),
    database,
    platformAuthProvider: {
      authenticate(request) {
        const header = request.headers['x-test-platform-role'];
        if (!header || typeof header !== 'string') {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          platformUserId: 'platform-user-1',
          role: header as PlatformUserRole,
        });
      },
    },
    rateLimit: {
      classLimits: { SYSTEM_INTERNAL: { windowMs: 60_000, max: 50 } },
    },
  });
}

describe('platform feature-flag routes', () => {
  it('GET /platform/feature-flags requires platform auth', async () => {
    const { database } = buildFakeDatabase([makeFlag()]);
    const app = buildTestApp(database);

    const response = await app.inject({ method: 'GET', url: '/platform/feature-flags' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('GET /platform/feature-flags lists flags for any authenticated platform principal', async () => {
    const { database } = buildFakeDatabase([makeFlag({ name: 'INSURANCE' })]);
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'GET',
      url: '/platform/feature-flags',
      headers: { 'x-test-platform-role': PlatformUserRole.SUPPORT_ADMIN },
    });

    expect(response.statusCode).toBe(200);
    const body: FeatureFlagsListResponse = response.json();
    expect(body.flags).toHaveLength(1);
    expect(body.flags[0]?.name).toBe('INSURANCE');
    await app.close();
  });

  it('POST /platform/feature-flags/:name/toggle rejects a non-admin platform role', async () => {
    const { database } = buildFakeDatabase([makeFlag()]);
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/platform/feature-flags/OCR_DOCUMENTS/toggle',
      headers: { 'x-test-platform-role': PlatformUserRole.SUPPORT_ADMIN },
      payload: { enabled: true },
    });

    // Authenticated but insufficient role => 403 Forbidden (F-02), not 401.
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('POST /platform/feature-flags/:name/toggle allows PLATFORM_ADMIN and records an audit row', async () => {
    const { database, auditRows } = buildFakeDatabase([makeFlag({ enabled: false })]);
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/platform/feature-flags/OCR_DOCUMENTS/toggle',
      headers: { 'x-test-platform-role': PlatformUserRole.PLATFORM_ADMIN },
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(200);
    const body: FeatureFlagToggleResponse = response.json();
    expect(body.flag.enabled).toBe(true);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.[4]).toBe('platform-user-1');
    await app.close();
  });

  it('POST /platform/feature-flags/:name/toggle rejects a non-boolean body', async () => {
    const { database } = buildFakeDatabase([makeFlag()]);
    const app = buildTestApp(database);

    const response = await app.inject({
      method: 'POST',
      url: '/platform/feature-flags/OCR_DOCUMENTS/toggle',
      headers: { 'x-test-platform-role': PlatformUserRole.PLATFORM_ADMIN },
      payload: { enabled: 'yes' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
