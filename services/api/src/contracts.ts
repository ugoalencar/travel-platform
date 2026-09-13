// Contracts / E-signature (Agent 03).
//
// Security posture (mirrors services/api/src/enrollment.ts and
// services/api/src/invitations.ts -- see security/NON_NEGOTIABLES.md
// "Tokens publicos"):
//   * high-entropy token: crypto.randomBytes(32), never Math.random().
//   * only the sha256 hash of the token is ever persisted -- the raw
//     token is returned to the caller exactly once, at creation time.
//   * expiry + revocation + terminal-state both fail closed.
//   * the public resolve path never lets the caller distinguish an
//     unknown token from an expired/revoked/already-signed one -- every
//     failure mode collapses to the same generic null/rejection.
//
// State machine (contract_documents.status): DRAFT -> READY -> SENT ->
// VIEWED -> PARTIALLY_SIGNED -> SIGNED, with DECLINED/CANCELLED/EXPIRED
// as terminal side-exits. Enforced centrally by assertTransitionAllowed()
// below rather than scattered ad-hoc checks, so every mutation of
// `status` goes through one auditable chokepoint.
import { createHash, randomBytes } from 'node:crypto';
import {
  getAgencyId,
  getUserId,
  requireRole,
  runWithTenantContext,
} from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

// ============================================================
// State machine
// ============================================================
export type ContractDocumentStatus =
  | 'DRAFT'
  | 'READY'
  | 'SENT'
  | 'VIEWED'
  | 'PARTIALLY_SIGNED'
  | 'SIGNED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED';

export type ContractSignatoryStatus = 'PENDING' | 'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED';

const TERMINAL_DOCUMENT_STATUSES: ReadonlySet<ContractDocumentStatus> = new Set([
  'SIGNED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
]);

// Explicit adjacency list -- the single source of truth for which
// document-status transitions are legal. Anything not listed here is
// illegal and rejected with a ConflictError.
const DOCUMENT_TRANSITIONS: Record<ContractDocumentStatus, ContractDocumentStatus[]> = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['SENT', 'DRAFT', 'CANCELLED'],
  SENT: ['VIEWED', 'PARTIALLY_SIGNED', 'SIGNED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  VIEWED: ['PARTIALLY_SIGNED', 'SIGNED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  PARTIALLY_SIGNED: ['SIGNED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  SIGNED: [],
  DECLINED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function assertTransitionAllowed(
  from: ContractDocumentStatus,
  to: ContractDocumentStatus,
): void {
  if (from === to) {
    throw new ConflictError(`Documento já está no status ${to}`);
  }
  if (TERMINAL_DOCUMENT_STATUSES.has(from)) {
    throw new ConflictError(`Documento em estado terminal (${from}) não pode mudar de status`);
  }
  const allowed = DOCUMENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictError(`Transição de status inválida: ${from} -> ${to}`);
  }
}

// ============================================================
// SignatureProvider abstraction
//
// Kept intentionally minimal: a real paid e-signature vendor integration
// is explicitly out of scope for this slice (AGENT_03 mission point 5 --
// "Não escolher provider pago sem humano"). LocalSignatureProvider below
// is the only implementation, using the same randomBytes(32)/sha256
// pattern as every other public-token flow in this codebase. Swapping in
// a real vendor later means adding a new class here, not touching call
// sites.
// ============================================================
export interface GeneratedSignatureLink {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SignatureProvider {
  generateLink(ttlDays: number): GeneratedSignatureLink;
}

export class LocalSignatureProvider implements SignatureProvider {
  generateLink(ttlDays: number): GeneratedSignatureLink {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashSignatureToken(token);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    return { token, tokenHash, expiresAt };
  }
}

export function hashSignatureToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const defaultSignatureProvider: SignatureProvider = new LocalSignatureProvider();

export const DEFAULT_SIGNATURE_LINK_TTL_DAYS = 14;

// ============================================================
// Templates
// ============================================================
export interface ContractTemplate {
  id: string;
  agencyId: string;
  name: string;
  version: number;
  bodyMarkdown: string;
  variables: string[];
  isActive: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TemplateRow {
  id: string;
  agency_id: string;
  name: string;
  version: number;
  body_markdown: string;
  variables: string[];
  is_active: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_COLUMNS = `id, agency_id, name, version, body_markdown, variables,
  is_active, created_by_user_id, created_at, updated_at`;

function toTemplate(row: TemplateRow): ContractTemplate {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    version: row.version,
    bodyMarkdown: row.body_markdown,
    variables: row.variables,
    isActive: row.is_active,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface CreateContractTemplateInput {
  name: string;
  bodyMarkdown: string;
  variables?: string[];
}

export async function createContractTemplate(
  database: DatabaseRuntime,
  input: CreateContractTemplateInput,
): Promise<ContractTemplate> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();
  const userId = getUserId();

  const name = input.name?.trim();
  if (!name) {
    throw new ValidationError('Nome do template é obrigatório');
  }
  const bodyMarkdown = input.bodyMarkdown?.trim();
  if (!bodyMarkdown) {
    throw new ValidationError('Corpo do template é obrigatório');
  }
  const variables = normalizeVariables(input.variables);

  return database.withTenantTransaction(async (client) => {
    // Versioning: the next version number for this (agency, name) pair.
    const existing = await client.query<{ max_version: number | null }>(
      `SELECT MAX(version) AS max_version FROM contract_templates WHERE agency_id = $1 AND name = $2`,
      [agencyId, name],
    );
    const nextVersion = (existing.rows[0]?.max_version ?? 0) + 1;

    const result = await client.query<TemplateRow>(
      `INSERT INTO contract_templates (agency_id, name, version, body_markdown, variables, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${TEMPLATE_COLUMNS}`,
      [agencyId, name, nextVersion, bodyMarkdown, JSON.stringify(variables), userId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Template insert did not return a row');
    }
    const created = toTemplate(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CONTRACT_TEMPLATE_CREATED,
      entityType: 'contract_template',
      entityId: created.id,
      metadata: { name: created.name, version: created.version },
    });
    return created;
  });
}

export async function listContractTemplates(database: DatabaseRuntime): Promise<ContractTemplate[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TemplateRow>(
      `SELECT ${TEMPLATE_COLUMNS} FROM contract_templates
       WHERE agency_id = $1
       ORDER BY name ASC, version DESC`,
      [agencyId],
    );
    return result.rows.map(toTemplate);
  });
}

export async function getContractTemplateById(
  database: DatabaseRuntime,
  id: string,
): Promise<ContractTemplate | null> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TemplateRow>(
      `SELECT ${TEMPLATE_COLUMNS} FROM contract_templates WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toTemplate(row) : null;
  });
}

export interface UpdateContractTemplateInput {
  isActive?: boolean;
}

// Body/variables are immutable once created -- a "change" is a new
// version via createContractTemplate(). update() only allows toggling
// is_active (retiring an old version), matching the append-only intent
// of the versioning scheme.
export async function updateContractTemplate(
  database: DatabaseRuntime,
  id: string,
  input: UpdateContractTemplateInput,
): Promise<ContractTemplate | null> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();

  if (input.isActive === undefined) {
    throw new ValidationError('Nada para atualizar');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TemplateRow>(
      `UPDATE contract_templates SET is_active = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${TEMPLATE_COLUMNS}`,
      [agencyId, id, input.isActive],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const updated = toTemplate(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CONTRACT_TEMPLATE_UPDATED,
      entityType: 'contract_template',
      entityId: updated.id,
      metadata: { isActive: updated.isActive },
    });
    return updated;
  });
}

function normalizeVariables(input: string[] | undefined): string[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input) || !input.every((v) => typeof v === 'string')) {
    throw new ValidationError('variables deve ser um array de strings');
  }
  return input;
}

// ============================================================
// Documents
// ============================================================
export interface ContractDocument {
  id: string;
  agencyId: string;
  templateId: string;
  status: ContractDocumentStatus;
  saleId: string | null;
  customerId: string | null;
  tripId: string | null;
  partnerId: string | null;
  renderedBody: string;
  variableValues: Record<string, string>;
  createdByUserId: string;
  sentAt: Date | null;
  firstViewedAt: Date | null;
  signedAt: Date | null;
  declinedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DocumentRow {
  id: string;
  agency_id: string;
  template_id: string;
  status: ContractDocumentStatus;
  sale_id: string | null;
  customer_id: string | null;
  trip_id: string | null;
  partner_id: string | null;
  rendered_body: string;
  variable_values: Record<string, string>;
  created_by_user_id: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const DOCUMENT_COLUMNS = `id, agency_id, template_id, status, sale_id, customer_id, trip_id,
  partner_id, rendered_body, variable_values, created_by_user_id, sent_at, first_viewed_at,
  signed_at, declined_at, cancelled_at, expires_at, created_at, updated_at`;

function toDocument(row: DocumentRow): ContractDocument {
  return {
    id: row.id,
    agencyId: row.agency_id,
    templateId: row.template_id,
    status: row.status,
    saleId: row.sale_id,
    customerId: row.customer_id,
    tripId: row.trip_id,
    partnerId: row.partner_id,
    renderedBody: row.rendered_body,
    variableValues: row.variable_values,
    createdByUserId: row.created_by_user_id,
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    firstViewedAt: row.first_viewed_at ? new Date(row.first_viewed_at) : null,
    signedAt: row.signed_at ? new Date(row.signed_at) : null,
    declinedAt: row.declined_at ? new Date(row.declined_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface CreateContractDocumentInput {
  templateId: string;
  saleId?: string;
  customerId?: string;
  tripId?: string;
  partnerId?: string;
  variableValues?: Record<string, string>;
}

function renderTemplate(bodyMarkdown: string, variableValues: Record<string, string>): string {
  return bodyMarkdown.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = variableValues[key];
    return value !== undefined ? value : `{{${key}}}`;
  });
}

export async function createContractDocument(
  database: DatabaseRuntime,
  input: CreateContractDocumentInput,
): Promise<ContractDocument> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();
  const userId = getUserId();

  if (!input.templateId) {
    throw new ValidationError('templateId é obrigatório');
  }
  const variableValues = input.variableValues ?? {};

  return database.withTenantTransaction(async (client) => {
    const templateResult = await client.query<TemplateRow>(
      `SELECT ${TEMPLATE_COLUMNS} FROM contract_templates WHERE agency_id = $1 AND id = $2`,
      [agencyId, input.templateId],
    );
    const templateRow = templateResult.rows[0];
    if (!templateRow) {
      throw new NotFoundError('Template não encontrado');
    }
    const template = toTemplate(templateRow);
    if (!template.isActive) {
      throw new ValidationError('Template inativo não pode gerar documentos');
    }

    const renderedBody = renderTemplate(template.bodyMarkdown, variableValues);

    const result = await client.query<DocumentRow>(
      `INSERT INTO contract_documents
         (agency_id, template_id, sale_id, customer_id, trip_id, partner_id,
          rendered_body, variable_values, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${DOCUMENT_COLUMNS}`,
      [
        agencyId,
        input.templateId,
        input.saleId ?? null,
        input.customerId ?? null,
        input.tripId ?? null,
        input.partnerId ?? null,
        renderedBody,
        JSON.stringify(variableValues),
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Document insert did not return a row');
    }
    const created = toDocument(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.CONTRACT_DOCUMENT_CREATED,
      entityType: 'contract_document',
      entityId: created.id,
      metadata: { templateId: created.templateId },
    });
    return created;
  });
}

export async function listContractDocuments(database: DatabaseRuntime): Promise<ContractDocument[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS} FROM contract_documents WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toDocument);
  });
}

export async function getContractDocumentById(
  database: DatabaseRuntime,
  id: string,
): Promise<ContractDocument | null> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS} FROM contract_documents WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toDocument(row) : null;
  });
}

async function fetchDocumentForUpdate(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<DocumentRow> {
  const result = await client.query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS} FROM contract_documents WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError('Documento não encontrado');
  }
  return row;
}

async function setDocumentStatus(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
  to: ContractDocumentStatus,
  extraSetClause: string,
  extraParams: unknown[],
): Promise<ContractDocument> {
  const current = await fetchDocumentForUpdate(client, agencyId, id);
  assertTransitionAllowed(current.status, to);

  const result = await client.query<DocumentRow>(
    `UPDATE contract_documents SET status = $3, updated_at = now()${extraSetClause}
     WHERE agency_id = $1 AND id = $2
     RETURNING ${DOCUMENT_COLUMNS}`,
    [agencyId, id, to, ...extraParams],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Document update did not return a row');
  }
  const updated = toDocument(row);
  await recordAuditEvent(client, {
    eventType: AuditEventType.CONTRACT_DOCUMENT_STATUS_CHANGED,
    entityType: 'contract_document',
    entityId: updated.id,
    metadata: { fromStatus: current.status, toStatus: to },
  });
  return updated;
}

// Moves DRAFT -> READY. Requires at least one party already attached.
export async function markContractDocumentReady(
  database: DatabaseRuntime,
  id: string,
): Promise<ContractDocument> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const partiesResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM contract_parties WHERE agency_id = $1 AND contract_document_id = $2`,
      [agencyId, id],
    );
    if ((partiesResult.rows[0]?.count ?? '0') === '0') {
      throw new ValidationError('Documento precisa de ao menos um signatário para ficar pronto');
    }

    const updated = await setDocumentStatus(client, agencyId, id, 'READY', '', []);
    return updated;
  });
}

export interface SentSignatureLink {
  partyId: string;
  token: string;
  expiresAt: Date;
}

// READY -> SENT: generates one signature link per party and marks the
// document + every party SENT.
export async function sendContractDocument(
  database: DatabaseRuntime,
  id: string,
  options?: { ttlDays?: number; signatureProvider?: SignatureProvider },
): Promise<{ document: ContractDocument; links: SentSignatureLink[] }> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();
  const provider = options?.signatureProvider ?? defaultSignatureProvider;
  const ttlDays = options?.ttlDays ?? DEFAULT_SIGNATURE_LINK_TTL_DAYS;

  return database.withTenantTransaction(async (client) => {
    const updated = await setDocumentStatus(client, agencyId, id, 'SENT', `, sent_at = now()`, []);

    const partiesResult = await client.query<{ id: string }>(
      `SELECT id FROM contract_parties WHERE agency_id = $1 AND contract_document_id = $2`,
      [agencyId, id],
    );
    if (partiesResult.rows.length === 0) {
      throw new ValidationError('Documento não possui signatários');
    }

    const links: SentSignatureLink[] = [];
    for (const party of partiesResult.rows) {
      const generated = provider.generateLink(ttlDays);
      await client.query(
        `INSERT INTO contract_signature_links (agency_id, contract_party_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [agencyId, party.id, generated.tokenHash, generated.expiresAt],
      );
      await client.query(
        `UPDATE contract_parties SET status = 'SENT', sent_at = now(), updated_at = now()
         WHERE agency_id = $1 AND id = $2`,
        [agencyId, party.id],
      );
      await recordAuditEvent(client, {
        eventType: AuditEventType.CONTRACT_SIGNATURE_LINK_CREATED,
        entityType: 'contract_party',
        entityId: party.id,
      });
      links.push({ partyId: party.id, token: generated.token, expiresAt: generated.expiresAt });
    }

    return { document: updated, links };
  });
}

export async function cancelContractDocument(
  database: DatabaseRuntime,
  id: string,
): Promise<ContractDocument> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const updated = await setDocumentStatus(
      client,
      agencyId,
      id,
      'CANCELLED',
      `, cancelled_at = now()`,
      [],
    );
    await recordAuditEvent(client, {
      eventType: AuditEventType.CONTRACT_DOCUMENT_CANCELLED,
      entityType: 'contract_document',
      entityId: updated.id,
    });
    return updated;
  });
}

// ============================================================
// Parties (signatories) -- may only be added/removed while DRAFT.
// ============================================================
export interface ContractParty {
  id: string;
  agencyId: string;
  contractDocumentId: string;
  fullName: string;
  email: string;
  role: string;
  status: ContractSignatoryStatus;
  sentAt: Date | null;
  viewedAt: Date | null;
  signedAt: Date | null;
  declinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PartyRow {
  id: string;
  agency_id: string;
  contract_document_id: string;
  full_name: string;
  email: string;
  role: string;
  status: ContractSignatoryStatus;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  created_at: string;
  updated_at: string;
}

const PARTY_COLUMNS = `id, agency_id, contract_document_id, full_name, email, role, status,
  sent_at, viewed_at, signed_at, declined_at, created_at, updated_at`;

function toParty(row: PartyRow): ContractParty {
  return {
    id: row.id,
    agencyId: row.agency_id,
    contractDocumentId: row.contract_document_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    viewedAt: row.viewed_at ? new Date(row.viewed_at) : null,
    signedAt: row.signed_at ? new Date(row.signed_at) : null,
    declinedAt: row.declined_at ? new Date(row.declined_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AddContractPartyInput {
  fullName: string;
  email: string;
  role: string;
}

export async function addContractParty(
  database: DatabaseRuntime,
  documentId: string,
  input: AddContractPartyInput,
): Promise<ContractParty> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  const fullName = input.fullName?.trim();
  if (!fullName) {
    throw new ValidationError('Nome do signatário é obrigatório');
  }
  const email = input.email?.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new ValidationError('E-mail do signatário inválido');
  }
  const role = input.role?.trim();
  if (!role) {
    throw new ValidationError('Papel do signatário é obrigatório');
  }

  return database.withTenantTransaction(async (client) => {
    const docResult = await client.query<{ status: ContractDocumentStatus }>(
      `SELECT status FROM contract_documents WHERE agency_id = $1 AND id = $2`,
      [agencyId, documentId],
    );
    const docRow = docResult.rows[0];
    if (!docRow) {
      throw new NotFoundError('Documento não encontrado');
    }
    if (docRow.status !== 'DRAFT') {
      throw new ConflictError('Signatários só podem ser adicionados enquanto o documento está em rascunho');
    }

    const result = await client.query<PartyRow>(
      `INSERT INTO contract_parties (agency_id, contract_document_id, full_name, email, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${PARTY_COLUMNS}`,
      [agencyId, documentId, fullName, email, role],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Party insert did not return a row');
    }
    return toParty(row);
  });
}

export async function listContractParties(
  database: DatabaseRuntime,
  documentId: string,
): Promise<ContractParty[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PartyRow>(
      `SELECT ${PARTY_COLUMNS} FROM contract_parties
       WHERE agency_id = $1 AND contract_document_id = $2
       ORDER BY created_at ASC`,
      [agencyId, documentId],
    );
    return result.rows.map(toParty);
  });
}

export async function removeContractParty(
  database: DatabaseRuntime,
  documentId: string,
  partyId: string,
): Promise<boolean> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const docResult = await client.query<{ status: ContractDocumentStatus }>(
      `SELECT status FROM contract_documents WHERE agency_id = $1 AND id = $2`,
      [agencyId, documentId],
    );
    const docRow = docResult.rows[0];
    if (!docRow) {
      throw new NotFoundError('Documento não encontrado');
    }
    if (docRow.status !== 'DRAFT') {
      throw new ConflictError('Signatários só podem ser removidos enquanto o documento está em rascunho');
    }

    const result = await client.query(
      `DELETE FROM contract_parties WHERE agency_id = $1 AND id = $2 AND contract_document_id = $3`,
      [agencyId, partyId, documentId],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function revokeContractSignatureLink(
  database: DatabaseRuntime,
  partyId: string,
): Promise<boolean> {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `UPDATE contract_signature_links SET revoked_at = now()
       WHERE agency_id = $1 AND contract_party_id = $2 AND revoked_at IS NULL`,
      [agencyId, partyId],
    );
    const revoked = (result.rowCount ?? 0) > 0;
    if (revoked) {
      await recordAuditEvent(client, {
        eventType: AuditEventType.CONTRACT_SIGNATURE_LINK_REVOKED,
        entityType: 'contract_party',
        entityId: partyId,
      });
    }
    return revoked;
  });
}

// ============================================================
// Public signing flow -- token-only, no staff auth. Mirrors
// resolvePublicInvitationToken/acceptInvitation exactly: resolve ONLY by
// hash under withPlatformTransaction + set_config('app.contract_lookup_hash', ...),
// generic null/rejection for every invalid path, never leaking which
// tenant (or whether any tenant) a token belongs to.
// ============================================================
export interface PublicSignatureInfo {
  agencyId: string;
  partyId: string;
  documentId: string;
  fullName: string;
  email: string;
  role: string;
}

export async function resolvePublicSignatureToken(
  database: DatabaseRuntime,
  rawToken: string,
): Promise<PublicSignatureInfo | null> {
  if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return null;
  }
  const tokenHash = hashSignatureToken(rawToken);

  return database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.contract_lookup_hash', $1, true)`, [tokenHash]);

    const linkResult = await client.query<{
      agency_id: string;
      contract_party_id: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `SELECT agency_id, contract_party_id, expires_at, revoked_at
       FROM contract_signature_links WHERE token_hash = $1`,
      [tokenHash],
    );
    const link = linkResult.rows[0];
    if (!link) {
      return null;
    }
    if (link.revoked_at !== null) {
      return null;
    }
    if (new Date(link.expires_at).getTime() <= Date.now()) {
      return null;
    }

    const partyResult = await client.query<PartyRow>(
      `SELECT ${PARTY_COLUMNS} FROM contract_parties
       WHERE agency_id = $1 AND id = $2`,
      [link.agency_id, link.contract_party_id],
    );
    const partyRow = partyResult.rows[0];
    if (!partyRow) {
      return null;
    }
    // Already-terminal party states (SIGNED/DECLINED) reject just like an
    // expired/revoked token -- same generic failure, no detail leaked.
    if (partyRow.status === 'SIGNED' || partyRow.status === 'DECLINED') {
      return null;
    }

    return {
      agencyId: partyRow.agency_id,
      partyId: partyRow.id,
      documentId: partyRow.contract_document_id,
      fullName: partyRow.full_name,
      email: partyRow.email,
      role: partyRow.role,
    };
  });
}

// Records the party's (and, on first view, the document's) transition to
// VIEWED. Best-effort / idempotent: called on every public GET.
export async function recordPublicSignatureView(
  database: DatabaseRuntime,
  info: PublicSignatureInfo,
  rawToken: string,
): Promise<void> {
  const tokenHash = hashSignatureToken(rawToken);

  await database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.contract_lookup_hash', $1, true)`, [tokenHash]);

    const linkResult = await client.query<{ revoked_at: string | null; expires_at: string }>(
      `SELECT revoked_at, expires_at FROM contract_signature_links
       WHERE agency_id = $1 AND contract_party_id = $2 AND token_hash = $3`,
      [info.agencyId, info.partyId, tokenHash],
    );
    const link = linkResult.rows[0];
    if (!link || link.revoked_at !== null || new Date(link.expires_at).getTime() <= Date.now()) {
      return;
    }

    await client.query('SELECT set_tenant_context($1, $2)', [
      info.agencyId,
      `contract-party:${info.partyId}`,
    ]);

    const partyUpdate = await client.query(
      `UPDATE contract_parties SET status = 'VIEWED', viewed_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND status IN ('PENDING', 'SENT')`,
      [info.agencyId, info.partyId],
    );

    const docResult = await client.query<{ status: ContractDocumentStatus }>(
      `SELECT status FROM contract_documents WHERE agency_id = $1 AND id = $2`,
      [info.agencyId, info.documentId],
    );
    const docStatus = docResult.rows[0]?.status;
    if (docStatus === 'SENT') {
      await client.query(
        `UPDATE contract_documents SET status = 'VIEWED', first_viewed_at = now(), updated_at = now()
         WHERE agency_id = $1 AND id = $2`,
        [info.agencyId, info.documentId],
      );
    }

    // Only fire the audit event on the actual first-view transition, not
    // on every subsequent GET of an already-VIEWED party (idempotent).
    if ((partyUpdate.rowCount ?? 0) > 0) {
      await recordPublicContractAuditEvent(
        client,
        info,
        AuditEventType.CONTRACT_SIGNATORY_VIEWED,
      );
    }
  });
}

export interface SubmitSignatureInput {
  typedFullName: string;
  intentConfirmed: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export async function submitSignature(
  database: DatabaseRuntime,
  info: PublicSignatureInfo,
  rawToken: string,
  input: SubmitSignatureInput,
): Promise<{ documentStatus: ContractDocumentStatus }> {
  const typedFullName = input.typedFullName?.trim();
  if (!typedFullName) {
    throw new ValidationError('Nome digitado é obrigatório');
  }
  if (input.intentConfirmed !== true) {
    throw new ValidationError('Confirmação de intenção é obrigatória');
  }

  const tokenHash = hashSignatureToken(rawToken);

  return database.withPlatformTransaction(async (client) => {
    await client.query(`SELECT set_config('app.contract_lookup_hash', $1, true)`, [tokenHash]);

    // Re-validate the token/party under the transaction (defence in depth
    // against a resolve->submit TOCTOU gap), same pattern as
    // acceptInvitation's re-check.
    const linkResult = await client.query<{ revoked_at: string | null; expires_at: string }>(
      `SELECT revoked_at, expires_at FROM contract_signature_links
       WHERE agency_id = $1 AND contract_party_id = $2 AND token_hash = $3`,
      [info.agencyId, info.partyId, tokenHash],
    );
    const link = linkResult.rows[0];
    if (!link || link.revoked_at !== null || new Date(link.expires_at).getTime() <= Date.now()) {
      throw new NotFoundError('Link de assinatura inválido ou expirado');
    }

    const partyResult = await client.query<PartyRow>(
      `SELECT ${PARTY_COLUMNS} FROM contract_parties WHERE agency_id = $1 AND id = $2`,
      [info.agencyId, info.partyId],
    );
    const partyRow = partyResult.rows[0];
    if (!partyRow || partyRow.status === 'SIGNED' || partyRow.status === 'DECLINED') {
      throw new NotFoundError('Link de assinatura inválido ou expirado');
    }

    await client.query('SELECT set_tenant_context($1, $2)', [
      info.agencyId,
      `contract-party:${info.partyId}`,
    ]);

    await client.query(
      `INSERT INTO contract_signature_evidence
         (agency_id, contract_party_id, typed_full_name, intent_confirmed, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        info.agencyId,
        info.partyId,
        typedFullName,
        input.intentConfirmed,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );

    await client.query(
      `UPDATE contract_parties SET status = 'SIGNED', signed_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2`,
      [info.agencyId, info.partyId],
    );

    const remainingResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM contract_parties
       WHERE agency_id = $1 AND contract_document_id = $2 AND status NOT IN ('SIGNED', 'DECLINED')`,
      [info.agencyId, info.documentId],
    );
    const remaining = Number(remainingResult.rows[0]?.count ?? '0');
    const nextDocStatus: ContractDocumentStatus = remaining === 0 ? 'SIGNED' : 'PARTIALLY_SIGNED';

    const setSignedAt = nextDocStatus === 'SIGNED' ? `, signed_at = now()` : '';
    await client.query(
      `UPDATE contract_documents SET status = $3, updated_at = now()${setSignedAt}
       WHERE agency_id = $1 AND id = $2`,
      [info.agencyId, info.documentId, nextDocStatus],
    );

    // Audit event recorded via a raw insert-equivalent call: recordAuditEvent
    // relies on tenant-context AsyncLocalStorage (getAgencyId/getUserId) which
    // isn't populated on this unauthenticated public path, so we bypass it and
    // insert directly the same way enrollment.ts does not need to (enrollment
    // uses runWithTenantContext). Follow the same approach as invitations.ts:
    // wrap in a synthetic tenant context for the audit call only.
    await recordPublicContractAuditEvent(client, info, AuditEventType.CONTRACT_SIGNATORY_SIGNED);

    return { documentStatus: nextDocStatus };
  });
}

// Synthetic actor id for audit events emitted from the unauthenticated
// signing path -- mirrors invitations.ts's `invitation:${id}` convention.
async function recordPublicContractAuditEvent(
  client: TenantTransactionClient,
  info: PublicSignatureInfo,
  eventType: AuditEventType,
): Promise<void> {
  await runWithTenantContext(
    {
      agencyId: info.agencyId,
      userId: `contract-party:${info.partyId}`,
      userRole: UserRole.VIEWER,
      email: info.email,
    },
    () =>
      recordAuditEvent(client, {
        eventType,
        entityType: 'contract_party',
        entityId: info.partyId,
        metadata: { documentId: info.documentId },
      }),
  );
}
