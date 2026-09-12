// Partner-portal data access (Agent 04). Every query here filters by BOTH
// agency_id AND the partner's own id at the SQL level. partnerId is NEVER
// taken from request params/body/query -- it always comes from
// getPartnerId(), which reads the tenant context established by
// establishPartnerTenantContext() (packages/domain/tenant-context.ts),
// which itself independently re-validates (via validatePartnerAgencyAccess)
// that the partner belongs to the resolved agency. Mirrors
// services/api/src/customer-portal.ts. This file intentionally does not
// reuse any staff/admin data-access function, and a partner must NEVER be
// able to see another partner's data within the same tenant (see
// services/api/tests/partners.test.ts "partner self-scope" suite).
import type { Pool } from 'pg';
import { getAgencyId, getPartnerId } from '../../../packages/domain/tenant-context';
import type { ValidatePartnerAgencyAccess } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import type { CommercialPartner, PartnerContract } from './partners';
import type { PartnerCommission } from './partner-commissions';

// ============================================================
// Cross-tenant / cross-partner validator (production + dev use this same
// function -- there is no "trust the dev header" shortcut here).
// ============================================================
export function createPartnerAccessValidator(pool: Pool): ValidatePartnerAgencyAccess {
  return async function validatePartnerAgencyAccess(partnerId, agencyId) {
    const result = await pool.query(
      `SELECT 1 FROM commercial_partners WHERE id = $1 AND agency_id = $2`,
      [partnerId, agencyId],
    );
    return (result.rowCount ?? 0) > 0;
  };
}

// ============================================================
// Own profile
// ============================================================
export async function getMyPartnerProfile(
  database: DatabaseRuntime,
): Promise<Pick<CommercialPartner, 'id' | 'name' | 'partnerType' | 'email' | 'phone' | 'status'> | null> {
  const agencyId = getAgencyId();
  const partnerId = getPartnerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      partner_type: 'PF' | 'PJ';
      email: string | null;
      phone: string | null;
      status: 'ACTIVE' | 'INACTIVE';
    }>(
      `SELECT id, name, partner_type, email, phone, status
       FROM commercial_partners WHERE agency_id = $1 AND id = $2`,
      [agencyId, partnerId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      partnerType: row.partner_type,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      status: row.status,
    } as Pick<CommercialPartner, 'id' | 'name' | 'partnerType' | 'email' | 'phone' | 'status'>;
  });
}

// ============================================================
// Own contract(s)
// ============================================================
export async function getMyPartnerContracts(database: DatabaseRuntime): Promise<PartnerContract[]> {
  const agencyId = getAgencyId();
  const partnerId = getPartnerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      agency_id: string;
      partner_id: string;
      commission_percentage: string;
      terms: string | null;
      status: 'ACTIVE' | 'ENDED' | 'CANCELLED';
      starts_at: string | null;
      ends_at: string | null;
      created_by_user_id: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, agency_id, partner_id, commission_percentage, terms, status, starts_at, ends_at,
              created_by_user_id, created_at, updated_at
       FROM partner_contracts WHERE agency_id = $1 AND partner_id = $2 ORDER BY created_at DESC`,
      [agencyId, partnerId],
    );
    return result.rows.map((row) => ({
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
    }));
  });
}

// ============================================================
// Own attributions (leads/sales attributed to this partner)
// ============================================================
export interface MyPartnerAttribution {
  id: string;
  customerId: string | null;
  wishId: string | null;
  saleId: string | null;
  createdAt: Date;
}

export async function getMyPartnerAttributions(
  database: DatabaseRuntime,
): Promise<MyPartnerAttribution[]> {
  const agencyId = getAgencyId();
  const partnerId = getPartnerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      customer_id: string | null;
      wish_id: string | null;
      sale_id: string | null;
      created_at: string;
    }>(
      `SELECT id, customer_id, wish_id, sale_id, created_at
       FROM partner_attributions WHERE agency_id = $1 AND partner_id = $2 ORDER BY created_at DESC`,
      [agencyId, partnerId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      wishId: row.wish_id,
      saleId: row.sale_id,
      createdAt: new Date(row.created_at),
    }));
  });
}

// ============================================================
// Own commissions
// ============================================================
export async function getMyPartnerCommissions(database: DatabaseRuntime): Promise<PartnerCommission[]> {
  const agencyId = getAgencyId();
  const partnerId = getPartnerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      agency_id: string;
      partner_id: string;
      partner_attribution_id: string;
      sale_id: string;
      partner_contract_id: string | null;
      calculation_base: string;
      rate: string | null;
      amount: string;
      is_manual_override: boolean;
      status: 'PENDING' | 'APPROVED' | 'PAYABLE' | 'PAID' | 'CANCELLED';
      approved_at: string | null;
      approved_by: string | null;
      paid_at: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, agency_id, partner_id, partner_attribution_id, sale_id, partner_contract_id,
              calculation_base, rate, amount, is_manual_override, status, approved_at, approved_by,
              paid_at, notes, created_at, updated_at
       FROM partner_commissions WHERE agency_id = $1 AND partner_id = $2 ORDER BY created_at DESC`,
      [agencyId, partnerId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      agencyId: row.agency_id,
      partnerId: row.partner_id,
      partnerAttributionId: row.partner_attribution_id,
      saleId: row.sale_id,
      calculationBase: Number(row.calculation_base),
      amount: Number(row.amount),
      isManualOverride: row.is_manual_override,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      ...(row.partner_contract_id !== null ? { partnerContractId: row.partner_contract_id } : {}),
      ...(row.rate !== null ? { rate: Number(row.rate) } : {}),
      ...(row.approved_at !== null ? { approvedAt: new Date(row.approved_at) } : {}),
      ...(row.approved_by !== null ? { approvedBy: row.approved_by } : {}),
      ...(row.paid_at !== null ? { paidAt: new Date(row.paid_at) } : {}),
      ...(row.notes !== null ? { notes: row.notes } : {}),
    }));
  });
}

// ============================================================
// Own trackable link(s) -- token itself is never re-exposed after
// creation (see partner-links.ts); the portal only shows link metadata.
// ============================================================
export interface MyPartnerLinkSummary {
  id: string;
  status: 'ACTIVE' | 'REVOKED';
  label: string | null;
  targetPath: string | null;
  createdAt: Date;
}

export async function getMyPartnerLinks(database: DatabaseRuntime): Promise<MyPartnerLinkSummary[]> {
  const agencyId = getAgencyId();
  const partnerId = getPartnerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      status: 'ACTIVE' | 'REVOKED';
      label: string | null;
      target_path: string | null;
      created_at: string;
    }>(
      `SELECT id, status, label, target_path, created_at
       FROM partner_links WHERE agency_id = $1 AND partner_id = $2 ORDER BY created_at DESC`,
      [agencyId, partnerId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      label: row.label,
      targetPath: row.target_path,
      createdAt: new Date(row.created_at),
    }));
  });
}
