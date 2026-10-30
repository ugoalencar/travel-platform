import { randomUUID } from 'node:crypto';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime, PlatformDatabaseRuntime, TenantTransactionClient } from './database';
import { getManagedBackupReadiness } from './tenant-backup-managed';
import {
  captureTenantBackupSnapshot,
  validateBackupContent,
} from './tenant-backup';
import { canonicalTableHash } from './tenant-backup-crypto';
import {
  encryptManagedBackup,
  parseManagedBackupKeyring,
  resolveCurrentManagedBackupKey,
} from './tenant-backup-managed-crypto';
import { calculateNextBackupRun } from './tenant-backup-scheduler';
import { deleteFile, saveFile } from './storage';

const RETENTION_DAYS = 30;
const MAX_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 5 * 60_000;
const RETRY_DELAY_MS = 15 * 60_000;
const WORKER_OBJECT_PREFIX = 'internal/managed-backups/';

interface DueBackupCandidate {
  agency_id: string;
  owner_id: string;
  daily_time: string;
  timezone: string;
  next_run_at: string;
  next_local_date: string;
}

interface ClaimedBackup extends DueBackupCandidate {
  run_id: string;
  attempt: number;
  object_key: string;
}

type ExecuteClaimOutcome = 'succeeded' | 'failed' | 'skipped';

export interface BackupWorkerStorage {
  saveFile(key: string, content: Buffer): Promise<void>;
  deleteFile(key: string): Promise<void>;
}

export interface ManagedBackupWorkerOptions {
  platformDatabase: PlatformDatabaseRuntime;
  candidateDatabase: Pick<DatabaseRuntime, 'withPlatformTransaction'>;
  environment?: NodeJS.ProcessEnv;
  storage?: BackupWorkerStorage;
  now?: () => Date;
}

function tenantContext(candidate: Pick<DueBackupCandidate, 'agency_id' | 'owner_id'>) {
  return {
    agencyId: candidate.agency_id,
    userId: candidate.owner_id,
    userRole: UserRole.OWNER,
    email: '',
  };
}

function scheduleMatchesClaim(
  schedule: { enabled: boolean; daily_time: string; timezone: string; next_local_date: string | null } | undefined,
  claim: ClaimedBackup,
): boolean {
  return Boolean(schedule?.enabled && schedule.daily_time === claim.daily_time && schedule.timezone === claim.timezone &&
    schedule.next_local_date?.slice(0, 10) === claim.next_local_date);
}

export function managedBackupObjectKey(agencyId: string, localDate: string): string {
  if (!/^[A-Za-z0-9-]{1,200}$/.test(agencyId) || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error('Managed backup object coordinates are invalid.');
  }
  return `${WORKER_OBJECT_PREFIX}${agencyId}/${localDate}.tpbackup`;
}

async function listDueCandidates(candidateDatabase: Pick<DatabaseRuntime, 'withPlatformTransaction'>): Promise<DueBackupCandidate[]> {
  return candidateDatabase.withPlatformTransaction(async client => {
    const result = await client.query<DueBackupCandidate>(
      'SELECT agency_id, owner_id, daily_time, timezone, next_run_at, next_local_date FROM public.list_due_tenant_backup_agencies()',
    );
    return result.rows;
  });
}

async function verifyActiveOwner(client: TenantTransactionClient, agencyId: string, ownerId: string): Promise<boolean> {
  const owner = await client.query<{ id: string }>(
    `SELECT id FROM public.users WHERE agency_id = $1 AND id = $2 AND role = 'OWNER' AND status = 'ACTIVE'`,
    [agencyId, ownerId],
  );
  return owner.rows.length === 1;
}

async function claimCandidate(
  platformDatabase: PlatformDatabaseRuntime,
  candidate: DueBackupCandidate,
  now: Date,
): Promise<ClaimedBackup | null> {
  return runWithTenantContext(tenantContext(candidate), () => platformDatabase.withAgencyTransaction(
    candidate.agency_id,
    candidate.owner_id,
    async client => {
      const schedule = await client.query<DueBackupCandidate & { enabled: boolean }>(
        `SELECT agency_id, updated_by AS owner_id, to_char(daily_time, 'HH24:MI') AS daily_time,
                timezone, next_run_at, next_local_date, enabled
           FROM public.tenant_backup_schedules
          WHERE agency_id = $1 AND enabled = TRUE
          FOR UPDATE SKIP LOCKED`,
        [candidate.agency_id],
      );
      const row = schedule.rows[0];
      if (!row || !await verifyActiveOwner(client, candidate.agency_id, candidate.owner_id)) return null;
      const dueAt = row.next_run_at ? new Date(row.next_run_at).getTime() : Number.POSITIVE_INFINITY;
      const localDate = row.next_local_date;
      if (!localDate) return null;

      const existing = await client.query<{ id: string; status: string; attempt: number; started_at: string }>(
        `SELECT id, status, attempt, started_at FROM public.tenant_backup_runs
          WHERE agency_id = $1 AND scheduled_local_date = $2::date FOR UPDATE`,
        [candidate.agency_id, localDate],
      );
      const prior = existing.rows[0];
      const staleRun = prior?.status === 'RUNNING' && now.getTime() - new Date(prior.started_at).getTime() >= CLAIM_LEASE_MS;
      if (dueAt > now.getTime() && !staleRun) return null;
      if (prior?.status === 'SUCCEEDED') return null;
      if (prior?.status === 'RUNNING' && !staleRun) return null;
      const attempt = (prior?.attempt ?? 0) + 1;
      if (attempt > MAX_ATTEMPTS) {
        const next = calculateNextBackupRun(now, row.daily_time, row.timezone);
        await client.query(
          `UPDATE public.tenant_backup_schedules SET next_run_at = $2, next_local_date = $3::date, updated_by = $4, updated_at = now()
            WHERE agency_id = $1`,
          [candidate.agency_id, next.nextRunAt, next.nextLocalDate, candidate.owner_id],
        );
        if (prior?.status === 'RUNNING') {
          await client.query(
            `UPDATE public.tenant_backup_runs SET status = 'FAILED', completed_at = now(), error_code = 'BACKUP_ATTEMPTS_EXHAUSTED', updated_by = $3
              WHERE agency_id = $1 AND id = $2`, [candidate.agency_id, prior.id, candidate.owner_id],
          );
        }
        return null;
      }

      const runId = prior?.id ?? randomUUID();
      if (prior) {
        await client.query(
          `UPDATE public.tenant_backup_runs SET status = 'RUNNING', attempt = $3, started_at = $4,
             completed_at = NULL, error_code = NULL, updated_by = $5
            WHERE agency_id = $1 AND id = $2`,
          [candidate.agency_id, runId, attempt, now, candidate.owner_id],
        );
      } else {
        await client.query(
          `INSERT INTO public.tenant_backup_runs
            (id, agency_id, scheduled_local_date, status, attempt, created_by, updated_by, started_at)
           VALUES ($1, $2, $3::date, 'RUNNING', $4, $5, $5, $6)`,
          [runId, candidate.agency_id, localDate, attempt, candidate.owner_id, now],
        );
      }
      await client.query(
        `UPDATE public.tenant_backup_schedules SET next_run_at = $2, updated_by = $3, updated_at = now()
          WHERE agency_id = $1`,
        [candidate.agency_id, new Date(now.getTime() + CLAIM_LEASE_MS), candidate.owner_id],
      );
      return {
        ...row,
        agency_id: candidate.agency_id,
        owner_id: candidate.owner_id,
        run_id: runId,
        attempt,
        object_key: managedBackupObjectKey(candidate.agency_id, localDate),
      };
    },
  ));
}

async function pruneExpiredRuns(
  client: TenantTransactionClient,
  agencyId: string,
  ownerId: string,
): Promise<string[]> {
  const expired = await client.query<{ id: string; object_key: string | null }>(
    `SELECT id, object_key FROM public.tenant_backup_runs
      WHERE agency_id = $1 AND created_at < now() - ($2 * INTERVAL '1 day')
        AND id IS DISTINCT FROM (
          SELECT id FROM public.tenant_backup_runs
           WHERE agency_id = $1 AND status = 'SUCCEEDED'
           ORDER BY completed_at DESC, id DESC LIMIT 1
        )
      ORDER BY created_at FOR UPDATE`,
    [agencyId, RETENTION_DAYS],
  );
  for (const run of expired.rows) {
    await client.query('DELETE FROM public.tenant_backup_runs WHERE agency_id = $1 AND id = $2', [agencyId, run.id]);
  }
  if (expired.rows.length > 0) {
    await recordAuditEvent(client, {
      eventType: AuditEventType.BACKUP_SCHEDULED,
      entityType: 'backup_retention',
      required: true,
      metadata: { retentionDays: RETENTION_DAYS, rowCount: expired.rows.length },
    });
  }
  await client.query(
    `UPDATE public.tenant_backup_schedules SET updated_by = $2, updated_at = now() WHERE agency_id = $1`,
    [agencyId, ownerId],
  );
  return expired.rows.flatMap(run => run.object_key ? [run.object_key] : []);
}

async function executeClaim(options: ManagedBackupWorkerOptions, claim: ClaimedBackup): Promise<ExecuteClaimOutcome> {
  const environment = options.environment ?? process.env;
  const storage = options.storage ?? { saveFile, deleteFile };
  const keyring = parseManagedBackupKeyring(environment.TENANT_BACKUP_KEYRING_JSON);
  const key = resolveCurrentManagedBackupKey(keyring, environment.TENANT_BACKUP_CURRENT_KEY_VERSION);
  const now = options.now ?? (() => new Date());
  const context = tenantContext(claim);
  let expiredObjectKeys: string[] = [];

  const completed = await runWithTenantContext(context, () => options.platformDatabase.withAgencyTransaction(
    claim.agency_id,
    claim.owner_id,
    async client => {
      if (!await verifyActiveOwner(client, claim.agency_id, claim.owner_id)) throw new Error('OWNER_CONTEXT_INVALID');
      const scheduleResult = await client.query<{ enabled: boolean; daily_time: string; timezone: string; next_local_date: string | null }>(
        `SELECT enabled, to_char(daily_time, 'HH24:MI') AS daily_time, timezone, next_local_date
           FROM public.tenant_backup_schedules WHERE agency_id = $1 FOR UPDATE`, [claim.agency_id],
      );
      const schedule = scheduleResult.rows[0];
      const lockedRun = await client.query<{ status: string; attempt: number }>(
        `SELECT status, attempt FROM public.tenant_backup_runs WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
        [claim.agency_id, claim.run_id],
      );
      if (lockedRun.rows[0]?.status !== 'RUNNING' || lockedRun.rows[0]?.attempt !== claim.attempt) return 'skipped';
      if (!scheduleMatchesClaim(schedule, claim)) {
        await client.query(
          `UPDATE public.tenant_backup_runs SET status = 'FAILED', completed_at = $3,
             error_code = 'BACKUP_SCHEDULE_CHANGED', updated_by = $4 WHERE agency_id = $1 AND id = $2`,
          [claim.agency_id, claim.run_id, now(), claim.owner_id],
        );
        await recordAuditEvent(client, {
          eventType: AuditEventType.BACKUP_SCHEDULE_FAILED,
          entityType: 'managed_backup',
          entityId: claim.run_id,
          required: true,
          metadata: { runId: claim.run_id, result: 'SCHEDULE_CHANGED' },
        });
        return 'failed';
      }
      const plaintext = await captureTenantBackupSnapshot(client);
      validateBackupContent(plaintext, claim.agency_id);
      const envelope = encryptManagedBackup(plaintext, key);
      const serialized = Buffer.from(JSON.stringify(envelope), 'utf8');
      if (serialized.length > 40 * 1024 * 1024) throw new Error('BACKUP_TOO_LARGE');
      await storage.deleteFile(claim.object_key);
      await storage.saveFile(claim.object_key, serialized);
      const completedAt = now();
      const next = calculateNextBackupRun(completedAt, schedule!.daily_time, schedule!.timezone);
      await client.query(
        `UPDATE public.tenant_backup_runs
            SET status = 'SUCCEEDED', object_key = $3, key_version = $4, manifest_hash = $5,
                record_count = $6, size_bytes = $7, error_code = NULL, completed_at = $8, updated_by = $9
          WHERE agency_id = $1 AND id = $2 AND status = 'RUNNING'`,
        [claim.agency_id, claim.run_id, claim.object_key, key.keyVersion,
          canonicalTableHash(plaintext.manifest),
          Object.values(plaintext.tables).reduce((total, rows) => total + rows.length, 0), serialized.length, completedAt, claim.owner_id],
      );
      await client.query(
        `UPDATE public.tenant_backup_schedules SET next_run_at = $2, next_local_date = $3::date,
           updated_by = $4, updated_at = now() WHERE agency_id = $1`,
        [claim.agency_id, next.nextRunAt, next.nextLocalDate, claim.owner_id],
      );
      await recordAuditEvent(client, {
        eventType: AuditEventType.BACKUP_SCHEDULED,
        entityType: 'managed_backup',
        entityId: claim.run_id,
        required: true,
        metadata: {
          runId: claim.run_id,
          rowCount: Object.values(plaintext.tables).reduce((total, rows) => total + rows.length, 0),
          keyVersion: key.keyVersion,
          result: 'SUCCEEDED',
        },
      });
      expiredObjectKeys = await pruneExpiredRuns(client, claim.agency_id, claim.owner_id);
      return 'succeeded';
    },
  ));
  if (completed !== 'succeeded') return completed;
  for (const objectKey of expiredObjectKeys) {
    try { await storage.deleteFile(objectKey); }
    catch { /* Metadata was deleted after commit; failed cleanup leaves an unreferenced private object. */ }
  }
  return 'succeeded';
}

async function recordFailure(
  platformDatabase: PlatformDatabaseRuntime,
  claim: ClaimedBackup,
  now: Date,
): Promise<void> {
  const context = tenantContext(claim);
  await runWithTenantContext(context, () => platformDatabase.withAgencyTransaction(
    claim.agency_id,
    claim.owner_id,
    async client => {
      if (!await verifyActiveOwner(client, claim.agency_id, claim.owner_id)) return;
      const scheduleResult = await client.query<{ enabled: boolean; daily_time: string; timezone: string; next_local_date: string | null }>(
        `SELECT enabled, to_char(daily_time, 'HH24:MI') AS daily_time, timezone, next_local_date
           FROM public.tenant_backup_schedules WHERE agency_id = $1 FOR UPDATE`, [claim.agency_id],
      );
      const schedule = scheduleResult.rows[0];
      const run = await client.query<{ status: string }>(
        `SELECT status FROM public.tenant_backup_runs WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
        [claim.agency_id, claim.run_id],
      );
      if (run.rows[0]?.status !== 'RUNNING') return;
      await client.query(
        `UPDATE public.tenant_backup_runs SET status = 'FAILED', completed_at = $3,
           error_code = 'BACKUP_EXECUTION_FAILED', updated_by = $4 WHERE agency_id = $1 AND id = $2`,
        [claim.agency_id, claim.run_id, now, claim.owner_id],
      );
      if (!scheduleMatchesClaim(schedule, claim)) {
        await recordAuditEvent(client, {
          eventType: AuditEventType.BACKUP_SCHEDULE_FAILED,
          entityType: 'managed_backup',
          entityId: claim.run_id,
          required: true,
          metadata: { runId: claim.run_id, result: 'SCHEDULE_CHANGED' },
        });
        return;
      }
      if (claim.attempt >= MAX_ATTEMPTS) {
        const next = calculateNextBackupRun(now, schedule!.daily_time, schedule!.timezone);
        await client.query(
          `UPDATE public.tenant_backup_schedules SET next_run_at = $2, next_local_date = $3::date,
             updated_by = $4, updated_at = now() WHERE agency_id = $1`,
          [claim.agency_id, next.nextRunAt, next.nextLocalDate, claim.owner_id],
        );
      } else {
        await client.query(
          `UPDATE public.tenant_backup_schedules SET next_run_at = $2, updated_by = $3, updated_at = now()
            WHERE agency_id = $1`,
          [claim.agency_id, new Date(now.getTime() + RETRY_DELAY_MS), claim.owner_id],
        );
      }
      await recordAuditEvent(client, {
        eventType: AuditEventType.BACKUP_SCHEDULE_FAILED,
        entityType: 'managed_backup',
        entityId: claim.run_id,
        required: true,
        metadata: { runId: claim.run_id, result: 'FAILED' },
      });
    },
  ));
}

export async function runManagedBackupWorkerOnce(options: ManagedBackupWorkerOptions): Promise<{ claimed: number; succeeded: number; failed: number }> {
  const environment = options.environment ?? process.env;
  if (!getManagedBackupReadiness(environment).ready) throw new Error('Managed backup storage or encryption is not configured.');
  const now = options.now ?? (() => new Date());
  const candidates = await listDueCandidates(options.candidateDatabase);
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const claim = await claimCandidate(options.platformDatabase, candidate, now());
    if (!claim) continue;
    claimed += 1;
    try {
      const outcome = await executeClaim(options, claim);
      if (outcome === 'succeeded') succeeded += 1;
      else if (outcome === 'failed') failed += 1;
    } catch {
      failed += 1;
      try {
        await recordFailure(options.platformDatabase, claim, now());
      } catch {
        // Failure state is retried by the next worker lease; never log record content or credentials.
      }
    }
  }
  return { claimed, succeeded, failed };
}
