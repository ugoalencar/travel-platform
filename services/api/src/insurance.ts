/**
 * Insurance (Seguro) -- catalog of insurer plans (InsuranceProduct), sold
 * policies (InsurancePolicy), covered travelers (InsuranceTraveler), and
 * policy documents (InsuranceDocument).
 *
 * Spec: docs/travel_platform_mega_pack/architecture/PRODUCTS_UPSELL_INSURANCE.md
 * "Seguro converge em SaleItem + Finance."
 *
 * No SaleItem table exists in this worktree (Agent 08/Upsell owns it
 * concurrently and cannot be depended on). InsurancePolicy therefore carries
 * its own cost/sale/commission values directly and exposes a nullable,
 * unconstrained `saleItemId` for a future integration migration to backfill
 * and constrain once SaleItem lands -- this should be reconciled with
 * SaleItem at integration time, not duplicated permanently.
 *
 * Financial convergence: selling a policy creates a real Receivable through
 * financial.ts's existing `createReceivable`, linked to the policy's sale
 * (never a parallel AR table).
 */

import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ValidationError, ConflictError } from './errors';
import { createReceivable } from './financial';

export type InsurancePolicyStatus = 'QUOTED' | 'ISSUED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

// ============================================================
// InsuranceProduct
// ============================================================

const PRODUCT_COLUMNS = `id, agency_id, insurer_name, supplier_id, broker_name, plan_name,
  coverage_description, cost_amount, price_amount, currency, active,
  created_at, updated_at, deleted_at`;

interface InsuranceProductRow {
  id: string;
  agency_id: string;
  insurer_name: string;
  supplier_id: string | null;
  broker_name: string | null;
  plan_name: string;
  coverage_description: string | null;
  cost_amount: string;
  price_amount: string;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InsuranceProduct {
  id: string;
  agencyId: string;
  insurerName: string;
  supplierId: string | null;
  brokerName: string | null;
  planName: string;
  coverageDescription: string | null;
  costAmount: number;
  priceAmount: number;
  currency: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateInsuranceProductInput {
  insurerName: string;
  planName: string;
  supplierId?: string;
  brokerName?: string;
  coverageDescription?: string;
  costAmount: number;
  priceAmount: number;
  currency?: string;
}

function toInsuranceProduct(row: InsuranceProductRow): InsuranceProduct {
  return {
    id: row.id,
    agencyId: row.agency_id,
    insurerName: row.insurer_name,
    supplierId: row.supplier_id,
    brokerName: row.broker_name,
    planName: row.plan_name,
    coverageDescription: row.coverage_description,
    costAmount: Number(row.cost_amount),
    priceAmount: Number(row.price_amount),
    currency: row.currency,
    active: row.active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function requireNonNegativeMoney(value: unknown, field: string): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new ValidationError(`Field "${field}" must be a non-negative number`);
  }
}

export async function listInsuranceProducts(database: DatabaseRuntime): Promise<InsuranceProduct[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<InsuranceProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM insurance_products
       WHERE agency_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toInsuranceProduct);
  });
}

export async function getInsuranceProductById(
  database: DatabaseRuntime,
  id: string,
): Promise<InsuranceProduct | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<InsuranceProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM insurance_products
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toInsuranceProduct(row) : null;
  });
}

export async function createInsuranceProduct(
  database: DatabaseRuntime,
  data: CreateInsuranceProductInput,
): Promise<InsuranceProduct> {
  const agencyId = getAgencyId();

  requireNonBlank(data.insurerName, 'insurerName');
  requireNonBlank(data.planName, 'planName');
  requireNonNegativeMoney(data.costAmount, 'costAmount');
  requireNonNegativeMoney(data.priceAmount, 'priceAmount');

  return database.withTenantTransaction(async (client) => {
    if (data.supplierId !== undefined) {
      await assertTenantRef(client, agencyId, 'suppliers', data.supplierId, 'Supplier not found');
    }

    const result = await client.query<InsuranceProductRow>(
      `INSERT INTO insurance_products
         (agency_id, insurer_name, supplier_id, broker_name, plan_name,
          coverage_description, cost_amount, price_amount, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${PRODUCT_COLUMNS}`,
      [
        agencyId,
        data.insurerName.trim(),
        data.supplierId ?? null,
        data.brokerName ?? null,
        data.planName.trim(),
        data.coverageDescription ?? null,
        data.costAmount,
        data.priceAmount,
        data.currency ?? 'BRL',
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Insurance product insert did not return a row');
    return toInsuranceProduct(row);
  });
}

// ============================================================
// InsurancePolicy
// ============================================================

const POLICY_COLUMNS = `id, agency_id, insurance_product_id, customer_id, sale_id, sale_item_id,
  policy_number, coverage_start, coverage_end, cost_amount, sale_amount, commission_amount,
  currency, status, emergency_contact_name, emergency_contact_phone, receivable_id, notes,
  created_at, updated_at, deleted_at`;

interface InsurancePolicyRow {
  id: string;
  agency_id: string;
  insurance_product_id: string;
  customer_id: string;
  sale_id: string | null;
  sale_item_id: string | null;
  policy_number: string | null;
  coverage_start: string;
  coverage_end: string;
  cost_amount: string;
  sale_amount: string;
  commission_amount: string;
  currency: string;
  status: InsurancePolicyStatus;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  receivable_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InsurancePolicy {
  id: string;
  agencyId: string;
  insuranceProductId: string;
  customerId: string;
  saleId: string | null;
  saleItemId: string | null;
  policyNumber: string | null;
  coverageStart: Date;
  coverageEnd: Date;
  costAmount: number;
  saleAmount: number;
  commissionAmount: number;
  currency: string;
  status: InsurancePolicyStatus;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  receivableId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateInsurancePolicyInput {
  insuranceProductId: string;
  customerId: string;
  saleId?: string;
  coverageStart: string;
  coverageEnd: string;
  costAmount: number;
  saleAmount: number;
  commissionAmount?: number;
  currency?: string;
  policyNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  /** Create the linked Receivable immediately (requires saleId). Defaults to true when saleId is set. */
  createReceivable?: boolean;
}

const POLICY_STATUSES: InsurancePolicyStatus[] = ['QUOTED', 'ISSUED', 'ACTIVE', 'EXPIRED', 'CANCELLED'];

function toInsurancePolicy(row: InsurancePolicyRow): InsurancePolicy {
  return {
    id: row.id,
    agencyId: row.agency_id,
    insuranceProductId: row.insurance_product_id,
    customerId: row.customer_id,
    saleId: row.sale_id,
    saleItemId: row.sale_item_id,
    policyNumber: row.policy_number,
    coverageStart: new Date(row.coverage_start),
    coverageEnd: new Date(row.coverage_end),
    costAmount: Number(row.cost_amount),
    saleAmount: Number(row.sale_amount),
    commissionAmount: Number(row.commission_amount),
    currency: row.currency,
    status: row.status,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    receivableId: row.receivable_id,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

async function assertTenantRef(
  client: TenantTransactionClient,
  agencyId: string,
  table: string,
  id: string,
  message: string,
): Promise<void> {
  const result = await client.query(`SELECT 1 FROM ${table} WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    id,
  ]);
  if (result.rows.length === 0) {
    throw new ValidationError(message);
  }
}

export async function listInsurancePolicies(database: DatabaseRuntime): Promise<InsurancePolicy[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<InsurancePolicyRow>(
      `SELECT ${POLICY_COLUMNS} FROM insurance_policies
       WHERE agency_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toInsurancePolicy);
  });
}

export async function getInsurancePolicyById(
  database: DatabaseRuntime,
  id: string,
): Promise<InsurancePolicy | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<InsurancePolicyRow>(
      `SELECT ${POLICY_COLUMNS} FROM insurance_policies
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toInsurancePolicy(row) : null;
  });
}

/**
 * Sells an insurance policy. This is the convergence point with Finance:
 * when a saleId is given (and createReceivable is not explicitly false),
 * a real Receivable is created via financial.ts's createReceivable, linked
 * to the sale -- never a parallel AR record.
 */
export async function createInsurancePolicy(
  database: DatabaseRuntime,
  data: CreateInsurancePolicyInput,
): Promise<InsurancePolicy> {
  const agencyId = getAgencyId();

  requireNonBlank(data.insuranceProductId, 'insuranceProductId');
  requireNonBlank(data.customerId, 'customerId');
  requireNonBlank(data.coverageStart, 'coverageStart');
  requireNonBlank(data.coverageEnd, 'coverageEnd');
  requireNonNegativeMoney(data.costAmount, 'costAmount');
  requireNonNegativeMoney(data.saleAmount, 'saleAmount');
  if (data.commissionAmount !== undefined) {
    requireNonNegativeMoney(data.commissionAmount, 'commissionAmount');
  }
  if (new Date(data.coverageEnd) < new Date(data.coverageStart)) {
    throw new ValidationError('coverageEnd must not be before coverageStart');
  }

  const policy = await database.withTenantTransaction(async (client) => {
    await assertTenantRef(
      client,
      agencyId,
      'insurance_products',
      data.insuranceProductId,
      'Insurance product not found',
    );
    await assertTenantRef(client, agencyId, 'customers', data.customerId, 'Customer not found');
    if (data.saleId !== undefined) {
      await assertTenantRef(client, agencyId, 'sales', data.saleId, 'Sale not found');
    }

    const result = await client.query<InsurancePolicyRow>(
      `INSERT INTO insurance_policies
         (agency_id, insurance_product_id, customer_id, sale_id, policy_number,
          coverage_start, coverage_end, cost_amount, sale_amount, commission_amount,
          currency, emergency_contact_name, emergency_contact_phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${POLICY_COLUMNS}`,
      [
        agencyId,
        data.insuranceProductId,
        data.customerId,
        data.saleId ?? null,
        data.policyNumber ?? null,
        data.coverageStart,
        data.coverageEnd,
        data.costAmount,
        data.saleAmount,
        data.commissionAmount ?? 0,
        data.currency ?? 'BRL',
        data.emergencyContactName ?? null,
        data.emergencyContactPhone ?? null,
        data.notes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Insurance policy insert did not return a row');
    return toInsurancePolicy(row);
  });

  const shouldCreateReceivable = data.createReceivable ?? true;
  if (data.saleId && shouldCreateReceivable && data.saleAmount > 0) {
    const receivable = await createReceivable(database, {
      saleId: data.saleId,
      customerId: data.customerId,
      description: `Insurance policy ${policy.policyNumber ?? policy.id}`,
      amount: data.saleAmount,
      dueAt: new Date(),
    });

    return database.withTenantTransaction(async (client) => {
      const result = await client.query<InsurancePolicyRow>(
        `UPDATE insurance_policies
         SET receivable_id = $3, updated_at = now()
         WHERE agency_id = $1 AND id = $2
         RETURNING ${POLICY_COLUMNS}`,
        [agencyId, policy.id, receivable.id],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Insurance policy update did not return a row');
      return toInsurancePolicy(row);
    });
  }

  return policy;
}

export async function updateInsurancePolicyStatus(
  database: DatabaseRuntime,
  id: string,
  status: InsurancePolicyStatus,
): Promise<InsurancePolicy | null> {
  const agencyId = getAgencyId();

  if (!POLICY_STATUSES.includes(status)) {
    throw new ValidationError(`Field "status" must be one of: ${POLICY_STATUSES.join(', ')}`);
  }

  return database.withTenantTransaction(async (client) => {
    const existing = await client.query<{ status: InsurancePolicyStatus }>(
      `SELECT status FROM insurance_policies WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    const current = existing.rows[0];
    if (!current) return null;
    if (current.status === 'CANCELLED' || current.status === 'EXPIRED') {
      throw new ConflictError(`Cannot change status of a ${current.status} policy`);
    }

    const result = await client.query<InsurancePolicyRow>(
      `UPDATE insurance_policies
       SET status = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${POLICY_COLUMNS}`,
      [agencyId, id, status],
    );
    const row = result.rows[0];
    return row ? toInsurancePolicy(row) : null;
  });
}

// ============================================================
// InsuranceTraveler
// ============================================================

export interface InsuranceTraveler {
  id: string;
  agencyId: string;
  insurancePolicyId: string;
  customerId: string | null;
  dependentId: string | null;
  createdAt: Date;
}

interface InsuranceTravelerRow {
  id: string;
  agency_id: string;
  insurance_policy_id: string;
  customer_id: string | null;
  dependent_id: string | null;
  created_at: string;
}

export interface AddInsuranceTravelerInput {
  insurancePolicyId: string;
  customerId?: string;
  dependentId?: string;
}

function toInsuranceTraveler(row: InsuranceTravelerRow): InsuranceTraveler {
  return {
    id: row.id,
    agencyId: row.agency_id,
    insurancePolicyId: row.insurance_policy_id,
    customerId: row.customer_id,
    dependentId: row.dependent_id,
    createdAt: new Date(row.created_at),
  };
}

export async function listInsuranceTravelers(
  database: DatabaseRuntime,
  insurancePolicyId: string,
): Promise<InsuranceTraveler[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<InsuranceTravelerRow>(
      `SELECT id, agency_id, insurance_policy_id, customer_id, dependent_id, created_at
       FROM insurance_travelers
       WHERE agency_id = $1 AND insurance_policy_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [agencyId, insurancePolicyId],
    );
    return result.rows.map(toInsuranceTraveler);
  });
}

export async function addInsuranceTraveler(
  database: DatabaseRuntime,
  data: AddInsuranceTravelerInput,
): Promise<InsuranceTraveler> {
  const agencyId = getAgencyId();

  requireNonBlank(data.insurancePolicyId, 'insurancePolicyId');
  const hasCustomer = data.customerId !== undefined;
  const hasDependent = data.dependentId !== undefined;
  if (hasCustomer === hasDependent) {
    throw new ValidationError('Exactly one of customerId or dependentId must be provided');
  }

  return database.withTenantTransaction(async (client) => {
    await assertTenantRef(
      client,
      agencyId,
      'insurance_policies',
      data.insurancePolicyId,
      'Insurance policy not found',
    );
    if (data.customerId !== undefined) {
      await assertTenantRef(client, agencyId, 'customers', data.customerId, 'Customer not found');
    }
    if (data.dependentId !== undefined) {
      await assertTenantRef(
        client,
        agencyId,
        'customer_dependents',
        data.dependentId,
        'Customer dependent not found',
      );
    }

    const result = await client.query<InsuranceTravelerRow>(
      `INSERT INTO insurance_travelers (agency_id, insurance_policy_id, customer_id, dependent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agency_id, insurance_policy_id, customer_id, dependent_id, created_at`,
      [agencyId, data.insurancePolicyId, data.customerId ?? null, data.dependentId ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Insurance traveler insert did not return a row');
    return toInsuranceTraveler(row);
  });
}

// ============================================================
// InsuranceDocument (metadata-only, mirrors customer-documents.ts pattern)
// ============================================================

export interface InsuranceDocument {
  id: string;
  agencyId: string;
  insurancePolicyId: string;
  fileName: string;
  mimeType: string | null;
  storageReference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface InsuranceDocumentRow {
  id: string;
  agency_id: string;
  insurance_policy_id: string;
  file_name: string;
  mime_type: string | null;
  storage_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateInsuranceDocumentInput {
  insurancePolicyId: string;
  fileName: string;
  mimeType?: string;
  storageReference?: string;
  notes?: string;
}

const DOCUMENT_COLUMNS = `id, agency_id, insurance_policy_id, file_name, mime_type, storage_reference,
  notes, created_at, updated_at, deleted_at`;

function toInsuranceDocument(row: InsuranceDocumentRow): InsuranceDocument {
  return {
    id: row.id,
    agencyId: row.agency_id,
    insurancePolicyId: row.insurance_policy_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    storageReference: row.storage_reference,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export async function listInsuranceDocuments(
  database: DatabaseRuntime,
  insurancePolicyId: string,
): Promise<InsuranceDocument[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<InsuranceDocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS} FROM insurance_documents
       WHERE agency_id = $1 AND insurance_policy_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId, insurancePolicyId],
    );
    return result.rows.map(toInsuranceDocument);
  });
}

export async function createInsuranceDocument(
  database: DatabaseRuntime,
  data: CreateInsuranceDocumentInput,
): Promise<InsuranceDocument> {
  const agencyId = getAgencyId();

  requireNonBlank(data.insurancePolicyId, 'insurancePolicyId');
  requireNonBlank(data.fileName, 'fileName');

  return database.withTenantTransaction(async (client) => {
    await assertTenantRef(
      client,
      agencyId,
      'insurance_policies',
      data.insurancePolicyId,
      'Insurance policy not found',
    );

    const result = await client.query<InsuranceDocumentRow>(
      `INSERT INTO insurance_documents
         (agency_id, insurance_policy_id, file_name, mime_type, storage_reference, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${DOCUMENT_COLUMNS}`,
      [
        agencyId,
        data.insurancePolicyId,
        data.fileName.trim(),
        data.mimeType ?? null,
        data.storageReference ?? null,
        data.notes ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Insurance document insert did not return a row');
    return toInsuranceDocument(row);
  });
}
