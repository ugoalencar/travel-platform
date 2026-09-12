// Partner Portal (Agent 04): CommercialPartner + PartnerContract.
//
// A CommercialPartner is an EXTERNAL affiliate/agent -- explicitly
// separate from `employees` (internal staff, see employees.ts). Never
// extend Employee for this; this is a distinct tenant-scoped table
// (infrastructure/migrations/052_commercial_partners.sql).
import { getAgencyId, getUserId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

// ============================================================
// CommercialPartner
// ============================================================
export type PartnerType = 'PF' | 'PJ';
export type PartnerStatus = 'ACTIVE' | 'INACTIVE';

export interface CommercialPartner {
  id: string;
  agencyId: string;
  partnerType: PartnerType;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  managerUserId?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  bankPixKey?: string;
  status: PartnerStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CommercialPartnerRow {
  id: string;
  agency_id: string;
  partner_type: PartnerType;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  manager_user_id: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  bank_pix_key: string | null;
  status: PartnerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PARTNER_COLUMNS = `id, agency_id, partner_type, name, document, email, phone, manager_user_id,
  bank_name, bank_branch, bank_account, bank_pix_key, status, notes, created_at, updated_at`;

function toCommercialPartner(row: CommercialPartnerRow): CommercialPartner {
  return {
    id: row.id,
    agencyId: row.agency_id,
    partnerType: row.partner_type,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.document !== null ? { document: row.document } : {}),
    ...(row.email !== null ? { email: row.email } : {}),
    ...(row.phone !== null ? { phone: row.phone } : {}),
    ...(row.manager_user_id !== null ? { managerUserId: row.manager_user_id } : {}),
    ...(row.bank_name !== null ? { bankName: row.bank_name } : {}),
    ...(row.bank_branch !== null ? { bankBranch: row.bank_branch } : {}),
    ...(row.bank_account !== null ? { bankAccount: row.bank_account } : {}),
    ...(row.bank_pix_key !== null ? { bankPixKey: row.bank_pix_key } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

export interface CreatePartnerInput {
  partnerType: PartnerType;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  managerUserId?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  bankPixKey?: string;
  notes?: string;
}

export async function createPartner(
  database: DatabaseRuntime,
  input: CreatePartnerInput,
): Promise<CommercialPartner> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('Nome do parceiro é obrigatório');
  }
  if (input.partnerType !== 'PF' && input.partnerType !== 'PJ') {
    throw new ValidationError('partnerType deve ser PF ou PJ');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommercialPartnerRow>(
      `INSERT INTO commercial_partners
         (agency_id, partner_type, name, document, email, phone, manager_user_id,
          bank_name, bank_branch, bank_account, bank_pix_key, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${PARTNER_COLUMNS}`,
      [
        agencyId,
        input.partnerType,
        input.name.trim(),
        input.document ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.managerUserId ?? null,
        input.bankName ?? null,
        input.bankBranch ?? null,
        input.bankAccount ?? null,
        input.bankPixKey ?? null,
        input.notes ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Partner insert did not return a row');
    }
    const partner = toCommercialPartner(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.PARTNER_CREATED,
      entityType: 'commercial_partner',
      entityId: partner.id,
    });
    return partner;
  });
}

export async function listPartners(database: DatabaseRuntime): Promise<CommercialPartner[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommercialPartnerRow>(
      `SELECT ${PARTNER_COLUMNS} FROM commercial_partners WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toCommercialPartner);
  });
}

export async function getPartnerById(
  database: DatabaseRuntime,
  id: string,
): Promise<CommercialPartner | null> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommercialPartnerRow>(
      `SELECT ${PARTNER_COLUMNS} FROM commercial_partners WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toCommercialPartner(row) : null;
  });
}

export interface UpdatePartnerInput {
  name?: string;
  document?: string;
  email?: string;
  phone?: string;
  managerUserId?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  bankPixKey?: string;
  status?: PartnerStatus;
  notes?: string;
}

export async function updatePartner(
  database: DatabaseRuntime,
  id: string,
  input: UpdatePartnerInput,
): Promise<CommercialPartner | null> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommercialPartnerRow>(
      `UPDATE commercial_partners
       SET name = COALESCE($3, name),
           document = COALESCE($4, document),
           email = COALESCE($5, email),
           phone = COALESCE($6, phone),
           manager_user_id = COALESCE($7, manager_user_id),
           bank_name = COALESCE($8, bank_name),
           bank_branch = COALESCE($9, bank_branch),
           bank_account = COALESCE($10, bank_account),
           bank_pix_key = COALESCE($11, bank_pix_key),
           status = COALESCE($12, status),
           notes = COALESCE($13, notes),
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${PARTNER_COLUMNS}`,
      [
        agencyId,
        id,
        input.name ?? null,
        input.document ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.managerUserId ?? null,
        input.bankName ?? null,
        input.bankBranch ?? null,
        input.bankAccount ?? null,
        input.bankPixKey ?? null,
        input.status ?? null,
        input.notes ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const partner = toCommercialPartner(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.PARTNER_UPDATED,
      entityType: 'commercial_partner',
      entityId: partner.id,
    });
    return partner;
  });
}

// ============================================================
// PartnerContract (lightweight for now -- see 052 migration header
// comment: e-signature integration with Agent 03's ContractTemplate/
// SignatureRequest flow is a follow-up once that lands, not built here).
// ============================================================
export type PartnerContractStatus = 'ACTIVE' | 'ENDED' | 'CANCELLED';

export interface PartnerContract {
  id: string;
  agencyId: string;
  partnerId: string;
  commissionPercentage: number;
  terms?: string;
  status: PartnerContractStatus;
  startsAt?: string;
  endsAt?: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PartnerContractRow {
  id: string;
  agency_id: string;
  partner_id: string;
  commission_percentage: string;
  terms: string | null;
  status: PartnerContractStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

const PARTNER_CONTRACT_COLUMNS = `id, agency_id, partner_id, commission_percentage, terms, status,
  starts_at, ends_at, created_by_user_id, created_at, updated_at`;

function toPartnerContract(row: PartnerContractRow): PartnerContract {
  return {
    id: row.id,
    agencyId: row.agency_id,
    partnerId: row.partner_id,
    commissionPercentage: Number(row.commission_percentage),
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.terms !== null ? { terms: row.terms } : {}),
    ...(row.starts_at !== null ? { startsAt: row.starts_at } : {}),
    ...(row.ends_at !== null ? { endsAt: row.ends_at } : {}),
  };
}

export interface CreatePartnerContractInput {
  partnerId: string;
  commissionPercentage: number;
  terms?: string;
  startsAt?: string;
  endsAt?: string;
}

export async function createPartnerContract(
  database: DatabaseRuntime,
  input: CreatePartnerContractInput,
): Promise<PartnerContract> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();
  const createdByUserId = getUserId();

  if (
    typeof input.commissionPercentage !== 'number' ||
    input.commissionPercentage < 0 ||
    input.commissionPercentage > 100
  ) {
    throw new ValidationError('commissionPercentage deve estar entre 0 e 100');
  }

  return database.withTenantTransaction(async (client) => {
    const partnerResult = await client.query<{ id: string }>(
      `SELECT id FROM commercial_partners WHERE agency_id = $1 AND id = $2`,
      [agencyId, input.partnerId],
    );
    if (!partnerResult.rows[0]) {
      throw new NotFoundError('Partner not found');
    }

    const result = await client.query<PartnerContractRow>(
      `INSERT INTO partner_contracts
         (agency_id, partner_id, commission_percentage, terms, starts_at, ends_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PARTNER_CONTRACT_COLUMNS}`,
      [
        agencyId,
        input.partnerId,
        input.commissionPercentage,
        input.terms ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        createdByUserId,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Partner contract insert did not return a row');
    }
    const contract = toPartnerContract(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.PARTNER_CONTRACT_CREATED,
      entityType: 'partner_contract',
      entityId: contract.id,
    });
    return contract;
  });
}

export async function listPartnerContracts(
  database: DatabaseRuntime,
  partnerId?: string,
): Promise<PartnerContract[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();

  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];
  if (partnerId) {
    values.push(partnerId);
    conditions.push(`partner_id = $${values.length}`);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PartnerContractRow>(
      `SELECT ${PARTNER_CONTRACT_COLUMNS} FROM partner_contracts
       WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(toPartnerContract);
  });
}

/**
 * Returns the currently ACTIVE contract for a partner, if any. Used by
 * partner-commissions.ts to resolve the default commission percentage
 * when generating a commission without a manual override.
 */
export async function getActivePartnerContract(
  database: DatabaseRuntime,
  partnerId: string,
): Promise<PartnerContract | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PartnerContractRow>(
      `SELECT ${PARTNER_CONTRACT_COLUMNS} FROM partner_contracts
       WHERE agency_id = $1 AND partner_id = $2 AND status = 'ACTIVE'
       ORDER BY created_at DESC LIMIT 1`,
      [agencyId, partnerId],
    );
    const row = result.rows[0];
    return row ? toPartnerContract(row) : null;
  });
}
