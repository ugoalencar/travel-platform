import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requirePermission } from '../access';
import { recordAuditEvent } from '../audit-log';
import type { LiteDatabase } from '../database';
import { ForbiddenError, ValidationError } from '../errors';
import { verifyPassword } from '../password';
import { getTenantContext } from '../tenant-context';
import { captureOperationalSnapshot, encryptOperationalSnapshot } from '../tenant-backup';
import { parseObjectBody, requiredString } from '../validation';
import { LiteLoginAbuseProtector, loginClientIp, sendRateLimited } from '../rate-limit';

function requireBackupAccess() {
  const context = getTenantContext();
  requirePermission(context, 'users.manage');
  if (!context.grantsAll) throw new ForbiddenError('Backup restrito ao administrador principal da agência.');
  return context;
}

export function registerBackupRoutes(app: FastifyInstance, database: LiteDatabase, hooks: preHandlerHookHandler[]) {
  const abuse = new LiteLoginAbuseProtector();
  app.get('/backup/status', { preHandler: hooks }, async (_request, reply) => {
    const { tenantId } = requireBackupAccess();
    reply.header('cache-control', 'no-store');
    const history = await database.withTenantTransaction(async (client) => {
      const rows = await client.query<{ id: string; created_at: string; user_id: string; metadata: { filename: string; rows: number } }>(
        `SELECT id,created_at,user_id,metadata FROM audit_logs WHERE tenant_id=$1 AND event_type='BACKUP_EXPORTED'
         ORDER BY created_at DESC,id DESC LIMIT 20`, [tenantId],
      );
      return rows.rows.map((row) => ({ id: row.id, createdAt: row.created_at, userId: row.user_id,
        filename: row.metadata.filename, rows: row.metadata.rows }));
    });
    return { automatic: { configured: false }, history };
  });
  app.post('/backup/export', { preHandler: hooks }, async (request, reply) => {
    const context = requireBackupAccess();
    reply.header('cache-control', 'no-store');
    const body = parseObjectBody(request.body);
    if (Object.keys(body).some((key) => !['currentPassword', 'archivePassword'].includes(key))) {
      throw new ValidationError('Campos não permitidos no pedido de backup.');
    }
    const currentPassword = requiredString(body, 'currentPassword', { max: 1024, trim: false });
    const archivePassword = requiredString(body, 'archivePassword', { max: 1024, trim: false });
    if (archivePassword.length < 12) throw new ValidationError('A senha do arquivo deve ter pelo menos 12 caracteres.');
    if (archivePassword === currentPassword) throw new ValidationError('Use uma senha de arquivo diferente da senha de acesso.');
    const abuseInput = { accountId: `backup:${context.userId}`, ip: loginClientIp(request) };
    const decision = abuse.check(abuseInput);
    if (decision.state !== 'allow') return sendRateLimited(reply, decision.retryAfterSeconds);
    return database.withTenantTransaction(async (client) => {
      const user = await client.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE tenant_id=$1 AND id=$2', [context.tenantId, context.userId]);
      if (!user.rows[0] || !await verifyPassword(currentPassword, user.rows[0].password_hash)) {
        abuse.recordFailure(abuseInput);
        throw new ForbiddenError('Senha atual inválida.');
      }
      abuse.recordSuccess(abuseInput);
      await client.query("SET LOCAL statement_timeout='15s'");
      const snapshot = await captureOperationalSnapshot(client, context.tenantId);
      const archive = await encryptOperationalSnapshot(snapshot, archivePassword);
      const filename = `travel-lite-${context.tenantId}-${snapshot.createdAt.replace(/[:.]/g, '-')}.tlbackup`;
      const rows = Object.values(snapshot.tables).reduce((total, records) => total + records.length, 0);
      await recordAuditEvent(client, { eventType: 'BACKUP_EXPORTED', entityType: 'tenant_backup', metadata: { filename, rows, tables: Object.keys(snapshot.tables).length } });
      return { filename, archive };
    });
  });
}
