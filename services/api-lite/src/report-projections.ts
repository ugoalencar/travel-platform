/**
 * Report projections (Frente 9) -- pure functions, no I/O. All money is summed
 * in integer cents. Amounts of different obligations are never added together:
 * customer receivables, agency revenue and employee commission are projected
 * separately (ADR-007 D3), so nothing here can double count.
 */

const cents = (value: number): number => Math.round(value * 100);
const money = (value: number): number => value / 100;
const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

// ---------------------------------------------------------------- receivables

export interface ReceivableRow {
  id: string;
  saleId: string | null;
  /** Civil date (YYYY-MM-DD). */
  dueDate: string;
  amount: number;
  /** Sum of the payment allocations on this receivable. */
  paid: number;
  status: string;
}

export interface ReceivablesProjection {
  late: { count: number; openBalance: number };
  byMonth: Array<{ month: string; openBalance: number; count: number }>;
  totalOpen: number;
}

export function projectReceivables(rows: readonly ReceivableRow[], today: string): ReceivablesProjection {
  const months = new Map<string, { cents: number; count: number }>();
  let lateCents = 0;
  let lateCount = 0;
  let total = 0;
  for (const row of rows) {
    if (row.status === 'CANCELLED' || row.status === 'PAID') continue;
    const open = Math.max(0, cents(row.amount) - cents(row.paid));
    if (open === 0) continue;
    total += open;
    // A due date equal to today is not late (late starts the civil day after).
    if (row.dueDate < today) {
      lateCents += open;
      lateCount += 1;
      continue;
    }
    const bucket = months.get(monthOf(row.dueDate)) ?? { cents: 0, count: 0 };
    bucket.cents += open;
    bucket.count += 1;
    months.set(monthOf(row.dueDate), bucket);
  }
  return {
    late: { count: lateCount, openBalance: money(lateCents) },
    byMonth: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({ month, openBalance: money(bucket.cents), count: bucket.count })),
    totalOpen: money(total),
  };
}

// ------------------------------------------------------------- agency revenue

export interface RevenueRow {
  entryId: string;
  supplierId: string | null;
  status: string;
  amount: number;
  receivedAmount: number | null;
  /** Civil date the right was constituted (ENTITLED/AVAILABLE). */
  entitledOn: string | null;
  /** Estimated civil date for a FORECAST entry, when one can be derived. */
  expectedOn: string | null;
}

interface RevenueClass {
  total: number;
  byMonth: Array<{ month: string; amount: number }>;
}

export interface RevenueProjection {
  contracted: RevenueClass;
  projected: RevenueClass;
  undefined: { total: number };
  bySupplier: Array<{ supplierId: string | null; contracted: number; projected: number; undefined: number }>;
  grandTotal: number;
}

export function projectRevenue(rows: readonly RevenueRow[]): RevenueProjection {
  const classes = { contracted: new Map<string, number>(), projected: new Map<string, number>() };
  let undefinedCents = 0;
  const suppliers = new Map<string, { id: string | null; contracted: number; projected: number; undefined: number }>();
  for (const row of rows) {
    // PENDING_RULE has no revenue; CANCELLED and RECEIVED are not future money.
    if (!['FORECAST', 'ENTITLED', 'AVAILABLE'].includes(row.status)) continue;
    const value = cents(row.amount);
    const supplier = suppliers.get(row.supplierId ?? '') ?? { id: row.supplierId, contracted: 0, projected: 0, undefined: 0 };
    suppliers.set(row.supplierId ?? '', supplier);
    if (row.status !== 'FORECAST') {
      supplier.contracted += value;
      const month = monthOf(row.entitledOn ?? row.expectedOn ?? '0000-00');
      classes.contracted.set(month, (classes.contracted.get(month) ?? 0) + value);
    } else if (row.expectedOn) {
      supplier.projected += value;
      const month = monthOf(row.expectedOn);
      classes.projected.set(month, (classes.projected.get(month) ?? 0) + value);
    } else {
      supplier.undefined += value;
      undefinedCents += value;
    }
  }
  const toClass = (map: Map<string, number>): RevenueClass => ({
    total: money([...map.values()].reduce((sum, value) => sum + value, 0)),
    byMonth: [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, amount: money(value) })),
  });
  const contracted = toClass(classes.contracted);
  const projected = toClass(classes.projected);
  return {
    contracted,
    projected,
    undefined: { total: money(undefinedCents) },
    bySupplier: [...suppliers.values()]
      .sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
      .map((supplier) => ({
        supplierId: supplier.id,
        contracted: money(supplier.contracted),
        projected: money(supplier.projected),
        undefined: money(supplier.undefined),
      })),
    grandTotal: money(cents(contracted.total) + cents(projected.total) + undefinedCents),
  };
}

export interface SupplierBalance {
  supplierId: string | null;
  expected: number;
  received: number;
  difference: number;
}

/** Expected (live entries with a right or received) x received x open difference, per supplier. */
export function supplierBalances(rows: readonly RevenueRow[]): SupplierBalance[] {
  const suppliers = new Map<string, { id: string | null; expected: number; received: number }>();
  for (const row of rows) {
    if (!['ENTITLED', 'AVAILABLE', 'RECEIVED'].includes(row.status)) continue;
    const supplier = suppliers.get(row.supplierId ?? '') ?? { id: row.supplierId, expected: 0, received: 0 };
    supplier.expected += cents(row.amount);
    if (row.status === 'RECEIVED') supplier.received += cents(row.receivedAmount ?? 0);
    suppliers.set(row.supplierId ?? '', supplier);
  }
  return [...suppliers.values()]
    .sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
    .map((supplier) => ({
      supplierId: supplier.id,
      expected: money(supplier.expected),
      received: money(supplier.received),
      difference: money(supplier.expected - supplier.received),
    }));
}

// ---------------------------------------------------------- employee commission

export interface CommissionRow {
  entryId: string;
  amount: number;
  /** Amount released for payment by the customer receipts (release policy). */
  released: number;
  paid: number;
  status: string;
}

export interface CommissionProjection {
  forecast: number;
  released: number;
  paid: number;
  releasedNotPaid: number;
  notYetReleased: number;
}

export function projectCommissions(rows: readonly CommissionRow[]): CommissionProjection {
  let forecast = 0;
  let released = 0;
  let paid = 0;
  for (const row of rows) {
    if (row.status === 'CANCELLED') continue;
    const amount = cents(row.amount);
    const rel = Math.min(Math.max(cents(row.released), 0), amount);
    const pd = Math.min(Math.max(cents(row.paid), 0), rel);
    forecast += amount;
    released += rel;
    paid += pd;
  }
  return {
    forecast: money(forecast),
    released: money(released),
    paid: money(paid),
    releasedNotPaid: money(released - paid),
    notYetReleased: money(forecast - released),
  };
}
