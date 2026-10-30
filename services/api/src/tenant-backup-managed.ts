import {
  getAgencyId,
  getTenantContext,
  requireExactRole,
} from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime } from './database';
import { ConflictError, ValidationError } from './errors';
import { resolveStorageProvider, readFile } from './storage';
import { canonicalTableHash } from './tenant-backup-crypto';
import {
  authorizeBackupStepUp,
  getBackupStatus,
  pendingTables,
  restoreManagedBackupPlaintext,
  validateBackupContent,
  verifyBackupPlaintext,
  type VerifyReport,
} from './tenant-backup';
import {
  decryptManagedBackup,
  parseManagedBackupKeyring,
  resolveCurrentManagedBackupKey,
  type ManagedBackupEnvelope,
} from './tenant-backup-managed-crypto';
import { calculateNextBackupRun, parseBackupScheduleInput, type BackupScheduleInput } from './tenant-backup-scheduler';

const RETENTION_DAYS = 30;
const MAX_MANAGED_BACKUP_BYTES = 40 * 1024 * 1024;
const OBJECT_KEY_PREFIX = 'internal/managed-backups/';

export interface ManagedBackupReadiness {
  storageConfigured: boolean;
  encryptionConfigured: boolean;
  ready: boolean;
}

export function getManagedBackupReadiness(environment: NodeJS.ProcessEnv = process.env): ManagedBackupReadiness {
  let storageConfigured = false;
  let encryptionConfigured = false;
  try {
    storageConfigured = resolveStorageProvider(environment) === 'supabase' &&
      Boolean(environment.SUPABASE_URL?.trim() && environment.SUPABASE_SERVICE_ROLE_KEY?.trim());
  } catch {
    storageConfigured = false;
  }
  try {
    const keyring = parseManagedBackupKeyring(environment.TENANT_BACKUP_KEYRING_JSON);
    resolveCurrentManagedBackupKey(keyring, environment.TENANT_BACKUP_CURRENT_KEY_VERSION);
    encryptionConfigured = true;
  } catch {
    encryptionConfigured = false;
  }
  return { storageConfigured, encryptionConfigured, ready: storageConfigured && encryptionConfigured };
}

export function parseBackupScheduleMutation(value: unknown): BackupScheduleInput & { currentPassword: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Request body must be an object.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['enabled', 'dailyTime', 'timezone', 'currentPassword'].includes(key))) {
    throw new ValidationError('Request contains an unsupported field.');
  }
  if (typeof body.currentPassword !== 'string' || !body.currentPassword || body.currentPassword.length > 200) {
    throw new ValidationError('Field "currentPassword" is required.');
  }
  const schedule = parseBackupScheduleInput({ enabled: body.enabled, dailyTime: body.dailyTime, timezone: body.timezone });
  return { ...schedule, currentPassword: body.currentPassword };
}

export async function updateManagedBackupSchedule(database: DatabaseRuntime, input: BackupScheduleInput & { currentPassword: string }) {
  requireExactRole(UserRole.OWNER);
  if (input.enabled && !getManagedBackupReadiness().ready) {
    throw new ConflictError('Configure o armazenamento privado e a chave de criptografia antes de ativar o backup diário.');
  }
  await authorizeBackupStepUp(database, input.currentPassword);
  const next = input.enabled ? calculateNextBackupRun(new Date(), input.dailyTime, input.timezone) : null;
  return database.withTenantTransaction(async client => {
    const agencyId = getAgencyId();
    const userId = getTenantContext().userId;
    await client.query(
      `INSERT INTO tenant_backup_schedules
        (agency_id, enabled, daily_time, timezone, next_run_at, next_local_date, updated_by)
       VALUES ($1, $2, $3::time, $4, $5, $6::date, $7)
       ON CONFLICT (agency_id) DO UPDATE SET enabled = EXCLUDED.enabled, daily_time = EXCLUDED.daily_time,
         timezone = EXCLUDED.timezone, next_run_at = EXCLUDED.next_run_at,
         next_local_date = EXCLUDED.next_local_date, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [agencyId, input.enabled, input.dailyTime, input.timezone, next?.nextRunAt ?? null, next?.nextLocalDate ?? null, userId],
    );
    await recordAuditEvent(client, {
      eventType: AuditEventType.BACKUP_SCHEDULE_UPDATED,
      entityType: 'backup_schedule',
      required: true,
      metadata: { enabled: input.enabled, dailyTime: input.dailyTime, timezone: input.timezone, retentionDays: RETENTION_DAYS },
    });
    return { enabled: input.enabled, dailyTime: input.dailyTime, timezone: input.timezone, nextRunAt: next?.nextRunAt ?? null };
  });
}

export async function getManagedBackupStatus(database: DatabaseRuntime) {
  requireExactRole(UserRole.OWNER);
  getTenantContext();
  const base = await getBackupStatus(database);
  const readiness = getManagedBackupReadiness();
  const managed = await database.withTenantTransaction(async client => {
    const agencyId = getAgencyId();
    const schedule = await client.query<{
      enabled: boolean; daily_time: string; timezone: string; next_run_at: string | null; next_local_date: string | null;
    }>(
      `SELECT enabled, to_char(daily_time, 'HH24:MI') AS daily_time, timezone, next_run_at, next_local_date
       FROM tenant_backup_schedules WHERE agency_id = $1`, [agencyId],
    );
    const runs = await client.query<{
      id: string; scheduled_local_date: string; status: string; attempt: number; key_version: string | null;
      record_count: number | null; size_bytes: string | null; error_code: string | null; started_at: string; completed_at: string | null;
    }>(
      `SELECT id, scheduled_local_date, status, attempt, key_version, record_count, size_bytes, error_code, started_at, completed_at
       FROM tenant_backup_runs WHERE agency_id = $1 ORDER BY created_at DESC, id DESC LIMIT 31`, [agencyId],
    );
    return { schedule: schedule.rows[0] ?? null, runs: runs.rows };
  });
  const schedule = managed.schedule;
  return {
    ...base,
    automatic: {
      configured: Boolean(schedule?.enabled && readiness.ready),
      enabled: schedule?.enabled ?? false,
      ready: readiness.ready,
      readiness,
      dailyTime: schedule?.daily_time ?? '02:00',
      timezone: schedule?.timezone ?? 'America/Sao_Paulo',
      nextRunAt: schedule?.next_run_at ?? null,
      nextLocalDate: schedule?.next_local_date ?? null,
      retentionDays: RETENTION_DAYS,
    },
    scope: 'CLASSIFIED',
    pendingInventory: pendingTables(),
    managedRuns: managed.runs.map(run => ({
      id: run.id,
      scheduledLocalDate: run.scheduled_local_date,
      status: run.status,
      attempt: run.attempt,
      keyVersion: run.key_version,
      recordCount: run.record_count,
      sizeBytes: run.size_bytes === null ? null : Number(run.size_bytes),
      errorCode: run.error_code,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    })),
  };
}

interface ManagedRunEnvelope {
  envelope: ManagedBackupEnvelope;
  manifestHash: string;
  keyVersion: string;
}

async function readManagedRun(database: DatabaseRuntime, runId: string): Promise<ManagedRunEnvelope> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new ValidationError('Backup run ID is invalid.');
  const agencyId = getAgencyId();
  const metadata = await database.withTenantTransaction(async client => {
    const result = await client.query<{ object_key: string; manifest_hash: string; key_version: string; size_bytes: string }>(
      `SELECT object_key, manifest_hash, key_version, size_bytes FROM tenant_backup_runs
       WHERE agency_id = $1 AND id = $2 AND status = 'SUCCEEDED'`, [agencyId, runId],
    );
    return result.rows[0];
  });
  if (!metadata || !metadata.object_key.startsWith(`${OBJECT_KEY_PREFIX}${agencyId}/`) || metadata.object_key.includes('..')) {
    throw new ConflictError('Backup gerenciado não encontrado para esta agência.');
  }
  const bytes = await readFile(metadata.object_key);
  if (bytes.length > MAX_MANAGED_BACKUP_BYTES || Number(metadata.size_bytes) !== bytes.length) {
    throw new ConflictError('O tamanho do arquivo de backup gerenciado não confere com o histórico.');
  }
  let envelope: ManagedBackupEnvelope;
  try {
    envelope = JSON.parse(bytes.toString('utf8')) as ManagedBackupEnvelope;
  } catch {
    throw new ConflictError('O arquivo de backup gerenciado está inválido.');
  }
  if (envelope.agencyId !== agencyId || envelope.keyVersion !== metadata.key_version) {
    throw new ConflictError('O arquivo de backup gerenciado não corresponde ao registro.');
  }
  return { envelope, manifestHash: metadata.manifest_hash, keyVersion: metadata.key_version };
}

async function readManagedPlaintext(database: DatabaseRuntime, runId: string) {
  const stored = await readManagedRun(database, runId);
  const keyring = parseManagedBackupKeyring(process.env.TENANT_BACKUP_KEYRING_JSON);
  const plaintext = decryptManagedBackup(stored.envelope, keyring, getAgencyId());
  validateBackupContent(plaintext, getAgencyId());
  if (canonicalTableHash(plaintext.manifest) !== stored.manifestHash) {
    throw new ConflictError('O manifesto do backup gerenciado não confere com o histórico.');
  }
  return { stored, plaintext };
}

export async function downloadManagedBackup(database: DatabaseRuntime, runId: string, currentPassword: string) {
  requireExactRole(UserRole.OWNER);
  await authorizeBackupStepUp(database, currentPassword);
  const { stored } = await readManagedPlaintext(database, runId);
  const filename = `backup-gerenciado-${runId}.tpbackup`;
  await database.withTenantTransaction(client => recordAuditEvent(client, {
    eventType: AuditEventType.BACKUP_EXPORTED,
    entityType: 'managed_backup',
    entityId: runId,
    required: true,
    metadata: { keyVersion: stored.keyVersion, result: 'DOWNLOAD' },
  }));
  return { filename, bytes: Buffer.from(JSON.stringify(stored.envelope), 'utf8') };
}

export async function verifyManagedBackup(database: DatabaseRuntime, runId: string, currentPassword: string): Promise<VerifyReport> {
  requireExactRole(UserRole.OWNER);
  await authorizeBackupStepUp(database, currentPassword);
  const { plaintext } = await readManagedPlaintext(database, runId);
  return verifyBackupPlaintext(database, plaintext, AuditEventType.BACKUP_MANAGED_VERIFIED);
}

export async function restoreManagedBackup(database: DatabaseRuntime, runId: string, currentPassword: string, reportHash: string) {
  requireExactRole(UserRole.OWNER);
  if (!/^[a-f0-9]{64}$/.test(reportHash)) throw new ValidationError('A verification report is required.');
  await authorizeBackupStepUp(database, currentPassword);
  const { plaintext } = await readManagedPlaintext(database, runId);
  return restoreManagedBackupPlaintext(database, plaintext, reportHash);
}

export const MANAGED_BACKUP_RETENTION_DAYS = RETENTION_DAYS;
