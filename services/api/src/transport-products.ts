import { TripType } from '../../../packages/domain/types';
import type { TransportProduct } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';

interface TransportProductRow {
  id: string;
  agency_id: string;
  name: string;
  trip_type: TripType;
  outbound_route_id: string;
  return_route_id: string | null;
  price: string;
  active: boolean;
  publicly_bookable: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTransportProductInput {
  name: string;
  tripType: TripType;
  outboundRouteId: string;
  returnRouteId?: string;
  price: number;
  active?: boolean;
  publiclyBookable?: boolean;
  notes?: string;
}

export interface UpdateTransportProductInput {
  name?: string;
  price?: number;
  active?: boolean;
  publiclyBookable?: boolean;
  notes?: string;
}

const PRODUCT_COLUMNS = `id, agency_id, name, trip_type, outbound_route_id, return_route_id, price,
              active, publicly_bookable, notes, created_at, updated_at`;

export async function listTransportProducts(
  database: DatabaseRuntime,
): Promise<TransportProduct[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TransportProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM transport_products WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toProduct);
  });
}

export async function getTransportProductById(
  database: DatabaseRuntime,
  id: string,
): Promise<TransportProduct | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TransportProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM transport_products WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toProduct(row) : null;
  });
}

export async function createTransportProduct(
  database: DatabaseRuntime,
  data: CreateTransportProductInput,
): Promise<TransportProduct> {
  const agencyId = getAgencyId();

  if (data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }
  if (data.price < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }
  // P1-1: a round trip is one Product with both an outbound and a return
  // Route; the database CHECK constraint backstops this, but we validate
  // here first for a clean application-level error message.
  if (data.tripType === TripType.ONE_WAY && data.returnRouteId !== undefined) {
    throw new ValidationError('Field "returnRouteId" must not be set when tripType is ONE_WAY');
  }
  if (data.tripType === TripType.ROUND_TRIP && data.returnRouteId === undefined) {
    throw new ValidationError('Field "returnRouteId" is required when tripType is ROUND_TRIP');
  }

  return database.withTenantTransaction(async (client) => {
    const outboundCheck = await client.query(
      `SELECT 1 FROM routes WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.outboundRouteId],
    );
    if (outboundCheck.rows.length === 0) {
      throw new NotFoundError('Outbound route not found');
    }

    if (data.returnRouteId !== undefined) {
      const returnCheck = await client.query(
        `SELECT 1 FROM routes WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.returnRouteId],
      );
      if (returnCheck.rows.length === 0) {
        throw new NotFoundError('Return route not found');
      }
    }

    const result = await client.query<TransportProductRow>(
      `INSERT INTO transport_products
         (agency_id, name, trip_type, outbound_route_id, return_route_id, price, active, publicly_bookable, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${PRODUCT_COLUMNS}`,
      [
        agencyId,
        data.name,
        data.tripType,
        data.outboundRouteId,
        data.returnRouteId ?? null,
        data.price,
        data.active ?? true,
        data.publiclyBookable ?? false,
        data.notes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('TransportProduct insert did not return a row');
    }
    return toProduct(row);
  });
}

export async function updateTransportProduct(
  database: DatabaseRuntime,
  id: string,
  data: UpdateTransportProductInput,
): Promise<TransportProduct | null> {
  const agencyId = getAgencyId();

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new ValidationError('Field "name" must not be empty');
  }
  if (data.price !== undefined && data.price < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }

  // tripType/outboundRouteId/returnRouteId are intentionally not
  // updatable here: changing trip shape after departures may exist
  // against a product is a bigger decision (would need to re-validate
  // every ScheduledDeparture) that is out of scope for this version.
  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${++index}`);
    values.push(data.name);
  }
  if (data.price !== undefined) {
    fields.push(`price = $${++index}`);
    values.push(data.price);
  }
  if (data.active !== undefined) {
    fields.push(`active = $${++index}`);
    values.push(data.active);
  }
  if (data.publiclyBookable !== undefined) {
    fields.push(`publicly_bookable = $${++index}`);
    values.push(data.publiclyBookable);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${++index}`);
    values.push(data.notes);
  }

  if (fields.length === 0) {
    return getTransportProductById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TransportProductRow>(
      `UPDATE transport_products SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${PRODUCT_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    return row ? toProduct(row) : null;
  });
}

function toProduct(row: TransportProductRow): TransportProduct {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    tripType: row.trip_type,
    outboundRouteId: row.outbound_route_id,
    price: Number(row.price),
    active: row.active,
    publiclyBookable: row.publicly_bookable,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.return_route_id !== null ? { returnRouteId: row.return_route_id } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
