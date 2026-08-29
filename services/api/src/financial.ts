import {
  PaymentDirection,
  type FinancialObligationStatus,
  type OperationalCost,
  type Payable,
  type Payment,
  type PaymentAllocation,
  type Receivable,
  FinancialCategoryType,
  type FinancialCategory,
  RevenueStatus,
  type Revenue,
  ExpenseStatus,
  type Expense,
  CashTransactionType,
  type CashTransaction,
  ReconciliationStatus,
  type Reconciliation,
} from '../../../packages/domain/types';
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { NotFoundError, ValidationError } from './errors';

// ============================================================
// ROW INTERFACES
// ============================================================

interface ReceivableRow {
  id: string;
  agency_id: string;
  sale_id: string | null;
  customer_id: string;
  description: string;
  amount: string;
  due_at: string;
  status: FinancialObligationStatus;
  created_at: string;
  updated_at: string;
}

interface PayableRow {
  id: string;
  agency_id: string;
  sale_id: string | null;
  supplier_id: string | null;
  commission_id: string | null;
  transport_operation_id: string | null;
  operational_cost_id: string | null;
  description: string;
  amount: string;
  due_at: string;
  status: FinancialObligationStatus;
  created_at: string;
  updated_at: string;
}

interface PaymentRow {
  id: string;
  agency_id: string;
  direction: PaymentDirection;
  amount: string;
  occurred_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

interface AllocationRow {
  id: string;
  agency_id: string;
  payment_id: string;
  receivable_id: string | null;
  payable_id: string | null;
  amount: string;
  created_at: string;
}

interface OperationalCostRow {
  id: string;
  agency_id: string;
  sale_id: string | null;
  transport_operation_id: string | null;
  supplier_id: string | null;
  description: string;
  cost_type: string;
  expected_amount: string | null;
  actual_amount: string | null;
  incurred_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface FinancialCategoryRow {
  id: string;
  agency_id: string;
  name: string;
  type: FinancialCategoryType;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RevenueRow {
  id: string;
  agency_id: string;
  sale_id: string | null;
  booking_id: string | null;
  customer_id: string;
  category_id: string;
  description: string;
  amount: string;
  currency: string;
  competency_date: string;
  due_date: string;
  receipt_date: string | null;
  payment_method: string | null;
  status: RevenueStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ExpenseRow {
  id: string;
  agency_id: string;
  supplier_id: string | null;
  category_id: string;
  description: string;
  amount: string;
  currency: string;
  incurred_at: string;
  due_date: string;
  payment_date: string | null;
  payment_method: string | null;
  status: ExpenseStatus;
  recurrence: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CashTransactionRow {
  id: string;
  agency_id: string;
  type: CashTransactionType;
  amount: string;
  occurring_at: string;
  origin: string;
  related_record_id: string | null;
  related_record_type: string | null;
  calculated_balance: string;
  notes: string | null;
  created_at: string;
}

interface ReconciliationRow {
  id: string;
  agency_id: string;
  reconciliation_date: string;
  expected_amount: string;
  actual_amount: string;
  status: ReconciliationStatus;
  payment_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// INPUT TYPES
// ============================================================

export interface CreateReceivableInput {
  saleId?: string;
  customerId: string;
  description: string;
  amount: number;
  dueAt: Date;
}

export interface CreatePayableInput {
  saleId?: string;
  supplierId?: string;
  commissionId?: string;
  transportOperationId?: string;
  operationalCostId?: string;
  description: string;
  amount: number;
  dueAt: Date;
}

export interface RecordPaymentInput {
  direction: PaymentDirection;
  amount: number;
  occurredAt: Date;
  method?: string;
  reference?: string;
  notes?: string;
}

export interface CreatePaymentAllocationInput {
  receivableId?: string;
  payableId?: string;
  amount: number;
}

export interface AllocationResult {
  allocations: PaymentAllocation[];
  targets: Array<Receivable | Payable>;
}

export interface CreateOperationalCostInput {
  saleId?: string;
  transportOperationId?: string;
  supplierId?: string;
  description: string;
  costType: string;
  expectedAmount?: number;
  actualAmount?: number;
  incurredAt: Date;
}

export interface CreateFinancialCategoryInput {
  name: string;
  type: FinancialCategoryType;
  description: string | undefined;
}

export interface CreateRevenueInput {
  saleId: string | undefined;
  bookingId: string | undefined;
  customerId: string;
  categoryId: string;
  description: string;
  amount: number;
  currency: string;
  competencyDate: Date;
  dueDate: Date;
  paymentMethod: string | undefined;
  notes: string | undefined;
}

export interface UpdateRevenueInput {
  categoryId?: string;
  description?: string;
  dueDate?: Date;
  paymentMethod?: string;
  notes?: string;
}

export interface CreateExpenseInput {
  supplierId: string | undefined;
  categoryId: string;
  description: string;
  amount: number;
  currency: string;
  incurredAt: Date;
  dueDate: Date;
  paymentMethod: string | undefined;
  recurrence: string | undefined;
  notes: string | undefined;
}

export interface UpdateExpenseInput {
  categoryId?: string;
  description?: string;
  dueDate?: Date;
  paymentMethod?: string;
  recurrence?: string;
  notes?: string;
}

export interface CreateCashTransactionInput {
  type: CashTransactionType;
  amount: number;
  occurringAt: Date;
  origin: string;
  relatedRecordId: string | undefined;
  relatedRecordType: string | undefined;
  notes: string | undefined;
}

export interface CreateReconciliationInput {
  reconciliationDate: Date;
  expectedAmount: number;
  actualAmount: number;
  paymentId: string | undefined;
  notes: string | undefined;
}

export interface CashFlowPeriod {
  from: Date;
  to: Date;
}

export interface CashFlowSummary {
  projected: {
    receivablesDue: number;
    payablesDue: number;
    balance: number;
  };
  realized: {
    paymentsIn: number;
    paymentsOut: number;
    balance: number;
  };
}

export interface SaleMargin {
  saleId: string;
  revenue: number;
  supplierCosts: number;
  operationalCosts: number;
  commission: number;
  margin: number;
}

export interface FinancialSummary {
  salesThisMonth: {
    total: number;
    count: number;
  };
  received: number;
  pending: number;
  expectedMargin: number;
  recentPayments: Array<{
    id: string;
    customerId: string;
    customerName: string;
    description: string;
    amount: number;
    occurredAt: Date;
    status: 'PAID' | 'PENDING';
  }>;
  upcomingReceivables: Array<{
    id: string;
    customerId: string;
    customerName: string;
    description: string;
    amount: number;
    dueAt: Date;
    status: FinancialObligationStatus;
  }>;
}

export interface DREReport {
  period: string;
  revenues: { total: number; count: number };
  expenses: { total: number; count: number };
  margin: number;
  byCategory: Array<{
    category: string;
    type: FinancialCategoryType;
    amount: number;
  }>;
}

export interface OverdueReport {
  receivables: Array<{
    id: string;
    customerName: string;
    amount: number;
    daysOverdue: number;
  }>;
  payables: Array<{
    id: string;
    supplierName: string | null;
    amount: number;
    daysOverdue: number;
  }>;
  total: number;
}

// ============================================================
// COLUMN DEFINITIONS
// ============================================================

const RECEIVABLE_COLUMNS = `id, agency_id, sale_id, customer_id, description, amount,
  due_at, status, created_at, updated_at`;
const PAYABLE_COLUMNS = `id, agency_id, sale_id, supplier_id, commission_id,
  transport_operation_id, operational_cost_id, description, amount, due_at, status,
  created_at, updated_at`;
const PAYMENT_COLUMNS = `id, agency_id, direction, amount, occurred_at, method,
  reference, notes, created_by, created_at`;
const ALLOCATION_COLUMNS = `id, agency_id, payment_id, receivable_id, payable_id,
  amount, created_at`;
const OPERATIONAL_COST_COLUMNS = `id, agency_id, sale_id, transport_operation_id,
  supplier_id, description, cost_type, expected_amount, actual_amount, incurred_at,
  created_by, created_at, updated_at`;
const CATEGORY_COLUMNS = `id, agency_id, name, type, description, is_active, created_at, updated_at`;
const REVENUE_COLUMNS = `id, agency_id, sale_id, booking_id, customer_id, category_id,
  description, amount, currency, competency_date, due_date, receipt_date, payment_method,
  status, notes, created_at, updated_at`;
const EXPENSE_COLUMNS = `id, agency_id, supplier_id, category_id, description, amount,
  currency, incurred_at, due_date, payment_date, payment_method, status, recurrence,
  notes, created_at, updated_at`;
const CASH_TRANSACTION_COLUMNS = `id, agency_id, type, amount, occurring_at, origin,
  related_record_id, related_record_type, calculated_balance, notes, created_at`;
const RECONCILIATION_COLUMNS = `id, agency_id, reconciliation_date, expected_amount,
  actual_amount, status, payment_id, notes, created_at, updated_at`;

// ============================================================
// FINANCIAL CATEGORIES
// ============================================================

export async function listFinancialCategories(
  database: DatabaseRuntime,
  type?: FinancialCategoryType,
): Promise<FinancialCategory[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    let query = `SELECT ${CATEGORY_COLUMNS}
       FROM financial_categories
       WHERE agency_id = $1 AND is_active = true`;
    const params: any[] = [agencyId];

    if (type !== undefined) {
      query += ` AND type = $2`;
      params.push(type);
    }

    query += ` ORDER BY name ASC`;

    const result = await client.query<FinancialCategoryRow>(query, params);
    return result.rows.map(toFinancialCategory);
  });
}

export async function createFinancialCategory(
  database: DatabaseRuntime,
  data: CreateFinancialCategoryInput,
): Promise<FinancialCategory> {
  const agencyId = getAgencyId();
  assertNonEmpty(data.name, 'name');
  if (!Object.values(FinancialCategoryType).includes(data.type)) {
    throw new ValidationError('Invalid category type');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<FinancialCategoryRow>(
      `INSERT INTO financial_categories (agency_id, name, type, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agency_id, type, name) DO UPDATE SET is_active = true
       RETURNING ${CATEGORY_COLUMNS}`,
      [agencyId, data.name, data.type, data.description ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Category insert did not return a row');
    return toFinancialCategory(row);
  });
}

export async function deleteFinancialCategory(
  database: DatabaseRuntime,
  categoryId: string,
): Promise<void> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    await client.query(
      `UPDATE financial_categories SET is_active = false
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, categoryId],
    );
  });
}

// ============================================================
// REVENUES
// ============================================================

export async function listRevenues(
  database: DatabaseRuntime,
  filters?: {
    status?: RevenueStatus;
    customerId?: string;
    categoryId?: string;
    periodFrom?: Date;
    periodTo?: Date;
  },
): Promise<Revenue[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    let query = `SELECT ${REVENUE_COLUMNS}
       FROM revenues
       WHERE agency_id = $1`;
    const params: any[] = [agencyId];
    let paramIndex = 2;

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }
    if (filters?.customerId) {
      query += ` AND customer_id = $${paramIndex}`;
      params.push(filters.customerId);
      paramIndex++;
    }
    if (filters?.categoryId) {
      query += ` AND category_id = $${paramIndex}`;
      params.push(filters.categoryId);
      paramIndex++;
    }
    if (filters?.periodFrom) {
      query += ` AND due_date >= $${paramIndex}`;
      params.push(filters.periodFrom);
      paramIndex++;
    }
    if (filters?.periodTo) {
      query += ` AND due_date <= $${paramIndex}`;
      params.push(filters.periodTo);
      paramIndex++;
    }

    query += ` ORDER BY due_date ASC, created_at DESC`;

    const result = await client.query<RevenueRow>(query, params);
    return result.rows.map(toRevenue);
  });
}

export async function getRevenue(database: DatabaseRuntime, revenueId: string): Promise<Revenue> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RevenueRow>(
      `SELECT ${REVENUE_COLUMNS}
       FROM revenues
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, revenueId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Revenue not found');
    return toRevenue(row);
  });
}

export async function createRevenue(
  database: DatabaseRuntime,
  data: CreateRevenueInput,
): Promise<Revenue> {
  const agencyId = getAgencyId();
  assertPositiveMoney(data.amount, 'amount');
  assertNonEmpty(data.customerId, 'customerId');
  assertNonEmpty(data.categoryId, 'categoryId');
  assertNonEmpty(data.description, 'description');

  return database.withTenantTransaction(async (client) => {
    // Idempotency: if sale_id provided, check if revenue already exists
    if (data.saleId !== undefined) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM revenues WHERE agency_id = $1 AND sale_id = $2`,
        [agencyId, data.saleId],
      );
      if (existing.rows.length > 0 && existing.rows[0]) {
        // Return existing revenue
        return getRevenue(database, existing.rows[0].id);
      }
    }

    await assertRef(client, agencyId, 'customers', data.customerId, 'Customer not found');
    await assertRef(client, agencyId, 'financial_categories', data.categoryId, 'Category not found');
    if (data.saleId !== undefined) {
      await assertRef(client, agencyId, 'sales', data.saleId, 'Sale not found');
    }
    if (data.bookingId !== undefined) {
      await assertRef(client, agencyId, 'bookings', data.bookingId, 'Booking not found');
    }

    const result = await client.query<RevenueRow>(
      `INSERT INTO revenues
         (agency_id, sale_id, booking_id, customer_id, category_id, description,
          amount, currency, competency_date, due_date, payment_method, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${REVENUE_COLUMNS}`,
      [
        agencyId,
        data.saleId ?? null,
        data.bookingId ?? null,
        data.customerId,
        data.categoryId,
        data.description,
        data.amount,
        data.currency ?? 'BRL',
        data.competencyDate,
        data.dueDate,
        data.paymentMethod ?? null,
        data.notes ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Revenue insert did not return a row');
    await recordAuditEvent(client, {
      eventType: AuditEventType.REVENUE_CREATED,
      entityType: 'revenue',
      entityId: row.id,
      metadata: {
        amount: Number(row.amount),
        saleId: row.sale_id ?? undefined,
      },
    });
    return toRevenue(row);
  });
}

export async function updateRevenue(
  database: DatabaseRuntime,
  revenueId: string,
  data: UpdateRevenueInput,
): Promise<Revenue> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const existing = await client.query<RevenueRow>(
      `SELECT ${REVENUE_COLUMNS} FROM revenues WHERE agency_id = $1 AND id = $2`,
      [agencyId, revenueId],
    );
    const row = existing.rows[0];
    if (!row) throw new NotFoundError('Revenue not found');

    if (row.status === 'PAID') {
      throw new ValidationError('Cannot update a paid revenue');
    }

    if (data.categoryId !== undefined) {
      await assertRef(client, agencyId, 'financial_categories', data.categoryId, 'Category not found');
    }

    const result = await client.query<RevenueRow>(
      `UPDATE revenues SET
         category_id = COALESCE($2, category_id),
         description = COALESCE($3, description),
         due_date = COALESCE($4, due_date),
         payment_method = COALESCE($5, payment_method),
         notes = COALESCE($6, notes),
         updated_at = now()
       WHERE agency_id = $1 AND id = $7
       RETURNING ${REVENUE_COLUMNS}`,
      [
        agencyId,
        data.categoryId ?? null,
        data.description ?? null,
        data.dueDate ?? null,
        data.paymentMethod ?? null,
        data.notes ?? null,
        revenueId,
      ],
    );

    const updated = result.rows[0];
    if (!updated) throw new NotFoundError('Revenue not found');
    return toRevenue(updated);
  });
}

export async function markRevenueAsPaid(
  database: DatabaseRuntime,
  revenueId: string,
  partialAmount?: number,
): Promise<Revenue> {
  const agencyId = getAgencyId();
  if (partialAmount !== undefined) {
    assertPositiveMoney(partialAmount, 'partialAmount');
  }

  return database.withTenantTransaction(async (client) => {
    const existing = await client.query<RevenueRow>(
      `SELECT ${REVENUE_COLUMNS} FROM revenues WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [agencyId, revenueId],
    );
    const row = existing.rows[0];
    if (!row) throw new NotFoundError('Revenue not found');

    const fullAmount = Number(row.amount);
    const newStatus = partialAmount === undefined ? 'PAID' : 'PARTIALLY_PAID';

    const result = await client.query<RevenueRow>(
      `UPDATE revenues SET
         status = $2::"RevenueStatus",
         receipt_date = COALESCE(receipt_date, CASE WHEN $2::"RevenueStatus" = 'PAID' THEN now() ELSE NULL END),
         updated_at = now()
       WHERE agency_id = $1 AND id = $3
       RETURNING ${REVENUE_COLUMNS}`,
      [agencyId, newStatus, revenueId],
    );

    const updated = result.rows[0];
    if (!updated) throw new NotFoundError('Revenue not found');
    return toRevenue(updated);
  });
}

export async function cancelRevenue(database: DatabaseRuntime, revenueId: string): Promise<Revenue> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RevenueRow>(
      `UPDATE revenues SET status = 'CANCELLED'::"RevenueStatus", updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${REVENUE_COLUMNS}`,
      [agencyId, revenueId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Revenue not found');
    return toRevenue(row);
  });
}

// ============================================================
// EXPENSES
// ============================================================

export async function listExpenses(
  database: DatabaseRuntime,
  filters?: {
    status?: ExpenseStatus;
    supplierId?: string;
    categoryId?: string;
    periodFrom?: Date;
    periodTo?: Date;
  },
): Promise<Expense[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    let query = `SELECT ${EXPENSE_COLUMNS}
       FROM expenses
       WHERE agency_id = $1`;
    const params: any[] = [agencyId];
    let paramIndex = 2;

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }
    if (filters?.supplierId) {
      query += ` AND supplier_id = $${paramIndex}`;
      params.push(filters.supplierId);
      paramIndex++;
    }
    if (filters?.categoryId) {
      query += ` AND category_id = $${paramIndex}`;
      params.push(filters.categoryId);
      paramIndex++;
    }
    if (filters?.periodFrom) {
      query += ` AND due_date >= $${paramIndex}`;
      params.push(filters.periodFrom);
      paramIndex++;
    }
    if (filters?.periodTo) {
      query += ` AND due_date <= $${paramIndex}`;
      params.push(filters.periodTo);
      paramIndex++;
    }

    query += ` ORDER BY due_date ASC, created_at DESC`;

    const result = await client.query<ExpenseRow>(query, params);
    return result.rows.map(toExpense);
  });
}

export async function getExpense(database: DatabaseRuntime, expenseId: string): Promise<Expense> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ExpenseRow>(
      `SELECT ${EXPENSE_COLUMNS}
       FROM expenses
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, expenseId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Expense not found');
    return toExpense(row);
  });
}

export async function createExpense(
  database: DatabaseRuntime,
  data: CreateExpenseInput,
): Promise<Expense> {
  const agencyId = getAgencyId();
  assertPositiveMoney(data.amount, 'amount');
  assertNonEmpty(data.categoryId, 'categoryId');
  assertNonEmpty(data.description, 'description');

  return database.withTenantTransaction(async (client) => {
    await assertRef(client, agencyId, 'financial_categories', data.categoryId, 'Category not found');
    if (data.supplierId !== undefined) {
      await assertRef(client, agencyId, 'suppliers', data.supplierId, 'Supplier not found');
    }

    const result = await client.query<ExpenseRow>(
      `INSERT INTO expenses
         (agency_id, supplier_id, category_id, description, amount, currency,
          incurred_at, due_date, payment_method, recurrence, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${EXPENSE_COLUMNS}`,
      [
        agencyId,
        data.supplierId ?? null,
        data.categoryId,
        data.description,
        data.amount,
        data.currency ?? 'BRL',
        data.incurredAt,
        data.dueDate,
        data.paymentMethod ?? null,
        data.recurrence ?? null,
        data.notes ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Expense insert did not return a row');
    await recordAuditEvent(client, {
      eventType: AuditEventType.EXPENSE_CREATED,
      entityType: 'expense',
      entityId: row.id,
      metadata: {
        amount: Number(row.amount),
        supplierId: row.supplier_id ?? undefined,
      },
    });
    return toExpense(row);
  });
}

export async function updateExpense(
  database: DatabaseRuntime,
  expenseId: string,
  data: UpdateExpenseInput,
): Promise<Expense> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const existing = await client.query<ExpenseRow>(
      `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE agency_id = $1 AND id = $2`,
      [agencyId, expenseId],
    );
    const row = existing.rows[0];
    if (!row) throw new NotFoundError('Expense not found');

    if (row.status === 'PAID') {
      throw new ValidationError('Cannot update a paid expense');
    }

    if (data.categoryId !== undefined) {
      await assertRef(client, agencyId, 'financial_categories', data.categoryId, 'Category not found');
    }

    const result = await client.query<ExpenseRow>(
      `UPDATE expenses SET
         category_id = COALESCE($2, category_id),
         description = COALESCE($3, description),
         due_date = COALESCE($4, due_date),
         payment_method = COALESCE($5, payment_method),
         recurrence = COALESCE($6, recurrence),
         notes = COALESCE($7, notes),
         updated_at = now()
       WHERE agency_id = $1 AND id = $8
       RETURNING ${EXPENSE_COLUMNS}`,
      [
        agencyId,
        data.categoryId ?? null,
        data.description ?? null,
        data.dueDate ?? null,
        data.paymentMethod ?? null,
        data.recurrence ?? null,
        data.notes ?? null,
        expenseId,
      ],
    );

    const updated = result.rows[0];
    if (!updated) throw new NotFoundError('Expense not found');
    return toExpense(updated);
  });
}

export async function markExpenseAsPaid(
  database: DatabaseRuntime,
  expenseId: string,
  partialAmount?: number,
): Promise<Expense> {
  const agencyId = getAgencyId();
  if (partialAmount !== undefined) {
    assertPositiveMoney(partialAmount, 'partialAmount');
  }

  return database.withTenantTransaction(async (client) => {
    const existing = await client.query<ExpenseRow>(
      `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [agencyId, expenseId],
    );
    const row = existing.rows[0];
    if (!row) throw new NotFoundError('Expense not found');

    const newStatus = partialAmount === undefined ? 'PAID' : 'PARTIALLY_PAID';

    const result = await client.query<ExpenseRow>(
      `UPDATE expenses SET
         status = $2::"ExpenseStatus",
         payment_date = COALESCE(payment_date, CASE WHEN $2::"ExpenseStatus" = 'PAID' THEN now() ELSE NULL END),
         updated_at = now()
       WHERE agency_id = $1 AND id = $3
       RETURNING ${EXPENSE_COLUMNS}`,
      [agencyId, newStatus, expenseId],
    );

    const updated = result.rows[0];
    if (!updated) throw new NotFoundError('Expense not found');
    return toExpense(updated);
  });
}

export async function cancelExpense(database: DatabaseRuntime, expenseId: string): Promise<Expense> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ExpenseRow>(
      `UPDATE expenses SET status = 'CANCELLED'::"ExpenseStatus", updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${EXPENSE_COLUMNS}`,
      [agencyId, expenseId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Expense not found');
    return toExpense(row);
  });
}

// ============================================================
// CASH TRANSACTIONS (Immutable)
// ============================================================

export async function listCashTransactions(
  database: DatabaseRuntime,
  filters?: {
    type?: CashTransactionType;
    periodFrom?: Date;
    periodTo?: Date;
  },
): Promise<CashTransaction[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    let query = `SELECT ${CASH_TRANSACTION_COLUMNS}
       FROM cash_transactions
       WHERE agency_id = $1`;
    const params: any[] = [agencyId];
    let paramIndex = 2;

    if (filters?.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }
    if (filters?.periodFrom) {
      query += ` AND occurring_at >= $${paramIndex}`;
      params.push(filters.periodFrom);
      paramIndex++;
    }
    if (filters?.periodTo) {
      query += ` AND occurring_at <= $${paramIndex}`;
      params.push(filters.periodTo);
      paramIndex++;
    }

    query += ` ORDER BY occurring_at ASC`;

    const result = await client.query<CashTransactionRow>(query, params);
    return result.rows.map(toCashTransaction);
  });
}

export async function createCashTransaction(
  database: DatabaseRuntime,
  data: CreateCashTransactionInput,
): Promise<CashTransaction> {
  const agencyId = getAgencyId();
  assertPositiveMoney(data.amount, 'amount');
  assertNonEmpty(data.origin, 'origin');

  return database.withTenantTransaction(async (client) => {
    // Calculate running balance
    const balance = await client.query<{ balance: string }>(
      `SELECT COALESCE(calculated_balance, 0)::text AS balance
       FROM cash_transactions
       WHERE agency_id = $1
       ORDER BY occurring_at DESC, created_at DESC
       LIMIT 1`,
      [agencyId],
    );

    const currentBalance = Number(balance.rows[0]?.balance ?? 0);
    const newBalance =
      data.type === 'ENTRY'
        ? roundMoney(currentBalance + data.amount)
        : roundMoney(currentBalance - data.amount);

    const result = await client.query<CashTransactionRow>(
      `INSERT INTO cash_transactions
         (agency_id, type, amount, occurring_at, origin, related_record_id,
          related_record_type, calculated_balance, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${CASH_TRANSACTION_COLUMNS}`,
      [
        agencyId,
        data.type,
        data.amount,
        data.occurringAt,
        data.origin,
        data.relatedRecordId ?? null,
        data.relatedRecordType ?? null,
        newBalance,
        data.notes ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('CashTransaction insert did not return a row');
    return toCashTransaction(row);
  });
}

export async function getCashBalance(database: DatabaseRuntime, asOf?: Date): Promise<number> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    let query = `SELECT calculated_balance FROM cash_transactions
       WHERE agency_id = $1`;
    const params: any[] = [agencyId];

    if (asOf) {
      query += ` AND occurring_at <= $2`;
      params.push(asOf);
    }

    query += ` ORDER BY occurring_at DESC, created_at DESC LIMIT 1`;

    const result = await client.query<{ calculated_balance: string }>(query, params);
    return roundMoney(Number(result.rows[0]?.calculated_balance ?? 0));
  });
}

// ============================================================
// RECONCILIATIONS
// ============================================================

export async function listReconciliations(
  database: DatabaseRuntime,
  filters?: {
    status?: ReconciliationStatus;
    periodFrom?: Date;
    periodTo?: Date;
  },
): Promise<Reconciliation[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    let query = `SELECT ${RECONCILIATION_COLUMNS}
       FROM reconciliations
       WHERE agency_id = $1`;
    const params: any[] = [agencyId];
    let paramIndex = 2;

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }
    if (filters?.periodFrom) {
      query += ` AND reconciliation_date >= $${paramIndex}`;
      params.push(filters.periodFrom);
      paramIndex++;
    }
    if (filters?.periodTo) {
      query += ` AND reconciliation_date <= $${paramIndex}`;
      params.push(filters.periodTo);
      paramIndex++;
    }

    query += ` ORDER BY reconciliation_date DESC`;

    const result = await client.query<ReconciliationRow>(query, params);
    return result.rows.map(toReconciliation);
  });
}

export async function createReconciliation(
  database: DatabaseRuntime,
  data: CreateReconciliationInput,
): Promise<Reconciliation> {
  const agencyId = getAgencyId();
  assertNonNegativeMoney(data.expectedAmount, 'expectedAmount');
  assertNonNegativeMoney(data.actualAmount, 'actualAmount');

  return database.withTenantTransaction(async (client) => {
    if (data.paymentId !== undefined) {
      await assertRef(client, agencyId, 'payments', data.paymentId, 'Payment not found');
    }

    const result = await client.query<ReconciliationRow>(
      `INSERT INTO reconciliations
         (agency_id, reconciliation_date, expected_amount, actual_amount, status, payment_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${RECONCILIATION_COLUMNS}`,
      [
        agencyId,
        data.reconciliationDate,
        data.expectedAmount,
        data.actualAmount,
        data.expectedAmount === data.actualAmount ? 'RECONCILED' : 'NOT_RECONCILED',
        data.paymentId ?? null,
        data.notes ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Reconciliation insert did not return a row');
    return toReconciliation(row);
  });
}

export async function markReconciliationAsReconciled(
  database: DatabaseRuntime,
  reconciliationId: string,
): Promise<Reconciliation> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ReconciliationRow>(
      `UPDATE reconciliations SET status = 'RECONCILED'::"ReconciliationStatus", updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${RECONCILIATION_COLUMNS}`,
      [agencyId, reconciliationId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Reconciliation not found');
    return toReconciliation(row);
  });
}

// ============================================================
// REPORTS
// ============================================================

export async function getDREReport(
  database: DatabaseRuntime,
  periodFrom: Date,
  periodTo: Date,
): Promise<DREReport> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    // Sum revenues
    const revResult = await client.query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS count
       FROM revenues
       WHERE agency_id = $1 AND status IN ('PAID', 'PARTIALLY_PAID')
         AND due_date >= $2 AND due_date <= $3`,
      [agencyId, periodFrom, periodTo],
    );
    const revenues = {
      total: roundMoney(Number(revResult.rows[0]?.total ?? 0)),
      count: Number(revResult.rows[0]?.count ?? 0),
    };

    // Sum expenses
    const expResult = await client.query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS count
       FROM expenses
       WHERE agency_id = $1 AND status IN ('PAID', 'PARTIALLY_PAID')
         AND due_date >= $2 AND due_date <= $3`,
      [agencyId, periodFrom, periodTo],
    );
    const expenses = {
      total: roundMoney(Number(expResult.rows[0]?.total ?? 0)),
      count: Number(expResult.rows[0]?.count ?? 0),
    };

    const margin = roundMoney(revenues.total - expenses.total);

    // By category
    const catResult = await client.query<{
      category: string;
      type: FinancialCategoryType;
      amount: string;
    }>(
      `SELECT fc.name AS category, fc.type, COALESCE(SUM(
         CASE WHEN fc.type = 'REVENUE' THEN r.amount
              WHEN fc.type = 'EXPENSE' THEN e.amount
              ELSE 0 END
       ), 0)::text AS amount
       FROM financial_categories fc
       LEFT JOIN revenues r ON fc.agency_id = r.agency_id AND fc.id = r.category_id
         AND r.status IN ('PAID', 'PARTIALLY_PAID')
         AND r.due_date >= $2 AND r.due_date <= $3
       LEFT JOIN expenses e ON fc.agency_id = e.agency_id AND fc.id = e.category_id
         AND e.status IN ('PAID', 'PARTIALLY_PAID')
         AND e.due_date >= $2 AND e.due_date <= $3
       WHERE fc.agency_id = $1
       GROUP BY fc.id, fc.name, fc.type
       HAVING SUM(CASE WHEN fc.type = 'REVENUE' THEN r.amount
                      WHEN fc.type = 'EXPENSE' THEN e.amount
                      ELSE 0 END) > 0`,
      [agencyId, periodFrom, periodTo],
    );

    const byCategory = catResult.rows.map((row) => ({
      category: row.category,
      type: row.type,
      amount: roundMoney(Number(row.amount)),
    }));

    return {
      period: `${periodFrom.toISOString().split('T')[0]} to ${periodTo.toISOString().split('T')[0]}`,
      revenues,
      expenses,
      margin,
      byCategory,
    };
  });
}

export async function getOverdueReport(database: DatabaseRuntime): Promise<OverdueReport> {
  const agencyId = getAgencyId();
  const now = new Date();

  return database.withTenantTransaction(async (client) => {
    const recResult = await client.query<{
      id: string;
      customer_name: string;
      amount: string;
      days_overdue: string;
    }>(
      `SELECT r.id, c.name AS customer_name, r.amount,
              EXTRACT(DAY FROM $2::timestamp - r.due_at)::text AS days_overdue
       FROM receivables r
       LEFT JOIN customers c ON r.agency_id = c.agency_id AND r.customer_id = c.id
       WHERE r.agency_id = $1 AND r.status IN ('OPEN', 'PARTIALLY_PAID')
         AND r.due_at < $2
       ORDER BY days_overdue DESC`,
      [agencyId, now],
    );

    const payResult = await client.query<{
      id: string;
      supplier_name: string | null;
      amount: string;
      days_overdue: string;
    }>(
      `SELECT p.id, s.name AS supplier_name, p.amount,
              EXTRACT(DAY FROM $2::timestamp - p.due_at)::text AS days_overdue
       FROM payables p
       LEFT JOIN suppliers s ON p.agency_id = s.agency_id AND p.supplier_id = s.id
       WHERE p.agency_id = $1 AND p.status IN ('OPEN', 'PARTIALLY_PAID')
         AND p.due_at < $2
       ORDER BY days_overdue DESC`,
      [agencyId, now],
    );

    const receivables = recResult.rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name || 'Unknown',
      amount: roundMoney(Number(row.amount)),
      daysOverdue: Number(row.days_overdue),
    }));

    const payables = payResult.rows.map((row) => ({
      id: row.id,
      supplierName: row.supplier_name,
      amount: roundMoney(Number(row.amount)),
      daysOverdue: Number(row.days_overdue),
    }));

    const totalReceivables = roundMoney(receivables.reduce((sum, r) => sum + r.amount, 0));
    const totalPayables = roundMoney(payables.reduce((sum, p) => sum + p.amount, 0));

    return {
      receivables,
      payables,
      total: roundMoney(totalReceivables + totalPayables),
    };
  });
}

// ============================================================
// EXISTING FUNCTIONS (Retained for backward compatibility)
// ============================================================

export async function listReceivables(database: DatabaseRuntime): Promise<Receivable[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ReceivableRow>(
      `SELECT ${RECEIVABLE_COLUMNS}
       FROM receivables
       WHERE agency_id = $1
       ORDER BY due_at ASC, created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toReceivable);
  });
}

export async function listPayables(database: DatabaseRuntime): Promise<Payable[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PayableRow>(
      `SELECT ${PAYABLE_COLUMNS}
       FROM payables
       WHERE agency_id = $1
       ORDER BY due_at ASC, created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toPayable);
  });
}

export async function listPayments(database: DatabaseRuntime): Promise<Payment[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS}
       FROM payments
       WHERE agency_id = $1
       ORDER BY occurred_at DESC, created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toPayment);
  });
}

export async function listPaymentAllocations(
  database: DatabaseRuntime,
  paymentId: string,
): Promise<PaymentAllocation[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AllocationRow>(
      `SELECT ${ALLOCATION_COLUMNS}
       FROM payment_allocations
       WHERE agency_id = $1 AND payment_id = $2
       ORDER BY created_at ASC`,
      [agencyId, paymentId],
    );
    return result.rows.map(toAllocation);
  });
}

export async function listAllocationsForTarget(
  database: DatabaseRuntime,
  target: { receivableId?: string; payableId?: string },
): Promise<PaymentAllocation[]> {
  const agencyId = getAgencyId();
  if (!target.receivableId && !target.payableId) {
    return [];
  }
  const column = target.receivableId ? 'receivable_id' : 'payable_id';
  const value = target.receivableId ?? target.payableId;
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AllocationRow>(
      `SELECT ${ALLOCATION_COLUMNS}
       FROM payment_allocations
       WHERE agency_id = $1 AND ${column} = $2
       ORDER BY created_at ASC`,
      [agencyId, value],
    );
    return result.rows.map(toAllocation);
  });
}

export async function listOperationalCosts(database: DatabaseRuntime): Promise<OperationalCost[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OperationalCostRow>(
      `SELECT ${OPERATIONAL_COST_COLUMNS}
       FROM operational_costs
       WHERE agency_id = $1
       ORDER BY incurred_at DESC, created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toOperationalCost);
  });
}

export async function createReceivable(
  database: DatabaseRuntime,
  data: CreateReceivableInput,
): Promise<Receivable> {
  const agencyId = getAgencyId();
  assertPositiveMoney(data.amount, 'amount');
  assertNonEmpty(data.customerId, 'customerId');
  assertNonEmpty(data.description, 'description');

  return database.withTenantTransaction(async (client) => {
    await assertRef(client, agencyId, 'customers', data.customerId, 'Customer not found');
    if (data.saleId !== undefined) {
      await assertRef(client, agencyId, 'sales', data.saleId, 'Sale not found');
    }

    const result = await client.query<ReceivableRow>(
      `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${RECEIVABLE_COLUMNS}`,
      [agencyId, data.saleId ?? null, data.customerId, data.description, data.amount, data.dueAt],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Receivable insert did not return a row');
    return toReceivable(row);
  });
}

export async function createPayable(
  database: DatabaseRuntime,
  data: CreatePayableInput,
): Promise<Payable> {
  const agencyId = getAgencyId();
  assertPositiveMoney(data.amount, 'amount');
  assertNonEmpty(data.description, 'description');

  return database.withTenantTransaction(async (client) => {
    await assertOptionalRef(client, agencyId, 'sales', data.saleId, 'Sale not found');
    await assertOptionalRef(client, agencyId, 'suppliers', data.supplierId, 'Supplier not found');
    await assertOptionalRef(client, agencyId, 'commissions', data.commissionId, 'Commission not found');
    await assertOptionalRef(
      client,
      agencyId,
      'transport_operations',
      data.transportOperationId,
      'Transport operation not found',
    );
    await assertOptionalRef(
      client,
      agencyId,
      'operational_costs',
      data.operationalCostId,
      'Operational cost not found',
    );

    const result = await client.query<PayableRow>(
      `INSERT INTO payables
         (agency_id, sale_id, supplier_id, commission_id, transport_operation_id,
          operational_cost_id, description, amount, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${PAYABLE_COLUMNS}`,
      [
        agencyId,
        data.saleId ?? null,
        data.supplierId ?? null,
        data.commissionId ?? null,
        data.transportOperationId ?? null,
        data.operationalCostId ?? null,
        data.description,
        data.amount,
        data.dueAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Payable insert did not return a row');
    return toPayable(row);
  });
}

export async function recordPayment(
  database: DatabaseRuntime,
  data: RecordPaymentInput,
): Promise<Payment> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  assertPositiveMoney(data.amount, 'amount');
  if (!Object.values(PaymentDirection).includes(data.direction)) {
    throw new ValidationError('Field "direction" must be IN or OUT');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PaymentRow>(
      `INSERT INTO payments
         (agency_id, direction, amount, occurred_at, method, reference, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${PAYMENT_COLUMNS}`,
      [
        agencyId,
        data.direction,
        data.amount,
        data.occurredAt,
        data.method ?? null,
        data.reference ?? null,
        data.notes ?? null,
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Payment insert did not return a row');
    await recordAuditEvent(client, {
      eventType: AuditEventType.PAYMENT_RECORDED,
      entityType: 'payment',
      entityId: row.id,
      metadata: {
        amount: Number(row.amount),
        currency: 'BRL',
        method: row.method ?? undefined,
        paymentDirection: row.direction,
      },
    });
    return toPayment(row);
  });
}

export async function allocatePayment(
  database: DatabaseRuntime,
  paymentId: string,
  allocations: CreatePaymentAllocationInput[],
): Promise<AllocationResult> {
  const agencyId = getAgencyId();
  if (allocations.length === 0) {
    throw new ValidationError('At least one allocation is required');
  }

  return database.withTenantTransaction(async (client) => {
    const paymentResult = await client.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments
       WHERE agency_id = $1 AND id = $2
       FOR UPDATE`,
      [agencyId, paymentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    const existingPaymentAllocated = await sumAllocationsForPayment(client, agencyId, paymentId);
    const requestedTotal = roundMoney(
      allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
    );
    if (roundMoney(existingPaymentAllocated + requestedTotal) > Number(payment.amount)) {
      throw new ValidationError('Payment allocations cannot exceed payment amount');
    }

    const created: PaymentAllocation[] = [];
    const targets: Array<Receivable | Payable> = [];

    for (const allocation of allocations) {
      assertPositiveMoney(allocation.amount, 'amount');
      const hasReceivable = allocation.receivableId !== undefined;
      const hasPayable = allocation.payableId !== undefined;
      if (hasReceivable === hasPayable) {
        throw new ValidationError('Allocation must target exactly one receivable or payable');
      }

      if (hasReceivable) {
        if (payment.direction !== PaymentDirection.IN) {
          throw new ValidationError('IN payments can only be allocated to receivables');
        }
        const target = await lockReceivable(client, agencyId, allocation.receivableId!);
        await assertTargetCapacity(client, agencyId, 'receivable_id', target.id, target.amount, allocation.amount);
        const row = await insertAllocation(client, agencyId, paymentId, allocation);
        const updated = await refreshReceivableStatus(client, agencyId, target.id);
        created.push(toAllocation(row));
        targets.push(updated);
      } else {
        if (payment.direction !== PaymentDirection.OUT) {
          throw new ValidationError('OUT payments can only be allocated to payables');
        }
        const target = await lockPayable(client, agencyId, allocation.payableId!);
        await assertTargetCapacity(client, agencyId, 'payable_id', target.id, target.amount, allocation.amount);
        const row = await insertAllocation(client, agencyId, paymentId, allocation);
        const updated = await refreshPayableStatus(client, agencyId, target.id);
        created.push(toAllocation(row));
        targets.push(updated);
      }
    }

    return { allocations: created, targets };
  });
}

export async function createOperationalCost(
  database: DatabaseRuntime,
  data: CreateOperationalCostInput,
): Promise<OperationalCost> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  assertNonEmpty(data.description, 'description');
  assertNonEmpty(data.costType, 'costType');
  if (data.expectedAmount === undefined && data.actualAmount === undefined) {
    throw new ValidationError('At least one of expectedAmount or actualAmount is required');
  }
  if (data.expectedAmount !== undefined) assertNonNegativeMoney(data.expectedAmount, 'expectedAmount');
  if (data.actualAmount !== undefined) assertNonNegativeMoney(data.actualAmount, 'actualAmount');

  return database.withTenantTransaction(async (client) => {
    await assertOptionalRef(client, agencyId, 'sales', data.saleId, 'Sale not found');
    await assertOptionalRef(client, agencyId, 'suppliers', data.supplierId, 'Supplier not found');
    await assertOptionalRef(
      client,
      agencyId,
      'transport_operations',
      data.transportOperationId,
      'Transport operation not found',
    );

    const result = await client.query<OperationalCostRow>(
      `INSERT INTO operational_costs
         (agency_id, sale_id, transport_operation_id, supplier_id, description,
          cost_type, expected_amount, actual_amount, incurred_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${OPERATIONAL_COST_COLUMNS}`,
      [
        agencyId,
        data.saleId ?? null,
        data.transportOperationId ?? null,
        data.supplierId ?? null,
        data.description,
        data.costType,
        data.expectedAmount ?? null,
        data.actualAmount ?? null,
        data.incurredAt,
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('OperationalCost insert did not return a row');
    return toOperationalCost(row);
  });
}

export async function getCashFlowSummary(
  database: DatabaseRuntime,
  period: CashFlowPeriod,
): Promise<CashFlowSummary> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const receivablesDue = await sumColumn(client, 'receivables', 'amount', agencyId, period, 'due_at');
    const payablesDue = await sumColumn(client, 'payables', 'amount', agencyId, period, 'due_at');
    const paymentsIn = await sumPayments(client, agencyId, period, PaymentDirection.IN);
    const paymentsOut = await sumPayments(client, agencyId, period, PaymentDirection.OUT);

    return {
      projected: {
        receivablesDue,
        payablesDue,
        balance: roundMoney(receivablesDue - payablesDue),
      },
      realized: {
        paymentsIn,
        paymentsOut,
        balance: roundMoney(paymentsIn - paymentsOut),
      },
    };
  });
}

export async function getSaleMargin(database: DatabaseRuntime, saleId: string): Promise<SaleMargin> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const sale = await client.query<{ total: string }>(
      `SELECT total FROM sales WHERE agency_id = $1 AND id = $2`,
      [agencyId, saleId],
    );
    const row = sale.rows[0];
    if (!row) {
      throw new NotFoundError('Sale not found');
    }

    const supplierCosts = await sumBySale(client, 'payables', agencyId, saleId);
    const operationalCosts = await sumBySale(
      client,
      'operational_costs',
      agencyId,
      saleId,
      'COALESCE(actual_amount, expected_amount, 0)',
    );
    const commission = await sumBySale(client, 'commissions', agencyId, saleId);
    const revenue = Number(row.total);

    return {
      saleId,
      revenue,
      supplierCosts,
      operationalCosts,
      commission,
      margin: roundMoney(revenue - supplierCosts - operationalCosts - commission),
    };
  });
}

export async function getFinancialSummary(database: DatabaseRuntime): Promise<FinancialSummary> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    // This month's sales (PAID or CONFIRMED)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const salesResult = await client.query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(total), 0)::text AS total, COUNT(*)::text AS count
       FROM sales
       WHERE agency_id = $1
         AND status IN ('PAID', 'CONFIRMED')
         AND created_at >= $2
         AND created_at <= $3`,
      [agencyId, monthStart, monthEnd],
    );
    const salesRow = salesResult.rows[0];
    const salesThisMonth = {
      total: roundMoney(Number(salesRow?.total ?? 0)),
      count: Number(salesRow?.count ?? 0),
    };

    // Total received (payments with direction IN)
    const receivedResult = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM payments
       WHERE agency_id = $1 AND direction = 'IN'`,
      [agencyId],
    );
    const received = roundMoney(Number(receivedResult.rows[0]?.total ?? 0));

    // Pending receivables (OPEN or PARTIALLY_PAID)
    const pendingResult = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM receivables
       WHERE agency_id = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')`,
      [agencyId],
    );
    const pending = roundMoney(Number(pendingResult.rows[0]?.total ?? 0));

    // Expected margin (total revenue - total costs - commissions) for this month
    const marginResult = await client.query<{
      revenue: string;
      supplier_costs: string;
      operational_costs: string;
      commissions: string;
    }>(
      `SELECT
        COALESCE(SUM(s.total), 0)::text AS revenue,
        COALESCE(SUM(CASE WHEN p.sale_id = s.id THEN p.amount ELSE 0 END), 0)::text AS supplier_costs,
        COALESCE(SUM(CASE WHEN oc.sale_id = s.id THEN COALESCE(oc.actual_amount, oc.expected_amount, 0) ELSE 0 END), 0)::text AS operational_costs,
        COALESCE(SUM(CASE WHEN c.sale_id = s.id THEN c.amount ELSE 0 END), 0)::text AS commissions
       FROM sales s
       LEFT JOIN payables p ON s.agency_id = p.agency_id AND s.id = p.sale_id
       LEFT JOIN operational_costs oc ON s.agency_id = oc.agency_id AND s.id = oc.sale_id
       LEFT JOIN commissions c ON s.agency_id = c.agency_id AND s.id = c.sale_id
       WHERE s.agency_id = $1
         AND s.status IN ('PAID', 'CONFIRMED')
         AND s.created_at >= $2
         AND s.created_at <= $3`,
      [agencyId, monthStart, monthEnd],
    );
    const marginRow = marginResult.rows[0];
    const revenue = Number(marginRow?.revenue ?? 0);
    const supplierCosts = Number(marginRow?.supplier_costs ?? 0);
    const operationalCosts = Number(marginRow?.operational_costs ?? 0);
    const commissions = Number(marginRow?.commissions ?? 0);
    const expectedMargin = roundMoney(revenue - supplierCosts - operationalCosts - commissions);

    // Recent payments (last 10, ordered by date DESC)
    const recentPaymentsResult = await client.query<{
      id: string;
      customer_id: string;
      customer_name: string;
      description: string;
      amount: string;
      occurred_at: string;
    }>(
      `SELECT p.id, r.customer_id, c.name AS customer_name,
              r.description, p.amount, p.occurred_at
       FROM payments p
       LEFT JOIN payment_allocations pa ON p.agency_id = pa.agency_id AND p.id = pa.payment_id
       LEFT JOIN receivables r ON p.agency_id = r.agency_id AND pa.receivable_id = r.id
       LEFT JOIN customers c ON r.agency_id = c.agency_id AND r.customer_id = c.id
       WHERE p.agency_id = $1 AND p.direction = 'IN'
       ORDER BY p.occurred_at DESC
       LIMIT 10`,
      [agencyId],
    );
    const recentPayments = recentPaymentsResult.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      description: row.description || 'Pagamento',
      amount: roundMoney(Number(row.amount)),
      occurredAt: new Date(row.occurred_at),
      status: 'PAID' as const,
    }));

    // Upcoming receivables (OPEN or PARTIALLY_PAID, ordered by due date)
    const upcomingReceivablesResult = await client.query<{
      id: string;
      customer_id: string;
      customer_name: string;
      description: string;
      amount: string;
      due_at: string;
      status: FinancialObligationStatus;
    }>(
      `SELECT r.id, r.customer_id, c.name AS customer_name, r.description,
              r.amount, r.due_at, r.status
       FROM receivables r
       LEFT JOIN customers c ON r.agency_id = c.agency_id AND r.customer_id = c.id
       WHERE r.agency_id = $1 AND r.status IN ('OPEN', 'PARTIALLY_PAID')
       ORDER BY r.due_at ASC
       LIMIT 10`,
      [agencyId],
    );
    const upcomingReceivables = upcomingReceivablesResult.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      description: row.description,
      amount: roundMoney(Number(row.amount)),
      dueAt: new Date(row.due_at),
      status: row.status,
    }));

    return {
      salesThisMonth,
      received,
      pending,
      expectedMargin,
      recentPayments,
      upcomingReceivables,
    };
  });
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function assertOptionalRef(
  client: TenantTransactionClient,
  agencyId: string,
  table: string,
  id: string | undefined,
  message: string,
): Promise<void> {
  if (id === undefined) {
    return;
  }
  await assertRef(client, agencyId, table, id, message);
}

async function assertRef(
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
    throw new NotFoundError(message);
  }
}

async function sumAllocationsForPayment(
  client: TenantTransactionClient,
  agencyId: string,
  paymentId: string,
): Promise<number> {
  const result = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS sum
     FROM payment_allocations
     WHERE agency_id = $1 AND payment_id = $2`,
    [agencyId, paymentId],
  );
  return Number(result.rows[0]?.sum ?? 0);
}

async function lockReceivable(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Receivable> {
  const result = await client.query<ReceivableRow>(
    `SELECT ${RECEIVABLE_COLUMNS} FROM receivables
     WHERE agency_id = $1 AND id = $2
     FOR UPDATE`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Receivable not found');
  return toReceivable(row);
}

async function lockPayable(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Payable> {
  const result = await client.query<PayableRow>(
    `SELECT ${PAYABLE_COLUMNS} FROM payables
     WHERE agency_id = $1 AND id = $2
     FOR UPDATE`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Payable not found');
  return toPayable(row);
}

async function assertTargetCapacity(
  client: TenantTransactionClient,
  agencyId: string,
  column: 'receivable_id' | 'payable_id',
  targetId: string,
  targetAmount: number,
  allocationAmount: number,
): Promise<void> {
  const result = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS sum
     FROM payment_allocations
     WHERE agency_id = $1 AND ${column} = $2`,
    [agencyId, targetId],
  );
  const allocated = Number(result.rows[0]?.sum ?? 0);
  if (roundMoney(allocated + allocationAmount) > targetAmount) {
    throw new ValidationError('Allocations cannot exceed target amount');
  }
}

async function insertAllocation(
  client: TenantTransactionClient,
  agencyId: string,
  paymentId: string,
  allocation: CreatePaymentAllocationInput,
): Promise<AllocationRow> {
  const result = await client.query<AllocationRow>(
    `INSERT INTO payment_allocations
       (agency_id, payment_id, receivable_id, payable_id, amount)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${ALLOCATION_COLUMNS}`,
    [
      agencyId,
      paymentId,
      allocation.receivableId ?? null,
      allocation.payableId ?? null,
      allocation.amount,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('PaymentAllocation insert did not return a row');
  return row;
}

async function refreshReceivableStatus(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Receivable> {
  const result = await client.query<ReceivableRow>(
    `UPDATE receivables r
     SET status = CASE
       WHEN allocated.total <= 0 THEN 'OPEN'::"FinancialObligationStatus"
       WHEN allocated.total >= r.amount THEN 'PAID'::"FinancialObligationStatus"
       ELSE 'PARTIALLY_PAID'::"FinancialObligationStatus"
     END,
     updated_at = now()
     FROM (
       SELECT COALESCE(SUM(amount), 0) AS total
       FROM payment_allocations
       WHERE agency_id = $1 AND receivable_id = $2
     ) allocated
     WHERE r.agency_id = $1 AND r.id = $2
     RETURNING ${RECEIVABLE_COLUMNS}`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Receivable not found');
  return toReceivable(row);
}

async function refreshPayableStatus(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Payable> {
  const result = await client.query<PayableRow>(
    `UPDATE payables p
     SET status = CASE
       WHEN allocated.total <= 0 THEN 'OPEN'::"FinancialObligationStatus"
       WHEN allocated.total >= p.amount THEN 'PAID'::"FinancialObligationStatus"
       ELSE 'PARTIALLY_PAID'::"FinancialObligationStatus"
     END,
     updated_at = now()
     FROM (
       SELECT COALESCE(SUM(amount), 0) AS total
       FROM payment_allocations
       WHERE agency_id = $1 AND payable_id = $2
     ) allocated
     WHERE p.agency_id = $1 AND p.id = $2
     RETURNING ${PAYABLE_COLUMNS}`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Payable not found');
  return toPayable(row);
}

async function sumColumn(
  client: TenantTransactionClient,
  table: 'receivables' | 'payables',
  column: string,
  agencyId: string,
  period: CashFlowPeriod,
  dateColumn: string,
): Promise<number> {
  const result = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(${column}), 0)::text AS sum
     FROM ${table}
     WHERE agency_id = $1
       AND status <> 'CANCELLED'
       AND ${dateColumn} >= $2
       AND ${dateColumn} <= $3`,
    [agencyId, period.from, period.to],
  );
  return Number(result.rows[0]?.sum ?? 0);
}

async function sumPayments(
  client: TenantTransactionClient,
  agencyId: string,
  period: CashFlowPeriod,
  direction: PaymentDirection,
): Promise<number> {
  const result = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS sum
     FROM payments
     WHERE agency_id = $1
       AND direction = $2
       AND occurred_at >= $3
       AND occurred_at <= $4`,
    [agencyId, direction, period.from, period.to],
  );
  return Number(result.rows[0]?.sum ?? 0);
}

async function sumBySale(
  client: TenantTransactionClient,
  table: 'payables' | 'operational_costs' | 'commissions',
  agencyId: string,
  saleId: string,
  expression = 'amount',
): Promise<number> {
  const result = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(${expression}), 0)::text AS sum
     FROM ${table}
     WHERE agency_id = $1 AND sale_id = $2`,
    [agencyId, saleId],
  );
  return Number(result.rows[0]?.sum ?? 0);
}

function assertPositiveMoney(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`Field "${field}" must be a positive number`);
  }
}

function assertNonNegativeMoney(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(`Field "${field}" must be a non-negative number`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ============================================================
// CONVERTERS
// ============================================================

function toReceivable(row: ReceivableRow): Receivable {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    description: row.description,
    amount: Number(row.amount),
    dueAt: new Date(row.due_at),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.sale_id !== null ? { saleId: row.sale_id } : {}),
  };
}

function toPayable(row: PayableRow): Payable {
  return {
    id: row.id,
    agencyId: row.agency_id,
    description: row.description,
    amount: Number(row.amount),
    dueAt: new Date(row.due_at),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.sale_id !== null ? { saleId: row.sale_id } : {}),
    ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
    ...(row.commission_id !== null ? { commissionId: row.commission_id } : {}),
    ...(row.transport_operation_id !== null ? { transportOperationId: row.transport_operation_id } : {}),
    ...(row.operational_cost_id !== null ? { operationalCostId: row.operational_cost_id } : {}),
  };
}

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    agencyId: row.agency_id,
    direction: row.direction,
    amount: Number(row.amount),
    occurredAt: new Date(row.occurred_at),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    ...(row.method !== null ? { method: row.method } : {}),
    ...(row.reference !== null ? { reference: row.reference } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

function toAllocation(row: AllocationRow): PaymentAllocation {
  return {
    id: row.id,
    agencyId: row.agency_id,
    paymentId: row.payment_id,
    amount: Number(row.amount),
    createdAt: new Date(row.created_at),
    ...(row.receivable_id !== null ? { receivableId: row.receivable_id } : {}),
    ...(row.payable_id !== null ? { payableId: row.payable_id } : {}),
  };
}

function toOperationalCost(row: OperationalCostRow): OperationalCost {
  return {
    id: row.id,
    agencyId: row.agency_id,
    description: row.description,
    costType: row.cost_type,
    incurredAt: new Date(row.incurred_at),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.sale_id !== null ? { saleId: row.sale_id } : {}),
    ...(row.transport_operation_id !== null
      ? { transportOperationId: row.transport_operation_id }
      : {}),
    ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
    ...(row.expected_amount !== null ? { expectedAmount: Number(row.expected_amount) } : {}),
    ...(row.actual_amount !== null ? { actualAmount: Number(row.actual_amount) } : {}),
  };
}

function toFinancialCategory(row: FinancialCategoryRow): FinancialCategory {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    type: row.type,
    description: row.description || undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toRevenue(row: RevenueRow): Revenue {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    categoryId: row.category_id,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    competencyDate: new Date(row.competency_date),
    dueDate: new Date(row.due_date),
    paymentMethod: row.payment_method ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    saleId: row.sale_id || undefined,
    bookingId: row.booking_id || undefined,
    receiptDate: row.receipt_date ? new Date(row.receipt_date) : undefined,
  };
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    agencyId: row.agency_id,
    supplierId: row.supplier_id ?? undefined,
    categoryId: row.category_id,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    incurredAt: new Date(row.incurred_at),
    dueDate: new Date(row.due_date),
    paymentMethod: row.payment_method || undefined,
    status: row.status,
    recurrence: row.recurrence || undefined,
    notes: row.notes || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    paymentDate: row.payment_date ? new Date(row.payment_date) : undefined,
  };
}

function toCashTransaction(row: CashTransactionRow): CashTransaction {
  return {
    id: row.id,
    agencyId: row.agency_id,
    type: row.type,
    amount: Number(row.amount),
    occurringAt: new Date(row.occurring_at),
    origin: row.origin,
    calculatedBalance: Number(row.calculated_balance),
    notes: row.notes || undefined,
    createdAt: new Date(row.created_at),
    relatedRecordId: row.related_record_id || undefined,
    relatedRecordType: row.related_record_type || undefined,
  };
}

function toReconciliation(row: ReconciliationRow): Reconciliation {
  return {
    id: row.id,
    agencyId: row.agency_id,
    reconciliationDate: new Date(row.reconciliation_date),
    expectedAmount: Number(row.expected_amount),
    actualAmount: Number(row.actual_amount),
    status: row.status,
    notes: row.notes || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    paymentId: row.payment_id || undefined,
  };
}
