/**
 * Sales import planner (IMP-01) -- pure: no I/O. Turns parsed rows into a plan
 * (dry run) that the service later executes. Rules:
 *  - natural key = `<source system>|<external_ref>`: a sale is never created twice;
 *  - A2: category/supplier/destination missing or unknown do NOT reject; the sale
 *    is imported and reported as "a completar";
 *  - the customer is linked by CPF and must already exist (never created silently);
 *  - an import never creates commissions or receivables (historical sales only).
 */
import { createHash } from 'node:crypto';

export const MAX_IMPORT_ROWS = 2000;

export const IMPORT_COLUMNS = [
  'external_ref', 'sale_date', 'customer_cpf', 'category', 'supplier', 'total', 'discount',
  'origin', 'destination', 'travel_start_date', 'notes',
] as const;

export type SalesImportRow = Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>;

export interface SalesImportLookups {
  /** digits-only CPF -> customer id */
  customersByCpf: ReadonlyMap<string, string>;
  /** normalized name -> category id */
  categoriesByName: ReadonlyMap<string, string>;
  suppliersByName: ReadonlyMap<string, string>;
  /** natural keys that already exist (previous imports) */
  existingKeys: ReadonlySet<string>;
  /** civil date, to refuse future sale dates */
  today: string;
}

export interface PlannedRow {
  row: number;
  status: 'NEW' | 'ALREADY_IMPORTED' | 'DUPLICATE_IN_FILE' | 'REJECTED';
  naturalKey: string;
  customerId: string | null;
  categoryId: string | null;
  supplierId: string | null;
  saleDate: string | null;
  total: number;
  discount: number;
  origin: string | null;
  destination: string | null;
  travelStartDate: string | null;
  notes: string | null;
  toComplete: Array<'category' | 'supplier' | 'destination'>;
  errors: Array<{ column: string; message: string }>;
}

export interface SalesImportPlan {
  sourceSystem: string;
  rows: PlannedRow[];
  summary: { total: number; new: number; alreadyImported: number; duplicateInFile: number; rejected: number; toComplete: number };
}

export const normalizeName = (value: string | undefined): string =>
  (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function validCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

export function normalizeCpf(value: string | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

/** sales.amount/total are NUMERIC(10,2). */
const MAX_MONEY = 99_999_999.99;

function parseMoney(value: string | undefined): number | null {
  if (value === undefined) return null;
  // Strict: "1.234,56", "1234,56", "1234.56" or "1234", optional "R$" prefix. Anything else is rejected, never guessed.
  let text = value.trim().replace(/^R\$\s*/, '');
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d{1,4})?$|^-?\d+\.\d{1,4}$/.test(text)) return null;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  const number = Number(text);
  if (!Number.isFinite(number) || Math.abs(number) > MAX_MONEY) return null;
  // half-up to cents, decimal safe enough for BRL magnitudes
  return Math.round((number + Number.EPSILON) * 100 + (number >= 0 ? 1e-9 : -1e-9)) / 100;
}

const isCivilDate = (value: string | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function planSalesImport(
  rows: readonly SalesImportRow[],
  lookups: SalesImportLookups,
  sourceSystem: string,
): SalesImportPlan {
  if (rows.length > MAX_IMPORT_ROWS) throw new RangeError(`A importação aceita no máximo ${MAX_IMPORT_ROWS} linhas`);
  const allowed = new Set<string>(IMPORT_COLUMNS);
  for (const row of rows) {
    for (const column of Object.keys(row)) if (!allowed.has(column)) throw new RangeError(`Unknown column "${column}"`);
  }
  const seen = new Set<string>();
  const planned: PlannedRow[] = rows.map((raw, index) => {
    const errors: PlannedRow['errors'] = [];
    const ref = (raw.external_ref ?? '').trim();
    if (ref === '' || ref.length > 100 || ref.includes('|')) {
      errors.push({ column: 'external_ref', message: 'Informe o número da venda de origem (até 100 caracteres, sem "|")' });
    }
    const naturalKey = `${sourceSystem}|${ref}`;

    const saleDate = raw.sale_date?.trim();
    if (!isCivilDate(saleDate)) errors.push({ column: 'sale_date', message: 'Data da venda inválida (use AAAA-MM-DD)' });
    else if (saleDate > lookups.today) errors.push({ column: 'sale_date', message: 'A data da venda não pode ser futura' });

    const cpf = normalizeCpf(raw.customer_cpf);
    let customerId: string | null = null;
    if (!cpf || !validCpf(cpf)) errors.push({ column: 'customer_cpf', message: 'CPF do cliente inválido' });
    else {
      customerId = lookups.customersByCpf.get(cpf) ?? null;
      if (!customerId) errors.push({ column: 'customer_cpf', message: 'Cliente não encontrado para este CPF (cadastre antes de importar)' });
    }

    const total = parseMoney(raw.total);
    if (total === null || total <= 0) errors.push({ column: 'total', message: 'Valor total inválido' });
    const discountText = raw.discount?.trim();
    const discount = discountText ? parseMoney(discountText) : 0;
    if (discount === null || discount < 0) errors.push({ column: 'discount', message: 'Desconto inválido' });
    else if (total !== null && total > 0 && discount > total) errors.push({ column: 'discount', message: 'O desconto não pode exceder o total' });

    const travel = raw.travel_start_date?.trim();
    if (travel && !isCivilDate(travel)) errors.push({ column: 'travel_start_date', message: 'Data de embarque inválida' });

    const category = normalizeName(raw.category);
    const supplier = normalizeName(raw.supplier);
    const categoryId = category ? (lookups.categoriesByName.get(category) ?? null) : null;
    const supplierId = supplier ? (lookups.suppliersByName.get(supplier) ?? null) : null;
    const destination = raw.destination?.trim() || null;
    const toComplete: PlannedRow['toComplete'] = [];
    if (!categoryId) toComplete.push('category');
    if (!supplierId) toComplete.push('supplier');
    if (!destination) toComplete.push('destination');

    let status: PlannedRow['status'] = 'NEW';
    if (errors.length > 0) status = 'REJECTED';
    else if (lookups.existingKeys.has(naturalKey)) status = 'ALREADY_IMPORTED';
    else if (seen.has(naturalKey)) status = 'DUPLICATE_IN_FILE';
    if (status === 'NEW') seen.add(naturalKey);

    return {
      row: index + 1,
      status,
      naturalKey,
      customerId,
      categoryId,
      supplierId,
      saleDate: isCivilDate(saleDate) ? saleDate : null,
      total: total ?? 0,
      discount: discount ?? 0,
      origin: raw.origin?.trim() || null,
      destination,
      travelStartDate: travel && isCivilDate(travel) ? travel : null,
      notes: raw.notes?.trim() || null,
      toComplete: status === 'NEW' ? toComplete : [],
      errors,
    };
  });
  const count = (status: PlannedRow['status']) => planned.filter((row) => row.status === status).length;
  return {
    sourceSystem,
    rows: planned,
    summary: {
      total: planned.length,
      new: count('NEW'),
      alreadyImported: count('ALREADY_IMPORTED'),
      duplicateInFile: count('DUPLICATE_IN_FILE'),
      rejected: count('REJECTED'),
      toComplete: planned.filter((row) => row.status === 'NEW' && row.toComplete.length > 0).length,
    },
  };
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Idempotency by content: same rows (any key order) + same source system = same hash. */
export function contentHash(rows: readonly SalesImportRow[], sourceSystem: string): string {
  return createHash('sha256').update(canonical({ sourceSystem, rows })).digest('hex');
}
