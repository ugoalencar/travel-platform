import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireExactRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import {
  BackupError,
  MAX_BACKUP_BYTES,
  restoreTenantBackup,
  exportTenantBackup,
  parseExportInput,
  verifyTenantBackup,
} from '../tenant-backup';
import type { BackupEnvelope } from '../tenant-backup-crypto';
import {
  downloadManagedBackup,
  getManagedBackupStatus,
  parseBackupScheduleMutation,
  restoreManagedBackup,
  updateManagedBackupSchedule,
  verifyManagedBackup,
} from '../tenant-backup-managed';

/**
 * Per-agency operational backup (BAK-01). OWNER only (exact role), never
 * delegable; export and verify need the current password (step-up). The file is
 * returned in the response, encrypted, `no-store`, and never kept by the server.
 * Restore requires a reviewed verification report and a completely empty destination.
 */
export function registerBackupRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
): void {
  const { database, protectedHooks } = options;
  const noStore = { onSend: (_request: unknown, reply: { header: (k: string, v: string) => void }, payload: unknown, done: (e: null, p: unknown) => void) => {
    reply.header('cache-control', 'no-store');
    done(null, payload);
  } };

  const guard = async <T>(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof BackupError) return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      throw error;
    }
  };

  app.get('/settings/backup/status', { preHandler: protectedHooks, ...noStore }, () => getManagedBackupStatus(database));

  app.put('/settings/backup/schedule', { preHandler: protectedHooks, ...noStore }, async (request, reply) => {
    requireExactRole(UserRole.OWNER);
    const input = parseBackupScheduleMutation(request.body);
    return guard(reply, () => updateManagedBackupSchedule(database, input));
  });

  for (const action of ['download', 'verify', 'restore'] as const) {
    app.post<{ Params: { runId: string }; Body: unknown }>(`/settings/backup/runs/:runId/${action}`, {
      preHandler: protectedHooks,
      bodyLimit: 16 * 1024,
      ...noStore,
    }, async (request, reply) => {
      requireExactRole(UserRole.OWNER);
      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
        throw new ValidationError('Request body must be an object.');
      }
      const body = request.body as Record<string, unknown>;
      const allowed = action === 'restore' ? ['currentPassword', 'reportHash'] : ['currentPassword'];
      if (Object.keys(body).some(key => !allowed.includes(key))) throw new ValidationError('Request contains an unsupported field.');
      if (typeof body.currentPassword !== 'string' || !body.currentPassword || body.currentPassword.length > 200) {
        throw new ValidationError('Field "currentPassword" is required.');
      }
      if (action === 'download') {
        const result = await downloadManagedBackup(database, request.params.runId, body.currentPassword);
        return reply
          .header('content-type', 'application/vnd.travel-platform.backup+json')
          .header('content-disposition', `attachment; filename="${result.filename}"`)
          .header('x-content-type-options', 'nosniff')
          .send(result.bytes);
      }
      if (action === 'verify') return verifyManagedBackup(database, request.params.runId, body.currentPassword);
      if (typeof body.reportHash !== 'string') throw new ValidationError('A verification report is required.');
      return restoreManagedBackup(database, request.params.runId, body.currentPassword, body.reportHash);
    });
  }

  app.post('/settings/backup/export', { preHandler: protectedHooks, ...noStore }, async (request, reply) => {
    requireExactRole(UserRole.OWNER);
    const input = parseExportInput(request.body);
    return guard(reply, () => exportTenantBackup(database, input));
  });

  for (const action of ['verify', 'restore'] as const) app.post(`/settings/backup/${action}`, { preHandler: protectedHooks, bodyLimit: MAX_BACKUP_BYTES * 2, ...noStore }, async (request, reply) => {
    requireExactRole(UserRole.OWNER);
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => ![
      'envelope', 'archivePassword', 'currentPassword', ...(action === 'restore' ? ['reportHash'] : []),
    ].includes(key))) {
      throw new ValidationError('Unknown field in request body');
    }
    if (!record.envelope || typeof record.envelope !== 'object') throw new ValidationError('Field "envelope" is required');
    if (typeof record.archivePassword !== 'string' || typeof record.currentPassword !== 'string') {
      throw new ValidationError('Passwords are required');
    }
    const { archivePassword, currentPassword } = record;
    if (archivePassword.length < 12 || archivePassword.length > 200 || !currentPassword || currentPassword.length > 200) throw new ValidationError('Passwords are invalid');
    if (action === 'restore') {
      if (typeof record.reportHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.reportHash)) throw new ValidationError('A verification report is required');
      return guard(reply, () => restoreTenantBackup(database, record.envelope as BackupEnvelope, archivePassword, currentPassword, record.reportHash as string));
    }
    return guard(reply, () =>
      verifyTenantBackup(database, record.envelope as BackupEnvelope, archivePassword, currentPassword),
    );
  });
}
