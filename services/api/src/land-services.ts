import type {
  FinancialObligationStatus,
  LandService,
  LandServiceStatus,
  LandServiceType,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';

interface LandServiceRow {
  id: string;
  agency_id: string;
  trip_id: string;
  booking_id: string | null;
  supplier_id: string | null;
  customer_id: string;
  dependent_id: string | null;
  service_type: LandServiceType;
  description: string;
  start_date: string;
  end_date: string;
  quantity: string;
  cost: string;
  sale_value: string;
  taxes: string;
  fees: string;
  commission: string | null;
  currency: string;
  supplier_due_date: string | null;
  supplier_payment_status: FinancialObligationStatus;
  status: LandServiceStatus;
  confirmation_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LandServiceInput {
  tripId: string;
  bookingId?: string;
  supplierId?: string;
  customerId: string;
  dependentId?: string;
  serviceType?: LandServiceType;
  description: string;
  startDate: string;
  endDate: string;
  quantity?: number;
  cost?: number;
  saleValue?: number;
  taxes?: number;
  fees?: number;
  commission?: number;
  currency?: string;
  supplierDueDate?: string;
  supplierPaymentStatus?: FinancialObligationStatus;
  status?: LandServiceStatus;
  confirmationNumber?: string;
  notes?: string;
}

export type CreateLandServiceInput = LandServiceInput;
export type UpdateLandServiceInput = Partial<LandServiceInput>;

const LAND_SERVICE_COLUMNS = `id, agency_id, trip_id, booking_id, supplier_id, customer_id, dependent_id,
  service_type, description, start_date, end_date, quantity, cost, sale_value, taxes, fees,
  commission, currency, supplier_due_date, supplier_payment_status, status, confirmation_number,
  notes, created_at, updated_at`;

export async function listLandServices(
  database: DatabaseRuntime,
  filters: { tripId?: string | undefined; customerId?: string | undefined } = {},
): Promise<LandService[]> {
  const agencyId = getAgencyId();

  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];
  if (filters.tripId) {
    values.push(filters.tripId);
    conditions.push(`trip_id = $${values.length}`);
  }
  if (filters.customerId) {
    values.push(filters.customerId);
    conditions.push(`customer_id = $${values.length}`);
  }

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<LandServiceRow>(
      `SELECT ${LAND_SERVICE_COLUMNS} FROM land_services
       WHERE ${conditions.join(' AND ')}
       ORDER BY trip_id, start_date`,
      values,
    );
    return result.rows;
  });

  return rows.map(toLandService);
}

export async function getLandServiceById(
  database: DatabaseRuntime,
  id: string,
): Promise<LandService | null> {
  const agencyId = getAgencyId();

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<LandServiceRow>(
      `SELECT ${LAND_SERVICE_COLUMNS} FROM land_services WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return result.rows[0] ?? null;
  });

  return row ? toLandService(row) : null;
}

function assertRequiredFields(data: CreateLandServiceInput): void {
  if (!data.tripId || data.tripId.trim().length === 0) {
    throw new ValidationError('Field "tripId" is required');
  }
  if (!data.customerId || data.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required');
  }
  if (!data.description || data.description.trim().length === 0) {
    throw new ValidationError('Field "description" must not be empty');
  }
  if (!data.startDate) {
    throw new ValidationError('Field "startDate" is required');
  }
  if (!data.endDate) {
    throw new ValidationError('Field "endDate" is required');
  }
}

export async function createLandService(
  database: DatabaseRuntime,
  data: CreateLandServiceInput,
): Promise<LandService> {
  const agencyId = getAgencyId();
  assertRequiredFields(data);

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<LandServiceRow>(
      `INSERT INTO land_services (
         agency_id, trip_id, booking_id, supplier_id, customer_id, dependent_id,
         service_type, description, start_date, end_date, quantity, cost, sale_value,
         taxes, fees, commission, currency, supplier_due_date, supplier_payment_status,
         status, confirmation_number, notes
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22
       )
       RETURNING ${LAND_SERVICE_COLUMNS}`,
      [
        agencyId,
        data.tripId,
        data.bookingId ?? null,
        data.supplierId ?? null,
        data.customerId,
        data.dependentId ?? null,
        data.serviceType ?? 'ACCOMMODATION',
        data.description,
        data.startDate,
        data.endDate,
        data.quantity ?? 1,
        data.cost ?? 0,
        data.saleValue ?? 0,
        data.taxes ?? 0,
        data.fees ?? 0,
        data.commission ?? null,
        data.currency ?? 'BRL',
        data.supplierDueDate ?? null,
        data.supplierPaymentStatus ?? 'OPEN',
        data.status ?? 'PENDING',
        data.confirmationNumber ?? null,
        data.notes ?? null,
      ],
    );

    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error('Land service insert did not return a row');
    }
    return inserted;
  });

  return toLandService(row);
}

const UPDATE_COLUMN_MAP: Array<[keyof UpdateLandServiceInput, string]> = [
  ['tripId', 'trip_id'],
  ['bookingId', 'booking_id'],
  ['supplierId', 'supplier_id'],
  ['customerId', 'customer_id'],
  ['dependentId', 'dependent_id'],
  ['serviceType', 'service_type'],
  ['description', 'description'],
  ['startDate', 'start_date'],
  ['endDate', 'end_date'],
  ['quantity', 'quantity'],
  ['cost', 'cost'],
  ['saleValue', 'sale_value'],
  ['taxes', 'taxes'],
  ['fees', 'fees'],
  ['commission', 'commission'],
  ['currency', 'currency'],
  ['supplierDueDate', 'supplier_due_date'],
  ['supplierPaymentStatus', 'supplier_payment_status'],
  ['status', 'status'],
  ['confirmationNumber', 'confirmation_number'],
  ['notes', 'notes'],
];

export async function updateLandService(
  database: DatabaseRuntime,
  id: string,
  data: UpdateLandServiceInput,
): Promise<LandService | null> {
  const agencyId = getAgencyId();

  if (data.description !== undefined && data.description.trim().length === 0) {
    throw new ValidationError('Field "description" must not be empty');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const [key, column] of UPDATE_COLUMN_MAP) {
    if (data[key] !== undefined) {
      fields.push(`${column} = $${++index}`);
      values.push(data[key]);
    }
  }

  if (fields.length === 0) {
    return getLandServiceById(database, id);
  }

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<LandServiceRow>(
      `UPDATE land_services SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${LAND_SERVICE_COLUMNS}`,
      [agencyId, ...values, id],
    );
    return result.rows[0] ?? null;
  });

  return row ? toLandService(row) : null;
}

export async function deleteLandService(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();

  const deleted = await database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM land_services WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return (result.rowCount ?? 0) > 0;
  });

  return deleted;
}

function toLandService(row: LandServiceRow): LandService {
  return {
    id: row.id,
    agencyId: row.agency_id,
    tripId: row.trip_id,
    customerId: row.customer_id,
    serviceType: row.service_type,
    description: row.description,
    startDate: new Date(row.start_date),
    endDate: new Date(row.end_date),
    quantity: Number(row.quantity),
    cost: Number(row.cost),
    saleValue: Number(row.sale_value),
    taxes: Number(row.taxes),
    fees: Number(row.fees),
    currency: row.currency,
    supplierPaymentStatus: row.supplier_payment_status,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.booking_id !== null ? { bookingId: row.booking_id } : {}),
    ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
    ...(row.dependent_id !== null ? { dependentId: row.dependent_id } : {}),
    ...(row.commission !== null ? { commission: Number(row.commission) } : {}),
    ...(row.supplier_due_date !== null ? { supplierDueDate: new Date(row.supplier_due_date) } : {}),
    ...(row.confirmation_number !== null ? { confirmationNumber: row.confirmation_number } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
