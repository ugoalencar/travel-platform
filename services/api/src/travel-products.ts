import {
  TravelProductCategory,
  type ProductAsset,
  type TravelProduct,
} from '../../../packages/domain/types';
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';
import { recordAuditLog } from './offer-growth-audit';

interface TravelProductRow {
  id: string;
  agency_id: string;
  category: TravelProductCategory;
  supplier_id: string | null;
  partner_id: string | null;
  title: string;
  description: string | null;
  destination: string | null;
  duration_text: string | null;
  rules: string | null;
  inclusions: string | null;
  exclusions: string | null;
  min_age: number | null;
  max_age: number | null;
  capacity: number | null;
  booking_deadline_days: number | null;
  cancellation_policy: string | null;
  cost: string;
  price: string;
  currency: string;
  markup_percent: string | null;
  commission_percent: string | null;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
  standalone: boolean;
  proposal_eligible: boolean;
  portal_visible: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductAssetRow {
  id: string;
  agency_id: string;
  product_id: string;
  asset_id: string;
  sort_order: number;
  created_at: string;
}

export interface TravelProductInput {
  category: TravelProductCategory;
  title: string;
  supplierId?: string;
  partnerId?: string;
  description?: string;
  destination?: string;
  durationText?: string;
  rules?: string;
  inclusions?: string;
  exclusions?: string;
  minAge?: number;
  maxAge?: number;
  capacity?: number;
  bookingDeadlineDays?: number;
  cancellationPolicy?: string;
  cost?: number;
  price?: number;
  currency?: string;
  markupPercent?: number;
  commissionPercent?: number;
  /** ISO calendar date "YYYY-MM-DD" — see TravelProduct.validFrom for rationale. */
  validFrom?: string;
  /** ISO calendar date "YYYY-MM-DD" — see TravelProduct.validUntil for rationale. */
  validUntil?: string;
  active?: boolean;
  standalone?: boolean;
  proposalEligible?: boolean;
  portalVisible?: boolean;
}

export type CreateTravelProductInput = TravelProductInput;
export type UpdateTravelProductInput = Partial<TravelProductInput>;

const CATEGORY_VALUES = Object.values(TravelProductCategory);

// valid_from/valid_until are cast to text (to_char with an explicit ISO
// format) directly in SQL rather than left as raw DATE columns. node-pg's
// default DATE parser returns a JS Date constructed from the date string,
// and round-tripping that through the driver's date-to-parameter encoder
// is timezone-sensitive: depending on the process's local TZ, a stored
// '2026-01-01' can come back as Dec 31 or Jan 2. Casting to text here means
// this module only ever handles plain "YYYY-MM-DD" strings end to end —
// no JS Date is ever constructed from a DATE column, so there is no
// timezone conversion for a value that was never timezone-aware to begin
// with.
const COLUMNS = `id, agency_id, category, supplier_id, partner_id, title, description,
  destination, duration_text, rules, inclusions, exclusions, min_age, max_age, capacity,
  booking_deadline_days, cancellation_policy, cost, price, currency, markup_percent,
  commission_percent, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
  to_char(valid_until, 'YYYY-MM-DD') AS valid_until, active, standalone, proposal_eligible,
  portal_visible, created_at, updated_at`;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertValid(data: Partial<TravelProductInput>): void {
  if (data.category !== undefined && !CATEGORY_VALUES.includes(data.category)) {
    throw new ValidationError('Field "category" must be a valid TravelProductCategory');
  }
  if (data.title !== undefined && data.title.trim().length === 0) {
    throw new ValidationError('Field "title" must not be empty');
  }
  if (data.cost !== undefined && data.cost < 0) {
    throw new ValidationError('Field "cost" must not be negative');
  }
  if (data.price !== undefined && data.price < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }
  if (data.validFrom !== undefined && !ISO_DATE_PATTERN.test(data.validFrom)) {
    throw new ValidationError('Field "validFrom" must be an ISO date string (YYYY-MM-DD)');
  }
  if (data.validUntil !== undefined && !ISO_DATE_PATTERN.test(data.validUntil)) {
    throw new ValidationError('Field "validUntil" must be an ISO date string (YYYY-MM-DD)');
  }
  if (
    data.validFrom !== undefined &&
    data.validUntil !== undefined &&
    data.validFrom > data.validUntil
  ) {
    throw new ValidationError('Field "validFrom" must not be after "validUntil"');
  }
  if (
    data.minAge !== undefined &&
    data.maxAge !== undefined &&
    data.minAge > data.maxAge
  ) {
    throw new ValidationError('Field "minAge" must not be greater than "maxAge"');
  }
}

export async function listTravelProducts(
  database: DatabaseRuntime,
  filters: { category?: TravelProductCategory | undefined } = {},
): Promise<TravelProduct[]> {
  const agencyId = getAgencyId();

  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];
  if (filters.category) {
    values.push(filters.category);
    conditions.push(`category = $${values.length}`);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelProductRow>(
      `SELECT ${COLUMNS} FROM travel_products
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(toTravelProduct);
  });
}

export async function getTravelProductById(
  database: DatabaseRuntime,
  id: string,
): Promise<TravelProduct | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelProductRow>(
      `SELECT ${COLUMNS} FROM travel_products WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toTravelProduct(row) : null;
  });
}

export async function createTravelProduct(
  database: DatabaseRuntime,
  data: CreateTravelProductInput,
): Promise<TravelProduct> {
  const agencyId = getAgencyId();
  const userId = getUserId();

  if (!data.category) {
    throw new ValidationError('Field "category" is required');
  }
  if (!data.title || data.title.trim().length === 0) {
    throw new ValidationError('Field "title" must not be empty');
  }
  assertValid(data);

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelProductRow>(
      `INSERT INTO travel_products (
         agency_id, category, supplier_id, partner_id, title, description, destination,
         duration_text, rules, inclusions, exclusions, min_age, max_age, capacity,
         booking_deadline_days, cancellation_policy, cost, price, currency, markup_percent,
         commission_percent, valid_from, valid_until, active, standalone, proposal_eligible,
         portal_visible
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22, $23, $24, $25, $26, $27)
       RETURNING ${COLUMNS}`,
      [
        agencyId,
        data.category,
        data.supplierId ?? null,
        data.partnerId ?? null,
        data.title,
        data.description ?? null,
        data.destination ?? null,
        data.durationText ?? null,
        data.rules ?? null,
        data.inclusions ?? null,
        data.exclusions ?? null,
        data.minAge ?? null,
        data.maxAge ?? null,
        data.capacity ?? null,
        data.bookingDeadlineDays ?? null,
        data.cancellationPolicy ?? null,
        data.cost ?? 0,
        data.price ?? 0,
        data.currency ?? 'BRL',
        data.markupPercent ?? null,
        data.commissionPercent ?? null,
        data.validFrom ?? null,
        data.validUntil ?? null,
        data.active ?? true,
        data.standalone ?? true,
        data.proposalEligible ?? true,
        data.portalVisible ?? false,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Travel product insert did not return a row');

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'travel_product.created',
      entityType: 'TravelProduct',
      entityId: row.id,
      metadata: { category: row.category, title: row.title },
    });

    return toTravelProduct(row);
  });
}

const UPDATE_COLUMN_MAP: Array<[keyof UpdateTravelProductInput, string]> = [
  ['category', 'category'],
  ['supplierId', 'supplier_id'],
  ['partnerId', 'partner_id'],
  ['title', 'title'],
  ['description', 'description'],
  ['destination', 'destination'],
  ['durationText', 'duration_text'],
  ['rules', 'rules'],
  ['inclusions', 'inclusions'],
  ['exclusions', 'exclusions'],
  ['minAge', 'min_age'],
  ['maxAge', 'max_age'],
  ['capacity', 'capacity'],
  ['bookingDeadlineDays', 'booking_deadline_days'],
  ['cancellationPolicy', 'cancellation_policy'],
  ['cost', 'cost'],
  ['price', 'price'],
  ['currency', 'currency'],
  ['markupPercent', 'markup_percent'],
  ['commissionPercent', 'commission_percent'],
  ['validFrom', 'valid_from'],
  ['validUntil', 'valid_until'],
  ['active', 'active'],
  ['standalone', 'standalone'],
  ['proposalEligible', 'proposal_eligible'],
  ['portalVisible', 'portal_visible'],
];

export async function updateTravelProduct(
  database: DatabaseRuntime,
  id: string,
  data: UpdateTravelProductInput,
): Promise<TravelProduct | null> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  assertValid(data);

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
    return getTravelProductById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelProductRow>(
      `UPDATE travel_products SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) return null;

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'travel_product.updated',
      entityType: 'TravelProduct',
      entityId: row.id,
      metadata: { fields: Object.keys(data) },
    });

    return toTravelProduct(row);
  });
}

export async function deleteTravelProduct(database: DatabaseRuntime, id: string): Promise<TravelProduct | null> {
  // Soft-delete via active=false, matching the suppliers.ts convention.
  return updateTravelProduct(database, id, { active: false });
}

export async function attachAssetToProduct(
  database: DatabaseRuntime,
  productId: string,
  assetId: string,
  sortOrder = 0,
): Promise<ProductAsset> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const productCheck = await client.query(
      `SELECT 1 FROM travel_products WHERE agency_id = $1 AND id = $2`,
      [agencyId, productId],
    );
    if (productCheck.rows.length === 0) {
      throw new NotFoundError('Travel product not found');
    }

    const result = await client.query<ProductAssetRow>(
      `INSERT INTO product_assets (agency_id, product_id, asset_id, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agency_id, product_id, asset_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
       RETURNING id, agency_id, product_id, asset_id, sort_order, created_at`,
      [agencyId, productId, assetId, sortOrder],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Product asset link insert did not return a row');
    return toProductAsset(row);
  });
}

export async function listProductAssets(
  database: DatabaseRuntime,
  productId: string,
): Promise<ProductAsset[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProductAssetRow>(
      `SELECT id, agency_id, product_id, asset_id, sort_order, created_at
       FROM product_assets WHERE agency_id = $1 AND product_id = $2
       ORDER BY sort_order, created_at`,
      [agencyId, productId],
    );
    return result.rows.map(toProductAsset);
  });
}

function toTravelProduct(row: TravelProductRow): TravelProduct {
  return {
    id: row.id,
    agencyId: row.agency_id,
    category: row.category,
    title: row.title,
    cost: Number(row.cost),
    price: Number(row.price),
    currency: row.currency,
    active: row.active,
    standalone: row.standalone,
    proposalEligible: row.proposal_eligible,
    portalVisible: row.portal_visible,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
    ...(row.partner_id !== null ? { partnerId: row.partner_id } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.destination !== null ? { destination: row.destination } : {}),
    ...(row.duration_text !== null ? { durationText: row.duration_text } : {}),
    ...(row.rules !== null ? { rules: row.rules } : {}),
    ...(row.inclusions !== null ? { inclusions: row.inclusions } : {}),
    ...(row.exclusions !== null ? { exclusions: row.exclusions } : {}),
    ...(row.min_age !== null ? { minAge: row.min_age } : {}),
    ...(row.max_age !== null ? { maxAge: row.max_age } : {}),
    ...(row.capacity !== null ? { capacity: row.capacity } : {}),
    ...(row.booking_deadline_days !== null
      ? { bookingDeadlineDays: row.booking_deadline_days }
      : {}),
    ...(row.cancellation_policy !== null ? { cancellationPolicy: row.cancellation_policy } : {}),
    ...(row.markup_percent !== null ? { markupPercent: Number(row.markup_percent) } : {}),
    ...(row.commission_percent !== null
      ? { commissionPercent: Number(row.commission_percent) }
      : {}),
    ...(row.valid_from !== null ? { validFrom: row.valid_from } : {}),
    ...(row.valid_until !== null ? { validUntil: row.valid_until } : {}),
  };
}

function toProductAsset(row: ProductAssetRow): ProductAsset {
  return {
    id: row.id,
    agencyId: row.agency_id,
    productId: row.product_id,
    assetId: row.asset_id,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
  };
}
