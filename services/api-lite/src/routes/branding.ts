import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requirePermission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import {
  DEFAULT_BRANDING,
  parseBrandingUpdate,
  parseSlug,
  rowToBranding,
  type Branding,
  type BrandingRow,
  type BrandingUpdate,
} from '../branding';
import type { LiteDatabase, TenantClient } from '../database';
import { getTenantContext } from '../tenant-context';
import { parseObjectBody } from '../validation';

/**
 * Tenant branding.
 *
 *   GET /branding/public?slug=  — login screen, no session. The tenant is
 *                                 resolved from the slug on the server; the
 *                                 response never carries a tenant id and an
 *                                 unknown/inactive/invalid slug gets the same
 *                                 200 + default theme as a tenant without
 *                                 branding (no extra slug-existence oracle).
 *   GET /branding               — any authenticated user; tenant from session.
 *   PUT /branding               — dashboard.configure (MASTER-only by default).
 *
 * Branding is cosmetic: the public (login) read fails open to the default
 * theme so sign-in never breaks; the authenticated read and the write fail
 * closed.
 */

const SELECT_BRANDING = `SELECT display_name, welcome_text, primary_color, secondary_color,
                                login_background, logo_mime, logo_data
                           FROM tenant_branding
                          WHERE tenant_id = $1`;

async function loadBranding(client: TenantClient, tenantId: string): Promise<Branding> {
  const result = await client.query<BrandingRow>(SELECT_BRANDING, [tenantId]);
  return rowToBranding(result.rows[0]);
}

function changedFields(update: BrandingUpdate, before: Branding): string {
  const changed: string[] = [];
  if (update.displayName !== before.displayName) changed.push('displayName');
  if (update.welcomeText !== before.welcomeText) changed.push('welcomeText');
  if (update.primaryColor !== before.primaryColor) changed.push('primaryColor');
  if (update.secondaryColor !== before.secondaryColor) changed.push('secondaryColor');
  if (update.loginBackground !== before.loginBackground) changed.push('loginBackground');
  if (update.logo.kind !== 'keep') changed.push('logo');
  return changed.join(',');
}

export function registerBrandingRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/branding/public', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const slug = parseSlug((request.query as Record<string, unknown> | undefined)?.['slug']);
    if (!slug) return { branding: DEFAULT_BRANDING };

    try {
      const tenantResult = await database.pool.query<{ id: string; status: string }>(
        'SELECT id, status FROM tenants WHERE slug = $1',
        [slug],
      );
      const tenant = tenantResult.rows[0];
      if (!tenant || tenant.status !== 'ACTIVE') return { branding: DEFAULT_BRANDING };
      const branding = await database.runAsTenant(tenant.id, null, (client) => loadBranding(client, tenant.id));
      return { branding };
    } catch (error) {
      request.log.warn({ err: error }, 'public branding unavailable, serving default theme');
      return { branding: DEFAULT_BRANDING };
    }
  });

  // Fails closed on purpose: the settings editor starts from this response, so
  // a read error must not look like "no branding" (saving would wipe it). The
  // shell treats a failure here as "keep the default theme".
  app.get('/branding', { preHandler: protectedHooks }, async () => {
    const { tenantId } = getTenantContext();
    return { branding: await database.withTenantTransaction((client) => loadBranding(client, tenantId)) };
  });

  app.put('/branding', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'dashboard.configure');
    const update = parseBrandingUpdate(parseObjectBody(request.body));

    const branding = await database.withTenantTransaction(async (client) => {
      const before = await loadBranding(client, context.tenantId);
      // The logo is written only when it changes; the CASE keeps the stored
      // bytes for `keep`, clears them for `remove` and replaces them for `set`.
      const logoMode = update.logo.kind;
      const logoMime = update.logo.kind === 'set' ? update.logo.mime : null;
      const logoData = update.logo.kind === 'set' ? update.logo.data : null;
      await client.query(
        `INSERT INTO tenant_branding
           (tenant_id, display_name, welcome_text, primary_color, secondary_color,
            login_background, logo_mime, logo_data, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6,
                 CASE WHEN $10 = 'set' THEN $7 ELSE NULL END,
                 CASE WHEN $10 = 'set' THEN $8::bytea ELSE NULL END,
                 $9, now())
         ON CONFLICT (tenant_id) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               welcome_text = EXCLUDED.welcome_text,
               primary_color = EXCLUDED.primary_color,
               secondary_color = EXCLUDED.secondary_color,
               login_background = EXCLUDED.login_background,
               logo_mime = CASE $10 WHEN 'keep' THEN tenant_branding.logo_mime ELSE EXCLUDED.logo_mime END,
               logo_data = CASE $10 WHEN 'keep' THEN tenant_branding.logo_data ELSE EXCLUDED.logo_data END,
               updated_by = EXCLUDED.updated_by,
               updated_at = now()`,
        [
          context.tenantId,
          update.displayName,
          update.welcomeText,
          update.primaryColor,
          update.secondaryColor,
          update.loginBackground,
          logoMime,
          logoData,
          context.userId,
          logoMode,
        ],
      );
      const after = await loadBranding(client, context.tenantId);
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.BRANDING_UPDATED,
        entityType: 'branding',
        metadata: { fields: changedFields(update, before) },
      });
      return after;
    });

    return { branding };
  });
}
