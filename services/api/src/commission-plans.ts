import { CommissionCalculationType, type CommissionPlan } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';

interface CommissionPlanRow {
  id: string;
  agency_id: string;
  name: string;
  calculation_type: CommissionCalculationType;
  percentage: string | null;
  fixed_amount: string | null;
  rules: Record<string, unknown> | null;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCommissionPlanInput {
  name: string;
  calculationType: CommissionCalculationType;
  percentage?: number | undefined;
  fixedAmount?: number | undefined;
  rules?: Record<string, unknown> | undefined;
  active?: boolean | undefined;
  validFrom?: string | undefined;
  validUntil?: string | undefined;
}

export type UpdateCommissionPlanInput = Partial<CreateCommissionPlanInput>;

const COMMISSION_PLAN_COLUMNS = `id, agency_id, name, calculation_type, percentage, fixed_amount, rules,
  active, valid_from, valid_until, created_at, updated_at`;

const VALID_CALCULATION_TYPES = new Set(Object.values(CommissionCalculationType));

function assertValid(data: CreateCommissionPlanInput): void {
  if (!data.name || data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }
  if (!data.calculationType || !VALID_CALCULATION_TYPES.has(data.calculationType)) {
    throw new ValidationError('Field "calculationType" is invalid');
  }
  if (data.calculationType === CommissionCalculationType.FIXED && data.fixedAmount === undefined) {
    throw new ValidationError('Field "fixedAmount" is required for calculationType FIXED');
  }
  if (
    (data.calculationType === CommissionCalculationType.PERCENT_SALE ||
      data.calculationType === CommissionCalculationType.PERCENT_MARGIN) &&
    data.percentage === undefined
  ) {
    throw new ValidationError('Field "percentage" is required for percentage-based calculationType');
  }
}

export async function listCommissionPlans(
  database: DatabaseRuntime,
  includeInactive = false,
): Promise<CommissionPlan[]> {
  const agencyId = getAgencyId();

  const rows = await database.withTenantTransaction(async (client) => {
    const query = includeInactive
      ? `SELECT ${COMMISSION_PLAN_COLUMNS} FROM commission_plans WHERE agency_id = $1 ORDER BY name ASC`
      : `SELECT ${COMMISSION_PLAN_COLUMNS} FROM commission_plans WHERE agency_id = $1 AND active = true ORDER BY name ASC`;
    const result = await client.query<CommissionPlanRow>(query, [agencyId]);
    return result.rows;
  });

  return rows.map(toCommissionPlan);
}

export async function getCommissionPlanById(
  database: DatabaseRuntime,
  id: string,
): Promise<CommissionPlan | null> {
  const agencyId = getAgencyId();

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<CommissionPlanRow>(
      `SELECT ${COMMISSION_PLAN_COLUMNS} FROM commission_plans WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return result.rows[0] ?? null;
  });

  return row ? toCommissionPlan(row) : null;
}

export async function createCommissionPlan(
  database: DatabaseRuntime,
  data: CreateCommissionPlanInput,
): Promise<CommissionPlan> {
  const agencyId = getAgencyId();
  assertValid(data);

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<CommissionPlanRow>(
      `INSERT INTO commission_plans (
         agency_id, name, calculation_type, percentage, fixed_amount, rules, active, valid_from, valid_until
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COMMISSION_PLAN_COLUMNS}`,
      [
        agencyId,
        data.name.trim(),
        data.calculationType,
        data.percentage ?? null,
        data.fixedAmount ?? null,
        data.rules ? JSON.stringify(data.rules) : null,
        data.active ?? true,
        data.validFrom ?? null,
        data.validUntil ?? null,
      ],
    );
    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error('Commission plan insert did not return a row');
    }
    return inserted;
  });

  return toCommissionPlan(row);
}

const UPDATE_COLUMN_MAP: Array<[keyof UpdateCommissionPlanInput, string]> = [
  ['name', 'name'],
  ['calculationType', 'calculation_type'],
  ['percentage', 'percentage'],
  ['fixedAmount', 'fixed_amount'],
  ['active', 'active'],
  ['validFrom', 'valid_from'],
  ['validUntil', 'valid_until'],
];

export async function updateCommissionPlan(
  database: DatabaseRuntime,
  id: string,
  data: UpdateCommissionPlanInput,
): Promise<CommissionPlan | null> {
  const agencyId = getAgencyId();

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }
  if (data.calculationType !== undefined && !VALID_CALCULATION_TYPES.has(data.calculationType)) {
    throw new ValidationError('Field "calculationType" is invalid');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const [key, column] of UPDATE_COLUMN_MAP) {
    if (data[key] !== undefined) {
      fields.push(`${column} = $${++index}`);
      values.push(data[key]);
    }
  }

  if (data.rules !== undefined) {
    fields.push(`rules = $${++index}`);
    values.push(JSON.stringify(data.rules));
  }

  if (fields.length === 0) {
    return getCommissionPlanById(database, id);
  }

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<CommissionPlanRow>(
      `UPDATE commission_plans SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${COMMISSION_PLAN_COLUMNS}`,
      [agencyId, ...values, id],
    );
    return result.rows[0] ?? null;
  });

  return row ? toCommissionPlan(row) : null;
}

export async function deleteCommissionPlan(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();

  const deleted = await database.withTenantTransaction(async (client) => {
    const result = await client.query(`DELETE FROM commission_plans WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  });

  return deleted;
}

function toCommissionPlan(row: CommissionPlanRow): CommissionPlan {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    calculationType: row.calculation_type,
    percentage: row.percentage !== null ? Number(row.percentage) : undefined,
    fixedAmount: row.fixed_amount !== null ? Number(row.fixed_amount) : undefined,
    rules: row.rules ?? undefined,
    active: row.active,
    validFrom: row.valid_from !== null ? new Date(row.valid_from) : undefined,
    validUntil: row.valid_until !== null ? new Date(row.valid_until) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
