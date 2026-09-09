import type { Supplier, SupplierCategory, SupplierType } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';

interface SupplierRow {
  id: string;
  agency_id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  contact: string | null;
  supplier_type: SupplierType;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  bank_pix: string | null;
  payment_terms: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierInput {
  name: string;
  tradeName?: string;
  document?: string;
  contact?: string;
  supplierType?: SupplierType;
  email?: string;
  phone?: string;
  website?: string;
  addressLine?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
  bankPix?: string;
  paymentTerms?: string;
  notes?: string;
  active?: boolean;
  categories?: SupplierCategory[];
}

export type CreateSupplierInput = SupplierInput;
export type UpdateSupplierInput = Partial<SupplierInput>;

const SUPPLIER_COLUMNS = `id, agency_id, name, trade_name, document, contact, supplier_type,
  email, phone, website, address_line, address_city, address_state, address_zip,
  address_country, bank_name, bank_branch, bank_account, bank_pix, payment_terms, notes,
  active, created_at, updated_at`;

async function fetchCategories(
  database: DatabaseRuntime,
  agencyId: string,
  supplierIds: string[],
): Promise<Map<string, SupplierCategory[]>> {
  const map = new Map<string, SupplierCategory[]>();
  if (supplierIds.length === 0) return map;

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ supplier_id: string; category: SupplierCategory }>(
      `SELECT supplier_id, category FROM supplier_category_links
       WHERE agency_id = $1 AND supplier_id = ANY($2::text[])`,
      [agencyId, supplierIds],
    );
    for (const row of result.rows) {
      const list = map.get(row.supplier_id) ?? [];
      list.push(row.category);
      map.set(row.supplier_id, list);
    }
    return map;
  });
}

async function replaceCategories(
  database: DatabaseRuntime,
  agencyId: string,
  supplierId: string,
  categories: SupplierCategory[],
): Promise<void> {
  return database.withTenantTransaction(async (client) => {
    await client.query(
      `DELETE FROM supplier_category_links WHERE agency_id = $1 AND supplier_id = $2`,
      [agencyId, supplierId],
    );
    for (const category of categories) {
      await client.query(
        `INSERT INTO supplier_category_links (agency_id, supplier_id, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (supplier_id, category) DO NOTHING`,
        [agencyId, supplierId, category],
      );
    }
  });
}

export async function listSuppliers(database: DatabaseRuntime): Promise<Supplier[]> {
  const agencyId = getAgencyId();

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<SupplierRow>(
      `SELECT ${SUPPLIER_COLUMNS} FROM suppliers WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows;
  });

  const categoryMap = await fetchCategories(
    database,
    agencyId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toSupplier(row, categoryMap.get(row.id) ?? []));
}

export async function getSupplierById(
  database: DatabaseRuntime,
  id: string,
): Promise<Supplier | null> {
  const agencyId = getAgencyId();

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<SupplierRow>(
      `SELECT ${SUPPLIER_COLUMNS} FROM suppliers WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return result.rows[0] ?? null;
  });
  if (!row) return null;

  const categoryMap = await fetchCategories(database, agencyId, [row.id]);
  return toSupplier(row, categoryMap.get(row.id) ?? []);
}

export async function createSupplier(
  database: DatabaseRuntime,
  data: CreateSupplierInput,
): Promise<Supplier> {
  const agencyId = getAgencyId();

  if (data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<SupplierRow>(
      `INSERT INTO suppliers (
         agency_id, name, trade_name, document, contact, supplier_type, email, phone,
         website, address_line, address_city, address_state, address_zip, address_country,
         bank_name, bank_branch, bank_account, bank_pix, payment_terms, notes, active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING ${SUPPLIER_COLUMNS}`,
      [
        agencyId,
        data.name,
        data.tradeName ?? null,
        data.document ?? null,
        data.contact ?? null,
        data.supplierType ?? 'TRAVEL',
        data.email ?? null,
        data.phone ?? null,
        data.website ?? null,
        data.addressLine ?? null,
        data.addressCity ?? null,
        data.addressState ?? null,
        data.addressZip ?? null,
        data.addressCountry ?? null,
        data.bankName ?? null,
        data.bankBranch ?? null,
        data.bankAccount ?? null,
        data.bankPix ?? null,
        data.paymentTerms ?? null,
        data.notes ?? null,
        data.active ?? true,
      ],
    );

    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error('Supplier insert did not return a row');
    }
    return inserted;
  });

  if (data.categories && data.categories.length > 0) {
    await replaceCategories(database, agencyId, row.id, data.categories);
  }

  return toSupplier(row, data.categories ?? []);
}

export async function updateSupplier(
  database: DatabaseRuntime,
  id: string,
  data: UpdateSupplierInput,
): Promise<Supplier | null> {
  const agencyId = getAgencyId();

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  const columnMap: Array<[keyof UpdateSupplierInput, string]> = [
    ['name', 'name'],
    ['tradeName', 'trade_name'],
    ['document', 'document'],
    ['contact', 'contact'],
    ['supplierType', 'supplier_type'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['website', 'website'],
    ['addressLine', 'address_line'],
    ['addressCity', 'address_city'],
    ['addressState', 'address_state'],
    ['addressZip', 'address_zip'],
    ['addressCountry', 'address_country'],
    ['bankName', 'bank_name'],
    ['bankBranch', 'bank_branch'],
    ['bankAccount', 'bank_account'],
    ['bankPix', 'bank_pix'],
    ['paymentTerms', 'payment_terms'],
    ['notes', 'notes'],
    ['active', 'active'],
  ];

  for (const [key, column] of columnMap) {
    if (data[key] !== undefined) {
      fields.push(`${column} = $${++index}`);
      values.push(data[key]);
    }
  }

  if (data.categories !== undefined) {
    await replaceCategories(database, agencyId, id, data.categories);
  }

  if (fields.length === 0) {
    return getSupplierById(database, id);
  }

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<SupplierRow>(
      `UPDATE suppliers SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${SUPPLIER_COLUMNS}`,
      [agencyId, ...values, id],
    );

    return result.rows[0] ?? null;
  });

  if (!row) return null;
  const categoryMap = await fetchCategories(database, agencyId, [row.id]);
  return toSupplier(row, categoryMap.get(row.id) ?? []);
}

function toSupplier(row: SupplierRow, categories: SupplierCategory[]): Supplier {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    supplierType: row.supplier_type,
    active: row.active,
    categories,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.trade_name !== null ? { tradeName: row.trade_name } : {}),
    ...(row.document !== null ? { document: row.document } : {}),
    ...(row.contact !== null ? { contact: row.contact } : {}),
    ...(row.email !== null ? { email: row.email } : {}),
    ...(row.phone !== null ? { phone: row.phone } : {}),
    ...(row.website !== null ? { website: row.website } : {}),
    ...(row.address_line !== null ? { addressLine: row.address_line } : {}),
    ...(row.address_city !== null ? { addressCity: row.address_city } : {}),
    ...(row.address_state !== null ? { addressState: row.address_state } : {}),
    ...(row.address_zip !== null ? { addressZip: row.address_zip } : {}),
    ...(row.address_country !== null ? { addressCountry: row.address_country } : {}),
    ...(row.bank_name !== null ? { bankName: row.bank_name } : {}),
    ...(row.bank_branch !== null ? { bankBranch: row.bank_branch } : {}),
    ...(row.bank_account !== null ? { bankAccount: row.bank_account } : {}),
    ...(row.bank_pix !== null ? { bankPix: row.bank_pix } : {}),
    ...(row.payment_terms !== null ? { paymentTerms: row.payment_terms } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
