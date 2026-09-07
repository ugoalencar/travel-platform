import {
  CommissionCalculationType,
  CommissionEntryStatus,
  type CommissionEntry,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { getSaleMargin } from './financial';

interface CommissionEntryRow {
  id: string;
  agency_id: string;
  employee_id: string;
  sale_id: string;
  trip_id: string | null;
  commission_plan_id: string;
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

const COMMISSION_ENTRY_COLUMNS = `id, agency_id, employee_id, sale_id, trip_id, commission_plan_id,
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
    tripId: row.trip_id ?? undefined,
    commissionPlanId: row.commission_plan_id,
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
      `SELECT ${COMMISSION_ENTRY_COLUMNS} FROM commission_entries
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

    const saleResult = await client.query<{ id: string; total: string }>(
      `SELECT id, total FROM sales WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.saleId],
    );
    const sale = saleResult.rows[0];
    if (!sale) {
      throw new NotFoundError('Sale not found');
    }

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

    const result = await client.query<CommissionEntryRow>(
      `INSERT INTO commission_entries
         (agency_id, employee_id, sale_id, trip_id, commission_plan_id, calculation_base,
          rate, amount, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
       RETURNING ${COMMISSION_ENTRY_COLUMNS}`,
      [agencyId, data.employeeId, data.saleId, tripId, planId, calculationBase, rate, amount, data.notes ?? null],
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
      `SELECT ${COMMISSION_ENTRY_COLUMNS} FROM commission_entries WHERE agency_id = $1 AND id = $2`,
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
    const existingResult = await client.query<CommissionEntryRow>(
      `SELECT ${COMMISSION_ENTRY_COLUMNS} FROM commission_entries WHERE agency_id = $1 AND id = $2`,
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
