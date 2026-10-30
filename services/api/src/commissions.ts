import { assertEntryReleasableForPayable } from './commission-release-service';
import {
  CommissionCalculationType,
  CommissionEntryStatus,
  type CommissionEntry,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { getSaleMargin } from './financial';
import { captureSaleReleasePolicySnapshot } from './commission-release-service';

interface CommissionEntryRow {
  id: string;
  agency_id: string;
  employee_id: string;
  sale_id: string;
  supplier_id?: string | null;
  calculation_snapshot?: Record<string, unknown> | null;
  trip_id: string | null;
  commission_plan_id: string | null;
  commission_rule_id: string | null;
  product_type: CommissionEntry['productType'] | null;
  source_item_id: string | null;
  source_item_type: string | null;
  quantity: string | null;
  calculation_base: string;
  rate: string | null;
  amount: string;
  status: CommissionEntryStatus;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const COMMISSION_ENTRY_COLUMNS = `id, agency_id, employee_id, sale_id, supplier_id, trip_id, commission_plan_id,
  commission_rule_id, product_type, source_item_id, source_item_type, quantity,
  calculation_base, rate, amount, status, approved_at, approved_by, paid_at, notes,
  created_at, updated_at`;

export interface GenerateCommissionInput {
  saleId: string;
  employeeId: string;
  commissionPlanId?: string | undefined;
  notes?: string | undefined;
}

export interface CommissionListFilters {
  employeeId?: string | undefined;
  saleId?: string | undefined;
  status?: string | undefined;
}

function toCommissionEntry(row: CommissionEntryRow): CommissionEntry {
  return {
    id: row.id,
    agencyId: row.agency_id,
    employeeId: row.employee_id,
    saleId: row.sale_id,
    ...(row.supplier_id ? { supplierId: row.supplier_id } : {}),
    tripId: row.trip_id ?? undefined,
    commissionPlanId: row.commission_plan_id ?? undefined,
    commissionRuleId: row.commission_rule_id ?? undefined,
    productType: row.product_type ?? undefined,
    sourceItemId: row.source_item_id ?? undefined,
    sourceItemType: row.source_item_type ?? undefined,
    quantity: row.quantity !== null ? Number(row.quantity) : undefined,
    calculationBase: Number(row.calculation_base),
    rate: row.rate !== null ? Number(row.rate) : undefined,
    amount: Number(row.amount),
    status: row.status,
    approvedAt: row.approved_at !== null ? new Date(row.approved_at) : undefined,
    approvedBy: row.approved_by ?? undefined,
    paidAt: row.paid_at !== null ? new Date(row.paid_at) : undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.calculation_snapshot?.agencyRevenueWarning === 'COMMISSION_EXCEEDS_AGENCY_REVENUE' ? { agencyRevenueWarning: true } : {}),
  };
}

export async function listCommissionEntries(
  database: DatabaseRuntime,
  filters: CommissionListFilters = {},
): Promise<CommissionEntry[]> {
  const agencyId = getAgencyId();
  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`employee_id = $${values.length}`);
  }
  if (filters.saleId) {
    values.push(filters.saleId);
    conditions.push(`sale_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<CommissionEntryRow>(
      `SELECT ${COMMISSION_ENTRY_COLUMNS}, calculation_snapshot FROM commission_entries
       WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      values,
    );
    return result.rows;
  });

  return rows.map(toCommissionEntry);
}

export async function getCommissionEntryById(
  database: DatabaseRuntime,
  id: string,
): Promise<CommissionEntry | null> {
  const agencyId = getAgencyId();
  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<CommissionEntryRow>(
      `SELECT ${COMMISSION_ENTRY_COLUMNS} FROM commission_entries WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return result.rows[0] ?? null;
  });
  return row ? toCommissionEntry(row) : null;
}

/**
 * Computes a commission amount for a sale + employee + plan, reusing the same
 * authoritative margin calculation used by the Sale Financial Story
 * (getSaleMargin), so this never re-derives margin independently.
 */
export async function generateCommission(
  database: DatabaseRuntime,
  data: GenerateCommissionInput,
): Promise<CommissionEntry> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`commission-motor:${agencyId}:${data.saleId}:${data.employeeId}`]);
    const employeeResult = await client.query<{
      id: string;
      default_commission_plan_id: string | null;
    }>(`SELECT id, default_commission_plan_id FROM employees WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      data.employeeId,
    ]);
    const employee = employeeResult.rows[0];
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    const planId = data.commissionPlanId ?? employee.default_commission_plan_id ?? undefined;
    if (!planId) {
      throw new ValidationError(
        'No commissionPlanId provided and employee has no defaultCommissionPlanId',
      );
    }

    const planResult = await client.query<{
      id: string;
      calculation_type: CommissionCalculationType;
      percentage: string | null;
      fixed_amount: string | null;
    }>(
      `SELECT id, calculation_type, percentage, fixed_amount FROM commission_plans
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, planId],
    );
    const plan = planResult.rows[0];
    if (!plan) {
      throw new NotFoundError('Commission plan not found');
    }

    const saleResult = await client.query<{ id: string; total: string; recognition_date: string }>(
      `SELECT id, total, to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS recognition_date
         FROM sales WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.saleId],
    );
    const sale = saleResult.rows[0];
    if (!sale) {
      throw new NotFoundError('Sale not found');
    }

    const engineSettings = await client.query<{ cutover_date: string | null }>(
      'SELECT cutover_date::text FROM agency_commission_engine_settings WHERE agency_id=$1', [agencyId],
    );
    if (engineSettings.rows[0]?.cutover_date && sale.recognition_date >= engineSettings.rows[0].cutover_date) {
      throw new ConflictError('This sale is within the versioned commission engine period');
    }
    const attribution = await client.query(
      `SELECT 1 FROM sale_commission_attributions WHERE agency_id=$1 AND sale_id=$2 AND employee_id=$3 AND state='ACTIVE'`,
      [agencyId, data.saleId, data.employeeId],
    );
    if (attribution.rows.length > 0) throw new ConflictError('This sale uses versioned commission rules');

    const tripResult = await client.query<{ id: string }>(
      `SELECT id FROM trips WHERE agency_id = $1 AND sale_id = $2 LIMIT 1`,
      [agencyId, data.saleId],
    );
    const tripId = tripResult.rows[0]?.id ?? null;

    // Idempotency guard: generating a commission twice for the same
    // sale+employee must not create a duplicate entry. Any existing
    // non-cancelled commission_entry for this (agency, sale, employee)
    // blocks re-generation -- the caller should approve/cancel the
    // existing entry first rather than silently doubling the commission.
    const duplicateResult = await client.query<{ id: string }>(
      `SELECT id FROM commission_entries
       WHERE agency_id = $1 AND sale_id = $2 AND employee_id = $3 AND status <> 'CANCELLED'
       LIMIT 1`,
      [agencyId, data.saleId, data.employeeId],
    );
    if (duplicateResult.rows[0]) {
      throw new ConflictError(
        `A commission entry already exists for this sale and employee (id: ${duplicateResult.rows[0].id}). ` +
          'Cancel it before generating a new one.',
      );
    }

    let calculationBase: number;
    let rate: number | null = null;
    let amount: number;

    switch (plan.calculation_type) {
      case CommissionCalculationType.PERCENT_SALE: {
        if (plan.percentage === null) {
          throw new ValidationError('Commission plan has no percentage configured');
        }
        calculationBase = Number(sale.total);
        rate = Number(plan.percentage);
        amount = Math.round(calculationBase * (rate / 100) * 100) / 100;
        break;
      }
      case CommissionCalculationType.PERCENT_MARGIN: {
        if (plan.percentage === null) {
          throw new ValidationError('Commission plan has no percentage configured');
        }
        // Reuse the authoritative sale margin calculation (same one backing
        // the Sale Financial Story view) rather than re-deriving it here.
        const marginResult = await getSaleMargin(database, data.saleId);
        calculationBase = marginResult.margin;
        rate = Number(plan.percentage);
        amount = Math.round(calculationBase * (rate / 100) * 100) / 100;
        break;
      }
      case CommissionCalculationType.FIXED: {
        if (plan.fixed_amount === null) {
          throw new ValidationError('Commission plan has no fixedAmount configured');
        }
        calculationBase = Number(plan.fixed_amount);
        amount = Number(plan.fixed_amount);
        break;
      }
      default:
        throw new ValidationError(
          `Automatic commission calculation is not supported for calculationType "${plan.calculation_type}". ` +
            'Create the commission entry manually or configure a PERCENT_SALE/PERCENT_MARGIN/FIXED plan.',
        );
    }

    if (amount < 0) {
      throw new ValidationError('Calculated commission amount is negative');
    }

    const releasePolicySnapshot = await captureSaleReleasePolicySnapshot(client, agencyId, data.saleId);

    const result = await client.query<CommissionEntryRow>(
      `INSERT INTO commission_entries
         (agency_id, employee_id, sale_id, trip_id, commission_plan_id, calculation_base,
          rate, amount, status, notes, release_policy_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, $10::jsonb)
       RETURNING ${COMMISSION_ENTRY_COLUMNS}`,
      [agencyId, data.employeeId, data.saleId, tripId, planId, calculationBase, rate, amount, data.notes ?? null, JSON.stringify(releasePolicySnapshot)],
    );
    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error('Commission entry insert did not return a row');
    }
    return toCommissionEntry(inserted);
  });
}

export async function approveCommissionEntry(
  database: DatabaseRuntime,
  id: string,
  approvedBy: string,
): Promise<CommissionEntry | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const existingResult = await client.query<CommissionEntryRow>(
      `SELECT ${COMMISSION_ENTRY_COLUMNS} FROM commission_entries WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [agencyId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      return null;
    }
    if (existing.status !== CommissionEntryStatus.PENDING) {
      throw new ValidationError(`Commission entry must be PENDING to approve (current: ${existing.status})`);
    }

    const result = await client.query<CommissionEntryRow>(
      `UPDATE commission_entries
       SET status = 'APPROVED', approved_at = now(), approved_by = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${COMMISSION_ENTRY_COLUMNS}`,
      [agencyId, id, approvedBy],
    );
    return toCommissionEntry(result.rows[0]!);
  });
}

/**
 * Converts an APPROVED commission entry into a real `payables` row
 * (beneficiary_type = EMPLOYEE), converging Employee commissions into the
 * same Accounts Payable / Cash flow as Supplier payables. This is a
 * separate, explicit step (not automatic on approval) so an approved
 * commission can still be reviewed/batched before it hits Payables.
 */
export async function createPayableFromCommissionEntry(
  database: DatabaseRuntime,
  id: string,
): Promise<{ payableId: string }> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    // FOR UPDATE: two concurrent calls serialize here, so the second one sees PAYABLE and is
    // refused instead of creating a second obligation (backed by payables_agency_commission_entry_live_key).
    const existingResult = await client.query<CommissionEntryRow & { payroll_entry_id: string | null }>(
      `SELECT ${COMMISSION_ENTRY_COLUMNS}, payroll_entry_id FROM commission_entries
       WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [agencyId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new NotFoundError('Commission entry not found');
    }
    if (existing.status !== CommissionEntryStatus.APPROVED) {
      throw new ValidationError(
        `Commission entry must be APPROVED to create a payable (current: ${existing.status})`,
      );
    }
    // Single payment channel (decision F3): an entry reserved by a payroll is paid through it.
    if (existing.payroll_entry_id !== null) {
      throw new ConflictError(
        'This commission is already included in a payroll entry and is paid through it; it cannot also get a standalone payable',
      );
    }

    // COM-03: blocked without release configuration; needs something released by real receipts.
    await assertEntryReleasableForPayable(client, existing.id);

    const employeeResult = await client.query<{ name: string }>(
      `SELECT name FROM employees WHERE agency_id = $1 AND id = $2`,
      [agencyId, existing.employee_id],
    );
    const employeeName = employeeResult.rows[0]?.name ?? 'Funcionário';

    const categoryResult = await client.query<{ id: string }>(
      `SELECT id FROM financial_categories
       WHERE agency_id = $1 AND type = 'EXPENSE' AND name = 'COMMISSION' LIMIT 1`,
      [agencyId],
    );
    const categoryId = categoryResult.rows[0]?.id ?? null;

    // Deliberately NOT linking sale_id here: `payables.sale_id` feeds the
    // authoritative per-sale margin calculation (getSaleMargin /
    // getSaleFinancialStory, which sums ALL payables for a sale as
    // "supplier costs"). This commission amount was already computed FROM
    // that same margin (for PERCENT_MARGIN plans), so attaching sale_id
    // here would double-count it and corrupt the sale's margin figure.
    // Traceability back to the sale is preserved via commission_entry_id
    // -> commission_entries.sale_id.
    const payableResult = await client.query<{ id: string }>(
      `INSERT INTO payables
         (agency_id, description, amount, due_at, status, beneficiary_type,
          employee_id, commission_entry_id, category_id)
       VALUES ($1, $2, $3, now(), 'OPEN', 'EMPLOYEE', $4, $5, $6)
       RETURNING id`,
      [
        agencyId,
        `Comissão - ${employeeName}`,
        existing.amount,
        existing.employee_id,
        existing.id,
        categoryId,
      ],
    );
    const payableId = payableResult.rows[0]!.id;

    await client.query(
      `UPDATE commission_entries SET status = 'PAYABLE', updated_at = now() WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );

    return { payableId };
  });
}

export interface CommissionChannelConflict {
  commissionEntryId: string;
  employeeId: string;
  amount: number;
  status: string;
  payableId: string;
  payrollEntryId: string;
  competence: string;
}

/**
 * READ-ONLY report of legacy double-channel exposure: commission entries that have a live
 * standalone payable AND whose employee has a non-cancelled payroll entry for the entry's
 * month that counted commissions, without the entry being reserved by that payroll
 * (payroll_entry_id IS NULL -- only legacy rows look like this). Nothing is corrected here:
 * what to do with each case is a human financial decision.
 */
export async function listCommissionChannelConflicts(
  database: DatabaseRuntime,
): Promise<CommissionChannelConflict[]> {
  const agencyId = getAgencyId();
  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      commission_entry_id: string;
      employee_id: string;
      amount: string;
      status: string;
      payable_id: string;
      payroll_entry_id: string;
      competence: string;
    }>(
      `SELECT ce.id AS commission_entry_id, ce.employee_id, ce.amount::text AS amount, ce.status,
              p.id AS payable_id, pe.id AS payroll_entry_id, pe.competence::text AS competence
       FROM commission_entries ce
       JOIN payables p ON p.agency_id = ce.agency_id AND p.commission_entry_id = ce.id AND p.status <> 'CANCELLED'
       JOIN payroll_entries pe ON pe.agency_id = ce.agency_id AND pe.employee_id = ce.employee_id
         AND date_trunc('month', pe.competence) = date_trunc('month', ce.created_at)
         AND pe.status <> 'CANCELLED' AND pe.commissions_total > 0
       WHERE ce.agency_id = $1 AND ce.status IN ('PAYABLE', 'PAID') AND ce.payroll_entry_id IS NULL
       ORDER BY pe.competence, ce.id`,
      [agencyId],
    );
    return result.rows;
  });
  return rows.map((row) => ({
    commissionEntryId: row.commission_entry_id,
    employeeId: row.employee_id,
    amount: Number(row.amount),
    status: row.status,
    payableId: row.payable_id,
    payrollEntryId: row.payroll_entry_id,
    competence: row.competence,
  }));
}
