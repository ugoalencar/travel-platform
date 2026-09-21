import { OfferStatus, type Offer } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';

interface OfferRow {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  price: string;
  valid_from: string | null;
  valid_until: string | null;
  status: Offer['status'];
  featured: boolean;
  show_on_customer_app: boolean;
  target_segment_id: string | null;
  display_priority: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

const VALID_OFFER_STATUSES = ['ACTIVE', 'INACTIVE', 'EXPIRED'] as const;

export interface CreateOfferInput {
  name: string;
  description?: string;
  price: number;
  validFrom?: Date;
  validUntil?: Date;
  featured?: boolean;
  showOnCustomerApp?: boolean;
  targetSegmentId?: string | null;
  displayPriority?: number;
  imageUrl?: string | null;
}

export interface UpdateOfferInput {
  name?: string;
  description?: string;
  price?: number;
  validFrom?: Date;
  validUntil?: Date;
  status?: Offer['status'];
  featured?: boolean;
  showOnCustomerApp?: boolean;
  targetSegmentId?: string | null;
  displayPriority?: number;
  imageUrl?: string | null;
}

const OFFER_COLUMNS = `id, agency_id, name, description, price, valid_from, valid_until,
              status, featured, show_on_customer_app, target_segment_id, display_priority,
              image_url, created_at, updated_at`;

export async function listOffers(database: DatabaseRuntime): Promise<Offer[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM offers WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toOffer);
  });
}

export async function getOfferById(database: DatabaseRuntime, id: string): Promise<Offer | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM offers WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toOffer(row) : null;
  });
}

export async function createOffer(
  database: DatabaseRuntime,
  data: CreateOfferInput,
): Promise<Offer> {
  const agencyId = getAgencyId();

  if (data.price < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }
  if (
    data.validFrom !== undefined &&
    data.validUntil !== undefined &&
    data.validFrom.getTime() > data.validUntil.getTime()
  ) {
    throw new ValidationError('Field "validFrom" must not be after "validUntil"');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OfferRow>(
      `INSERT INTO offers (agency_id, name, description, price, valid_from, valid_until,
                          featured, show_on_customer_app, target_segment_id, display_priority, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${OFFER_COLUMNS}`,
      [
        agencyId,
        data.name,
        data.description ?? null,
        data.price,
        data.validFrom ?? null,
        data.validUntil ?? null,
        data.featured ?? false,
        data.showOnCustomerApp ?? true,
        data.targetSegmentId ?? null,
        data.displayPriority ?? 0,
        data.imageUrl ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Offer insert did not return a row');
    return toOffer(row);
  });
}

export async function updateOffer(
  database: DatabaseRuntime,
  id: string,
  data: UpdateOfferInput,
): Promise<Offer | null> {
  const agencyId = getAgencyId();

  if (data.price !== undefined && data.price < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }
  if (data.status !== undefined && !VALID_OFFER_STATUSES.includes(data.status)) {
    throw new ValidationError('Field "status" must be one of ACTIVE, INACTIVE, EXPIRED');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (data.name !== undefined) { fields.push(`name = $${++index}`); values.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${++index}`); values.push(data.description); }
  if (data.price !== undefined) { fields.push(`price = $${++index}`); values.push(data.price); }
  if (data.validFrom !== undefined) { fields.push(`valid_from = $${++index}`); values.push(data.validFrom); }
  if (data.validUntil !== undefined) { fields.push(`valid_until = $${++index}`); values.push(data.validUntil); }
  if (data.status !== undefined) { fields.push(`status = $${++index}`); values.push(data.status); }
  if (data.featured !== undefined) { fields.push(`featured = $${++index}`); values.push(data.featured); }
  if (data.showOnCustomerApp !== undefined) { fields.push(`show_on_customer_app = $${++index}`); values.push(data.showOnCustomerApp); }
  if (data.targetSegmentId !== undefined) { fields.push(`target_segment_id = $${++index}`); values.push(data.targetSegmentId); }
  if (data.displayPriority !== undefined) { fields.push(`display_priority = $${++index}`); values.push(data.displayPriority); }
  if (data.imageUrl !== undefined) { fields.push(`image_url = $${++index}`); values.push(data.imageUrl); }

  if (fields.length === 0) {
    return getOfferById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    // date-range CHECK constraint validated at app layer even for partial updates,
    // comparing against COALESCE(new, current) in the same UPDATE (atomic, tenant-scoped)
    const validFromExpr =
      data.validFrom !== undefined ? `$${values.indexOf(data.validFrom) + 2}::timestamptz` : 'valid_from';
    const validUntilExpr =
      data.validUntil !== undefined ? `$${values.indexOf(data.validUntil) + 2}::timestamptz` : 'valid_until';

    const result = await client.query<OfferRow>(
      `UPDATE offers SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
         AND (${validFromExpr} IS NULL OR ${validUntilExpr} IS NULL OR ${validFromExpr} <= ${validUntilExpr})
       RETURNING ${OFFER_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      const existsCheck = await client.query(
        `SELECT 1 FROM offers WHERE agency_id = $1 AND id = $2`, [agencyId, id],
      );
      if (existsCheck.rows.length > 0) {
        throw new ValidationError('Field "validFrom" must not be after "validUntil"');
      }
      return null;
    }
    return toOffer(row);
  });
}

function toOffer(row: OfferRow): Offer {
  // Effective status is derived read-only: EXPIRED overrides the stored status when
  // valid_until is strictly in the past, but the stored column itself is never mutated here.
  const effectiveStatus: Offer['status'] =
    row.valid_until !== null && new Date(row.valid_until).getTime() < Date.now()
      ? OfferStatus.EXPIRED
      : row.status;

  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    price: Number(row.price),
    status: effectiveStatus,
    featured: row.featured,
    showOnCustomerApp: row.show_on_customer_app,
    displayPriority: row.display_priority,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.valid_from !== null ? { validFrom: new Date(row.valid_from) } : {}),
    ...(row.valid_until !== null ? { validUntil: new Date(row.valid_until) } : {}),
    ...(row.target_segment_id !== null ? { targetSegmentId: row.target_segment_id } : {}),
    ...(row.image_url !== null ? { imageUrl: row.image_url } : {}),
  };
}
