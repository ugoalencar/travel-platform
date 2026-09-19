/**
 * Commissions -- commission plan config, employees, commission entries,
 * employee deductions, and payroll entries.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getTenantContext, getUserId, requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import {
  parseObjectBody,
  parseRequiredString,
} from '../request-parsing';
import { assertNotRestricted } from '../permission-restrictions';
import {
  createCommissionPlan,
  deleteCommissionPlan,
  getCommissionPlanById,
  listCommissionPlans,
  updateCommissionPlan,
  type CreateCommissionPlanInput,
  type UpdateCommissionPlanInput,
} from '../commission-plans';
import {
  createEmployee,
  deleteEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from '../employees';
import {
  approveCommissionEntry,
  createPayableFromCommissionEntry,
  generateCommission,
  getCommissionEntryById,
  listCommissionEntries,
  type GenerateCommissionInput,
} from '../commissions';
import {
  createEmployeeCommissionRule,
  getEmployeeCommissionRuleById,
  listEmployeeCommissionRules,
  updateEmployeeCommissionRuleStatus,
  type EmployeeCommissionRuleInput,
} from '../employee-commission-rules';
import {
  generateEmployeeCommission,
  getEmployeeCommissionsReport,
  listMyCommissionEntries,
  type GenerateEmployeeCommissionInput,
} from '../employee-commissions';
import { EmployeeCommissionCalculationType, EmployeeCommissionRuleStatus } from '../../../../packages/domain/types';
import {
  approvePayrollEntry,
  createEmployeeDeduction,
  deleteEmployeeDeduction,
  generatePayrollEntry,
  getPayrollEntryById,
  listEmployeeDeductions,
  listPayrollEntries,
  payPayrollEntry,
  type CreateEmployeeDeductionInput,
  type GeneratePayrollInput,
} from '../payroll';

export interface CommissionsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerCommissionsRoutes(
  app: FastifyInstance,
  options: CommissionsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // COMMISSION PLANS
  // ============================================================
  app.get('/commission-plans', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const includeInactive = query.includeInactive === 'true';
    const commissionPlans = await listCommissionPlans(database, includeInactive);
    return { commissionPlans };
  });

  app.get<{ Params: { id: string } }>(
    '/commission-plans/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const commissionPlan = await getCommissionPlanById(database, request.params.id);
      if (!commissionPlan) {
        reply.code(404);
        return { error: 'Commission plan not found' };
      }
      return { commissionPlan };
    },
  );

  app.post('/commission-plans', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateCommissionPlanInput(request.body);
    const commissionPlan = await createCommissionPlan(database, data);
    reply.code(201);
    return { commissionPlan };
  });

  app.patch<{ Params: { id: string } }>(
    '/commission-plans/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const data = parseUpdateCommissionPlanInput(request.body);
      const commissionPlan = await updateCommissionPlan(database, request.params.id, data);
      if (!commissionPlan) {
        reply.code(404);
        return { error: 'Commission plan not found' };
      }
      return { commissionPlan };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/commission-plans/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const deleted = await deleteCommissionPlan(database, request.params.id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Commission plan not found' };
      }
      return { success: true };
    },
  );

  // ============================================================
  // EMPLOYEES
  // ============================================================
  app.get('/employees', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const restrictionContext = getTenantContext();
    await database.withTenantTransaction((client) =>
      assertNotRestricted(client, restrictionContext.userRole, 'employees', 'view'),
    );
    const query = request.query as Record<string, string>;
    const employees = await listEmployees(database, { status: query.status });
    return { employees };
  });

  app.get<{ Params: { id: string } }>(
    '/employees/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const employee = await getEmployeeById(database, request.params.id);
      if (!employee) {
        reply.code(404);
        return { error: 'Employee not found' };
      }
      return { employee };
    },
  );

  app.post('/employees', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateEmployeeInput(request.body);
    const employee = await createEmployee(database, data);
    reply.code(201);
    return { employee };
  });

  app.patch<{ Params: { id: string } }>(
    '/employees/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const data = parseUpdateEmployeeInput(request.body);
      const employee = await updateEmployee(database, request.params.id, data);
      if (!employee) {
        reply.code(404);
        return { error: 'Employee not found' };
      }
      return { employee };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/employees/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const deleted = await deleteEmployee(database, request.params.id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Employee not found' };
      }
      return { success: true };
    },
  );

  // ============================================================
  // COMMISSION ENTRIES
  // ============================================================
  app.get('/commissions', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const commissions = await listCommissionEntries(database, {
      employeeId: query.employeeId,
      saleId: query.saleId,
      status: query.status,
    });
    return { commissions };
  });

  app.get<{ Params: { id: string } }>(
    '/commissions/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const commission = await getCommissionEntryById(database, request.params.id);
      if (!commission) {
        reply.code(404);
        return { error: 'Commission entry not found' };
      }
      return { commission };
    },
  );

  app.post('/commissions/generate', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseGenerateCommissionInput(request.body);
    const commission = await generateCommission(database, data);
    reply.code(201);
    return { commission };
  });

  app.patch<{ Params: { id: string } }>(
    '/commissions/:id/approve',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const commission = await approveCommissionEntry(database, request.params.id, getUserId());
      if (!commission) {
        reply.code(404);
        return { error: 'Commission entry not found' };
      }
      return { commission };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/commissions/:id/create-payable',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const result = await createPayableFromCommissionEntry(database, request.params.id);
      reply.code(201);
      return result;
    },
  );

  // ============================================================
  // EMPLOYEE COMMISSION RULES (per employee, per product type --
  // Comissionamento por Funcionário e Produto)
  // ============================================================
  app.get('/employee-commission-rules', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const rules = await listEmployeeCommissionRules(database, {
      employeeId: query.employeeId,
      productType: query.productType,
    });
    return { rules };
  });

  app.get<{ Params: { id: string } }>(
    '/employee-commission-rules/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const rule = await getEmployeeCommissionRuleById(database, request.params.id);
      if (!rule) {
        reply.code(404);
        return { error: 'Commission rule not found' };
      }
      return { rule };
    },
  );

  // Rule management restricted to ADMIN+ (spec: "Não permitir que AGENT
  // altere sua própria regra" -- and MANAGER cannot either; only ADMIN/OWNER).
  app.post('/employee-commission-rules', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseEmployeeCommissionRuleInput(request.body);
    const rule = await createEmployeeCommissionRule(database, data, getUserId());
    reply.code(201);
    return { rule };
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>(
    '/employee-commission-rules/:id/status',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const status = request.body?.status as EmployeeCommissionRuleStatus | undefined;
      if (!status || !Object.values(EmployeeCommissionRuleStatus).includes(status)) {
        throw new ValidationError('Field "status" is invalid');
      }
      const rule = await updateEmployeeCommissionRuleStatus(database, request.params.id, status);
      if (!rule) {
        reply.code(404);
        return { error: 'Commission rule not found' };
      }
      return { rule };
    },
  );

  // ============================================================
  // EMPLOYEE COMMISSIONS -- per-product generation, self-view, report
  // ============================================================

  // Same AGENT-allowed gate as the pre-existing /commissions/generate --
  // generation triggers a real, backend-computed commission from a real
  // rule; it never accepts a commission amount/rate from the client.
  app.post(
    '/commissions/generate-by-product',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const data = parseGenerateEmployeeCommissionInput(request.body);
      const commission = await generateEmployeeCommission(database, data);
      reply.code(201);
      return { commission };
    },
  );

  // Self-view: strictly the calling user's own linked employee record --
  // never accepts an employeeId query param. Available to AGENT+ (spec:
  // "Um agente poderá visualizar suas próprias comissões").
  app.get('/commissions/mine', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.AGENT);
    const commissions = await listMyCommissionEntries(database, getUserId());
    return { commissions };
  });

  app.get('/commissions/report', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const rows = await getEmployeeCommissionsReport(database, {
      employeeId: query.employeeId,
      productType: query.productType,
      status: query.status,
      from: query.from,
      to: query.to,
    });
    return { rows };
  });

  // ============================================================
  // EMPLOYEE DEDUCTIONS
  // ============================================================
  app.get('/employee-deductions', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const deductions = await listEmployeeDeductions(database, {
      employeeId: query.employeeId,
      competence: query.competence,
    });
    return { deductions };
  });

  app.post('/employee-deductions', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateEmployeeDeductionInput(request.body);
    const deduction = await createEmployeeDeduction(database, data);
    reply.code(201);
    return { deduction };
  });

  app.delete<{ Params: { id: string } }>(
    '/employee-deductions/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const deleted = await deleteEmployeeDeduction(database, request.params.id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Deduction not found' };
      }
      return { success: true };
    },
  );

  // ============================================================
  // PAYROLL ENTRIES
  // ============================================================
  app.get('/payroll-entries', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const payrollEntries = await listPayrollEntries(database, {
      employeeId: query.employeeId,
      status: query.status,
    });
    return { payrollEntries };
  });

  app.get<{ Params: { id: string } }>(
    '/payroll-entries/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const payrollEntry = await getPayrollEntryById(database, request.params.id);
      if (!payrollEntry) {
        reply.code(404);
        return { error: 'Payroll entry not found' };
      }
      return { payrollEntry };
    },
  );

  app.post('/payroll-entries/generate', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseGeneratePayrollInput(request.body);
    const payrollEntry = await generatePayrollEntry(database, data);
    reply.code(201);
    return { payrollEntry };
  });

  app.patch<{ Params: { id: string } }>(
    '/payroll-entries/:id/approve',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const payrollEntry = await approvePayrollEntry(database, request.params.id);
      if (!payrollEntry) {
        reply.code(404);
        return { error: 'Payroll entry not found' };
      }
      return { payrollEntry };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/payroll-entries/:id/pay',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const result = await payPayrollEntry(database, request.params.id);
      reply.code(201);
      return result;
    },
  );
}

// ============================================================
// Parsers
// ============================================================

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseCreateCommissionPlanInput(body: unknown): CreateCommissionPlanInput {
  const record = parseObjectBody(body);
  const name = parseRequiredString(record.name, 'name');
  const calculationType = record.calculationType as CreateCommissionPlanInput['calculationType'];
  if (
    !calculationType ||
    !['PERCENT_SALE', 'PERCENT_MARGIN', 'FIXED', 'PRODUCT', 'DESTINATION', 'TIERED_TARGET'].includes(
      calculationType,
    )
  ) {
    throw new ValidationError('Field "calculationType" is invalid');
  }
  return {
    name,
    calculationType,
    percentage: optionalNumber(record.percentage),
    fixedAmount: optionalNumber(record.fixedAmount),
    rules:
      typeof record.rules === 'object' && record.rules !== null
        ? (record.rules as Record<string, unknown>)
        : undefined,
    active: typeof record.active === 'boolean' ? record.active : undefined,
    validFrom: optionalTrimmedString(record.validFrom),
    validUntil: optionalTrimmedString(record.validUntil),
  };
}

function parseUpdateCommissionPlanInput(body: unknown): UpdateCommissionPlanInput {
  const record = parseObjectBody(body);
  const data: UpdateCommissionPlanInput = {};
  if (typeof record.name === 'string') {
    data.name = parseRequiredString(record.name, 'name');
  }
  if (record.calculationType !== undefined) {
    data.calculationType = record.calculationType as CreateCommissionPlanInput['calculationType'];
  }
  if (record.percentage !== undefined) {
    data.percentage = optionalNumber(record.percentage);
  }
  if (record.fixedAmount !== undefined) {
    data.fixedAmount = optionalNumber(record.fixedAmount);
  }
  if (record.rules !== undefined) {
    data.rules =
      typeof record.rules === 'object' && record.rules !== null
        ? (record.rules as Record<string, unknown>)
        : undefined;
  }
  if (typeof record.active === 'boolean') {
    data.active = record.active;
  }
  if (record.validFrom !== undefined) {
    data.validFrom = optionalTrimmedString(record.validFrom);
  }
  if (record.validUntil !== undefined) {
    data.validUntil = optionalTrimmedString(record.validUntil);
  }
  return data;
}

const EMPLOYEE_STRING_FIELDS = [
  'cpf',
  'rg',
  'birthDate',
  'addressLine',
  'addressCity',
  'addressState',
  'addressZipCode',
  'phone',
  'email',
  'hireDate',
  'terminationDate',
  'roleTitle',
  'department',
  'costCenterId',
  'managerId',
  'bankName',
  'bankBranch',
  'bankAccount',
  'bankPixKey',
  'notes',
  'userId',
  'defaultCommissionPlanId',
] as const;

function parseCreateEmployeeInput(body: unknown): CreateEmployeeInput {
  const record = parseObjectBody(body);
  const name = parseRequiredString(record.name, 'name');

  if (
    record.employmentType !== undefined &&
    !['EMPLOYEE', 'CONTRACTOR', 'PARTNER', 'FREELANCER', 'OTHER'].includes(
      record.employmentType as string,
    )
  ) {
    throw new ValidationError('Field "employmentType" is invalid');
  }
  if (
    record.status !== undefined &&
    !['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED'].includes(record.status as string)
  ) {
    throw new ValidationError('Field "status" is invalid');
  }

  const data: CreateEmployeeInput = { name };
  for (const field of EMPLOYEE_STRING_FIELDS) {
    data[field] = optionalTrimmedString(record[field]);
  }
  if (record.employmentType !== undefined) {
    data.employmentType = record.employmentType as CreateEmployeeInput['employmentType'];
  }
  if (record.status !== undefined) {
    data.status = record.status as CreateEmployeeInput['status'];
  }
  data.baseSalary = optionalNumber(record.baseSalary);
  return data;
}

function parseUpdateEmployeeInput(body: unknown): UpdateEmployeeInput {
  const record = parseObjectBody(body);
  const data: UpdateEmployeeInput = {};
  if (typeof record.name === 'string') {
    data.name = parseRequiredString(record.name, 'name');
  }
  if (
    record.employmentType !== undefined &&
    !['EMPLOYEE', 'CONTRACTOR', 'PARTNER', 'FREELANCER', 'OTHER'].includes(
      record.employmentType as string,
    )
  ) {
    throw new ValidationError('Field "employmentType" is invalid');
  }
  if (
    record.status !== undefined &&
    !['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED'].includes(record.status as string)
  ) {
    throw new ValidationError('Field "status" is invalid');
  }
  for (const field of EMPLOYEE_STRING_FIELDS) {
    if (record[field] !== undefined) {
      data[field] = optionalTrimmedString(record[field]);
    }
  }
  if (record.employmentType !== undefined) {
    data.employmentType = record.employmentType as CreateEmployeeInput['employmentType'];
  }
  if (record.status !== undefined) {
    data.status = record.status as CreateEmployeeInput['status'];
  }
  if (record.baseSalary !== undefined) {
    data.baseSalary = optionalNumber(record.baseSalary);
  }
  return data;
}

function parseGenerateCommissionInput(body: unknown): GenerateCommissionInput {
  const record = parseObjectBody(body);
  const saleId = parseRequiredString(record.saleId, 'saleId');
  const employeeId = parseRequiredString(record.employeeId, 'employeeId');
  return {
    saleId,
    employeeId,
    commissionPlanId: optionalTrimmedString(record.commissionPlanId),
    notes: optionalTrimmedString(record.notes),
  };
}

const VALID_PRODUCT_TYPES = ['AIR', 'EXCURSION', 'LAND', 'INSURANCE', 'PACKAGE', 'HOTEL', 'TRANSFER'];
const VALID_CALC_TYPES = Object.values(EmployeeCommissionCalculationType) as string[];
const VALID_BASES = [
  'PRODUCT_TOTAL',
  'PACKAGE_TOTAL',
  'PER_PASSENGER',
  'PER_TICKET',
  'FIXED_PER_PASSENGER',
  'FIXED_PER_TICKET',
  'FIXED_PER_SALE',
];

function parseEmployeeCommissionRuleInput(body: unknown): EmployeeCommissionRuleInput {
  const record = parseObjectBody(body);
  const employeeId = parseRequiredString(record.employeeId, 'employeeId');
  const productType = record.productType as EmployeeCommissionRuleInput['productType'];
  if (!productType || !VALID_PRODUCT_TYPES.includes(productType)) {
    throw new ValidationError('Field "productType" is invalid');
  }
  const calculationType = record.calculationType as EmployeeCommissionRuleInput['calculationType'];
  if (!calculationType || !VALID_CALC_TYPES.includes(calculationType)) {
    throw new ValidationError('Field "calculationType" is invalid');
  }
  const calculationBasis = record.calculationBasis as EmployeeCommissionRuleInput['calculationBasis'];
  if (!calculationBasis || !VALID_BASES.includes(calculationBasis)) {
    throw new ValidationError('Field "calculationBasis" is invalid');
  }
  return {
    employeeId,
    productType,
    calculationType,
    calculationBasis,
    percentageRate: optionalNumber(record.percentageRate),
    fixedAmount: optionalNumber(record.fixedAmount),
    currency: optionalTrimmedString(record.currency),
    validFrom: optionalTrimmedString(record.validFrom),
    validUntil: optionalTrimmedString(record.validUntil),
  };
}

function parseGenerateEmployeeCommissionInput(body: unknown): GenerateEmployeeCommissionInput {
  const record = parseObjectBody(body);
  const saleId = parseRequiredString(record.saleId, 'saleId');
  const employeeId = parseRequiredString(record.employeeId, 'employeeId');
  const productType = record.productType as GenerateEmployeeCommissionInput['productType'];
  if (!productType || !VALID_PRODUCT_TYPES.includes(productType)) {
    throw new ValidationError('Field "productType" is invalid');
  }
  return {
    saleId,
    employeeId,
    productType,
    sourceItemId: optionalTrimmedString(record.sourceItemId),
    manualBaseAmount: optionalNumber(record.manualBaseAmount),
    manualQuantity: optionalNumber(record.manualQuantity),
    notes: optionalTrimmedString(record.notes),
  };
}

function parseCreateEmployeeDeductionInput(body: unknown): CreateEmployeeDeductionInput {
  const record = parseObjectBody(body);
  const employeeId = parseRequiredString(record.employeeId, 'employeeId');
  const competence = parseRequiredString(record.competence, 'competence');
  const type = record.type as CreateEmployeeDeductionInput['type'];
  if (!type || !['ADVANCE', 'ABSENCE', 'BENEFIT', 'LOAN', 'ADJUSTMENT', 'OTHER'].includes(type)) {
    throw new ValidationError('Field "type" is invalid');
  }
  const amount = optionalNumber(record.amount);
  if (amount === undefined) {
    throw new ValidationError('Field "amount" is required');
  }
  return {
    employeeId,
    competence,
    type,
    description: optionalTrimmedString(record.description),
    amount,
    notes: optionalTrimmedString(record.notes),
  };
}

function parseGeneratePayrollInput(body: unknown): GeneratePayrollInput {
  const record = parseObjectBody(body);
  const employeeId = parseRequiredString(record.employeeId, 'employeeId');
  const competence = parseRequiredString(record.competence, 'competence');
  return {
    employeeId,
    competence,
    benefits: optionalNumber(record.benefits),
    bonuses: optionalNumber(record.bonuses),
    reimbursements: optionalNumber(record.reimbursements),
    additions: optionalNumber(record.additions),
    dueDate: optionalTrimmedString(record.dueDate),
    notes: optionalTrimmedString(record.notes),
  };
}
