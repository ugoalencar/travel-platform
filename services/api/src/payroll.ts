import {
  EmployeeDeductionType,
  PayrollEntryStatus,
  type EmployeeDeduction,
  type PayrollEntry,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';

// ============================================================
// EMPLOYEE DEDUCTIONS
// ============================================================

interface EmployeeDeductionRow {
  id: string;
  agency_id: string;
  employee_id: string;
  competence: string;
  type: EmployeeDeductionType;
  description: string | null;
  amount: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const DEDUCTION_COLUMNS = `id, agency_id, employee_id, competence, type, description, amount,
  notes, created_at, updated_at`;

const VALID_DEDUCTION_TYPES = new Set(Object.values(EmployeeDeductionType));

export interface CreateEmployeeDeductionInput {
  employeeId: string;
  competence: string;
  type: EmployeeDeductionType;
  description?: string | undefined;
  amount: number;
  notes?: string | undefined;
}

function toEmployeeDeduction(row: EmployeeDeductionRow): EmployeeDeduction {
  return {
    id: row.id,
    agencyId: row.agency_id,
    employeeId: row.employee_id,
    competence: new Date(row.competence),
    type: row.type,
    description: row.description ?? undefined,
    amount: Number(row.amount),
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function listEmployeeDeductions(
  database: DatabaseRuntime,
  filters: { employeeId?: string | undefined; competence?: string | undefined } = {},
): Promise<EmployeeDeduction[]> {
  const agencyId = getAgencyId();
  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`employee_id = $${values.length}`);
  }
  if (filters.competence) {
    values.push(filters.competence);
    conditions.push(`date_trunc('month', competence) = date_trunc('month', $${values.length}::date)`);
  }

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeDeductionRow>(
      `SELECT ${DEDUCTION_COLUMNS} FROM employee_deductions
       WHERE ${conditions.join(' AND ')} ORDER BY competence DESC`,
      values,
    );
    return result.rows;
  });

  return rows.map(toEmployeeDeduction);
}

export async function createEmployeeDeduction(
  database: DatabaseRuntime,
  data: CreateEmployeeDeductionInput,
): Promise<EmployeeDeduction> {
  const agencyId = getAgencyId();
  if (!VALID_DEDUCTION_TYPES.has(data.type)) {
    throw new ValidationError('Field "type" is invalid');
  }
  if (!(data.amount >= 0)) {
    throw new ValidationError('Field "amount" must be non-negative');
  }

  return database.withTenantTransaction(async (client) => {
    const employeeResult = await client.query(`SELECT id FROM employees WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      data.employeeId,
    ]);
    if (employeeResult.rows.length === 0) {
      throw new NotFoundError('Employee not found');
    }

    const result = await client.query<EmployeeDeductionRow>(
      `INSERT INTO employee_deductions (agency_id, employee_id, competence, type, description, amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${DEDUCTION_COLUMNS}`,
      [
        agencyId,
        data.employeeId,
        data.competence,
        data.type,
        data.description ?? null,
        data.amount,
        data.notes ?? null,
      ],
    );
    return toEmployeeDeduction(result.rows[0]!);
  });
}

export async function deleteEmployeeDeduction(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();
  const deleted = await database.withTenantTransaction(async (client) => {
    const result = await client.query(`DELETE FROM employee_deductions WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  });
  return deleted;
}

// ============================================================
// PAYROLL ENTRIES
// ============================================================

interface PayrollEntryRow {
  id: string;
  agency_id: string;
  employee_id: string;
  competence: string;
  base_salary: string;
  benefits: string;
  bonuses: string;
  commissions_total: string;
  reimbursements: string;
  additions: string;
  discounts_total: string;
  net_amount: string;
  status: PayrollEntryStatus;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PAYROLL_COLUMNS = `id, agency_id, employee_id, competence, base_salary, benefits, bonuses,
  commissions_total, reimbursements, additions, discounts_total, net_amount, status, due_date,
  paid_at, notes, created_at, updated_at`;

function toPayrollEntry(row: PayrollEntryRow): PayrollEntry {
  return {
    id: row.id,
    agencyId: row.agency_id,
    employeeId: row.employee_id,
    competence: new Date(row.competence),
    baseSalary: Number(row.base_salary),
    benefits: Number(row.benefits),
    bonuses: Number(row.bonuses),
    commissionsTotal: Number(row.commissions_total),
    reimbursements: Number(row.reimbursements),
    additions: Number(row.additions),
    discountsTotal: Number(row.discounts_total),
    netAmount: Number(row.net_amount),
    status: row.status,
    dueDate: row.due_date !== null ? new Date(row.due_date) : undefined,
    paidAt: row.paid_at !== null ? new Date(row.paid_at) : undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function listPayrollEntries(
  database: DatabaseRuntime,
  filters: { employeeId?: string | undefined; status?: string | undefined } = {},
): Promise<PayrollEntry[]> {
  const agencyId = getAgencyId();
  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`employee_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<PayrollEntryRow>(
      `SELECT ${PAYROLL_COLUMNS} FROM payroll_entries
       WHERE ${conditions.join(' AND ')} ORDER BY competence DESC, created_at DESC`,
      values,
    );
    return result.rows;
  });

  return rows.map(toPayrollEntry);
}

export async function getPayrollEntryById(
  database: DatabaseRuntime,
  id: string,
): Promise<PayrollEntry | null> {
  const agencyId = getAgencyId();
  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<PayrollEntryRow>(
      `SELECT ${PAYROLL_COLUMNS} FROM payroll_entries WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return result.rows[0] ?? null;
  });
  return row ? toPayrollEntry(row) : null;
}

export interface GeneratePayrollInput {
  employeeId: string;
  competence: string; // any date within the target month
  benefits?: number | undefined;
  bonuses?: number | undefined;
  reimbursements?: number | undefined;
  additions?: number | undefined;
  dueDate?: string | undefined;
  notes?: string | undefined;
}

/**
 * Generates (or refreshes, while OPEN) a payroll entry for an employee +
 * competence month: snapshots base_salary, rolls up APPROVED/PAYABLE/PAID
 * commission_entries and employee_deductions for that month, and computes
 * net_amount.
 */
export async function generatePayrollEntry(
  database: DatabaseRuntime,
  data: GeneratePayrollInput,
): Promise<PayrollEntry> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const employeeResult = await client.query<{ base_salary: string | null }>(
      `SELECT base_salary FROM employees WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.employeeId],
    );
    const employee = employeeResult.rows[0];
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }
    const baseSalary = employee.base_salary !== null ? Number(employee.base_salary) : 0;

    const commissionsResult = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM commission_entries
       WHERE agency_id = $1 AND employee_id = $2
         AND status IN ('APPROVED', 'PAYABLE', 'PAID')
         AND date_trunc('month', created_at) = date_trunc('month', $3::date)`,
      [agencyId, data.employeeId, data.competence],
    );
    const commissionsTotal = Number(commissionsResult.rows[0]?.total ?? 0);

    const deductionsResult = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM employee_deductions
       WHERE agency_id = $1 AND employee_id = $2
         AND date_trunc('month', competence) = date_trunc('month', $3::date)`,
      [agencyId, data.employeeId, data.competence],
    );
    const discountsTotal = Number(deductionsResult.rows[0]?.total ?? 0);

    const benefits = data.benefits ?? 0;
    const bonuses = data.bonuses ?? 0;
    const reimbursements = data.reimbursements ?? 0;
    const additions = data.additions ?? 0;
    const netAmount =
      Math.round(
        (baseSalary + benefits + bonuses + commissionsTotal + reimbursements + additions - discountsTotal) *
          100,
      ) / 100;

    const existingResult = await client.query<{ id: string; status: PayrollEntryStatus }>(
      `SELECT id, status FROM payroll_entries
       WHERE agency_id = $1 AND employee_id = $2 AND date_trunc('month', competence) = date_trunc('month', $3::date)`,
      [agencyId, data.employeeId, data.competence],
    );
    const existing = existingResult.rows[0];
    if (existing && existing.status !== PayrollEntryStatus.OPEN) {
      throw new ValidationError(
        `A payroll entry for this employee/month already exists with status ${existing.status}`,
      );
    }

    let row: PayrollEntryRow;
    if (existing) {
      const result = await client.query<PayrollEntryRow>(
        `UPDATE payroll_entries SET
           base_salary = $3, benefits = $4, bonuses = $5, commissions_total = $6,
           reimbursements = $7, additions = $8, discounts_total = $9, net_amount = $10,
           due_date = COALESCE($11, due_date), notes = COALESCE($12, notes), updated_at = now()
         WHERE agency_id = $1 AND id = $2
         RETURNING ${PAYROLL_COLUMNS}`,
        [
          agencyId,
          existing.id,
          baseSalary,
          benefits,
          bonuses,
          commissionsTotal,
          reimbursements,
          additions,
          discountsTotal,
          netAmount,
          data.dueDate ?? null,
          data.notes ?? null,
        ],
      );
      row = result.rows[0]!;
    } else {
      const result = await client.query<PayrollEntryRow>(
        `INSERT INTO payroll_entries
           (agency_id, employee_id, competence, base_salary, benefits, bonuses, commissions_total,
            reimbursements, additions, discounts_total, net_amount, status, due_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'OPEN', $12, $13)
         RETURNING ${PAYROLL_COLUMNS}`,
        [
          agencyId,
          data.employeeId,
          data.competence,
          baseSalary,
          benefits,
          bonuses,
          commissionsTotal,
          reimbursements,
          additions,
          discountsTotal,
          netAmount,
          data.dueDate ?? null,
          data.notes ?? null,
        ],
      );
      row = result.rows[0]!;
    }

    return toPayrollEntry(row);
  });
}

export async function approvePayrollEntry(
  database: DatabaseRuntime,
  id: string,
): Promise<PayrollEntry | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const existingResult = await client.query<PayrollEntryRow>(
      `SELECT ${PAYROLL_COLUMNS} FROM payroll_entries WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) return null;
    if (existing.status !== PayrollEntryStatus.OPEN) {
      throw new ValidationError(`Payroll entry must be OPEN to approve (current: ${existing.status})`);
    }
    const result = await client.query<PayrollEntryRow>(
      `UPDATE payroll_entries SET status = 'APPROVED', updated_at = now()
       WHERE agency_id = $1 AND id = $2 RETURNING ${PAYROLL_COLUMNS}`,
      [agencyId, id],
    );
    return toPayrollEntry(result.rows[0]!);
  });
}

/**
 * Marks a payroll entry PAID and creates the corresponding `payables` row
 * (beneficiary_type = EMPLOYEE, PERSONNEL/SALARY category), converging
 * personnel payments into the same Accounts Payable / Cash flow.
 */
export async function payPayrollEntry(
  database: DatabaseRuntime,
  id: string,
): Promise<{ payrollEntry: PayrollEntry; payableId: string }> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const existingResult = await client.query<PayrollEntryRow>(
      `SELECT ${PAYROLL_COLUMNS} FROM payroll_entries WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new NotFoundError('Payroll entry not found');
    }
    if (existing.status !== PayrollEntryStatus.APPROVED) {
      throw new ValidationError(`Payroll entry must be APPROVED to pay (current: ${existing.status})`);
    }

    const employeeResult = await client.query<{ name: string }>(
      `SELECT name FROM employees WHERE agency_id = $1 AND id = $2`,
      [agencyId, existing.employee_id],
    );
    const employeeName = employeeResult.rows[0]?.name ?? 'Funcionário';

    const categoryResult = await client.query<{ id: string }>(
      `SELECT id FROM financial_categories
       WHERE agency_id = $1 AND type = 'EXPENSE' AND name = 'SALARY' LIMIT 1`,
      [agencyId],
    );
    const categoryId = categoryResult.rows[0]?.id ?? null;

    const payableResult = await client.query<{ id: string }>(
      `INSERT INTO payables
         (agency_id, description, amount, due_at, status, beneficiary_type, employee_id,
          payroll_entry_id, category_id)
       VALUES ($1, $2, $3, COALESCE($4, now()), 'OPEN', 'EMPLOYEE', $5, $6, $7)
       RETURNING id`,
      [
        agencyId,
        `Folha de pagamento - ${employeeName} (${new Date(existing.competence).toISOString().slice(0, 7)})`,
        existing.net_amount,
        existing.due_date,
        existing.employee_id,
        existing.id,
        categoryId,
      ],
    );
    const payableId = payableResult.rows[0]!.id;

    const updated = await client.query<PayrollEntryRow>(
      `UPDATE payroll_entries SET status = 'PAID', paid_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 RETURNING ${PAYROLL_COLUMNS}`,
      [agencyId, id],
    );

    return { payrollEntry: toPayrollEntry(updated.rows[0]!), payableId };
  });
}
