/**
 * Financial -- all financial sub-domains: receivables, payables, payments,
 * operational costs, allocations, categories, revenues, expenses, cash
 * transactions, reconciliations, DRE, and financial reports.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getTenantContext, requireRole } from '../../../../packages/domain/tenant-context';
import {
  PaymentDirection,
  UserRole,
  type CashTransactionType,
  type FinancialCategoryType,
} from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { requireRoleOrAreaGrant } from '../area-grants';
import {
  parseObjectBody,
  assertAllowedFields,
  parseNonNegativeNumber,
  parsePositiveNumber,
  parseRequiredDate,
  parseRequiredString,
  parseUuidParam,
} from '../request-parsing';
import {
  allocatePayment,
  cancelExpense,
  cancelRevenue,
  createExpense,
  createFinancialCategory,
  createOperationalCost,
  createPayable,
  createReceivable,
  createRevenue,
  markExpenseAsPaid,
  markRevenueAsPaid,
  createReconciliation,
  createCashTransaction,
  getCashFlowSummary,
  getCashBalance,
  getFinancialSummary,
  getSaleFinancialStory,
  getSaleMargin,
  getExpense,
  getRevenue,
  getDREReport,
  getManagementDre,
  getOverdueReport,
  getMarginReport,
  getCashFlowReport,
  listAllocationsForTarget,
  listCashTransactions,
  listExpenses,
  listFinancialCategories,
  listOperationalCosts,
  listPaymentAllocations,
  listPayables,
  listPayments,
  listReceivables,
  listReconciliations,
  listRevenues,
  markReconciliationAsReconciled,
  recordPayment,
  updateExpense,
  updateRevenue,
  type CashFlowPeriod,
  type CreateCashTransactionInput,
  type CreateExpenseInput,
  type CreateFinancialCategoryInput,
  type CreateOperationalCostInput,
  type CreatePayableInput,
  type CreatePaymentAllocationInput,
  type CreateReceivableInput,
  type CreateReconciliationInput,
  type CreateRevenueInput,
  type RecordPaymentInput,
  type UpdateExpenseInput,
  type UpdateRevenueInput,
} from '../financial';
import { assertNotRestricted } from '../permission-restrictions';

export interface FinancialRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerFinancialRoutes(
  app: FastifyInstance,
  options: FinancialRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // RECEIVABLES
  // ============================================================
  app.get('/financial/receivables', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const receivables = await listReceivables(database);
    return { receivables };
  });

  app.post('/financial/receivables', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateReceivableInput(request.body);
    const receivable = await createReceivable(database, data);
    reply.code(201);
    return { receivable };
  });

  // ============================================================
  // PAYABLES
  // ============================================================
  app.get('/financial/payables', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const payables = await listPayables(database);
    return { payables };
  });

  app.post('/financial/payables', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreatePayableInput(request.body);
    const payable = await createPayable(database, data);
    reply.code(201);
    return { payable };
  });

  // ============================================================
  // PAYMENTS
  // ============================================================
  app.get('/financial/payments', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const payments = await listPayments(database);
    return { payments };
  });

  app.post('/financial/payments', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseRecordPaymentInput(request.body);
    const payment = await recordPayment(database, data);
    reply.code(201);
    return { payment };
  });

  app.get<{ Params: { id: string } }>(
    '/financial/payments/:id/allocations',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const allocations = await listPaymentAllocations(database, request.params.id);
      return { allocations };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/financial/payments/:id/allocations',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const allocations = parsePaymentAllocationsInput(request.body);
      return allocatePayment(database, request.params.id, allocations);
    }
  );

  // ============================================================
  // OPERATIONAL COSTS
  // ============================================================
  app.get('/financial/operational-costs', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const operationalCosts = await listOperationalCosts(database);
    return { operationalCosts };
  });

  app.post(
    '/financial/operational-costs',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const data = parseCreateOperationalCostInput(request.body);
      const operationalCost = await createOperationalCost(database, data);
      reply.code(201);
      return { operationalCost };
    }
  );

  // ============================================================
  // ALLOCATIONS
  // ============================================================
  app.get('/financial/allocations', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const target: { receivableId?: string; payableId?: string } = {};
    if (query.receivableId) target.receivableId = query.receivableId;
    if (query.payableId) target.payableId = query.payableId;
    const allocations = await listAllocationsForTarget(database, target);
    return { allocations };
  });

  // ============================================================
  // SALE MARGIN / STORY
  // ============================================================
  app.get<{ Params: { id: string } }>(
    '/financial/sales/:id/margin',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const margin = await getSaleMargin(database, request.params.id);
      return { margin };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/financial/sales/:id/story',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const saleId = parseUuidParam(request.params.id, 'saleId');
      const story = await getSaleFinancialStory(database, saleId);
      return { story };
    }
  );

  // ============================================================
  // DASHBOARD / SUMMARY
  // ============================================================
  app.get('/financial/dashboard', { preHandler: protectedHooks }, async (request) => {
    await requireRoleOrAreaGrant(database, UserRole.MANAGER, 'FINANCIAL');
    const restrictionContext = getTenantContext();
    await database.withTenantTransaction((client) =>
      assertNotRestricted(client, restrictionContext.userRole, 'financial', 'view'),
    );
    const period = parseCashFlowPeriod(request.query);
    const cashFlow = await getCashFlowSummary(database, period);
    return { cashFlow };
  });

  app.get('/financial/summary', { preHandler: protectedHooks }, async () => {
    await requireRoleOrAreaGrant(database, UserRole.MANAGER, 'FINANCIAL');
    const summary = await getFinancialSummary(database);
    return { summary };
  });

  // ============================================================
  // CATEGORIES
  // ============================================================
  app.get('/financial/categories', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const type = query.type;
    const categories = await listFinancialCategories(database, type);
    return { categories };
  });

  app.post('/financial/categories', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateFinancialCategoryInput(request.body);
    const category = await createFinancialCategory(database, data);
    reply.code(201);
    return { category };
  });

  // ============================================================
  // REVENUES
  // ============================================================
  app.get('/financial/revenues', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const filters: {
      status?: string;
      customerId?: string;
      categoryId?: string;
      periodFrom?: Date;
      periodTo?: Date;
    } = {};
    if (query.status) filters.status = query.status;
    if (query.customerId) filters.customerId = query.customerId;
    if (query.categoryId) filters.categoryId = query.categoryId;
    if (query.periodFrom) filters.periodFrom = new Date(query.periodFrom);
    if (query.periodTo) filters.periodTo = new Date(query.periodTo);
    const revenues = await listRevenues(database, filters as Parameters<typeof listRevenues>[1]);
    return { revenues };
  });

  app.get<{ Params: { id: string } }>(
    '/financial/revenues/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const revenue = await getRevenue(database, request.params.id);
      return { revenue };
    }
  );

  app.post('/financial/revenues', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateRevenueInput(request.body);
    const revenue = await createRevenue(database, data);
    reply.code(201);
    return { revenue };
  });

  app.patch<{ Params: { id: string } }>(
    '/financial/revenues/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const data = parseUpdateRevenueInput(request.body);
      const revenue = await updateRevenue(database, request.params.id, data);
      return { revenue };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/financial/revenues/:id/mark-paid',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const body = request.body as { partialAmount?: number };
      const partialAmount = body?.partialAmount;
      const revenue = await markRevenueAsPaid(database, request.params.id, partialAmount);
      return { revenue };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/financial/revenues/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const revenue = await cancelRevenue(database, request.params.id);
      return { revenue };
    }
  );

  // ============================================================
  // EXPENSES
  // ============================================================
  app.get('/financial/expenses', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const filters: {
      status?: string;
      supplierId?: string;
      categoryId?: string;
      periodFrom?: Date;
      periodTo?: Date;
    } = {};
    if (query.status) filters.status = query.status;
    if (query.supplierId) filters.supplierId = query.supplierId;
    if (query.categoryId) filters.categoryId = query.categoryId;
    if (query.periodFrom) filters.periodFrom = new Date(query.periodFrom);
    if (query.periodTo) filters.periodTo = new Date(query.periodTo);
    const expenses = await listExpenses(database, filters as Parameters<typeof listExpenses>[1]);
    return { expenses };
  });

  app.get<{ Params: { id: string } }>(
    '/financial/expenses/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const expense = await getExpense(database, request.params.id);
      return { expense };
    }
  );

  app.post('/financial/expenses', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateExpenseInput(request.body);
    const expense = await createExpense(database, data);
    reply.code(201);
    return { expense };
  });

  app.patch<{ Params: { id: string } }>(
    '/financial/expenses/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const data = parseUpdateExpenseInput(request.body);
      const expense = await updateExpense(database, request.params.id, data);
      return { expense };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/financial/expenses/:id/mark-paid',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const body = request.body as { partialAmount?: number };
      const partialAmount = body?.partialAmount;
      const expense = await markExpenseAsPaid(database, request.params.id, partialAmount);
      return { expense };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/financial/expenses/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const expense = await cancelExpense(database, request.params.id);
      return { expense };
    }
  );

  // ============================================================
  // CASH TRANSACTIONS
  // ============================================================
  app.get('/financial/cash-transactions', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const filters: {
      type?: string;
      periodFrom?: Date;
      periodTo?: Date;
    } = {};
    if (query.type) filters.type = query.type;
    if (query.periodFrom) filters.periodFrom = new Date(query.periodFrom);
    if (query.periodTo) filters.periodTo = new Date(query.periodTo);
    const transactions = await listCashTransactions(database, filters as Parameters<typeof listCashTransactions>[1]);
    return { transactions };
  });

  app.post('/financial/cash-transactions', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateCashTransactionInput(request.body);
    const transaction = await createCashTransaction(database, data);
    reply.code(201);
    return { transaction };
  });

  app.get('/financial/cash-balance', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const asOf = query.asOf ? new Date(query.asOf) : undefined;
    const balance = await getCashBalance(database, asOf);
    return { balance };
  });

  // ============================================================
  // RECONCILIATIONS
  // ============================================================
  app.get('/financial/reconciliations', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const filters: {
      status?: string;
      periodFrom?: Date;
      periodTo?: Date;
    } = {};
    if (query.status) filters.status = query.status;
    if (query.periodFrom) filters.periodFrom = new Date(query.periodFrom);
    if (query.periodTo) filters.periodTo = new Date(query.periodTo);
    const reconciliations = await listReconciliations(database, filters as Parameters<typeof listReconciliations>[1]);
    return { reconciliations };
  });

  app.post('/financial/reconciliations', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateReconciliationInput(request.body);
    const reconciliation = await createReconciliation(database, data);
    reply.code(201);
    return { reconciliation };
  });

  app.post<{ Params: { id: string } }>(
    '/financial/reconciliations/:id/mark-reconciled',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const reconciliation = await markReconciliationAsReconciled(database, request.params.id);
      return { reconciliation };
    }
  );

  // ============================================================
  // FINANCIAL REPORTS
  // ============================================================
  app.get('/financial/dre', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const periodFrom = query.from ? new Date(query.from) : new Date(0);
    const periodTo = query.to ? new Date(query.to) : new Date('2100-01-01T00:00:00.000Z');
    const dre = await getManagementDre(database, periodFrom, periodTo);
    return { dre };
  });

  app.get('/financial/reports/dre', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const periodFrom = query.start_date ? new Date(query.start_date) : new Date(new Date().setDate(1));
    const periodTo = query.end_date ? new Date(query.end_date) : new Date();
    const dre = await getDREReport(database, periodFrom, periodTo);
    return {
      report: {
        receitas_totais: dre.revenues.total,
        despesas_totais: dre.expenses.total,
        resultado_liquido: dre.margin,
        periodo: dre.period,
      },
    };
  });

  app.get('/financial/reports/overdue', { preHandler: protectedHooks }, async (_request) => {
    requireRole(UserRole.MANAGER);
    const overdue = await getOverdueReport(database);
    const allOverdue = [...overdue.receivables, ...overdue.payables];
    const agingBuckets: Array<{ start: number; end: number }> = [
      { start: 0, end: 30 },
      { start: 31, end: 60 },
      { start: 61, end: 90 },
      { start: 91, end: Infinity },
    ];
    const agingBreakdown = agingBuckets.map((bucket) => {
      const inBucket = allOverdue.filter(
        (item) => item.daysOverdue >= bucket.start && item.daysOverdue <= bucket.end,
      );
      return {
        days_overdue_start: bucket.start,
        days_overdue_end: bucket.end === Infinity ? 9999 : bucket.end,
        count: inBucket.length,
        amount: Math.round(inBucket.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
      };
    });

    return {
      report: {
        count: allOverdue.length,
        total_amount: overdue.total,
        aging_breakdown: agingBreakdown,
      },
    };
  });

  app.get('/financial/reports/margin', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const query = request.query as Record<string, string>;
    const periodFrom = query.start_date ? new Date(query.start_date) : new Date(new Date().setDate(1));
    const periodTo = query.end_date ? new Date(query.end_date) : new Date();
    const report = await getMarginReport(database, periodFrom, periodTo);
    return { report };
  });

  app.get('/financial/reports/cash-flow', { preHandler: protectedHooks }, async (_request) => {
    requireRole(UserRole.MANAGER);
    const report = await getCashFlowReport(database);
    return { report };
  });
}

// ============================================================
// Parsers
// ============================================================

const FORBIDDEN_FINANCIAL_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'status',
] as const;

const ALLOWED_RECEIVABLE_CREATE_FIELDS = [
  'saleId',
  'customerId',
  'description',
  'amount',
  'dueAt',
] as const;

const ALLOWED_PAYABLE_CREATE_FIELDS = [
  'saleId',
  'supplierId',
  'commissionId',
  'transportOperationId',
  'operationalCostId',
  'categoryId',
  'costCenterId',
  'description',
  'amount',
  'dueAt',
] as const;

const ALLOWED_PAYMENT_CREATE_FIELDS = [
  'direction',
  'amount',
  'occurredAt',
  'method',
  'reference',
  'notes',
] as const;

const ALLOWED_OPERATIONAL_COST_CREATE_FIELDS = [
  'saleId',
  'transportOperationId',
  'supplierId',
  'description',
  'costType',
  'expectedAmount',
  'actualAmount',
  'incurredAt',
] as const;

function parseCreateReceivableInput(body: unknown): CreateReceivableInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ALLOWED_RECEIVABLE_CREATE_FIELDS);

  return {
    customerId: parseRequiredString(record.customerId, 'customerId'),
    description: parseRequiredString(record.description, 'description'),
    amount: parsePositiveNumber(record.amount, 'amount'),
    dueAt: parseRequiredDate(record.dueAt, 'dueAt'),
    ...(record.saleId !== undefined
      ? { saleId: parseRequiredString(record.saleId, 'saleId') }
      : {}),
  };
}

function parseCreatePayableInput(body: unknown): CreatePayableInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ALLOWED_PAYABLE_CREATE_FIELDS);

  return {
    description: parseRequiredString(record.description, 'description'),
    amount: parsePositiveNumber(record.amount, 'amount'),
    dueAt: parseRequiredDate(record.dueAt, 'dueAt'),
    ...(record.saleId !== undefined
      ? { saleId: parseRequiredString(record.saleId, 'saleId') }
      : {}),
    ...(record.supplierId !== undefined
      ? { supplierId: parseRequiredString(record.supplierId, 'supplierId') }
      : {}),
    ...(record.commissionId !== undefined
      ? { commissionId: parseRequiredString(record.commissionId, 'commissionId') }
      : {}),
    ...(record.transportOperationId !== undefined
      ? {
          transportOperationId: parseRequiredString(
            record.transportOperationId,
            'transportOperationId'
          ),
        }
      : {}),
    ...(record.operationalCostId !== undefined
      ? { operationalCostId: parseRequiredString(record.operationalCostId, 'operationalCostId') }
      : {}),
    ...(record.categoryId !== undefined
      ? { categoryId: parseRequiredString(record.categoryId, 'categoryId') }
      : {}),
    ...(record.costCenterId !== undefined
      ? { costCenterId: parseRequiredString(record.costCenterId, 'costCenterId') }
      : {}),
  };
}

function parseRecordPaymentInput(body: unknown): RecordPaymentInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ALLOWED_PAYMENT_CREATE_FIELDS);
  if (
    typeof record.direction !== 'string' ||
    !Object.values(PaymentDirection).includes(record.direction as PaymentDirection)
  ) {
    throw new ValidationError('Field "direction" must be IN or OUT');
  }

  return {
    direction: record.direction as PaymentDirection,
    amount: parsePositiveNumber(record.amount, 'amount'),
    occurredAt: parseRequiredDate(record.occurredAt, 'occurredAt'),
    ...(record.method !== undefined
      ? { method: parseRequiredString(record.method, 'method') }
      : {}),
    ...(record.reference !== undefined
      ? { reference: parseRequiredString(record.reference, 'reference') }
      : {}),
    ...(record.notes !== undefined ? { notes: parseRequiredString(record.notes, 'notes') } : {}),
  };
}

function parsePaymentAllocationsInput(body: unknown): CreatePaymentAllocationInput[] {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ['allocations'] as const);
  if (!Array.isArray(record.allocations) || record.allocations.length === 0) {
    throw new ValidationError('Field "allocations" must be a non-empty array');
  }
  return record.allocations.map((value) => {
    const allocation = parseObjectBody(value);
    assertAllowedFields(allocation, FORBIDDEN_FINANCIAL_FIELDS, [
      'receivableId',
      'payableId',
      'amount',
    ] as const);
    return {
      amount: parsePositiveNumber(allocation.amount, 'amount'),
      ...(allocation.receivableId !== undefined
        ? { receivableId: parseRequiredString(allocation.receivableId, 'receivableId') }
        : {}),
      ...(allocation.payableId !== undefined
        ? { payableId: parseRequiredString(allocation.payableId, 'payableId') }
        : {}),
    };
  });
}

function parseCreateOperationalCostInput(body: unknown): CreateOperationalCostInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ALLOWED_OPERATIONAL_COST_CREATE_FIELDS);

  return {
    description: parseRequiredString(record.description, 'description'),
    costType: parseRequiredString(record.costType, 'costType'),
    incurredAt: parseRequiredDate(record.incurredAt, 'incurredAt'),
    ...(record.saleId !== undefined
      ? { saleId: parseRequiredString(record.saleId, 'saleId') }
      : {}),
    ...(record.transportOperationId !== undefined
      ? {
          transportOperationId: parseRequiredString(
            record.transportOperationId,
            'transportOperationId'
          ),
        }
      : {}),
    ...(record.supplierId !== undefined
      ? { supplierId: parseRequiredString(record.supplierId, 'supplierId') }
      : {}),
    ...(record.expectedAmount !== undefined
      ? { expectedAmount: parseNonNegativeNumber(record.expectedAmount, 'expectedAmount') }
      : {}),
    ...(record.actualAmount !== undefined
      ? { actualAmount: parseNonNegativeNumber(record.actualAmount, 'actualAmount') }
      : {}),
  };
}

function parseCashFlowPeriod(query: unknown): CashFlowPeriod {
  const record = parseObjectBody(query);
  return {
    from: parseRequiredDate(record.from, 'from'),
    to: parseRequiredDate(record.to, 'to'),
  };
}

function parseCreateFinancialCategoryInput(body: unknown): CreateFinancialCategoryInput {
  const record = parseObjectBody(body);
  const name = parseRequiredString(record.name, 'name');
  const type = record.type as string;
  if (!type || !['REVENUE', 'EXPENSE'].includes(type)) {
    throw new ValidationError('Field "type" must be REVENUE or EXPENSE');
  }
  let description: string | undefined;
  if (typeof record.description === 'string') {
    const trimmed = record.description.trim();
    description = trimmed.length > 0 ? trimmed : undefined;
  }
  let parentCategoryId: string | undefined;
  if (typeof record.parentCategoryId === 'string' && record.parentCategoryId.trim().length > 0) {
    parentCategoryId = record.parentCategoryId.trim();
  }

  return {
    name,
    type: type as FinancialCategoryType,
    description,
    parentCategoryId,
  };
}

function parseCreateRevenueInput(body: unknown): CreateRevenueInput {
  const record = parseObjectBody(body);
  const customerId = parseRequiredString(record.customerId, 'customerId');
  const categoryId = parseRequiredString(record.categoryId, 'categoryId');
  const description = parseRequiredString(record.description, 'description');
  const amount = parsePositiveNumber(record.amount, 'amount');
  const competencyDate = parseRequiredDate(record.competencyDate, 'competencyDate');
  const dueDate = parseRequiredDate(record.dueDate, 'dueDate');
  const saleId = typeof record.saleId === 'string' ? record.saleId : undefined;
  const bookingId = typeof record.bookingId === 'string' ? record.bookingId : undefined;
  const currency = typeof record.currency === 'string' ? record.currency : 'BRL';
  let paymentMethod: string | undefined;
  if (typeof record.paymentMethod === 'string') {
    const trimmed = record.paymentMethod.trim();
    paymentMethod = trimmed.length > 0 ? trimmed : undefined;
  }
  let notes: string | undefined;
  if (typeof record.notes === 'string') {
    const trimmed = record.notes.trim();
    notes = trimmed.length > 0 ? trimmed : undefined;
  }

  return {
    customerId,
    categoryId,
    description,
    amount,
    competencyDate,
    dueDate,
    saleId,
    bookingId,
    currency,
    paymentMethod,
    notes,
  };
}

function parseUpdateRevenueInput(body: unknown): UpdateRevenueInput {
  const record = parseObjectBody(body);
  const result: UpdateRevenueInput = {};

  if (record.categoryId !== undefined) {
    result.categoryId = parseRequiredString(record.categoryId, 'categoryId');
  }
  if (record.description !== undefined) {
    result.description = parseRequiredString(record.description, 'description');
  }
  if (record.dueDate !== undefined) {
    result.dueDate = parseRequiredDate(record.dueDate, 'dueDate');
  }
  if (record.paymentMethod !== undefined && typeof record.paymentMethod === 'string') {
    const trimmed = record.paymentMethod.trim();
    if (trimmed.length > 0) {
      result.paymentMethod = trimmed;
    }
  }
  if (record.notes !== undefined && typeof record.notes === 'string') {
    const trimmed = record.notes.trim();
    if (trimmed.length > 0) {
      result.notes = trimmed;
    }
  }

  return result;
}

function parseCreateExpenseInput(body: unknown): CreateExpenseInput {
  const record = parseObjectBody(body);
  const categoryId = parseRequiredString(record.categoryId, 'categoryId');
  const description = parseRequiredString(record.description, 'description');
  const amount = parsePositiveNumber(record.amount, 'amount');
  const incurredAt = parseRequiredDate(record.incurredAt, 'incurredAt');
  const dueDate = parseRequiredDate(record.dueDate, 'dueDate');
  const supplierId = typeof record.supplierId === 'string' ? record.supplierId : undefined;
  const currency = typeof record.currency === 'string' ? record.currency : 'BRL';
  let paymentMethod: string | undefined;
  if (typeof record.paymentMethod === 'string') {
    const trimmed = record.paymentMethod.trim();
    paymentMethod = trimmed.length > 0 ? trimmed : undefined;
  }
  let recurrence: string | undefined;
  if (typeof record.recurrence === 'string') {
    const trimmed = record.recurrence.trim();
    recurrence = trimmed.length > 0 ? trimmed : undefined;
  }
  let notes: string | undefined;
  if (typeof record.notes === 'string') {
    const trimmed = record.notes.trim();
    notes = trimmed.length > 0 ? trimmed : undefined;
  }
  const costCenterId = typeof record.costCenterId === 'string' ? record.costCenterId : undefined;

  return {
    categoryId,
    description,
    amount,
    incurredAt,
    dueDate,
    supplierId,
    currency,
    paymentMethod,
    recurrence,
    notes,
    costCenterId,
  };
}

function parseUpdateExpenseInput(body: unknown): UpdateExpenseInput {
  const record = parseObjectBody(body);
  const result: UpdateExpenseInput = {};

  if (record.categoryId !== undefined) {
    result.categoryId = parseRequiredString(record.categoryId, 'categoryId');
  }
  if (record.description !== undefined) {
    result.description = parseRequiredString(record.description, 'description');
  }
  if (record.dueDate !== undefined) {
    result.dueDate = parseRequiredDate(record.dueDate, 'dueDate');
  }
  if (record.paymentMethod !== undefined && typeof record.paymentMethod === 'string') {
    const trimmed = record.paymentMethod.trim();
    if (trimmed.length > 0) {
      result.paymentMethod = trimmed;
    }
  }
  if (record.recurrence !== undefined && typeof record.recurrence === 'string') {
    const trimmed = record.recurrence.trim();
    if (trimmed.length > 0) {
      result.recurrence = trimmed;
    }
  }
  if (record.notes !== undefined && typeof record.notes === 'string') {
    const trimmed = record.notes.trim();
    if (trimmed.length > 0) {
      result.notes = trimmed;
    }
  }

  return result;
}

function parseCreateCashTransactionInput(body: unknown): CreateCashTransactionInput {
  const record = parseObjectBody(body);
  const type = record.type as string;
  if (!type || !['ENTRY', 'EXIT', 'ADJUSTMENT'].includes(type)) {
    throw new ValidationError('Field "type" must be ENTRY, EXIT, or ADJUSTMENT');
  }
  const amount = parsePositiveNumber(record.amount, 'amount');
  const occurringAt = parseRequiredDate(record.occurringAt, 'occurringAt');
  const origin = parseRequiredString(record.origin, 'origin');
  const relatedRecordId =
    typeof record.relatedRecordId === 'string' ? record.relatedRecordId : undefined;
  const relatedRecordType =
    typeof record.relatedRecordType === 'string' ? record.relatedRecordType : undefined;
  let notes: string | undefined;
  if (typeof record.notes === 'string') {
    const trimmed = record.notes.trim();
    notes = trimmed.length > 0 ? trimmed : undefined;
  }

  return {
    type: type as CashTransactionType,
    amount,
    occurringAt,
    origin,
    relatedRecordId,
    relatedRecordType,
    notes,
  };
}

function parseCreateReconciliationInput(body: unknown): CreateReconciliationInput {
  const record = parseObjectBody(body);
  const reconciliationDate = parseRequiredDate(
    record.reconciliationDate,
    'reconciliationDate'
  );
  const expectedAmount = parseNonNegativeNumber(record.expectedAmount, 'expectedAmount');
  const actualAmount = parseNonNegativeNumber(record.actualAmount, 'actualAmount');
  const paymentId = typeof record.paymentId === 'string' ? record.paymentId : undefined;
  let notes: string | undefined;
  if (typeof record.notes === 'string') {
    const trimmed = record.notes.trim();
    notes = trimmed.length > 0 ? trimmed : undefined;
  }

  return {
    reconciliationDate,
    expectedAmount,
    actualAmount,
    paymentId,
    notes,
  };
}
