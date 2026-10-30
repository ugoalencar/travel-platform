// Employee Commission calculation engine -- per-employee, per-product-type
// commissions computed from EmployeeCommissionRule (employee-commission-rules.ts)
// against REAL sale/trip/product data. Extends commission_entries
// (commissions.ts) rather than creating a parallel ledger -- every entry
// generated here lands in the exact same table, status lifecycle, and
// financial/DRE integration as the pre-existing global-plan commissions.
//
// Backend-authoritative (spec: "NUNCA aceitar do browser commission_amount/
// commission_rate/base_amount como valores autoritativos"): every base
// amount is read from a real domain table server-side; the only client
// input accepted is WHICH sale/employee/product/source item to commission,
// plus (for HOTEL/TRANSFER only, which have no structured pricing table --
// see docs/product/COMISSIONAMENTO_FUNCIONARIOS.md) a manager-entered base
// amount/quantity -- the commission VALUE itself is still always computed
// here from the resolved rule, never accepted directly.
import {
  EmployeeCommissionBasis,
  EmployeeCommissionCalculationType,
  EmployeeCommissionProductType,
  type CommissionEntry,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { findApplicableRule } from './employee-commission-rules';
import { captureSaleReleasePolicySnapshot } from './commission-release-service';

interface CommissionEntryRow {
  id: string;
  agency_id: string;
  employee_id: string;
  sale_id: string;
  supplier_id?: string | null;
  trip_id: string | null;
  commission_plan_id: string | null;
  commission_rule_id: string | null;
  product_type: EmployeeCommissionProductType | null;
  source_item_id: string | null;
  source_item_type: string | null;
  quantity: string | null;
  calculation_base: string;
  rate: string | null;
  amount: string;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const ENTRY_COLUMNS = `id, agency_id, employee_id, sale_id, supplier_id, trip_id, commission_plan_id,
  commission_rule_id, product_type, source_item_id, source_item_type, quantity,
  calculation_base, rate, amount, status, approved_at, approved_by, paid_at, notes,
  created_at, updated_at`;

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
    status: row.status as CommissionEntry['status'],
    approvedAt: row.approved_at !== null ? new Date(row.approved_at) : undefined,
    approvedBy: row.approved_by ?? undefined,
    paidAt: row.paid_at !== null ? new Date(row.paid_at) : undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface GenerateEmployeeCommissionInput {
  saleId: string;
  employeeId: string;
  productType: EmployeeCommissionProductType;
  sourceItemId?: string | undefined;
  // Only consulted for HOTEL/TRANSFER (no structured pricing table exists
  // for these two yet -- see migration 080 header). Ignored for every
  // other product type, which always reads a real amount server-side.
  manualBaseAmount?: number | undefined;
  manualQuantity?: number | undefined;
  notes?: string | undefined;
}

interface ResolvedBase {
  baseAmount: number;
  quantity: number;
  sourceItemType: string;
  resolvedSourceItemId: string | null;
}

async function resolveBase(
  client: TenantTransactionClient,
  agencyId: string,
  tripId: string | null,
  sale: { id: string; total: string },
  input: GenerateEmployeeCommissionInput,
): Promise<ResolvedBase> {
  switch (input.productType) {
    case EmployeeCommissionProductType.AIR: {
      if (!input.sourceItemId) {
        throw new ValidationError('sourceItemId (an air_services id) is required for productType AIR');
      }
      const result = await client.query<{ sale_value: string }>(
        `SELECT sale_value FROM air_services WHERE agency_id = $1 AND id = $2 AND trip_id = $3`,
        [agencyId, input.sourceItemId, tripId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundError('Air service not found for this sale');
      return {
        baseAmount: Number(row.sale_value),
        quantity: 1,
        sourceItemType: 'AIR_SERVICE',
        resolvedSourceItemId: input.sourceItemId,
      };
    }
    case EmployeeCommissionProductType.LAND: {
      if (!input.sourceItemId) {
        throw new ValidationError('sourceItemId (a land_services id) is required for productType LAND');
      }
      const result = await client.query<{ sale_value: string }>(
        `SELECT sale_value FROM land_services WHERE agency_id = $1 AND id = $2 AND trip_id = $3`,
        [agencyId, input.sourceItemId, tripId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundError('Land service not found for this sale');
      return {
        baseAmount: Number(row.sale_value),
        quantity: 1,
        sourceItemType: 'LAND_SERVICE',
        resolvedSourceItemId: input.sourceItemId,
      };
    }
    case EmployeeCommissionProductType.EXCURSION: {
      if (!input.sourceItemId) {
        throw new ValidationError(
          'sourceItemId (an excursion_departures id) is required for productType EXCURSION',
        );
      }
      // excursion_customers hangs off the DEPARTURE (a dated use of a
      // reusable excursion template), not the template itself, since
      // migration 072 -- the template only carries the shared
      // (non-dated) commercial fields like sale_value.
      const excursionResult = await client.query<{ sale_value: string | null }>(
        `SELECT ex.sale_value
         FROM excursion_departures ed
         JOIN excursions ex ON ex.agency_id = ed.agency_id AND ex.id = ed.excursion_id
         WHERE ed.agency_id = $1 AND ed.id = $2`,
        [agencyId, input.sourceItemId],
      );
      const excursion = excursionResult.rows[0];
      if (!excursion) throw new NotFoundError('Excursion departure not found');

      // Sum real per-passenger values where set (excursion_customers.sale_value,
      // added in migration 080); fall back to the excursion's aggregate
      // sale_value divided evenly across enrolled passengers for any
      // passenger without an explicit per-passenger value -- documented
      // gap, see docs/product/COMISSIONAMENTO_FUNCIONARIOS.md.
      const passengersResult = await client.query<{ sale_value: string | null }>(
        `SELECT sale_value FROM excursion_customers
         WHERE agency_id = $1 AND excursion_departure_id = $2 AND trip_id = $3`,
        [agencyId, input.sourceItemId, tripId],
      );
      const passengers = passengersResult.rows;
      if (passengers.length === 0) {
        throw new ValidationError('No passengers enrolled in this excursion for this trip');
      }
      const excursionTotal = excursion.sale_value !== null ? Number(excursion.sale_value) : 0;
      const fallbackPerPassenger = excursionTotal / passengers.length;
      const baseAmount = passengers.reduce(
        (sum, p) => sum + (p.sale_value !== null ? Number(p.sale_value) : fallbackPerPassenger),
        0,
      );
      return {
        baseAmount,
        quantity: passengers.length,
        sourceItemType: 'EXCURSION',
        resolvedSourceItemId: input.sourceItemId,
      };
    }
    case EmployeeCommissionProductType.INSURANCE: {
      if (!input.sourceItemId) {
        throw new ValidationError(
          'sourceItemId (an insurance_policies id) is required for productType INSURANCE',
        );
      }
      const result = await client.query<{ sale_amount: string }>(
        `SELECT sale_amount FROM insurance_policies WHERE agency_id = $1 AND id = $2 AND sale_id = $3`,
        [agencyId, input.sourceItemId, sale.id],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundError('Insurance policy not found for this sale');
      return {
        baseAmount: Number(row.sale_amount),
        quantity: 1,
        sourceItemType: 'INSURANCE_POLICY',
        resolvedSourceItemId: input.sourceItemId,
      };
    }
    case EmployeeCommissionProductType.PACKAGE: {
      return {
        baseAmount: Number(sale.total),
        quantity: 1,
        sourceItemType: 'SALE',
        resolvedSourceItemId: null,
      };
    }
    case EmployeeCommissionProductType.HOTEL:
    case EmployeeCommissionProductType.TRANSFER: {
      // No structured per-sale pricing table exists for these two yet
      // (audited gap) -- a manager-entered base amount/quantity is the
      // documented, explicit exception. The commission VALUE is still
      // always computed here from the resolved rule, never accepted
      // directly from the client.
      if (input.manualBaseAmount === undefined || input.manualBaseAmount < 0) {
        throw new ValidationError(
          `manualBaseAmount is required for productType ${input.productType} (no structured pricing table exists yet)`,
        );
      }
      return {
        baseAmount: input.manualBaseAmount,
        quantity: input.manualQuantity ?? 1,
        sourceItemType: 'MANUAL',
        resolvedSourceItemId: null,
      };
    }
    default:
      throw new ValidationError(`Unsupported productType: ${String(input.productType)}`);
  }
}

/**
 * Generates a per-employee, per-product-type commission entry for a sale,
 * resolving the rule that was ACTIVE on the sale's recognition date
 * (sales.created_at -- the only recognition event this domain defines
 * today; see docs/product/COMISSIONAMENTO_FUNCIONARIOS.md "Evento de
 * reconhecimento"), reading the real base amount from the real product
 * domain table, and persisting a full snapshot (rule id, product type,
 * source item, quantity, base, rate/fixed amount, resulting amount) so a
 * LATER change to the rule never recomputes this historical entry.
 */
export async function generateEmployeeCommission(
  database: DatabaseRuntime,
  input: GenerateEmployeeCommissionInput,
): Promise<CommissionEntry> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`commission-motor:${agencyId}:${input.saleId}:${input.employeeId}`]);
    const employeeResult = await client.query<{ id: string }>(
      `SELECT id FROM employees WHERE agency_id = $1 AND id = $2`,
      [agencyId, input.employeeId],
    );
    if (!employeeResult.rows[0]) {
      throw new NotFoundError('Employee not found');
    }

    const saleResult = await client.query<{ id: string; total: string; status: string; created_at: string; recognition_date: string }>(
      `SELECT id, total, status, created_at,
        to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS recognition_date
       FROM sales WHERE agency_id = $1 AND id = $2`,
      [agencyId, input.saleId],
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new NotFoundError('Sale not found');
    if (sale.status === 'CANCELLED') {
      throw new ValidationError('Cannot generate a commission for a cancelled sale');
    }

    const engineSettings = await client.query<{ cutover_date: string | null }>(
      'SELECT cutover_date::text FROM agency_commission_engine_settings WHERE agency_id=$1', [agencyId],
    );
    const cutoverDate = engineSettings.rows[0]?.cutover_date;
    if (cutoverDate && sale.recognition_date >= cutoverDate) {
      throw new ConflictError('This sale is within the versioned commission engine period');
    }

    const versionedAttribution = await client.query(
      `SELECT 1 FROM sale_commission_attributions
        WHERE agency_id = $1 AND sale_id = $2 AND employee_id = $3 AND state = 'ACTIVE'`,
      [agencyId, input.saleId, input.employeeId],
    );
    if (versionedAttribution.rows.length > 0) {
      throw new ConflictError('This sale uses versioned commission rules');
    }

    const tripResult = await client.query<{ id: string }>(
      `SELECT id FROM trips WHERE agency_id = $1 AND sale_id = $2 LIMIT 1`,
      [agencyId, input.saleId],
    );
    const tripId = tripResult.rows[0]?.id ?? null;

    // Dedupe guard (widened in migration 080 to include product_type):
    // at most one active commission per (sale, employee, productType).
    const duplicateResult = await client.query<{ id: string }>(
      `SELECT id FROM commission_entries
       WHERE agency_id = $1 AND sale_id = $2 AND employee_id = $3 AND product_type = $4
         AND status <> 'CANCELLED'
       LIMIT 1`,
      [agencyId, input.saleId, input.employeeId, input.productType],
    );
    if (duplicateResult.rows[0]) {
      throw new ConflictError(
        `A commission entry already exists for this sale, employee, and product type (id: ${duplicateResult.rows[0].id}). ` +
          'Cancel it before generating a new one.',
      );
    }

    // Recognition event: the sale's created_at. This domain has no other
    // defined recognition timestamp (no separate "confirmed_at") --
    // documented choice, not a fabricated new concept.
    const recognitionDate = new Date(sale.created_at);
    const rule = await findApplicableRule(database, input.employeeId, input.productType, recognitionDate);
    if (!rule) {
      throw new ValidationError(
        `No active commission rule found for this employee and productType ${input.productType} on ${recognitionDate.toISOString().slice(0, 10)}`,
      );
    }

    const base = await resolveBase(client, agencyId, tripId, sale, input);

    let rate: number | null = null;
    let amount: number;
    if (rule.calculationType === EmployeeCommissionCalculationType.PERCENTAGE) {
      rate = rule.percentageRate ?? 0;
      amount = Math.round(base.baseAmount * (rate / 100) * 100) / 100;
    } else {
      const perUnit = rule.fixedAmount ?? 0;
      const usesQuantity =
        rule.calculationBasis === EmployeeCommissionBasis.FIXED_PER_PASSENGER ||
        rule.calculationBasis === EmployeeCommissionBasis.FIXED_PER_TICKET;
      amount = usesQuantity ? Math.round(perUnit * base.quantity * 100) / 100 : perUnit;
    }

    if (amount < 0) {
      throw new ValidationError('Calculated commission amount is negative');
    }

    const releasePolicySnapshot = await captureSaleReleasePolicySnapshot(client, agencyId, input.saleId);

    const result = await client.query<CommissionEntryRow>(
      `INSERT INTO commission_entries
         (agency_id, employee_id, sale_id, trip_id, commission_rule_id, product_type,
          source_item_id, source_item_type, quantity, calculation_base, rate, amount,
          status, notes, release_policy_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', $13, $14::jsonb)
       RETURNING ${ENTRY_COLUMNS}`,
      [
        agencyId,
        input.employeeId,
        input.saleId,
        tripId,
        rule.id,
        input.productType,
        base.resolvedSourceItemId,
        base.sourceItemType,
        base.quantity,
        base.baseAmount,
        rate,
        amount,
        input.notes ?? null,
        JSON.stringify(releasePolicySnapshot),
      ],
    );
    return toCommissionEntry(result.rows[0]!);
  });
}

/**
 * Lists commission entries for the CALLING user's own linked employee
 * record only -- never accepts an employeeId from the caller. Self-view
 * for AGENT-level users (spec: "Um agente poderá visualizar suas próprias
 * comissões... Não ampliar privilégios silenciosamente" -- this is
 * strictly read-only and strictly self-scoped, not a general commissions
 * list).
 */
export async function listMyCommissionEntries(
  database: DatabaseRuntime,
  userId: string,
): Promise<CommissionEntry[]> {
  const agencyId = getAgencyId();
  const rows = await database.withTenantTransaction(async (client) => {
    const employeeResult = await client.query<{ id: string }>(
      `SELECT id FROM employees WHERE agency_id = $1 AND user_id = $2`,
      [agencyId, userId],
    );
    const employeeId = employeeResult.rows[0]?.id;
    if (!employeeId) return [];

    const result = await client.query<CommissionEntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM commission_entries
       WHERE agency_id = $1 AND employee_id = $2
       ORDER BY created_at DESC`,
      [agencyId, employeeId],
    );
    return result.rows;
  });
  return rows.map(toCommissionEntry);
}

export interface EmployeeCommissionReportFilters {
  employeeId?: string | undefined;
  productType?: string | undefined;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface EmployeeCommissionReportRow {
  id: string;
  employeeId: string;
  employeeName: string;
  saleId: string;
  customerName: string | null;
  productType: string | null;
  calculationBase: number;
  rate: number | null;
  amount: number;
  status: string;
  createdAt: Date;
}

/**
 * Per-employee commission report (spec section "Relatório por
 * funcionário"): joins employee name + sale's customer name onto each
 * commission_entries row, filterable by period/employee/product/status.
 */
export async function getEmployeeCommissionsReport(
  database: DatabaseRuntime,
  filters: EmployeeCommissionReportFilters = {},
): Promise<EmployeeCommissionReportRow[]> {
  const agencyId = getAgencyId();
  const conditions = ['ce.agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`ce.employee_id = $${values.length}`);
  }
  if (filters.productType) {
    values.push(filters.productType);
    conditions.push(`ce.product_type = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`ce.status = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`ce.created_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`ce.created_at <= $${values.length}`);
  }

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      employee_id: string;
      employee_name: string;
      sale_id: string;
      customer_name: string | null;
      product_type: string | null;
      calculation_base: string;
      rate: string | null;
      amount: string;
      status: string;
      created_at: string;
    }>(
      `SELECT ce.id, ce.employee_id, e.name AS employee_name, ce.sale_id,
              c.name AS customer_name, ce.product_type, ce.calculation_base,
              ce.rate, ce.amount, ce.status, ce.created_at
       FROM commission_entries ce
       JOIN employees e ON e.agency_id = ce.agency_id AND e.id = ce.employee_id
       LEFT JOIN sales s ON s.agency_id = ce.agency_id AND s.id = ce.sale_id
       LEFT JOIN customers c ON c.agency_id = s.agency_id AND c.id = s.customer_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ce.created_at DESC`,
      values,
    );
    return result.rows;
  });

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    saleId: row.sale_id,
    customerName: row.customer_name,
    productType: row.product_type,
    calculationBase: Number(row.calculation_base),
    rate: row.rate !== null ? Number(row.rate) : null,
    amount: Number(row.amount),
    status: row.status,
    createdAt: new Date(row.created_at),
  }));
}

/**
 * Cancellation cascade for a cancelled sale. PENDING/APPROVED entries are marked
 * CANCELLED. An entry already committed to a payment channel -- PAYABLE (standalone
 * payable), PAID, or APPROVED but reserved by a payroll entry -- cannot be silently
 * dropped: the sale cancellation is refused with 409 (decision F3), so no payable or
 * payroll keeps paying a commission whose sale no longer exists. Recovering money from
 * such cases is a separate, explicit financial adjustment (not implemented). Called
 * from sales.ts's cancelSale() in the same transaction; the entries are locked FOR
 * UPDATE so a concurrent create-payable / payroll generation serializes with it.
 */
export async function cancelCommissionsForSale(
  client: TenantTransactionClient,
  agencyId: string,
  saleId: string,
): Promise<void> {
  const entries = await client.query<{ id: string; status: string; payroll_entry_id: string | null }>(
    `SELECT id, status, payroll_entry_id FROM commission_entries
     WHERE agency_id = $1 AND sale_id = $2 AND status <> 'CANCELLED'
     ORDER BY id
     FOR UPDATE`,
    [agencyId, saleId],
  );
  const committed = entries.rows.filter(
    (entry) => entry.status === 'PAYABLE' || entry.status === 'PAID' || entry.payroll_entry_id !== null,
  );
  if (committed.length > 0) {
    throw new ConflictError(
      'Cannot cancel this sale: a commission for it is already in a payable, in a payroll entry or paid',
    );
  }
  await client.query(
    `UPDATE commission_entries
     SET status = 'CANCELLED', updated_at = now(),
         notes = COALESCE(notes || ' | ', '') || 'Auto-cancelado: venda cancelada'
     WHERE agency_id = $1 AND sale_id = $2 AND status IN ('PENDING', 'APPROVED')`,
    [agencyId, saleId],
  );
}
