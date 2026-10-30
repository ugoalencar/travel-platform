import { describe, expect, it } from 'vitest';
import { contentHash, normalizeCpf, planSalesImport, type SalesImportLookups, type SalesImportRow } from '../src/sales-import-plan';

const lookups = (over: Partial<SalesImportLookups> = {}): SalesImportLookups => ({
  customersByCpf: new Map([['52998224725', 'cust-1']]),
  categoriesByName: new Map([['aereo', 'cat-air']]),
  suppliersByName: new Map([['latam', 'sup-1']]),
  existingKeys: new Set<string>(),
  today: '2026-10-24',
  ...over,
});
const row = (over: Partial<SalesImportRow> = {}): SalesImportRow => ({
  external_ref: 'V-1',
  sale_date: '2026-09-10',
  customer_cpf: '529.982.247-25',
  category: 'Aéreo',
  supplier: 'LATAM',
  total: '1500,50',
  destination: 'Gramado',
  ...over,
});

describe('normalizeCpf', () => {
  it('keeps only digits and requires 11', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(normalizeCpf('123')).toBeNull();
    expect(normalizeCpf(undefined)).toBeNull();
  });
});

describe('planSalesImport', () => {
  it('plans a complete row as NEW with parsed money, linked customer, category and supplier', () => {
    const plan = planSalesImport([row()], lookups(), 'BWT');
    expect(plan.rows[0]).toMatchObject({
      status: 'NEW', naturalKey: 'BWT|V-1', customerId: 'cust-1', categoryId: 'cat-air', supplierId: 'sup-1', total: 1500.5, toComplete: [],
    });
    expect(plan.summary).toMatchObject({ new: 1, alreadyImported: 0, rejected: 0, toComplete: 0 });
  });

  it('matches categories and suppliers ignoring case and accents', () => {
    const plan = planSalesImport([row({ category: ' AEREO ', supplier: 'latam' })], lookups(), 'BWT');
    expect(plan.rows[0]?.categoryId).toBe('cat-air');
    expect(plan.rows[0]?.supplierId).toBe('sup-1');
  });

  it('A2: unknown category/supplier or no destination do NOT reject; the sale is imported marked "a completar"', () => {
    const plan = planSalesImport([row({ category: 'Nova', supplier: 'Desconhecido', destination: '' })], lookups(), 'BWT');
    expect(plan.rows[0]?.status).toBe('NEW');
    expect(plan.rows[0]?.toComplete.sort()).toEqual(['category', 'destination', 'supplier']);
    expect(plan.summary.toComplete).toBe(1);
  });

  it('rejects with a precise reason: no key, bad date, future date, unknown customer, bad cpf, bad or negative total', () => {
    const reasons = (r: Partial<SalesImportRow>) => planSalesImport([row(r)], lookups(), 'BWT').rows[0]?.errors.map((e) => e.column);
    expect(reasons({ external_ref: '' })).toEqual(['external_ref']);
    expect(reasons({ sale_date: '10/09/2026' })).toEqual(['sale_date']);
    expect(reasons({ sale_date: '2030-01-01' })).toEqual(['sale_date']);
    expect(reasons({ customer_cpf: '111.111.111-11' })).toEqual(['customer_cpf']);
    expect(reasons({ customer_cpf: '' })).toEqual(['customer_cpf']);
    expect(reasons({ total: 'abc' })).toEqual(['total']);
    expect(reasons({ total: '1e3' })).toEqual(['total']);
    expect(reasons({ total: '(100,00)' })).toEqual(['total']);
    expect(reasons({ total: '100000000' })).toEqual(['total']);
    expect(reasons({ total: 'R$ 1.234,56' })).toEqual([]);
    expect(reasons({ external_ref: 'V|1' })).toEqual(['external_ref']);
    expect(reasons({ total: '-5' })).toEqual(['total']);
    expect(reasons({ total: '0' })).toEqual(['total']);
    const unknown = planSalesImport([row({ customer_cpf: '390.533.447-05' })], lookups(), 'BWT');
    expect(unknown.rows[0]).toMatchObject({ status: 'REJECTED' });
    expect(unknown.rows[0]?.errors[0]?.column).toBe('customer_cpf');
  });

  it('does not duplicate: a natural key already imported (or repeated in the same file) is ALREADY_IMPORTED / DUPLICATE_IN_FILE', () => {
    const existing = planSalesImport([row()], lookups({ existingKeys: new Set(['BWT|V-1']) }), 'BWT');
    expect(existing.rows[0]?.status).toBe('ALREADY_IMPORTED');
    const inFile = planSalesImport([row(), row({ total: '2000' })], lookups(), 'BWT');
    expect(inFile.rows.map((r) => r.status)).toEqual(['NEW', 'DUPLICATE_IN_FILE']);
    expect(inFile.summary.new).toBe(1);
  });

  it('the natural key is scoped by source system (same number in another system is a different sale)', () => {
    const plan = planSalesImport([row()], lookups({ existingKeys: new Set(['OUTRO|V-1']) }), 'BWT');
    expect(plan.rows[0]?.status).toBe('NEW');
  });

  it('parses Brazilian and plain money formats and rounds half-up to cents', () => {
    const total = (value: string) => planSalesImport([row({ total: value })], lookups(), 'BWT').rows[0]?.total;
    expect(total('1.234,56')).toBe(1234.56);
    expect(total('1234.56')).toBe(1234.56);
    expect(total('R$ 10,005')).toBe(10.01);
    expect(total('100')).toBe(100);
  });

  it('discount cannot exceed the total; the sale value is the total informed', () => {
    const plan = planSalesImport([row({ discount: '2000' })], lookups(), 'BWT');
    expect(plan.rows[0]?.errors.map((e) => e.column)).toEqual(['discount']);
  });

  it('rejects a file with too many rows or with unknown columns instead of ignoring them', () => {
    const many = Array.from({ length: 2001 }, (_, i) => row({ external_ref: `V-${i}` }));
    expect(() => planSalesImport(many, lookups(), 'BWT')).toThrow(/2000/);
    expect(() => planSalesImport([{ ...row(), password: 'x' } as never], lookups(), 'BWT')).toThrow(/column/i);
  });
});

describe('contentHash (file idempotency)', () => {
  it('is the same for the same rows in any key order and changes with any value or the source system', () => {
    const a = contentHash([row()], 'BWT');
    expect(contentHash([{ ...row() }].map((r) => Object.fromEntries(Object.entries(r).reverse()) as SalesImportRow), 'BWT')).toBe(a);
    expect(contentHash([row({ total: '1500,51' })], 'BWT')).not.toBe(a);
    expect(contentHash([row()], 'OUTRO')).not.toBe(a);
  });
});
