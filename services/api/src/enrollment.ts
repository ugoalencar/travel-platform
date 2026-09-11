// Client Onboarding (Agent 02): secure remote enrollment link flow.
//
// Security posture (security/NON_NEGOTIABLES.md "Tokens publicos"):
//   * high-entropy token: crypto.randomBytes(32), never Math.random().
//   * only the sha256 hash of the token is ever persisted -- the raw
//     token is returned to the caller exactly once, at creation time.
//   * expiry + revocation both fail closed.
//   * the public resolve/submit path never lets the caller choose or leak
//     which tenant a token belongs to: it resolves ONLY via the hash, and
//     invalid/expired/revoked/unknown tokens all produce the exact same
//     generic rejection (see resolvePublicEnrollmentToken).
import { createHash, randomBytes } from 'node:crypto';
import { getAgencyId, getUserId, requireRole, runWithTenantContext } from '../../../packages/domain/tenant-context';
import type { TenantContext } from '../../../packages/domain/types';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { createCustomer } from './customers';
import { createWish } from './wishes';

export const DEFAULT_ENROLLMENT_LINK_TTL_DAYS = 7;
const MIN_ENROLLMENT_LINK_TTL_DAYS = 1;
const MAX_ENROLLMENT_LINK_TTL_DAYS = 60;

// Synthetic, non-secret tenant context for the public enrollment surface,
// mirroring CUSTOMER_CONTEXT_ROLE in tenant-context.ts: a prospect is not a
// staff user and never gets a real userId/role, only enough shape to
// satisfy assertValidTenantContext / recordAuditEvent's actor plumbing.
function publicEnrollmentContext(agencyId: string, linkId: string): TenantContext {
  return {
    agencyId,
    userId: `enrollment-link:${linkId}`,
    userRole: UserRole.VIEWER,
    email: '',
  };
}

// ============================================================
// Token helpers
// ============================================================
export function generateEnrollmentToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashEnrollmentToken(token) };
}

export function hashEnrollmentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ============================================================
// Types
// ============================================================
export type EnrollmentLinkStatus = 'ACTIVE' | 'REVOKED';
export type EnrollmentSubmissionStatus =
  | 'SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'REJECTED';

export interface EnrollmentLink {
  id: string;
  agencyId: string;
  status: EnrollmentLinkStatus;
  ownerUserId?: string;
  createdByUserId: string;
  label?: string;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface EnrollmentLinkRow {
  id: string;
  agency_id: string;
  status: EnrollmentLinkStatus;
  owner_user_id: string | null;
  created_by_user_id: string;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

const LINK_COLUMNS = `id, agency_id, status, owner_user_id, created_by_user_id, label,
  expires_at, revoked_at, last_used_at, created_at, updated_at`;

function toEnrollmentLink(row: EnrollmentLinkRow): EnrollmentLink {
  return {
    id: row.id,
    agencyId: row.agency_id,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.owner_user_id !== null ? { ownerUserId: row.owner_user_id } : {}),
    ...(row.label !== null ? { label: row.label } : {}),
    ...(row.revoked_at !== null ? { revokedAt: new Date(row.revoked_at) } : {}),
    ...(row.last_used_at !== null ? { lastUsedAt: new Date(row.last_used_at) } : {}),
  };
}

// ============================================================
// Staff: create / list / revoke
// ============================================================
export interface CreateEnrollmentLinkInput {
  ownerUserId?: string;
  label?: string;
  ttlDays?: number;
}

export async function createEnrollmentLink(
  database: DatabaseRuntime,
  input: CreateEnrollmentLinkInput,
): Promise<{ link: EnrollmentLink; token: string }> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();
  const createdByUserId = getUserId();

  const ttlDays = normalizeTtlDays(input.ttlDays);
  const { token, tokenHash } = generateEnrollmentToken();

  const link = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EnrollmentLinkRow>(
      `INSERT INTO enrollment_links
         (agency_id, token_hash, owner_user_id, created_by_user_id, label, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)
       RETURNING ${LINK_COLUMNS}`,
      [agencyId, tokenHash, input.ownerUserId ?? null, createdByUserId, input.label ?? null, ttlDays],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Enrollment link insert did not return a row');
    }
    const created = toEnrollmentLink(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.ENROLLMENT_LINK_CREATED,
      entityType: 'enrollment_link',
      entityId: created.id,
    });
    return created;
  });

  return { link, token };
}

export async function listEnrollmentLinks(database: DatabaseRuntime): Promise<EnrollmentLink[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EnrollmentLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM enrollment_links WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toEnrollmentLink);
  });
}

export async function revokeEnrollmentLink(
  database: DatabaseRuntime,
  id: string,
): Promise<EnrollmentLink | null> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EnrollmentLinkRow>(
      `UPDATE enrollment_links
       SET status = 'REVOKED', revoked_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING ${LINK_COLUMNS}`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const revoked = toEnrollmentLink(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.ENROLLMENT_LINK_REVOKED,
      entityType: 'enrollment_link',
      entityId: revoked.id,
    });
    return revoked;
  });
}

// ============================================================
// Public: resolve token / submit (no staff auth -- token-only)
// ============================================================
export interface PublicEnrollmentLinkInfo {
  agencyId: string;
  linkId: string;
}

// Resolves ONLY by the token hash -- the browser never supplies or picks
// a tenant/agency id. Returns null for missing/unknown/expired/revoked
// tokens alike (see enrollment routes: every one of those cases must map
// to the identical generic HTTP response so a caller cannot distinguish
// "wrong token" from "expired" from "revoked" from "this tenant doesn't
// exist").
export async function resolvePublicEnrollmentToken(
  database: DatabaseRuntime,
  rawToken: string,
): Promise<PublicEnrollmentLinkInfo | null> {
  if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return null;
  }

  const tokenHash = hashEnrollmentToken(rawToken);

  return database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.enrollment_lookup_hash', $1, true)`, [tokenHash]);

    const result = await client.query<EnrollmentLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM enrollment_links WHERE token_hash = $1`,
      [tokenHash],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    if (row.status !== 'ACTIVE') {
      return null;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }

    return { agencyId: row.agency_id, linkId: row.id };
  });
}

export interface SubmitEnrollmentInput {
  fullName: string;
  email?: string;
  phone?: string;
  cpf?: string;
  birthDate?: string;
  dependents?: Array<{ name: string; birthDate?: string; relationship?: string }>;
  wishDestination?: string;
  wishNotes?: string;
  consentGiven: boolean;
  consentTextVersion?: string;
  consentIp?: string;
}

export interface EnrollmentSubmission {
  id: string;
  agencyId: string;
  enrollmentLinkId: string;
  status: EnrollmentSubmissionStatus;
  fullName: string;
  email?: string;
  phone?: string;
  cpf?: string;
  submittedAt: Date;
}

interface EnrollmentSubmissionRow {
  id: string;
  agency_id: string;
  enrollment_link_id: string;
  status: EnrollmentSubmissionStatus;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  submitted_at: string;
}

const SUBMISSION_SUMMARY_COLUMNS = `id, agency_id, enrollment_link_id, status, full_name, email,
  phone, cpf, submitted_at`;

function toSubmissionSummary(row: EnrollmentSubmissionRow): EnrollmentSubmission {
  return {
    id: row.id,
    agencyId: row.agency_id,
    enrollmentLinkId: row.enrollment_link_id,
    status: row.status,
    fullName: row.full_name,
    submittedAt: new Date(row.submitted_at),
    ...(row.email !== null ? { email: row.email } : {}),
    ...(row.phone !== null ? { phone: row.phone } : {}),
    ...(row.cpf !== null ? { cpf: row.cpf } : {}),
  };
}

// Fails closed: caller MUST have already resolved the token via
// resolvePublicEnrollmentToken() and pass its linkInfo -- this function
// re-validates the link is still active/unexpired inside the same
// transaction (defense against a TOCTOU window between resolve and
// submit) and relies on the DB-level enrollment_submissions_insert_public
// policy as a second, independent enforcement layer.
export async function submitEnrollment(
  database: DatabaseRuntime,
  linkInfo: PublicEnrollmentLinkInfo,
  rawToken: string,
  input: SubmitEnrollmentInput,
): Promise<EnrollmentSubmission> {
  if (!input.fullName || input.fullName.trim().length === 0) {
    throw new ValidationError('Nome completo e obrigatorio');
  }
  if (!input.consentGiven) {
    throw new ValidationError('E necessario aceitar o consentimento (LGPD) para continuar');
  }

  const tokenHash = hashEnrollmentToken(rawToken);

  return database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.enrollment_lookup_hash', $1, true)`, [tokenHash]);

    const linkResult = await client.query<EnrollmentLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM enrollment_links
       WHERE id = $1 AND agency_id = $2 AND token_hash = $3
         AND status = 'ACTIVE' AND expires_at > now()`,
      [linkInfo.linkId, linkInfo.agencyId, tokenHash],
    );
    const linkRow = linkResult.rows[0];
    if (!linkRow) {
      // Same generic failure shape as an unknown token -- no distinguishing
      // "it expired between resolve and submit" detail leaked.
      throw new NotFoundError('Link invalido');
    }

    // The token is now authoritatively resolved to exactly this agency --
    // set the ordinary DB tenant context so the rest of this transaction
    // (the insert below, the audit-log write) runs under the SAME RLS
    // policies as every staff-authenticated request, rather than relying
    // solely on the narrow public-lookup policies.
    await client.query('SELECT set_tenant_context($1, $2)', [
      linkInfo.agencyId,
      `enrollment-link:${linkInfo.linkId}`,
    ]);

    const result = await client.query<EnrollmentSubmissionRow>(
      `INSERT INTO enrollment_submissions
         (agency_id, enrollment_link_id, full_name, email, phone, cpf, birth_date, dependents,
          wish_destination, wish_notes, consent_given, consent_text_version, consent_given_at,
          consent_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12,
               CASE WHEN $11 THEN now() ELSE NULL END, $13)
       RETURNING ${SUBMISSION_SUMMARY_COLUMNS}`,
      [
        linkInfo.agencyId,
        linkInfo.linkId,
        input.fullName.trim(),
        input.email ?? null,
        input.phone ?? null,
        input.cpf ?? null,
        input.birthDate ?? null,
        JSON.stringify(input.dependents ?? []),
        input.wishDestination ?? null,
        input.wishNotes ?? null,
        input.consentGiven,
        input.consentTextVersion ?? null,
        input.consentIp ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Enrollment submission insert did not return a row');
    }

    await client.query(
      `UPDATE enrollment_links SET last_used_at = now(), updated_at = now() WHERE id = $1`,
      [linkInfo.linkId],
    );

    const submission = toSubmissionSummary(row);

    await runWithTenantContext(publicEnrollmentContext(linkInfo.agencyId, linkInfo.linkId), () =>
      recordAuditEvent(client, {
        eventType: AuditEventType.ENROLLMENT_SUBMISSION_CREATED,
        entityType: 'enrollment_submission',
        entityId: submission.id,
      }),
    );

    return submission;
  });
}

// ============================================================
// Staff: list / review submissions
// ============================================================
export async function listEnrollmentSubmissions(
  database: DatabaseRuntime,
): Promise<EnrollmentSubmission[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EnrollmentSubmissionRow>(
      `SELECT ${SUBMISSION_SUMMARY_COLUMNS} FROM enrollment_submissions
       WHERE agency_id = $1 ORDER BY submitted_at DESC`,
      [agencyId],
    );
    return result.rows.map(toSubmissionSummary);
  });
}

export async function getEnrollmentSubmissionById(
  database: DatabaseRuntime,
  id: string,
): Promise<EnrollmentSubmission | null> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EnrollmentSubmissionRow>(
      `SELECT ${SUBMISSION_SUMMARY_COLUMNS} FROM enrollment_submissions
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toSubmissionSummary(row) : null;
  });
}

export interface RequestChangesInput {
  notes: string;
}

export async function requestEnrollmentChanges(
  database: DatabaseRuntime,
  id: string,
  input: RequestChangesInput,
): Promise<EnrollmentSubmission | null> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();
  const reviewerId = getUserId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EnrollmentSubmissionRow>(
      `UPDATE enrollment_submissions
       SET status = 'CHANGES_REQUESTED', reviewed_by_user_id = $3, reviewed_at = now(),
           review_notes = $4, updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND status = 'SUBMITTED'
       RETURNING ${SUBMISSION_SUMMARY_COLUMNS}`,
      [agencyId, id, reviewerId, input.notes],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const submission = toSubmissionSummary(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.ENROLLMENT_SUBMISSION_CHANGES_REQUESTED,
      entityType: 'enrollment_submission',
      entityId: submission.id,
    });
    return submission;
  });
}

export interface ApproveEnrollmentResult {
  submission: EnrollmentSubmission;
  customerId: string;
  wishId?: string;
}

// Converts an approved submission into a real Customer 360 record via the
// EXISTING createCustomer() path (never a parallel/shadow table), deduped
// by CPF/email against existing customers in this tenant -- reusing the
// same unique-violation -> ConflictError mapping createCustomer already
// has, plus an explicit pre-check so the caller gets a clear conflict
// reason rather than a generic 500 from a raw constraint violation.
export async function approveEnrollmentSubmission(
  database: DatabaseRuntime,
  id: string,
  reviewNotes?: string,
): Promise<ApproveEnrollmentResult> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  // Step 1: load the submission and dedupe-check against existing
  // customers in this tenant (CPF/email/phone), inside its own read
  // transaction.
  const submissionRow = await database.withTenantTransaction(async (client) => {
    const submissionResult = await client.query<
      EnrollmentSubmissionRow & { wish_destination: string | null; wish_notes: string | null; birth_date: string | null }
    >(
      `SELECT ${SUBMISSION_SUMMARY_COLUMNS}, wish_destination, wish_notes, birth_date
       FROM enrollment_submissions
       WHERE agency_id = $1 AND id = $2 AND status IN ('SUBMITTED', 'CHANGES_REQUESTED')`,
      [agencyId, id],
    );
    const row = submissionResult.rows[0];
    if (!row) {
      throw new NotFoundError('Enrollment submission not found or already reviewed');
    }

    for (const [column, value] of [
      ['cpf', row.cpf],
      ['email', row.email],
      ['phone', row.phone],
    ] as const) {
      if (!value) {
        continue;
      }
      const dupe = await client.query(
        `SELECT 1 FROM customers WHERE agency_id = $1 AND ${column} = $2 AND deleted_at IS NULL`,
        [agencyId, value],
      );
      if ((dupe.rowCount ?? 0) > 0) {
        throw new ConflictError(`A customer with this ${column} already exists`);
      }
    }

    return row;
  });

  // Step 2: reuse the EXISTING createCustomer path (never a parallel/shadow
  // table) to actually create the Customer 360 record, and createWish for
  // the optional initial wish the prospect expressed.
  const customer = await createCustomer(database, {
    name: submissionRow.full_name,
    ...(submissionRow.email ? { email: submissionRow.email } : {}),
    ...(submissionRow.phone ? { phone: submissionRow.phone } : {}),
    ...(submissionRow.cpf ? { cpf: submissionRow.cpf } : {}),
    ...(submissionRow.birth_date ? { birthDate: submissionRow.birth_date } : {}),
  });

  let wishId: string | undefined;
  if (submissionRow.wish_destination || submissionRow.wish_notes) {
    const wish = await createWish(database, customer.id, {
      ...(submissionRow.wish_destination ? { destination: submissionRow.wish_destination } : {}),
      ...(submissionRow.wish_notes ? { notes: submissionRow.wish_notes } : {}),
    });
    wishId = wish.id;
  }

  // Step 3: record the approval + link against the newly created customer.
  const reviewerId = getUserId();
  const submission = await database.withTenantTransaction(async (client) => {
    const updateResult = await client.query<EnrollmentSubmissionRow>(
      `UPDATE enrollment_submissions
       SET status = 'APPROVED', reviewed_by_user_id = $3, reviewed_at = now(),
           review_notes = $4, customer_id = $5, wish_id = $6, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${SUBMISSION_SUMMARY_COLUMNS}`,
      [agencyId, id, reviewerId, reviewNotes ?? null, customer.id, wishId ?? null],
    );
    const updatedRow = updateResult.rows[0];
    if (!updatedRow) {
      throw new Error('Enrollment submission update did not return a row');
    }
    const updated = toSubmissionSummary(updatedRow);

    await recordAuditEvent(client, {
      eventType: AuditEventType.ENROLLMENT_SUBMISSION_APPROVED,
      entityType: 'enrollment_submission',
      entityId: updated.id,
      metadata: { fieldsChanged: ['status', 'customerId'] },
    });

    return updated;
  });

  return { submission, customerId: customer.id, ...(wishId ? { wishId } : {}) };
}

function normalizeTtlDays(ttlDays: number | undefined): number {
  if (ttlDays === undefined) {
    return DEFAULT_ENROLLMENT_LINK_TTL_DAYS;
  }
  if (!Number.isInteger(ttlDays) || ttlDays < MIN_ENROLLMENT_LINK_TTL_DAYS || ttlDays > MAX_ENROLLMENT_LINK_TTL_DAYS) {
    throw new ValidationError(
      `ttlDays must be an integer between ${MIN_ENROLLMENT_LINK_TTL_DAYS} and ${MAX_ENROLLMENT_LINK_TTL_DAYS}`,
    );
  }
  return ttlDays;
}
