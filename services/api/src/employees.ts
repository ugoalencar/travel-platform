import { EmployeeStatus, EmploymentType, type Employee } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';

interface EmployeeRow {
  id: string;
  agency_id: string;
  name: string;
  cpf: string | null;
  rg: string | null;
  birth_date: string | null;
  address_line: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip_code: string | null;
  phone: string | null;
  email: string | null;
  hire_date: string | null;
  termination_date: string | null;
  employment_type: EmploymentType;
  role_title: string | null;
  department: string | null;
  cost_center_id: string | null;
  manager_id: string | null;
  status: EmployeeStatus;
  base_salary: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  bank_pix_key: string | null;
  notes: string | null;
  user_id: string | null;
  default_commission_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeInput {
  name: string;
  cpf?: string | undefined;
  rg?: string | undefined;
  birthDate?: string | undefined;
  addressLine?: string | undefined;
  addressCity?: string | undefined;
  addressState?: string | undefined;
  addressZipCode?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  hireDate?: string | undefined;
  terminationDate?: string | undefined;
  employmentType?: EmploymentType | undefined;
  roleTitle?: string | undefined;
  department?: string | undefined;
  costCenterId?: string | undefined;
  managerId?: string | undefined;
  status?: EmployeeStatus | undefined;
  baseSalary?: number | undefined;
  bankName?: string | undefined;
  bankBranch?: string | undefined;
  bankAccount?: string | undefined;
  bankPixKey?: string | undefined;
  notes?: string | undefined;
  userId?: string | undefined;
  defaultCommissionPlanId?: string | undefined;
}

export type CreateEmployeeInput = EmployeeInput;
export type UpdateEmployeeInput = Partial<EmployeeInput>;

const EMPLOYEE_COLUMNS = `id, agency_id, name, cpf, rg, birth_date, address_line, address_city, address_state,
  address_zip_code, phone, email, hire_date, termination_date, employment_type, role_title, department,
  cost_center_id, manager_id, status, base_salary, bank_name, bank_branch, bank_account, bank_pix_key,
  notes, user_id, default_commission_plan_id, created_at, updated_at`;

const VALID_EMPLOYMENT_TYPES = new Set(Object.values(EmploymentType));
const VALID_STATUSES = new Set(Object.values(EmployeeStatus));

function assertRequiredFields(data: CreateEmployeeInput): void {
  if (!data.name || data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }
  if (data.employmentType !== undefined && !VALID_EMPLOYMENT_TYPES.has(data.employmentType)) {
    throw new ValidationError('Field "employmentType" is invalid');
  }
  if (data.status !== undefined && !VALID_STATUSES.has(data.status)) {
    throw new ValidationError('Field "status" is invalid');
  }
}

export async function listEmployees(
  database: DatabaseRuntime,
  filters: { status?: string | undefined } = {},
): Promise<Employee[]> {
  const agencyId = getAgencyId();

  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
      values,
    );
    return result.rows;
  });

  return rows.map(toEmployee);
}

export async function getEmployeeById(database: DatabaseRuntime, id: string): Promise<Employee | null> {
  const agencyId = getAgencyId();

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return result.rows[0] ?? null;
  });

  return row ? toEmployee(row) : null;
}

export async function createEmployee(
  database: DatabaseRuntime,
  data: CreateEmployeeInput,
): Promise<Employee> {
  const agencyId = getAgencyId();
  assertRequiredFields(data);

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeRow>(
      `INSERT INTO employees (
         agency_id, name, cpf, rg, birth_date, address_line, address_city, address_state, address_zip_code,
         phone, email, hire_date, termination_date, employment_type, role_title, department, cost_center_id,
         manager_id, status, base_salary, bank_name, bank_branch, bank_account, bank_pix_key, notes, user_id,
         default_commission_plan_id
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
         $22, $23, $24, $25, $26, $27
       )
       RETURNING ${EMPLOYEE_COLUMNS}`,
      [
        agencyId,
        data.name.trim(),
        data.cpf ?? null,
        data.rg ?? null,
        data.birthDate ?? null,
        data.addressLine ?? null,
        data.addressCity ?? null,
        data.addressState ?? null,
        data.addressZipCode ?? null,
        data.phone ?? null,
        data.email ?? null,
        data.hireDate ?? null,
        data.terminationDate ?? null,
        data.employmentType ?? 'EMPLOYEE',
        data.roleTitle ?? null,
        data.department ?? null,
        data.costCenterId ?? null,
        data.managerId ?? null,
        data.status ?? 'ACTIVE',
        data.baseSalary ?? null,
        data.bankName ?? null,
        data.bankBranch ?? null,
        data.bankAccount ?? null,
        data.bankPixKey ?? null,
        data.notes ?? null,
        data.userId ?? null,
        data.defaultCommissionPlanId ?? null,
      ],
    );
    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error('Employee insert did not return a row');
    }
    return inserted;
  });

  return toEmployee(row);
}

const UPDATE_COLUMN_MAP: Array<[keyof UpdateEmployeeInput, string]> = [
  ['name', 'name'],
  ['cpf', 'cpf'],
  ['rg', 'rg'],
  ['birthDate', 'birth_date'],
  ['addressLine', 'address_line'],
  ['addressCity', 'address_city'],
  ['addressState', 'address_state'],
  ['addressZipCode', 'address_zip_code'],
  ['phone', 'phone'],
  ['email', 'email'],
  ['hireDate', 'hire_date'],
  ['terminationDate', 'termination_date'],
  ['employmentType', 'employment_type'],
  ['roleTitle', 'role_title'],
  ['department', 'department'],
  ['costCenterId', 'cost_center_id'],
  ['managerId', 'manager_id'],
  ['status', 'status'],
  ['baseSalary', 'base_salary'],
  ['bankName', 'bank_name'],
  ['bankBranch', 'bank_branch'],
  ['bankAccount', 'bank_account'],
  ['bankPixKey', 'bank_pix_key'],
  ['notes', 'notes'],
  ['userId', 'user_id'],
  ['defaultCommissionPlanId', 'default_commission_plan_id'],
];

export async function updateEmployee(
  database: DatabaseRuntime,
  id: string,
  data: UpdateEmployeeInput,
): Promise<Employee | null> {
  const agencyId = getAgencyId();

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }
  if (data.employmentType !== undefined && !VALID_EMPLOYMENT_TYPES.has(data.employmentType)) {
    throw new ValidationError('Field "employmentType" is invalid');
  }
  if (data.status !== undefined && !VALID_STATUSES.has(data.status)) {
    throw new ValidationError('Field "status" is invalid');
  }
  if (data.managerId !== undefined && data.managerId === id) {
    throw new ValidationError('An employee cannot be their own manager');
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

  if (fields.length === 0) {
    return getEmployeeById(database, id);
  }

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<EmployeeRow>(
      `UPDATE employees SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${EMPLOYEE_COLUMNS}`,
      [agencyId, ...values, id],
    );
    return result.rows[0] ?? null;
  });

  return row ? toEmployee(row) : null;
}

export async function deleteEmployee(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();

  const deleted = await database.withTenantTransaction(async (client) => {
    const result = await client.query(`DELETE FROM employees WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  });

  return deleted;
}

function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    cpf: row.cpf ?? undefined,
    rg: row.rg ?? undefined,
    birthDate: row.birth_date !== null ? new Date(row.birth_date) : undefined,
    addressLine: row.address_line ?? undefined,
    addressCity: row.address_city ?? undefined,
    addressState: row.address_state ?? undefined,
    addressZipCode: row.address_zip_code ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    hireDate: row.hire_date !== null ? new Date(row.hire_date) : undefined,
    terminationDate: row.termination_date !== null ? new Date(row.termination_date) : undefined,
    employmentType: row.employment_type,
    roleTitle: row.role_title ?? undefined,
    department: row.department ?? undefined,
    costCenterId: row.cost_center_id ?? undefined,
    managerId: row.manager_id ?? undefined,
    status: row.status,
    baseSalary: row.base_salary !== null ? Number(row.base_salary) : undefined,
    bankName: row.bank_name ?? undefined,
    bankBranch: row.bank_branch ?? undefined,
    bankAccount: row.bank_account ?? undefined,
    bankPixKey: row.bank_pix_key ?? undefined,
    notes: row.notes ?? undefined,
    userId: row.user_id ?? undefined,
    defaultCommissionPlanId: row.default_commission_plan_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
