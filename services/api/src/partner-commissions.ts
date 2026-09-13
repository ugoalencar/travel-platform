// Partner Portal (Agent 04): PartnerCommission, converging into the SAME
// `payables` AP/Cash flow used by employee commissions (commissions.ts)
// and supplier payables -- no parallel AP/AR/Cash is created here
// (architecture/DOMAIN_BLUEPRINT.md "Regra Financeira": "Não criar AP/AR/
// Cash paralelos"). Mirrors services/api/src/commissions.ts structurally.
import { getAgencyId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

export type PartnerCommissionStatus = 'PENDING' | 'APPROVED' | 'PAYABLE' | 'PAID' | 'CANCELLED';

export interface PartnerCommission {
  id: string;
  agencyId: string;
  partnerId: string;
  partnerAttributionId: string;
  saleId: string;
  partnerContractId?: string;
  calculationBase: number;
  rate?: number;
  amount: number;
  isManualOverride: boolean;
  status: PartnerCommissionStatus;
  approvedAt?: Date;
  approvedBy?: string;
  paidAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PartnerCommissionRow {
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
  status: PartnerCommissionStatus;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PARTNER_COMMISSION_COLUMNS = `id, agency_id, partner_id, partner_attribution_id, sale_id,
  partner_contract_id, calculation_base, rate, amount, is_manual_override, status, approved_at,
  approved_by, paid_at, notes, created_at, updated_at`;

function toPartnerCommission(row: PartnerCommissionRow): PartnerCommission {
  return {
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
  };
}

export interface GeneratePartnerCommissionInput {
  saleId: string;
  partnerId: string;
  /** Manual override amount, bypassing the contract percentage. */
  manualAmount?: number;
  notes?: string;
}

/**
 * Computes a partner commission for a Sale that has a PartnerAttribution
 * to this partner, using the ACTIVE PartnerContract's percentage (or a
 * manual override amount). Never re-derives attribution: requires an
 * existing partner_attributions row linking this sale to this partner
 * (created server-side only, see partner-links.ts convertPartnerLink /
 * attachSaleToAttribution).
 */
export async function generatePartnerCommission(
  database: DatabaseRuntime,
  data: GeneratePartnerCommissionInput,
): Promise<PartnerCommission> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const partnerResult = await client.query<{ id: string }>(
      `SELECT id FROM commercial_partners WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.partnerId],
    );
    if (!partnerResult.rows[0]) {
      throw new NotFoundError('Partner not found');
    }

    const saleResult = await client.query<{ id: string; total: string }>(
      `SELECT id, total FROM sales WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.saleId],
    );
    const sale = saleResult.rows[0];
    if (!sale) {
      throw new NotFoundError('Sale not found');
    }

    const attributionResult = await client.query<{ id: string }>(
      `SELECT id FROM partner_attributions
       WHERE agency_id = $1 AND partner_id = $2 AND sale_id = $3`,
      [agencyId, data.partnerId, data.saleId],
    );
    const attribution = attributionResult.rows[0];
    if (!attribution) {
      throw new ValidationError(
        'No PartnerAttribution links this sale to this partner. Attribute the sale first.',
      );
    }

    // Idempotency guard, mirroring commissions.ts: one active (non-
    // cancelled) commission per (partner, sale) -- enforced again at the
    // DB layer via partner_commissions_agency_sale_partner_key.
    const duplicateResult = await client.query<{ id: string }>(
      `SELECT id FROM partner_commissions
       WHERE agency_id = $1 AND sale_id = $2 AND partner_id = $3 AND status <> 'CANCELLED'
       LIMIT 1`,
      [agencyId, data.saleId, data.partnerId],
    );
    if (duplicateResult.rows[0]) {
      throw new ConflictError(
        `A partner commission already exists for this sale and partner (id: ${duplicateResult.rows[0].id}). ` +
          'Cancel it before generating a new one.',
      );
    }

    const calculationBase = Number(sale.total);
    let rate: number | null = null;
    let amount: number;
    let partnerContractId: string | null = null;
    let isManualOverride = false;

    if (data.manualAmount !== undefined) {
      if (typeof data.manualAmount !== 'number' || data.manualAmount < 0) {
        throw new ValidationError('manualAmount must be a non-negative number');
      }
      amount = Math.round(data.manualAmount * 100) / 100;
      isManualOverride = true;
    } else {
      const contractResult = await client.query<{ id: string; commission_percentage: string }>(
        `SELECT id, commission_percentage FROM partner_contracts
         WHERE agency_id = $1 AND partner_id = $2 AND status = 'ACTIVE'
         ORDER BY created_at DESC LIMIT 1`,
        [agencyId, data.partnerId],
      );
      const contract = contractResult.rows[0];
      if (!contract) {
        throw new ValidationError(
          'Partner has no ACTIVE PartnerContract and no manualAmount override was provided.',
        );
      }
      partnerContractId = contract.id;
      rate = Number(contract.commission_percentage);
      amount = Math.round(calculationBase * (rate / 100) * 100) / 100;
    }

    if (amount < 0) {
      throw new ValidationError('Calculated commission amount is negative');
    }

    const result = await client.query<PartnerCommissionRow>(
      `INSERT INTO partner_commissions
         (agency_id, partner_id, partner_attribution_id, sale_id, partner_contract_id,
          calculation_base, rate, amount, is_manual_override, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10)
       RETURNING ${PARTNER_COMMISSION_COLUMNS}`,
      [
        agencyId,
        data.partnerId,
        attribution.id,
        data.saleId,
        partnerContractId,
        calculationBase,
        rate,
        amount,
        isManualOverride,
        data.notes ?? null,
      ],
    );
    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error('Partner commission insert did not return a row');
    }
    const commission = toPartnerCommission(inserted);
    await recordAuditEvent(client, {
      eventType: AuditEventType.PARTNER_COMMISSION_GENERATED,
      entityType: 'partner_commission',
      entityId: commission.id,
    });
    return commission;
  });
}

export async function listPartnerCommissions(
  database: DatabaseRuntime,
  filters: { partnerId?: string; saleId?: string; status?: string } = {},
): Promise<PartnerCommission[]> {
  requireRole(UserRole.VIEWER);
  const agencyId = getAgencyId();
  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.partnerId) {
    values.push(filters.partnerId);
    conditions.push(`partner_id = $${values.length}`);
  }
  if (filters.saleId) {
    values.push(filters.saleId);
    conditions.push(`sale_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PartnerCommissionRow>(
      `SELECT ${PARTNER_COMMISSION_COLUMNS} FROM partner_commissions
       WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(toPartnerCommission);
  });
}

export async function approvePartnerCommission(
  database: DatabaseRuntime,
  id: string,
  approvedBy: string,
): Promise<PartnerCommission | null> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const existingResult = await client.query<PartnerCommissionRow>(
      `SELECT ${PARTNER_COMMISSION_COLUMNS} FROM partner_commissions WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      return null;
    }
    if (existing.status !== 'PENDING') {
      throw new ValidationError(`Partner commission must be PENDING to approve (current: ${existing.status})`);
    }

    const result = await client.query<PartnerCommissionRow>(
      `UPDATE partner_commissions
       SET status = 'APPROVED', approved_at = now(), approved_by = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${PARTNER_COMMISSION_COLUMNS}`,
      [agencyId, id, approvedBy],
    );
    const commission = toPartnerCommission(result.rows[0]!);
    await recordAuditEvent(client, {
      eventType: AuditEventType.PARTNER_COMMISSION_APPROVED,
      entityType: 'partner_commission',
      entityId: commission.id,
    });
    return commission;
  });
}

/**
 * Converts an APPROVED partner commission into a real `payables` row
 * (beneficiary_type = PARTNER), converging Partner commissions into the
 * SAME Accounts Payable / Cash flow as Employee and Supplier payables --
 * mirrors createPayableFromCommissionEntry() in commissions.ts exactly,
 * including deliberately NOT linking sale_id (see that function's comment
 * on getSaleMargin double-counting); traceability back to the sale is
 * preserved via partner_commission_id -> partner_commissions.sale_id.
 */
export async function createPayableFromPartnerCommission(
  database: DatabaseRuntime,
  id: string,
): Promise<{ payableId: string }> {
  requireRole(UserRole.AGENT);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const existingResult = await client.query<PartnerCommissionRow>(
      `SELECT ${PARTNER_COMMISSION_COLUMNS} FROM partner_commissions WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new NotFoundError('Partner commission not found');
    }
    if (existing.status !== 'APPROVED') {
      throw new ValidationError(
        `Partner commission must be APPROVED to create a payable (current: ${existing.status})`,
      );
    }

    const partnerResult = await client.query<{ name: string }>(
      `SELECT name FROM commercial_partners WHERE agency_id = $1 AND id = $2`,
      [agencyId, existing.partner_id],
    );
    const partnerName = partnerResult.rows[0]?.name ?? 'Parceiro';

    const categoryResult = await client.query<{ id: string }>(
      `SELECT id FROM financial_categories
       WHERE agency_id = $1 AND type = 'EXPENSE' AND name = 'COMMISSION' LIMIT 1`,
      [agencyId],
    );
    const categoryId = categoryResult.rows[0]?.id ?? null;

    const payableResult = await client.query<{ id: string }>(
      `INSERT INTO payables
         (agency_id, description, amount, due_at, status, beneficiary_type,
          partner_id, partner_commission_id, category_id)
       VALUES ($1, $2, $3, now(), 'OPEN', 'PARTNER', $4, $5, $6)
       RETURNING id`,
      [
        agencyId,
        `Comissão de parceiro - ${partnerName}`,
        existing.amount,
        existing.partner_id,
        existing.id,
        categoryId,
      ],
    );
    const payableId = payableResult.rows[0]!.id;

    await client.query(
      `UPDATE partner_commissions SET status = 'PAYABLE', updated_at = now() WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );

    await recordAuditEvent(client, {
      eventType: AuditEventType.PARTNER_COMMISSION_PAYABLE_CREATED,
      entityType: 'partner_commission',
      entityId: id,
      metadata: { payableId },
    });

    return { payableId };
  });
}
