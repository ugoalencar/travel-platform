import {
  PaymentDirection,
  type FinancialObligationStatus,
  type OperationalCost,
  type Payable,
  type Payment,
  type PaymentAllocation,
  type Receivable,
} from '../../../packages/domain/types';
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError, ValidationError } from './errors';

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
