import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireAdministrator, requirePermission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase } from '../database';
import { ValidationError } from '../errors';
import { getTenantContext } from '../tenant-context';
import { parseObjectBody, requiredString } from '../validation';

/** COM-03: the tenant financial profile (HOW receipts affect release). Mirrors the Full routes. */
export function registerCommissionReleaseRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/commission-release/config', { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    requirePermission(context, 'settings.manage');
    return database.withTenantTransaction(async (client) => {
      const profiles = await client.query<{ id: string; effect: string; effective_from: string; reason: string | null }>(
        `SELECT id, effect, effective_from::text, reason FROM commission_financial_profiles
          WHERE tenant_id = $1 ORDER BY effective_from DESC, created_at DESC`,
        [context.tenantId],
      );
      const today = await client.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS d`);
      const activeId = profiles.rows.find((p) => p.effective_from <= today.rows[0]!.d)?.id ?? null;
      const undecided = await client.query<{ name: string }>(
        `SELECT name FROM payment_methods WHERE tenant_id = $1 AND active AND NOT receipt_rule_decided ORDER BY name`,
        [context.tenantId],
      );
      const missing: string[] = [];
      if (activeId === null) missing.push('FINANCIAL_PROFILE_NOT_ACTIVE');
      if (undecided.rows.length > 0) missing.push('PAYMENT_METHOD_RECEIPT_RULE_UNSET');
      return {
        profiles: profiles.rows.map((p) => ({ id: p.id, effect: p.effect, effective_from: p.effective_from, reason: p.reason, active: p.id === activeId })),
        undecided_payment_methods: undecided.rows.map((m) => m.name),
        blocked: missing.length > 0,
        missing,
      };
    });
  });

  app.post('/commission-release/financial-profiles', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'settings.manage');
    requireAdministrator(context);
    const body = parseObjectBody(request.body);
    const effect = body.effect;
    if (effect !== 'META_E_LIBERACAO' && effect !== 'SOMENTE_LIBERACAO') {
      throw new ValidationError('Field effect must be META_E_LIBERACAO or SOMENTE_LIBERACAO');
    }
    const effectiveFrom = requiredString(body, 'effective_from', { max: 10 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new ValidationError('Field effective_from must be YYYY-MM-DD');
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null;
    const created = await database.withTenantTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO commission_financial_profiles (tenant_id, effect, effective_from, reason, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [context.tenantId, effect, effectiveFrom, reason, context.userId],
      );
      const id = result.rows[0]!.id;
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.COMMISSION_FINANCIAL_PROFILE_CREATED,
        entityType: 'commission_financial_profile',
        entityId: id,
        metadata: { effect },
      });
      return { id };
    });
    reply.code(201);
    return created;
  });
}
