import type { Supplier } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';

interface SupplierRow {
  id: string;
  agency_id: string;
  name: string;
  document: string | null;
  contact: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierInput {
  name: string;
  document?: string;
  contact?: string;
  active?: boolean;
}

export interface UpdateSupplierInput {
  name?: string;
  document?: string;
  contact?: string;
  active?: boolean;
}

const SUPPLIER_COLUMNS = `id, agency_id, name, document, contact, active, created_at, updated_at`;

export async function listSuppliers(database: DatabaseRuntime): Promise<Supplier[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SupplierRow>(
      `SELECT ${SUPPLIER_COLUMNS} FROM suppliers WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toSupplier);
  });
}

export async function getSupplierById(
  database: DatabaseRuntime,
  id: string,
): Promise<Supplier | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SupplierRow>(
      `SELECT ${SUPPLIER_COLUMNS} FROM suppliers WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toSupplier(row) : null;
  });
}

export async function createSupplier(
  database: DatabaseRuntime,
  data: CreateSupplierInput,
): Promise<Supplier> {
  const agencyId = getAgencyId();

  if (data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SupplierRow>(
      `INSERT INTO suppliers (agency_id, name, document, contact, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${SUPPLIER_COLUMNS}`,
      [agencyId, data.name, data.document ?? null, data.contact ?? null, data.active ?? true],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Supplier insert did not return a row');
    }
    return toSupplier(row);
  });
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

  if (data.name !== undefined) {
    fields.push(`name = $${++index}`);
    values.push(data.name);
  }
  if (data.document !== undefined) {
    fields.push(`document = $${++index}`);
    values.push(data.document);
  }
  if (data.contact !== undefined) {
    fields.push(`contact = $${++index}`);
    values.push(data.contact);
  }
  if (data.active !== undefined) {
    fields.push(`active = $${++index}`);
    values.push(data.active);
  }

  if (fields.length === 0) {
    return getSupplierById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SupplierRow>(
      `UPDATE suppliers SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${SUPPLIER_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    return row ? toSupplier(row) : null;
  });
}

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    active: row.active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.document !== null ? { document: row.document } : {}),
    ...(row.contact !== null ? { contact: row.contact } : {}),
  };
}
