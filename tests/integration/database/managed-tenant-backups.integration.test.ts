import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { startDisposableDb, type DisposableDb } from '../../../services/api/tests/helpers/disposable-postgres';

vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55649';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-managed-backup-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-managed-backup-int';
});

const migrations = readdirSync(resolve(import.meta.dirname, '../../../infrastructure/migrations'))
  .filter(name => /^\d+_.+\.sql$/.test(name))
  .sort();
const agencyA = '10000000-0000-4000-8000-000000000001';
const agencyB = '20000000-0000-4000-8000-000000000001';
const ownerA = '11000000-0000-4000-8000-000000000001';
const ownerB = '21000000-0000-4000-8000-000000000001';

describe('managed tenant backup metadata RLS', () => {
  let db: DisposableDb;
  let admin: Pool;

  beforeAll(async () => {
    db = await startDisposableDb(migrations);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Backup A', 'managed-backup-a', 'a@backup.test', 'FREE', 'ACTIVE'),
        ($2, 'Backup B', 'managed-backup-b', 'b@backup.test', 'FREE', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    await admin.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status) VALUES
        ($1, $3, 'owner-a@backup.test', 'Owner A', 'OWNER', 'test-hash', 'ACTIVE'),
        ($2, $4, 'owner-b@backup.test', 'Owner B', 'OWNER', 'test-hash', 'ACTIVE')`,
      [ownerA, ownerB, agencyA, agencyB],
    );
  }, 300_000);

  afterAll(async () => {
    await db?.stop();
  });

  async function asOwner<T>(agencyId: string, userId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await db.runtimePool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_tenant_context($1, $2)', [agencyId, userId]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function expectRejectedStatement(
    client: PoolClient,
    sql: string,
    values: readonly unknown[],
    message?: RegExp,
  ): Promise<void> {
    await client.query('SAVEPOINT expected_rejection');
    const statement = client.query(sql, values);
    if (message) await expect(statement).rejects.toThrow(message);
    else await expect(statement).rejects.toThrow();
    await client.query('ROLLBACK TO SAVEPOINT expected_rejection');
    await client.query('RELEASE SAVEPOINT expected_rejection');
  }

  it('keeps schedule and run rows agency-scoped and enforces unique daily runs', async () => {
    await asOwner(agencyA, ownerA, async client => {
      await client.query(
        `INSERT INTO tenant_backup_schedules (agency_id, enabled, daily_time, timezone, next_run_at, next_local_date, updated_by)
         VALUES ($1, TRUE, TIME '02:00', 'America/Sao_Paulo', now(), CURRENT_DATE, $2)`,
        [agencyA, ownerA],
      );
      await client.query(
        `INSERT INTO tenant_backup_runs
          (agency_id, scheduled_local_date, status, object_key, key_version, manifest_hash, record_count, size_bytes, created_by, updated_by, completed_at)
         VALUES ($1, CURRENT_DATE, 'SUCCEEDED', 'internal/managed-backups/a/run.tpbackup', 'v1', repeat('a', 64), 12, 2048, $2, $2, now())`,
        [agencyA, ownerA],
      );

      const visible = await client.query<{ agency_id: string }>('SELECT agency_id FROM tenant_backup_schedules');
      expect(visible.rows).toEqual([{ agency_id: agencyA }]);
      const runs = await client.query<{ agency_id: string }>('SELECT agency_id FROM tenant_backup_runs');
      expect(runs.rows).toEqual([{ agency_id: agencyA }]);
      await expectRejectedStatement(client,
        `INSERT INTO tenant_backup_runs
          (agency_id, scheduled_local_date, status, object_key, key_version, manifest_hash, record_count, size_bytes, created_by, updated_by, completed_at)
         VALUES ($1, CURRENT_DATE, 'SUCCEEDED', 'internal/managed-backups/a/duplicate.tpbackup', 'v1', repeat('b', 64), 1, 128, $2, $2, now())`,
        [agencyA, ownerA],
      );
      await expectRejectedStatement(client,
        `UPDATE tenant_backup_runs SET created_by = $2 WHERE agency_id = $1 AND scheduled_local_date = CURRENT_DATE`,
        [agencyA, ownerB],
        /creator is immutable/,
      );
      await expectRejectedStatement(client,
        `INSERT INTO tenant_backup_schedules (agency_id, enabled, daily_time, timezone, next_run_at, next_local_date, updated_by)
         VALUES ($1, TRUE, TIME '02:00', 'America/Sao_Paulo', now(), CURRENT_DATE, $2)`,
        [agencyB, ownerA],
      );
    });

    await asOwner(agencyB, ownerB, async client => {
      const schedules = await client.query<{ agency_id: string }>('SELECT agency_id FROM tenant_backup_schedules');
      expect(schedules.rows).toEqual([]);
      const runs = await client.query<{ agency_id: string }>('SELECT agency_id FROM tenant_backup_runs');
      expect(runs.rows).toEqual([]);
    });
  });

  it('grants candidate discovery only to the platform worker role', async () => {
    const result = await admin.query<{ runtime: boolean; platform: boolean }>(
      `SELECT has_function_privilege('travel_app_runtime_local', 'public.list_due_tenant_backup_agencies()', 'EXECUTE') AS runtime,
              has_function_privilege('travel_app_platform_local', 'public.list_due_tenant_backup_agencies()', 'EXECUTE') AS platform`,
    );
    expect(result.rows[0]).toEqual({ runtime: false, platform: true });
  });
});
