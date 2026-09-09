// ============================================================
// MANAGEMENT REPORTS (Wave C, Part 1)
// ============================================================
// Read-only aggregation queries reusing existing Sales/Financial/Wave B
// (Employee, Commission, Payroll) data. No new tables/migrations.
// All queries are tenant-scoped via agency_id = current_agency_id() (RLS)
// and the explicit agency_id = $1 filter, matching the rest of the
// codebase's convention.
//
// Upper bound note (see financial.ts DRE): callers that want "all time"
// should pass a `to` far in the future (e.g. 2100-01-01), NOT `now()`,
// because seed data includes future-dated trips/sales that a naive
// `<= now()` filter would silently exclude.
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ------------------------------------------------------------
// SALES REPORTS
// ------------------------------------------------------------

export type SalesGroupBy = 'period' | 'employee' | 'destination' | 'customer' | 'product';

export interface SalesReportRow {
  key: string;
  label: string;
  count: number;
  total: number;
}

export async function getSalesReport(
  database: DatabaseRuntime,
  groupBy: SalesGroupBy,
  from: Date,
  to: Date,
): Promise<SalesReportRow[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    let sql: string;
    switch (groupBy) {
      case 'employee':
        sql = `SELECT COALESCE(e.id, s.user_id) AS key,
                      COALESCE(e.name, u.name, 'Sem vendedor') AS label,
                      COUNT(*)::int AS count,
                      COALESCE(SUM(s.total), 0)::text AS total
               FROM sales s
               LEFT JOIN users u ON u.agency_id = s.agency_id AND u.id = s.user_id
               LEFT JOIN employees e ON e.agency_id = s.agency_id AND e.user_id = s.user_id
               WHERE s.agency_id = $1 AND s.created_at >= $2 AND s.created_at <= $3
               GROUP BY COALESCE(e.id, s.user_id), COALESCE(e.name, u.name, 'Sem vendedor')
               ORDER BY total DESC`;
        break;
      case 'destination':
        sql = `SELECT COALESCE(t.destination, 'Sem destino') AS key,
                      COALESCE(t.destination, 'Sem destino') AS label,
                      COUNT(DISTINCT s.id)::int AS count,
                      COALESCE(SUM(s.total), 0)::text AS total
               FROM sales s
               LEFT JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id
               WHERE s.agency_id = $1 AND s.created_at >= $2 AND s.created_at <= $3
               GROUP BY COALESCE(t.destination, 'Sem destino')
               ORDER BY total DESC`;
        break;
      case 'customer':
        sql = `SELECT c.id AS key, c.name AS label,
                      COUNT(*)::int AS count,
                      COALESCE(SUM(s.total), 0)::text AS total
               FROM sales s
               JOIN customers c ON c.agency_id = s.agency_id AND c.id = s.customer_id
               WHERE s.agency_id = $1 AND s.created_at >= $2 AND s.created_at <= $3
               GROUP BY c.id, c.name
               ORDER BY total DESC`;
        break;
      case 'product':
        sql = `SELECT COALESCE(o.id, 'SEM_OFERTA') AS key,
                      COALESCE(o.name, 'Sem oferta vinculada') AS label,
                      COUNT(*)::int AS count,
                      COALESCE(SUM(s.total), 0)::text AS total
               FROM sales s
               LEFT JOIN proposals p ON p.agency_id = s.agency_id AND p.id = s.proposal_id
               LEFT JOIN offers o ON o.agency_id = s.agency_id AND o.id = p.offer_id
               WHERE s.agency_id = $1 AND s.created_at >= $2 AND s.created_at <= $3
               GROUP BY COALESCE(o.id, 'SEM_OFERTA'), COALESCE(o.name, 'Sem oferta vinculada')
               ORDER BY total DESC`;
        break;
      case 'period':
      default:
        sql = `SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS key,
                      to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS label,
                      COUNT(*)::int AS count,
                      COALESCE(SUM(s.total), 0)::text AS total
               FROM sales s
               WHERE s.agency_id = $1 AND s.created_at >= $2 AND s.created_at <= $3
               GROUP BY 1
               ORDER BY 1`;
        break;
    }

    const result = await client.query<{ key: string; label: string; count: number; total: string }>(
      sql,
      [agencyId, from, to],
    );
    return result.rows.map((row) => ({
      key: row.key,
      label: row.label,
      count: Number(row.count),
      total: roundMoney(Number(row.total)),
    }));
  });
}

// ------------------------------------------------------------
// FINANCIAL REPORTS
// ------------------------------------------------------------

export interface AgingBucketRow {
  bucket: 'current' | '1-30' | '31-60' | '60+';
  count: number;
  total: number;
}

async function agingReport(
  database: DatabaseRuntime,
  table: 'receivables' | 'payables',
): Promise<AgingBucketRow[]> {
  const agencyId = getAgencyId();
  const dateColumn = table === 'receivables' ? 'due_at' : 'due_at';
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ bucket: string; count: string; total: string }>(
      `SELECT
         CASE
           WHEN ${dateColumn} >= now() THEN 'current'
           WHEN now() - ${dateColumn} <= interval '30 days' THEN '1-30'
           WHEN now() - ${dateColumn} <= interval '60 days' THEN '31-60'
           ELSE '60+'
         END AS bucket,
         COUNT(*)::text AS count,
         COALESCE(SUM(amount), 0)::text AS total
       FROM ${table}
       WHERE agency_id = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')
       GROUP BY 1`,
      [agencyId],
    );
    const order: AgingBucketRow['bucket'][] = ['current', '1-30', '31-60', '60+'];
    const byBucket = new Map(result.rows.map((r) => [r.bucket, r]));
    return order.map((bucket) => {
      const row = byBucket.get(bucket);
      return {
        bucket,
        count: row ? Number(row.count) : 0,
        total: row ? roundMoney(Number(row.total)) : 0,
      };
    });
  });
}

export function getReceivablesAging(database: DatabaseRuntime): Promise<AgingBucketRow[]> {
  return agingReport(database, 'receivables');
}

export function getPayablesAging(database: DatabaseRuntime): Promise<AgingBucketRow[]> {
  return agingReport(database, 'payables');
}

export interface SupplierExposureRow {
  supplierId: string;
  supplierName: string;
  openTotal: number;
  paidTotal: number;
  count: number;
}

export async function getSupplierExposure(database: DatabaseRuntime): Promise<SupplierExposureRow[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      supplier_id: string;
      supplier_name: string;
      open_total: string;
      paid_total: string;
      count: string;
    }>(
      `SELECT s.id AS supplier_id, s.name AS supplier_name,
              COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('OPEN', 'PARTIALLY_PAID')), 0)::text AS open_total,
              COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0)::text AS paid_total,
              COUNT(p.id)::text AS count
       FROM suppliers s
       JOIN payables p ON p.agency_id = s.agency_id AND p.supplier_id = s.id
       WHERE s.agency_id = $1
       GROUP BY s.id, s.name
       ORDER BY open_total DESC`,
      [agencyId],
    );
    return result.rows.map((row) => ({
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      openTotal: roundMoney(Number(row.open_total)),
      paidTotal: roundMoney(Number(row.paid_total)),
      count: Number(row.count),
    }));
  });
}

export interface EmployeeExpenseRow {
  employeeId: string;
  employeeName: string;
  payrollTotal: number;
  commissionTotal: number;
  total: number;
}

export async function getEmployeeExpenses(database: DatabaseRuntime): Promise<EmployeeExpenseRow[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      employee_id: string;
      employee_name: string;
      payroll_total: string;
      commission_total: string;
    }>(
      `SELECT e.id AS employee_id, e.name AS employee_name,
              COALESCE(SUM(p.amount) FILTER (WHERE p.beneficiary_type = 'EMPLOYEE' AND p.payroll_entry_id IS NOT NULL), 0)::text AS payroll_total,
              COALESCE(SUM(p.amount) FILTER (WHERE p.beneficiary_type = 'EMPLOYEE' AND p.commission_entry_id IS NOT NULL), 0)::text AS commission_total
       FROM employees e
       LEFT JOIN payables p ON p.agency_id = e.agency_id AND p.employee_id = e.id
       WHERE e.agency_id = $1
       GROUP BY e.id, e.name
       ORDER BY e.name`,
      [agencyId],
    );
    return result.rows.map((row) => ({
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      payrollTotal: roundMoney(Number(row.payroll_total)),
      commissionTotal: roundMoney(Number(row.commission_total)),
      total: roundMoney(Number(row.payroll_total) + Number(row.commission_total)),
    }));
  });
}

export interface OperationalExpenseRow {
  categoryId: string | null;
  categoryName: string;
  total: number;
  count: number;
}

export async function getOperationalExpensesBreakdown(
  database: DatabaseRuntime,
): Promise<OperationalExpenseRow[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      category_id: string | null;
      category_name: string;
      total: string;
      count: string;
    }>(
      `SELECT ex.category_id, COALESCE(fc.name, 'Sem categoria') AS category_name,
              COALESCE(SUM(ex.amount), 0)::text AS total,
              COUNT(*)::text AS count
       FROM expenses ex
       LEFT JOIN financial_categories fc ON fc.agency_id = ex.agency_id AND fc.id = ex.category_id
       WHERE ex.agency_id = $1
       GROUP BY ex.category_id, fc.name
       ORDER BY total DESC`,
      [agencyId],
    );
    return result.rows.map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      total: roundMoney(Number(row.total)),
      count: Number(row.count),
    }));
  });
}

export interface ExpectedVsActualRow {
  label: string;
  expected: number;
  actual: number;
}

export async function getExpectedVsActual(
  database: DatabaseRuntime,
  from: Date,
  to: Date,
): Promise<ExpectedVsActualRow[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const recv = await client.query<{ expected: string; actual: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS expected,
              COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0)::text AS actual
       FROM receivables
       WHERE agency_id = $1 AND due_at >= $2 AND due_at <= $3`,
      [agencyId, from, to],
    );
    const pay = await client.query<{ expected: string; actual: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS expected,
              COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0)::text AS actual
       FROM payables
       WHERE agency_id = $1 AND due_at >= $2 AND due_at <= $3`,
      [agencyId, from, to],
    );
    return [
      {
        label: 'Recebimentos',
        expected: roundMoney(Number(recv.rows[0]?.expected ?? 0)),
        actual: roundMoney(Number(recv.rows[0]?.actual ?? 0)),
      },
      {
        label: 'Pagamentos',
        expected: roundMoney(Number(pay.rows[0]?.expected ?? 0)),
        actual: roundMoney(Number(pay.rows[0]?.actual ?? 0)),
      },
    ];
  });
}

export interface CashFlowPeriodRow {
  period: string;
  inflow: number;
  outflow: number;
  net: number;
}

export async function getCashFlowByPeriod(
  database: DatabaseRuntime,
  from: Date,
  to: Date,
): Promise<CashFlowPeriodRow[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ period: string; inflow: string; outflow: string }>(
      `SELECT to_char(date_trunc('month', occurring_at), 'YYYY-MM') AS period,
              COALESCE(SUM(amount) FILTER (WHERE type = 'INFLOW'), 0)::text AS inflow,
              COALESCE(SUM(amount) FILTER (WHERE type = 'OUTFLOW'), 0)::text AS outflow
       FROM cash_transactions
       WHERE agency_id = $1 AND occurring_at >= $2 AND occurring_at <= $3
       GROUP BY 1
       ORDER BY 1`,
      [agencyId, from, to],
    );
    return result.rows.map((row) => ({
      period: row.period,
      inflow: roundMoney(Number(row.inflow)),
      outflow: roundMoney(Number(row.outflow)),
      net: roundMoney(Number(row.inflow) - Number(row.outflow)),
    }));
  });
}

// ------------------------------------------------------------
// PROFITABILITY REPORTS
// ------------------------------------------------------------

export type ProfitabilityGroupBy = 'sale' | 'trip' | 'destination' | 'salesperson' | 'air' | 'land';

export interface ProfitabilityRow {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  margin: number;
}

export async function getProfitabilityReport(
  database: DatabaseRuntime,
  groupBy: ProfitabilityGroupBy,
): Promise<ProfitabilityRow[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    if (groupBy === 'air') {
      const result = await client.query<{
        key: string;
        label: string;
        revenue: string;
        cost: string;
      }>(
        `SELECT a.id AS key,
                COALESCE(a.flight_number, a.airline) || ' (' || a.origin || '-' || a.destination || ')' AS label,
                a.sale_value::text AS revenue,
                (a.cost + a.taxes + a.fees + COALESCE(a.commission, 0))::text AS cost
         FROM air_services a
         WHERE a.agency_id = $1
         ORDER BY a.created_at DESC`,
        [agencyId],
      );
      return result.rows.map((row) => toProfitRow(row));
    }
    if (groupBy === 'land') {
      const result = await client.query<{
        key: string;
        label: string;
        revenue: string;
        cost: string;
      }>(
        `SELECT l.id AS key, l.description AS label,
                l.sale_value::text AS revenue,
                (l.cost + l.taxes + l.fees + COALESCE(l.commission, 0))::text AS cost
         FROM land_services l
         WHERE l.agency_id = $1
         ORDER BY l.created_at DESC`,
        [agencyId],
      );
      return result.rows.map((row) => toProfitRow(row));
    }

    // sale / trip / destination / salesperson all derive from sales + its
    // payables/operational_costs/commissions (mirrors getSaleMargin, but
    // aggregated per-group instead of per single sale).
    let groupExpr: string;
    let joinExtra = '';
    switch (groupBy) {
      case 'trip':
        groupExpr = `COALESCE(t.id, 'SEM_VIAGEM')`;
        joinExtra = `LEFT JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id`;
        break;
      case 'destination':
        groupExpr = `COALESCE(t.destination, 'Sem destino')`;
        joinExtra = `LEFT JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id`;
        break;
      case 'salesperson':
        groupExpr = `COALESCE(e.id, s.user_id)`;
        joinExtra = `LEFT JOIN employees e ON e.agency_id = s.agency_id AND e.user_id = s.user_id
                     LEFT JOIN users u ON u.agency_id = s.agency_id AND u.id = s.user_id`;
        break;
      case 'sale':
      default:
        groupExpr = `s.id`;
        break;
    }

    let labelExpr: string;
    switch (groupBy) {
      case 'trip':
        labelExpr = `COALESCE(t.name, 'Sem viagem')`;
        break;
      case 'destination':
        labelExpr = `COALESCE(t.destination, 'Sem destino')`;
        break;
      case 'salesperson':
        labelExpr = `COALESCE(e.name, u.name, 'Sem vendedor')`;
        break;
      case 'sale':
      default:
        labelExpr = `c.name || ' — ' || to_char(s.created_at, 'DD/MM/YYYY')`;
        break;
    }

    const sql = `
      SELECT ${groupExpr} AS key,
             MIN(${labelExpr}) AS label,
             COALESCE(SUM(s.total), 0)::text AS revenue,
             COALESCE(SUM(costs.total_cost), 0)::text AS cost
      FROM sales s
      JOIN customers c ON c.agency_id = s.agency_id AND c.id = s.customer_id
      ${joinExtra}
      LEFT JOIN LATERAL (
        SELECT
          COALESCE((SELECT SUM(p.amount) FROM payables p WHERE p.agency_id = s.agency_id AND p.sale_id = s.id), 0)
          + COALESCE((SELECT SUM(COALESCE(oc.actual_amount, oc.expected_amount, 0)) FROM operational_costs oc WHERE oc.agency_id = s.agency_id AND oc.sale_id = s.id), 0)
          + COALESCE((SELECT SUM(co.amount) FROM commissions co WHERE co.agency_id = s.agency_id AND co.sale_id = s.id), 0)
          AS total_cost
      ) costs ON true
      WHERE s.agency_id = $1
      GROUP BY ${groupExpr}
      ORDER BY revenue DESC`;

    const result = await client.query<{ key: string; label: string; revenue: string; cost: string }>(
      sql,
      [agencyId],
    );
    return result.rows.map((row) => toProfitRow(row));
  });
}

function toProfitRow(row: { key: string; label: string; revenue: string; cost: string }): ProfitabilityRow {
  const revenue = roundMoney(Number(row.revenue));
  const cost = roundMoney(Number(row.cost));
  return {
    key: row.key,
    label: row.label,
    revenue,
    cost,
    margin: roundMoney(revenue - cost),
  };
}

// ------------------------------------------------------------
// PERSONNEL REPORTS
// ------------------------------------------------------------

export type PersonnelGroupBy = 'employee' | 'month';

export interface PersonnelReportRow {
  key: string;
  label: string;
  salaryExpense: number;
  commissionTotal: number;
  total: number;
}

export async function getPersonnelReport(
  database: DatabaseRuntime,
  groupBy: PersonnelGroupBy,
): Promise<PersonnelReportRow[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    if (groupBy === 'month') {
      const result = await client.query<{
        key: string;
        salary: string;
        commissions: string;
      }>(
        `SELECT to_char(pr.competence, 'YYYY-MM') AS key,
                COALESCE(SUM(pr.base_salary + pr.benefits + pr.bonuses), 0)::text AS salary,
                COALESCE(SUM(pr.commissions_total), 0)::text AS commissions
         FROM payroll_entries pr
         WHERE pr.agency_id = $1
         GROUP BY 1
         ORDER BY 1`,
        [agencyId],
      );
      return result.rows.map((row) => ({
        key: row.key,
        label: row.key,
        salaryExpense: roundMoney(Number(row.salary)),
        commissionTotal: roundMoney(Number(row.commissions)),
        total: roundMoney(Number(row.salary) + Number(row.commissions)),
      }));
    }

    // employee
    const result = await client.query<{
      key: string;
      label: string;
      salary: string;
      commissions: string;
    }>(
      `SELECT e.id AS key, e.name AS label,
              COALESCE((SELECT SUM(pr.base_salary + pr.benefits + pr.bonuses) FROM payroll_entries pr WHERE pr.agency_id = e.agency_id AND pr.employee_id = e.id), 0)::text AS salary,
              COALESCE((SELECT SUM(ce.amount) FROM commission_entries ce WHERE ce.agency_id = e.agency_id AND ce.employee_id = e.id AND ce.status <> 'CANCELLED'), 0)::text AS commissions
       FROM employees e
       WHERE e.agency_id = $1
       ORDER BY e.name`,
      [agencyId],
    );
    return result.rows.map((row) => ({
      key: row.key,
      label: row.label,
      salaryExpense: roundMoney(Number(row.salary)),
      commissionTotal: roundMoney(Number(row.commissions)),
      total: roundMoney(Number(row.salary) + Number(row.commissions)),
    }));
  });
}
