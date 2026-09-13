// Partner Portal (Agent 04): PartnerLink + PartnerAttribution.
//
// Security posture (security/NON_NEGOTIABLES.md "Tokens publicos"),
// mirrors services/api/src/enrollment.ts exactly:
//   * high-entropy token: crypto.randomBytes(32), never Math.random().
//   * only the sha256 hash of the token is ever persisted -- the raw
//     token is returned to the caller exactly once, at creation time.
//   * expiry (optional) + revocation both fail closed.
//   * the public resolve/convert path never lets the caller choose or
//     leak which tenant/partner a token belongs to: it resolves ONLY via
//     the hash, and invalid/expired/revoked/unknown tokens all produce
//     the exact same generic rejection.
//
// PartnerAttribution is server-side only (security/NON_NEGOTIABLES.md
// "Partner: sempre self-scoped"): convertPartnerLink() below NEVER
// accepts a partnerId from the caller -- the partnerId always comes from
// the server-side resolved PartnerLink row, inside the same transaction.
import { createHash, randomBytes } from 'node:crypto';
import { getAgencyId, getUserId, requireRole, runWithTenantContext } from '../../../packages/domain/tenant-context';
import type { TenantContext } from '../../../packages/domain/types';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { createCustomer } from './customers';
import { createWish } from './wishes';

// Synthetic, non-secret tenant context for the public partner-link
// conversion surface, mirroring publicEnrollmentContext() in
// enrollment.ts: a prospect converting through a partner link is not a
// staff user and never gets a real userId/role.
function publicPartnerLinkContext(agencyId: string, linkId: string): TenantContext {
  return {
    agencyId,
    userId: `partner-link:${linkId}`,
    userRole: UserRole.VIEWER,
    email: '',
  };
}

// ============================================================
// Token helpers
// ============================================================
export function generatePartnerLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashPartnerLinkToken(token) };
}

export function hashPartnerLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ============================================================
// Types
// ============================================================
export type PartnerLinkStatus = 'ACTIVE' | 'REVOKED';

export interface PartnerLink {
  id: string;
  agencyId: string;
  partnerId: string;
  status: PartnerLinkStatus;
  label?: string;
  targetPath?: string;
  expiresAt?: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PartnerLinkRow {
  id: string;
  agency_id: string;
  partner_id: string;
  status: PartnerLinkStatus;
  label: string | null;
  target_path: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

const LINK_COLUMNS = `id, agency_id, partner_id, status, label, target_path, expires_at,
  revoked_at, last_used_at, created_by_user_id, created_at, updated_at`;

function toPartnerLink(row: PartnerLinkRow): PartnerLink {
  return {
    id: row.id,
    agencyId: row.agency_id,
    partnerId: row.partner_id,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.label !== null ? { label: row.label } : {}),
    ...(row.target_path !== null ? { targetPath: row.target_path } : {}),
    ...(row.expires_at !== null ? { expiresAt: new Date(row.expires_at) } : {}),
    ...(row.revoked_at !== null ? { revokedAt: new Date(row.revoked_at) } : {}),
    ...(row.last_used_at !== null ? { lastUsedAt: new Date(row.last_used_at) } : {}),
  };
}

// ============================================================
// Staff: create / list / revoke
// ============================================================
export interface CreatePartnerLinkInput {
  partnerId: string;
  label?: string;
  targetPath?: string;
  ttlDays?: number;
}

export async function createPartnerLink(
  database: DatabaseRuntime,
  input: CreatePartnerLinkInput,
): Promise<{ link: PartnerLink; token: string }> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();
  const createdByUserId = getUserId();

  if (input.ttlDays !== undefined && (!Number.isInteger(input.ttlDays) || input.ttlDays < 1)) {
    throw new ValidationError('ttlDays must be a positive integer when provided');
  }

  const { token, tokenHash } = generatePartnerLinkToken();

  const link = await database.withTenantTransaction(async (client) => {
    const partnerResult = await client.query<{ id: string }>(
      `SELECT id FROM commercial_partners WHERE agency_id = $1 AND id = $2 AND status = 'ACTIVE'`,
      [agencyId, input.partnerId],
    );
    if (!partnerResult.rows[0]) {
      throw new NotFoundError('Active partner not found');
    }

    const result = await client.query<PartnerLinkRow>(
      `INSERT INTO partner_links
         (agency_id, partner_id, token_hash, label, target_path, created_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               CASE WHEN $7::int IS NULL THEN NULL ELSE now() + ($7 || ' days')::interval END)
       RETURNING ${LINK_COLUMNS}`,
      [
        agencyId,
        input.partnerId,
        tokenHash,
        input.label ?? null,
        input.targetPath ?? null,
        createdByUserId,
        input.ttlDays ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Partner link insert did not return a row');
    }
    const created = toPartnerLink(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.PARTNER_LINK_CREATED,
      entityType: 'partner_link',
      entityId: created.id,
    });
    return created;
  });

  return { link, token };
}

export async function listPartnerLinks(
  database: DatabaseRuntime,
  partnerId?: string,
): Promise<PartnerLink[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];
  if (partnerId) {
    values.push(partnerId);
    conditions.push(`partner_id = $${values.length}`);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PartnerLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM partner_links WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(toPartnerLink);
  });
}

export async function revokePartnerLink(
  database: DatabaseRuntime,
  id: string,
): Promise<PartnerLink | null> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PartnerLinkRow>(
      `UPDATE partner_links
       SET status = 'REVOKED', revoked_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING ${LINK_COLUMNS}`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const revoked = toPartnerLink(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.PARTNER_LINK_REVOKED,
      entityType: 'partner_link',
      entityId: revoked.id,
    });
    return revoked;
  });
}

// ============================================================
// Public: resolve token (no staff auth -- token-only)
// ============================================================
export interface PublicPartnerLinkInfo {
  agencyId: string;
  linkId: string;
  partnerId: string;
}

// Resolves ONLY by the token hash -- the caller never supplies or picks a
// tenant/partner id. Returns null for missing/unknown/expired/revoked
// tokens alike, so a caller cannot distinguish "wrong token" from
// "expired" from "revoked" from "this partner/tenant doesn't exist".
export async function resolvePublicPartnerLink(
  database: DatabaseRuntime,
  rawToken: string,
): Promise<PublicPartnerLinkInfo | null> {
  if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return null;
  }

  const tokenHash = hashPartnerLinkToken(rawToken);

  return database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.partner_link_lookup_hash', $1, true)`, [tokenHash]);

    const result = await client.query<PartnerLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM partner_links WHERE token_hash = $1`,
      [tokenHash],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    if (row.status !== 'ACTIVE') {
      return null;
    }
    if (row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }

    return { agencyId: row.agency_id, linkId: row.id, partnerId: row.partner_id };
  });
}

// ============================================================
// Public: convert (creates Customer + optional Wish + PartnerAttribution)
// ============================================================
export interface ConvertPartnerLinkInput {
  fullName: string;
  email?: string;
  phone?: string;
  cpf?: string;
  wishDestination?: string;
  wishNotes?: string;
}

export interface ConvertPartnerLinkResult {
  attributionId: string;
  customerId: string;
  wishId?: string;
}

// Fails closed: caller MUST have already resolved the token via
// resolvePublicPartnerLink() and pass its linkInfo -- this function
// re-validates the link is still active/unexpired inside the same
// transaction (defense against a TOCTOU window between resolve and
// convert), relying on the DB-level partner_links_select/update_public_lookup
// policies as a second, independent enforcement layer. The partnerId
// attributed here comes ONLY from linkInfo.partnerId (server-resolved from
// the token) -- never from the request body.
export async function convertPartnerLink(
  database: DatabaseRuntime,
  linkInfo: PublicPartnerLinkInfo,
  rawToken: string,
  input: ConvertPartnerLinkInput,
): Promise<ConvertPartnerLinkResult> {
  if (!input.fullName || input.fullName.trim().length === 0) {
    throw new ValidationError('Nome completo é obrigatório');
  }

  const tokenHash = hashPartnerLinkToken(rawToken);

  // Step 1: re-validate the link is still active/unexpired, under the
  // public lookup context, and bump last_used_at.
  await database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.partner_link_lookup_hash', $1, true)`, [tokenHash]);

    const linkResult = await client.query<PartnerLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM partner_links
       WHERE id = $1 AND agency_id = $2 AND partner_id = $3 AND token_hash = $4
         AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())`,
      [linkInfo.linkId, linkInfo.agencyId, linkInfo.partnerId, tokenHash],
    );
    if (!linkResult.rows[0]) {
      // Same generic failure shape as an unknown token -- no distinguishing
      // "it expired between resolve and convert" detail leaked.
      throw new NotFoundError('Link inválido');
    }

    await client.query(
      `UPDATE partner_links SET last_used_at = now(), updated_at = now() WHERE id = $1`,
      [linkInfo.linkId],
    );
  });

  // Step 2: reuse the EXISTING createCustomer/createWish path (never a
  // parallel/shadow table), running under the ordinary tenant context now
  // that the token has authoritatively resolved to this agency.
  const context = publicPartnerLinkContext(linkInfo.agencyId, linkInfo.linkId);

  const { customerId, wishId } = await runWithTenantContext(context, async () => {
    const customer = await createCustomer(database, {
      name: input.fullName.trim(),
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.cpf ? { cpf: input.cpf } : {}),
    });

    let wish: { id: string } | undefined;
    if (input.wishDestination || input.wishNotes) {
      wish = await createWish(database, customer.id, {
        ...(input.wishDestination ? { destination: input.wishDestination } : {}),
        ...(input.wishNotes ? { notes: input.wishNotes } : {}),
      });
    }

    return { customerId: customer.id, wishId: wish?.id };
  });

  // Step 3: record the PartnerAttribution -- server-side only, using
  // linkInfo.partnerId (never a client-supplied value).
  const attribution = await runWithTenantContext(context, () =>
    database.withTenantTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO partner_attributions (agency_id, partner_id, partner_link_id, customer_id, wish_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [linkInfo.agencyId, linkInfo.partnerId, linkInfo.linkId, customerId, wishId ?? null],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Partner attribution insert did not return a row');
      }
      await recordAuditEvent(client, {
        eventType: AuditEventType.PARTNER_ATTRIBUTION_CREATED,
        entityType: 'partner_attribution',
        entityId: row.id,
      });
      return row;
    }),
  );

  return { attributionId: attribution.id, customerId, ...(wishId ? { wishId } : {}) };
}

// ============================================================
// Staff: attach a Sale to an existing attribution (e.g. once the wish
// converts into a sale later in the pipeline). Keeps PartnerAttribution
// as the single source of truth linking Customer/Wish/Sale back to the
// partner, without ever trusting a client-supplied partnerId here either
// -- the attribution row itself is looked up by (agency, customer),
// never created fresh from caller input at this step.
// ============================================================
export async function attachSaleToAttribution(
  database: DatabaseRuntime,
  customerId: string,
  saleId: string,
): Promise<{ attributionId: string; partnerId: string } | null> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const saleResult = await client.query<{ id: string }>(
      `SELECT id FROM sales WHERE agency_id = $1 AND id = $2`,
      [agencyId, saleId],
    );
    if (!saleResult.rows[0]) {
      throw new NotFoundError('Sale not found');
    }

    const result = await client.query<{ id: string; partner_id: string }>(
      `UPDATE partner_attributions
       SET sale_id = $3, updated_at = now()
       WHERE agency_id = $1 AND customer_id = $2 AND sale_id IS NULL
       RETURNING id, partner_id`,
      [agencyId, customerId, saleId],
    );
    const row = result.rows[0];
    return row ? { attributionId: row.id, partnerId: row.partner_id } : null;
  });
}
