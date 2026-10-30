import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseRuntime, PlatformDatabaseRuntime, TenantTransactionClient } from '../src/database';

const doubles = vi.hoisted(() => ({
  capture: vi.fn(),
  validate: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../src/tenant-backup', () => ({
  captureTenantBackupSnapshot: doubles.capture,
  validateBackupContent: doubles.validate,
}));
vi.mock('../src/audit-log', () => ({
  AuditEventType: { BACKUP_SCHEDULED: 'BACKUP_SCHEDULED', BACKUP_SCHEDULE_FAILED: 'BACKUP_SCHEDULE_FAILED' },
  recordAuditEvent: doubles.recordAudit,
}));

import { runManagedBackupWorkerOnce } from '../src/managed-backup-worker-service';

const key = Buffer.alloc(32, 7).toString('base64');
const environment = {
  STORAGE_PROVIDER: 'supabase', SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fictional-service-role', TENANT_BACKUP_KEYRING_JSON: JSON.stringify({ v1: key }),
  TENANT_BACKUP_CURRENT_KEY_VERSION: 'v1',
};
const scheduledAt = new Date('2026-01-01T00:00:00.000Z');
const agencyId = 'agency-worker';
const ownerId = 'owner-worker';
const candidate = {
  agency_id: agencyId, owner_id: ownerId, daily_time: '02:00:00', timezone: 'UTC',
  next_run_at: scheduledAt.toISOString(), next_local_date: '2026-01-01',
};

function harness(options: {
  ownerActive?: boolean;
  prior?: { id: string; status: string; attempt: number; started_at: string } | null;
  changeScheduleAfterClaim?: boolean;
  scheduleEnabled?: boolean;
  duplicateCandidate?: boolean;
} = {}) {
  const statements: Array<{ sql: string; values?: readonly unknown[] }> = [];
  let runState: { id: string; status: string; attempt: number; started_at: string } | null = options.prior ?? null;
  let scheduleNextRunAt: Date | string = candidate.next_run_at;
  let scheduleReads = 0;
  const query = vi.fn((sql: string, values?: readonly unknown[]) => {
    statements.push({ sql, ...(values === undefined ? {} : { values }) });
    if (sql.startsWith('SELECT id FROM public.users')) return Promise.resolve({ rows: options.ownerActive === false ? [] : [{ id: ownerId }] });
    if (sql.includes('FROM public.tenant_backup_schedules')) {
      scheduleReads += 1;
      if (sql.includes('WHERE agency_id = $1 AND enabled = TRUE') && options.scheduleEnabled === false) return Promise.resolve({ rows: [] });
      const dailyTime = options.changeScheduleAfterClaim && scheduleReads > 1 ? '03:00' : '02:00';
      return Promise.resolve({ rows: [{ ...candidate, daily_time: dailyTime, next_run_at: scheduleNextRunAt, enabled: options.scheduleEnabled !== false }] });
    }
    if (sql.includes('SELECT id, status, attempt, started_at')) return Promise.resolve({ rows: runState ? [runState] : [] });
    if (sql.includes('SELECT status, attempt FROM public.tenant_backup_runs')) return Promise.resolve({ rows: runState ? [{ status: runState.status, attempt: runState.attempt }] : [] });
    if (sql.includes('SELECT status FROM public.tenant_backup_runs')) return Promise.resolve({ rows: runState ? [{ status: runState.status }] : [] });
    if (sql.includes('SELECT id, object_key FROM public.tenant_backup_runs')) return Promise.resolve({ rows: [] });
    if (sql.startsWith('INSERT INTO public.tenant_backup_runs')) {
      runState = { id: String(values?.[0]), status: 'RUNNING', attempt: 1, started_at: String(values?.[5]) };
    }
    if (sql.startsWith('UPDATE public.tenant_backup_schedules SET next_run_at = $2')) scheduleNextRunAt = values?.[1] as Date | string;
    if (sql.startsWith('UPDATE public.tenant_backup_runs SET status =')) {
      const nextStatus = /SET status = '([A-Z]+)'/.exec(sql)?.[1];
      if (runState && nextStatus) runState.status = nextStatus;
    }
    return Promise.resolve({ rows: [] });
  });
  const client = { query } as unknown as TenantTransactionClient;
  const agencyTransaction = vi.fn((_agency: string, _actor: string | null, operation: (client: TenantTransactionClient) => Promise<unknown>) => operation(client));
  const candidateTransaction = vi.fn((operation: (client: TenantTransactionClient) => Promise<unknown>) => operation({
    query: vi.fn(() => Promise.resolve({ rows: options.duplicateCandidate ? [candidate, candidate] : [candidate] })),
  } as unknown as TenantTransactionClient));
  const platformDatabase = { withAgencyTransaction: agencyTransaction } as unknown as PlatformDatabaseRuntime;
  const candidateDatabase = { withPlatformTransaction: candidateTransaction } as unknown as Pick<DatabaseRuntime, 'withPlatformTransaction'>;
  return { statements, agencyTransaction, candidateTransaction, platformDatabase, candidateDatabase, runState };
}

const snapshot = {
  format: 'travel-platform-tenant-operations-v1', agencyId, createdAt: scheduledAt.toISOString(), schemaVersion: 'test-schema',
  manifest: [{ table: 'sales', rows: 0, sha256: 'a'.repeat(64) }], tables: { sales: [] },
};

afterEach(() => { vi.clearAllMocks(); });

describe('managed backup worker', () => {
  it('fails closed before querying jobs when storage or encryption is missing', async () => {
    const h = harness();
    await expect(runManagedBackupWorkerOnce({ platformDatabase: h.platformDatabase, candidateDatabase: h.candidateDatabase, environment: {} })).rejects.toThrow(/not configured/);
    expect(h.candidateTransaction).not.toHaveBeenCalled();
  });

  it('does not enter an agency context or query storage when no due schedules exist', async () => {
    const h = harness();
    h.candidateTransaction.mockImplementationOnce(operation => operation({ query: vi.fn(() => Promise.resolve({ rows: [] })) } as unknown as TenantTransactionClient));
    const storage = { saveFile: vi.fn(), deleteFile: vi.fn() };
    await expect(runManagedBackupWorkerOnce({ platformDatabase: h.platformDatabase, candidateDatabase: h.candidateDatabase, storage, environment }))
      .resolves.toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(h.agencyTransaction).not.toHaveBeenCalled();
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('claims once under a schedule row lock, rechecks the OWNER, and stores an encrypted agency object', async () => {
    doubles.capture.mockResolvedValue(snapshot);
    const h = harness();
    const storage = { saveFile: vi.fn(), deleteFile: vi.fn() };
    const result = await runManagedBackupWorkerOnce({
      platformDatabase: h.platformDatabase, candidateDatabase: h.candidateDatabase, storage, environment,
      now: () => new Date('2026-01-01T03:00:00.000Z'),
    });

    expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 });
    expect(h.agencyTransaction).toHaveBeenCalledTimes(2);
    expect(h.statements.filter(item => item.sql.startsWith('INSERT INTO public.tenant_backup_runs'))).toHaveLength(1);
    expect(h.agencyTransaction).toHaveBeenNthCalledWith(1, agencyId, ownerId, expect.any(Function));
    expect(h.statements.some(item => item.sql.includes('FOR UPDATE SKIP LOCKED'))).toBe(true);
    expect(h.statements.some(item => item.sql.includes("id IS DISTINCT FROM") && item.sql.includes("status = 'SUCCEEDED'"))).toBe(true);
    expect(storage.saveFile).toHaveBeenCalledWith('internal/managed-backups/agency-worker/2026-01-01.tpbackup', expect.any(Buffer));
    const bytes = storage.saveFile.mock.calls[0]![1] as Buffer;
    const envelope = JSON.parse(bytes.toString('utf8')) as { agencyId: string; format: string };
    expect(envelope).toMatchObject({ agencyId, format: 'travel-platform-managed-backup-v1' });
    expect(bytes.toString('utf8')).not.toContain('test-schema');
  });

  it('does not claim when the OWNER is no longer active or the local date already succeeded', async () => {
    const inactive = harness({ ownerActive: false });
    const storage = { saveFile: vi.fn(), deleteFile: vi.fn() };
    await expect(runManagedBackupWorkerOnce({ platformDatabase: inactive.platformDatabase, candidateDatabase: inactive.candidateDatabase, storage, environment }))
      .resolves.toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(storage.saveFile).not.toHaveBeenCalled();

    const succeeded = harness({ prior: { id: '00000000-0000-4000-8000-000000000001', status: 'SUCCEEDED', attempt: 1, started_at: scheduledAt.toISOString() } });
    await expect(runManagedBackupWorkerOnce({ platformDatabase: succeeded.platformDatabase, candidateDatabase: succeeded.candidateDatabase, storage, environment }))
      .resolves.toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(succeeded.statements.some(item => item.sql.startsWith('INSERT INTO public.tenant_backup_runs'))).toBe(false);

    const disabled = harness({ scheduleEnabled: false });
    await expect(runManagedBackupWorkerOnce({ platformDatabase: disabled.platformDatabase, candidateDatabase: disabled.candidateDatabase, storage, environment }))
      .resolves.toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(disabled.agencyTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not claim a second run while another worker holds the agency/date lease', async () => {
    doubles.capture.mockResolvedValue(snapshot);
    const h = harness({ duplicateCandidate: true });
    const storage = { saveFile: vi.fn(), deleteFile: vi.fn() };
    const result = await runManagedBackupWorkerOnce({
      platformDatabase: h.platformDatabase, candidateDatabase: h.candidateDatabase, storage, environment,
      now: () => new Date('2026-01-01T03:00:00.000Z'),
    });
    expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 });
    expect(h.agencyTransaction).toHaveBeenCalledTimes(3);
    expect(h.statements.filter(item => item.sql.startsWith('INSERT INTO public.tenant_backup_runs'))).toHaveLength(1);
  });

  it('does not overwrite a schedule changed after the claim', async () => {
    const h = harness({ changeScheduleAfterClaim: true });
    const storage = { saveFile: vi.fn(), deleteFile: vi.fn() };
    const result = await runManagedBackupWorkerOnce({
      platformDatabase: h.platformDatabase, candidateDatabase: h.candidateDatabase, storage, environment,
      now: () => new Date('2026-01-01T03:00:00.000Z'),
    });
    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 1 });
    expect(h.statements.some(item => item.sql.includes("error_code = 'BACKUP_SCHEDULE_CHANGED'"))).toBe(true);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('marks storage errors as failed and leaves a bounded retry schedule', async () => {
    doubles.capture.mockResolvedValue(snapshot);
    const h = harness();
    const storage = { saveFile: vi.fn(() => Promise.reject(new Error('private provider detail'))), deleteFile: vi.fn() };
    const result = await runManagedBackupWorkerOnce({
      platformDatabase: h.platformDatabase, candidateDatabase: h.candidateDatabase, storage, environment,
      now: () => new Date('2026-01-01T03:00:00.000Z'),
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 1 });
    expect(h.statements.some(item => item.sql.includes("error_code = 'BACKUP_EXECUTION_FAILED'"))).toBe(true);
    expect(h.statements.some(item => item.sql.includes('SET next_run_at = $2') && new Date(String(item.values?.[1])).toISOString() === '2026-01-01T03:15:00.000Z')).toBe(true);
    expect(doubles.recordAudit).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ eventType: 'BACKUP_SCHEDULE_FAILED' }));
  });
});
