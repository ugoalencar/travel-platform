// Employee Commission Rules -- per-employee, per-product-type commission
// configuration. Evolves the commission domain (commission-plans.ts,
// commissions.ts, employees.ts) rather than duplicating it -- see
// docs/product/COMISSIONAMENTO_FUNCIONARIOS.md "Estado atual" for the
// full audit that justified this as a new, narrower table alongside
// (not instead of) commission_plans.
import {
  EmployeeCommissionBasis,
  EmployeeCommissionCalculationType,
  EmployeeCommissionProductType,
  EmployeeCommissionRuleStatus,
  type EmployeeCommissionRule,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';

interface EmployeeCommissionRuleRow {
  id: string;
  agency_id: string;
  employee_id: string;
  product_type: EmployeeCommissionProductType;
  calculation_type: EmployeeCommissionCalculationType;
  calculation_basis: EmployeeCommissionBasis;
  percentage_rate: string | null;
  fixed_amount: string | null;
  currency: string;
  valid_from: string | null;
  valid_until: string | null;
  status: EmployeeCommissionRuleStatus;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

const RULE_COLUMNS = `id, agency_id, employee_id, product_type, calculation_type, calculation_basis,
  percentage_rate, fixed_amount, currency, valid_from, valid_until, status, created_by_user_id,
  created_at, updated_at`;

export interface EmployeeCommissionRuleInput {
  employeeId: string;
  productType: EmployeeCommissionProductType;
  calculationType: EmployeeCommissionCalculationType;
  calculationBasis: EmployeeCommissionBasis;
  percentageRate?: number | undefined;
  fixedAmount?: number | undefined;
  currency?: string | undefined;
  validFrom?: string | undefined;
  validUntil?: string | undefined;
}

function toRule(row: EmployeeCommissionRuleRow): EmployeeCommissionRule {
  return {
    id: row.id,
    agencyId: row.agency_id,
    employeeId: row.employee_id,
    productType: row.product_type,
    calculationType: row.calculation_type,
    calculationBasis: row.calculation_basis,
    percentageRate: row.percentage_rate !== null ? Number(row.percentage_rate) : undefined,
    fixedAmount: row.fixed_amount !== null ? Number(row.fixed_amount) : undefined,
    currency: row.currency,
    validFrom: row.valid_from !== null ? new Date(row.valid_from) : undefined,
    validUntil: row.valid_until !== null ? new Date(row.valid_until) : undefined,
    status: row.status,
    createdByUserId: row.created_by_user_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const VALID_PRODUCT_TYPES = new Set(Object.values(EmployeeCommissionProductType));
const VALID_CALCULATION_TYPES = new Set(Object.values(EmployeeCommissionCalculationType));
const VALID_BASES = new Set(Object.values(EmployeeCommissionBasis));

export async function listEmployeeCommissionRules(
  database: DatabaseRuntime,
  filters: { employeeId?: string | undefined; productType?: string | undefined } = {},
): Promise<EmployeeCommissionRule[]> {
  const agencyId = getAgencyId();
  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`employee_id = $${values.length}`);
  }
  if (filters.productType) {
    values.push(filters.productType);
    conditions.push(`product_type = $${values.length}`);
  }

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeCommissionRuleRow>(
      `SELECT ${RULE_COLUMNS} FROM employee_commission_rules
       WHERE ${conditions.join(' AND ')}
       ORDER BY employee_id, product_type, valid_from DESC NULLS LAST, created_at DESC`,
      values,
    );
    return result.rows;
  });

  return rows.map(toRule);
}

export async function getEmployeeCommissionRuleById(
  database: DatabaseRuntime,
  id: string,
): Promise<EmployeeCommissionRule | null> {
  const agencyId = getAgencyId();
  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeCommissionRuleRow>(
      `SELECT ${RULE_COLUMNS} FROM employee_commission_rules WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return result.rows[0] ?? null;
  });
  return row ? toRule(row) : null;
}

function validateInput(data: Partial<EmployeeCommissionRuleInput>): void {
  if (data.productType !== undefined && !VALID_PRODUCT_TYPES.has(data.productType)) {
    throw new ValidationError(`Invalid productType: ${String(data.productType)}`);
  }
  if (data.calculationType !== undefined && !VALID_CALCULATION_TYPES.has(data.calculationType)) {
    throw new ValidationError(`Invalid calculationType: ${String(data.calculationType)}`);
  }
  if (data.calculationBasis !== undefined && !VALID_BASES.has(data.calculationBasis)) {
    throw new ValidationError(`Invalid calculationBasis: ${String(data.calculationBasis)}`);
  }
  if (data.calculationType === EmployeeCommissionCalculationType.PERCENTAGE) {
    if (data.percentageRate === undefined || data.percentageRate === null) {
      throw new ValidationError('percentageRate is required for calculationType PERCENTAGE');
    }
    if (data.percentageRate < 0) {
      throw new ValidationError('percentageRate must be non-negative');
    }
  }
  if (data.calculationType === EmployeeCommissionCalculationType.FIXED) {
    if (data.fixedAmount === undefined || data.fixedAmount === null) {
      throw new ValidationError('fixedAmount is required for calculationType FIXED');
    }
    if (data.fixedAmount < 0) {
      throw new ValidationError('fixedAmount must be non-negative');
    }
  }
  if (data.validFrom && data.validUntil && data.validFrom > data.validUntil) {
    throw new ValidationError('validFrom must be before validUntil');
  }
}

/**
 * Creates a new commission rule for an employee+product type.
 *
 * Precedence (spec: "Não permitir duas regras ativas conflitantes...
 * Nunca escolher regra aleatoriamente"): at most one OPEN-ENDED
 * (validUntil = null) ACTIVE rule may exist per (employee, productType)
 * at a time -- enforced by employee_commission_rules_open_ended_active_uidx.
 * Creating a new open-ended ACTIVE rule automatically closes any existing
 * open-ended ACTIVE rule for the same employee+productType by setting its
 * validUntil to the day before the new rule's validFrom (or today, if the
 * new rule has no explicit validFrom) -- a deterministic replacement, not
 * a silent overwrite: the old rule's history (and every commission entry
 * that already snapshotted it) is preserved untouched.
 */
export async function createEmployeeCommissionRule(
  database: DatabaseRuntime,
  data: EmployeeCommissionRuleInput,
  createdByUserId: string,
): Promise<EmployeeCommissionRule> {
  validateInput(data);
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const employeeResult = await client.query<{ id: string }>(
      `SELECT id FROM employees WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.employeeId],
    );
    if (!employeeResult.rows[0]) {
      throw new NotFoundError('Employee not found');
    }

    const newValidFrom = data.validFrom ?? null;

    // Close any existing open-ended ACTIVE rule for this employee+product
    // before inserting the new one, so the unique index never rejects the
    // insert and the precedence is always deterministic (old rule's
    // validUntil = day before the new rule starts).
    await client.query(
      `UPDATE employee_commission_rules
       SET valid_until = COALESCE($3::date, CURRENT_DATE) - INTERVAL '1 day',
           updated_at = now()
       WHERE agency_id = $1 AND employee_id = $2 AND product_type = $4
         AND status = 'ACTIVE' AND valid_until IS NULL`,
      [agencyId, data.employeeId, newValidFrom, data.productType],
    );

    const result = await client.query<EmployeeCommissionRuleRow>(
      `INSERT INTO employee_commission_rules
         (agency_id, employee_id, product_type, calculation_type, calculation_basis,
          percentage_rate, fixed_amount, currency, valid_from, valid_until, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${RULE_COLUMNS}`,
      [
        agencyId,
        data.employeeId,
        data.productType,
        data.calculationType,
        data.calculationBasis,
        data.percentageRate ?? null,
        data.fixedAmount ?? null,
        data.currency ?? 'BRL',
        data.validFrom ?? null,
        data.validUntil ?? null,
        createdByUserId,
      ],
    );
    return toRule(result.rows[0]!);
  });
}

export async function updateEmployeeCommissionRuleStatus(
  database: DatabaseRuntime,
  id: string,
  status: EmployeeCommissionRuleStatus,
): Promise<EmployeeCommissionRule | null> {
  if (!Object.values(EmployeeCommissionRuleStatus).includes(status)) {
    throw new ValidationError(`Invalid status: ${String(status)}`);
  }
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeCommissionRuleRow>(
      `UPDATE employee_commission_rules
       SET status = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${RULE_COLUMNS}`,
      [agencyId, id, status],
    );
    return result.rows[0] ? toRule(result.rows[0]) : null;
  });
}

/**
 * Resolves the single rule that governs an employee+productType commission
 * at a given recognition date (the sale's created_at -- see
 * employee-commissions.ts for why). Deterministic: an ACTIVE rule whose
 * [validFrom, validUntil] window contains the date, preferring the most
 * recently created if more than one somehow matches (should not happen
 * given the open-ended-uidx precedence guard, but never picks randomly).
 */
export async function findApplicableRule(
  database: DatabaseRuntime,
  employeeId: string,
  productType: EmployeeCommissionProductType,
  atDate: Date,
): Promise<EmployeeCommissionRule | null> {
  const agencyId = getAgencyId();
  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeCommissionRuleRow>(
      `SELECT ${RULE_COLUMNS} FROM employee_commission_rules
       WHERE agency_id = $1 AND employee_id = $2 AND product_type = $3 AND status = 'ACTIVE'
         AND (valid_from IS NULL OR valid_from <= $4)
         AND (valid_until IS NULL OR valid_until >= $4)
       ORDER BY valid_from DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [agencyId, employeeId, productType, atDate.toISOString().slice(0, 10)],
    );
    return result.rows[0] ?? null;
  });
  return row ? toRule(row) : null;
}
