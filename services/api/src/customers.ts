import type { Customer } from '../../../packages/domain/types';
import type { Status } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

const POSTGRES_UNIQUE_VIOLATION = '23505';

const CUSTOMER_COLUMNS = `id, agency_id, protocol_number, name, email, phone, cpf, passport, rg, national_id_type,
              birth_date, nationality, whatsapp, social_name, marital_status, profession,
              id_issuing_authority, id_issued_date, emergency_contact_name,
              emergency_contact_relationship, emergency_contact_phone, emergency_contact_whatsapp,
              emergency_contact_email, emergency_contact_notes, address, notes, status,
              deleted_at, created_at, updated_at`;

interface CustomerRow {
  id: string;
  agency_id: string;
  protocol_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  passport: string | null;
  rg: string | null;
  national_id_type: string | null;
  birth_date: string | null;
  nationality: string | null;
  whatsapp: string | null;
  social_name: string | null;
  marital_status: string | null;
  profession: string | null;
  id_issuing_authority: string | null;
  id_issued_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_whatsapp: string | null;
  emergency_contact_email: string | null;
  emergency_contact_notes: string | null;
  address: Record<string, unknown> | null;
  notes: string | null;
  status: Status;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  rg?: string;
  nationalIdType?: string;
  birthDate?: string;
  nationality?: string;
  whatsapp?: string;
  socialName?: string;
  maritalStatus?: string;
  profession?: string;
  idIssuingAuthority?: string;
  idIssuedDate?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyContactWhatsapp?: string;
  emergencyContactEmail?: string;
  emergencyContactNotes?: string;
  address?: Record<string, unknown>;
  notes?: string;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

const OPTIONAL_STRING_COLUMNS = [
  ['email', 'email'],
  ['phone', 'phone'],
  ['cpf', 'cpf'],
  ['passport', 'passport'],
  ['rg', 'rg'],
  ['nationalIdType', 'national_id_type'],
  ['birthDate', 'birth_date'],
  ['nationality', 'nationality'],
  ['whatsapp', 'whatsapp'],
  ['socialName', 'social_name'],
  ['maritalStatus', 'marital_status'],
  ['profession', 'profession'],
  ['idIssuingAuthority', 'id_issuing_authority'],
  ['idIssuedDate', 'id_issued_date'],
  ['emergencyContactName', 'emergency_contact_name'],
  ['emergencyContactRelationship', 'emergency_contact_relationship'],
  ['emergencyContactPhone', 'emergency_contact_phone'],
  ['emergencyContactWhatsapp', 'emergency_contact_whatsapp'],
  ['emergencyContactEmail', 'emergency_contact_email'],
  ['emergencyContactNotes', 'emergency_contact_notes'],
  ['notes', 'notes'],
] as const;

export async function listCustomers(database: DatabaseRuntime): Promise<Customer[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerRow>(
      `SELECT ${CUSTOMER_COLUMNS}
       FROM customers
       WHERE agency_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toCustomer);
  });
}

export async function getCustomerById(
  database: DatabaseRuntime,
  id: string,
): Promise<Customer | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerRow>(
      `SELECT ${CUSTOMER_COLUMNS}
       FROM customers
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toCustomer(row) : null;
  });
}

export async function createCustomer(
  database: DatabaseRuntime,
  data: CreateCustomerInput,
): Promise<Customer> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    try {
      const result = await client.query<CustomerRow>(
        `INSERT INTO customers (
           agency_id, name, email, phone, cpf, passport, rg, national_id_type, birth_date,
           nationality, whatsapp, social_name, marital_status, profession,
           id_issuing_authority, id_issued_date, emergency_contact_name,
           emergency_contact_relationship, emergency_contact_phone, emergency_contact_whatsapp,
           emergency_contact_email, emergency_contact_notes, address, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                 $18, $19, $20, $21, $22, $23, $24)
         RETURNING ${CUSTOMER_COLUMNS}`,
        [
          agencyId,
          data.name,
          data.email ?? null,
          data.phone ?? null,
          data.cpf ?? null,
          data.passport ?? null,
          data.rg ?? null,
          data.nationalIdType ?? null,
          data.birthDate ?? null,
          data.nationality ?? null,
          data.whatsapp ?? null,
          data.socialName ?? null,
          data.maritalStatus ?? null,
          data.profession ?? null,
          data.idIssuingAuthority ?? null,
          data.idIssuedDate ?? null,
          data.emergencyContactName ?? null,
          data.emergencyContactRelationship ?? null,
          data.emergencyContactPhone ?? null,
          data.emergencyContactWhatsapp ?? null,
          data.emergencyContactEmail ?? null,
          data.emergencyContactNotes ?? null,
          data.address ? JSON.stringify(data.address) : null,
          data.notes ?? null,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Customer insert did not return a row');
      }
      const customer = toCustomer(row);
      await recordAuditEvent(client, {
        eventType: AuditEventType.CUSTOMER_CREATED,
        entityType: 'customer',
        entityId: customer.id,
      });
      return customer;
    } catch (error: unknown) {
      throw mapUniqueViolation(error);
    }
  });
}

export async function updateCustomer(
  database: DatabaseRuntime,
  id: string,
  data: UpdateCustomerInput,
): Promise<Customer | null> {
  const agencyId = getAgencyId();

  const fields: string[] = [];
  const values: unknown[] = [];
  const changedFields: string[] = [];
  let index = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${++index}`);
    values.push(data.name);
    changedFields.push('name');
  }
  for (const [key, column] of OPTIONAL_STRING_COLUMNS) {
    const value = data[key];
    if (value !== undefined) {
      fields.push(`${column} = $${++index}`);
      values.push(value);
      changedFields.push(key);
    }
  }
  if (data.address !== undefined) {
    fields.push(`address = $${++index}`);
    values.push(JSON.stringify(data.address));
    changedFields.push('address');
  }

  if (fields.length === 0) {
    return getCustomerById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    try {
      const result = await client.query<CustomerRow>(
        `UPDATE customers
         SET ${fields.join(', ')}, updated_at = now()
         WHERE agency_id = $1 AND id = $${index + 1} AND deleted_at IS NULL
         RETURNING ${CUSTOMER_COLUMNS}`,
        [agencyId, ...values, id],
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }
      const customer = toCustomer(row);
      await recordAuditEvent(client, {
        eventType: AuditEventType.CUSTOMER_UPDATED,
        entityType: 'customer',
        entityId: customer.id,
        metadata: { fieldsChanged: changedFields },
      });
      return customer;
    } catch (error: unknown) {
      throw mapUniqueViolation(error);
    }
  });
}

function mapUniqueViolation(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  ) {
    return new ConflictError('A customer with this CPF or email already exists');
  }

  return error;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    agencyId: row.agency_id,
    protocolNumber: row.protocol_number,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.email !== null ? { email: row.email } : {}),
    ...(row.phone !== null ? { phone: row.phone } : {}),
    ...(row.cpf !== null ? { cpf: row.cpf } : {}),
    ...(row.passport !== null ? { passport: row.passport } : {}),
    ...(row.rg !== null ? { rg: row.rg } : {}),
    ...(row.national_id_type !== null ? { nationalIdType: row.national_id_type } : {}),
    ...(row.birth_date !== null ? { birthDate: new Date(row.birth_date) } : {}),
    ...(row.nationality !== null ? { nationality: row.nationality } : {}),
    ...(row.whatsapp !== null ? { whatsapp: row.whatsapp } : {}),
    ...(row.social_name !== null ? { socialName: row.social_name } : {}),
    ...(row.marital_status !== null ? { maritalStatus: row.marital_status } : {}),
    ...(row.profession !== null ? { profession: row.profession } : {}),
    ...(row.id_issuing_authority !== null
      ? { idIssuingAuthority: row.id_issuing_authority }
      : {}),
    ...(row.id_issued_date !== null ? { idIssuedDate: new Date(row.id_issued_date) } : {}),
    ...(row.emergency_contact_name !== null
      ? { emergencyContactName: row.emergency_contact_name }
      : {}),
    ...(row.emergency_contact_relationship !== null
      ? { emergencyContactRelationship: row.emergency_contact_relationship }
      : {}),
    ...(row.emergency_contact_phone !== null
      ? { emergencyContactPhone: row.emergency_contact_phone }
      : {}),
    ...(row.emergency_contact_whatsapp !== null
      ? { emergencyContactWhatsapp: row.emergency_contact_whatsapp }
      : {}),
    ...(row.emergency_contact_email !== null
      ? { emergencyContactEmail: row.emergency_contact_email }
      : {}),
    ...(row.emergency_contact_notes !== null
      ? { emergencyContactNotes: row.emergency_contact_notes }
      : {}),
    ...(row.address !== null ? { address: row.address } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}
