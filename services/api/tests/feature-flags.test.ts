import { describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import type { DatabaseRuntime, TenantTransactionClient } from '../src/database';
import {
  getFeatureFlag,
  isFeatureEnabled,
  listFeatureFlags,
  setFeatureFlagEnabled,
} from '../src/feature-flags';

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

function asQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows } as QueryResult<T>;
}

function buildFakeDatabase(flags: FakeFlagState[]): {
  database: DatabaseRuntime;
  auditRows: unknown[][];
} {
  const auditRows: unknown[][] = [];

  const client: TenantTransactionClient = {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<QueryResult<T>> {
      const sql = text.trim();

      if (sql.startsWith('SELECT') && sql.includes('FROM feature_flags') && sql.includes('ORDER BY name')) {
        const rows = [...flags].sort((a, b) => a.name.localeCompare(b.name));
        return Promise.resolve(asQueryResult(rows as unknown as T[]));
      }

      if (sql.startsWith('SELECT') && sql.includes('WHERE name = $1')) {
        const [name] = values;
        const row = flags.find((f) => f.name === name);
        return Promise.resolve(asQueryResult((row ? [{ ...row }] : []) as unknown as T[]));
      }

      if (sql.startsWith('UPDATE feature_flags')) {
        const [id, enabled] = values as [string, boolean];
        const row = flags.find((f) => f.id === id);
        if (row) {
          row.enabled = enabled;
        }
        return Promise.resolve(asQueryResult([] as T[]));
      }

      if (sql.startsWith('INSERT INTO feature_flag_audit')) {
        auditRows.push([...values]);
        return Promise.resolve(asQueryResult([] as T[]));
      }

      if (sql.startsWith('SELECT id, name') && sql.includes('WHERE id = $1')) {
        const [id] = values;
        const row = flags.find((f) => f.id === id);
        return Promise.resolve(asQueryResult((row ? [{ ...row }] : []) as unknown as T[]));
      }

      return Promise.reject(new Error(`Unexpected query in test fake: ${sql}`));
    },
  };

  const database: DatabaseRuntime = {
    withTenantTransaction: () => {
      throw new Error('feature flags must use withPlatformTransaction, not withTenantTransaction');
    },
    withPlatformTransaction: (operation) => operation(client),
  };

  return { database, auditRows };
}

function makeFlag(overrides: Partial<FakeFlagState> = {}): FakeFlagState {
  return {
    id: 'flag-1',
    name: 'OCR_DOCUMENTS',
    description: 'OCR ingestion pipeline',
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

describe('feature-flags service', () => {
  it('listFeatureFlags returns mapped rows', async () => {
    const { database } = buildFakeDatabase([makeFlag(), makeFlag({ id: 'flag-2', name: 'INSURANCE' })]);

    const flags = await listFeatureFlags(database);

    expect(flags.map((f) => f.name)).toEqual(['INSURANCE', 'OCR_DOCUMENTS']);
  });

  it('getFeatureFlag returns null for an unknown flag', async () => {
    const { database } = buildFakeDatabase([]);

    const flag = await getFeatureFlag(database, 'DOES_NOT_EXIST');

    expect(flag).toBeNull();
  });

  describe('isFeatureEnabled (kill switch, not an auth check)', () => {
    it('is false for an unknown flag name (fails closed)', async () => {
      const { database } = buildFakeDatabase([]);

      await expect(isFeatureEnabled(database, 'NOPE')).resolves.toBe(false);
    });

    it('is false when the flag row is disabled', async () => {
      const { database } = buildFakeDatabase([makeFlag({ enabled: false })]);

      await expect(isFeatureEnabled(database, 'OCR_DOCUMENTS')).resolves.toBe(false);
    });

    it('is true for an enabled GLOBAL flag regardless of tenant', async () => {
      const { database } = buildFakeDatabase([makeFlag({ enabled: true, scope: 'GLOBAL' })]);

      await expect(isFeatureEnabled(database, 'OCR_DOCUMENTS')).resolves.toBe(true);
      await expect(isFeatureEnabled(database, 'OCR_DOCUMENTS', { tenantId: 'any-tenant' })).resolves.toBe(true);
    });

    it('is true for an enabled TENANT_ID flag only when the tenant matches', async () => {
      const { database } = buildFakeDatabase([
        makeFlag({ enabled: true, scope: 'TENANT_ID', target_id: 'tenant-a' }),
      ]);

      await expect(isFeatureEnabled(database, 'OCR_DOCUMENTS', { tenantId: 'tenant-a' })).resolves.toBe(true);
      await expect(isFeatureEnabled(database, 'OCR_DOCUMENTS', { tenantId: 'tenant-b' })).resolves.toBe(false);
      await expect(isFeatureEnabled(database, 'OCR_DOCUMENTS')).resolves.toBe(false);
    });
  });

  describe('setFeatureFlagEnabled', () => {
    it('flips the flag and writes an audit row', async () => {
      const { database, auditRows } = buildFakeDatabase([makeFlag({ enabled: false })]);

      const updated = await setFeatureFlagEnabled(database, 'OCR_DOCUMENTS', {
        enabled: true,
        changedBy: 'platform-user-1',
      });

      expect(updated.enabled).toBe(true);
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toEqual([
        'flag-1',
        'ENABLED',
        JSON.stringify({ enabled: false }),
        JSON.stringify({ enabled: true }),
        'platform-user-1',
      ]);
    });

    it('throws NotFoundError for an unknown flag name', async () => {
      const { database } = buildFakeDatabase([]);

      await expect(
        setFeatureFlagEnabled(database, 'DOES_NOT_EXIST', { enabled: true, changedBy: 'u1' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
