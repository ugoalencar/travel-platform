import { ProposalStatus, type Proposal } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';

interface ProposalRow {
  id: string;
  agency_id: string;
  customer_id: string;
  offer_id: string | null;
  wish_id: string | null;
  user_id: string | null;
  proposed_price: string;
  discount: string;
  total: string;
  valid_until: string | null;
  conditions: string | null;
  notes: string | null;
  status: Proposal['status'];
  title: string | null;
  subtitle: string | null;
  destination_summary: string | null;
  travel_period: string | null;
  traveler_summary: string | null;
  intro_text: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProposalInput {
  offerId?: string;
  wishId?: string;
  proposedPrice: number;
  discount?: number;
  validUntil?: Date;
  conditions?: string;
  notes?: string;
  title?: string;
  subtitle?: string;
  destinationSummary?: string;
  travelPeriod?: string;
  travelerSummary?: string;
  introText?: string;
}

export interface UpdateProposalInput {
  proposedPrice?: number;
  discount?: number;
  validUntil?: Date;
  conditions?: string;
  notes?: string;
  title?: string;
  subtitle?: string;
  destinationSummary?: string;
  travelPeriod?: string;
  travelerSummary?: string;
  introText?: string;
}

// Proposals leave the editable window once they stop being DRAFT/SENT --
// see 088_proposal_visual_cover.sql's note and
// docs/product/PROPOSAL_VISUAL_2.md's "Fase 10" section. Applies to the
// commercial fields here AND to sections/items/media
// (services/api/src/proposal-content.ts reuses this same guard).
const EDITABLE_STATUSES: ReadonlySet<Proposal['status']> = new Set([
  ProposalStatus.DRAFT,
  ProposalStatus.SENT,
]);

export function assertProposalContentEditable(status: Proposal['status']): void {
  if (!EDITABLE_STATUSES.has(status)) {
    throw new ConflictError(
      `Proposal content cannot be changed once its status is ${status}`,
    );
  }
}

const PROPOSAL_COLUMNS = `id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price,
              discount, total, valid_until, conditions, notes, status, title, subtitle,
              destination_summary, travel_period, traveler_summary, intro_text, published_at,
              created_at, updated_at`;

/**
 * Computes the 2-decimal-safe monetary total for a Proposal: total = proposedPrice - discount.
 * Works in integer cents internally to avoid floating point subtraction artifacts
 * (e.g. 99.99 - 33.33 must be exactly 66.66, not 66.65999999999999).
 */
export function computeTotal(proposedPrice: number, discount: number): number {
  const priceCents = Math.round(proposedPrice * 100);
  const discountCents = Math.round(discount * 100);
  return (priceCents - discountCents) / 100;
}

export async function listProposals(database: DatabaseRuntime): Promise<Proposal[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalRow>(
      `SELECT ${PROPOSAL_COLUMNS}
       FROM proposals
       WHERE agency_id = $1
       ORDER BY created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toProposal);
  });
}

export async function getProposalById(
  database: DatabaseRuntime,
  id: string,
): Promise<Proposal | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalRow>(
      `SELECT ${PROPOSAL_COLUMNS}
       FROM proposals
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toProposal(row) : null;
  });
}

export async function createProposal(
  database: DatabaseRuntime,
  customerId: string,
  data: CreateProposalInput,
): Promise<Proposal> {
  const agencyId = getAgencyId();

  if (data.proposedPrice < 0) {
    throw new ValidationError('Field "proposedPrice" must not be negative');
  }
  const discount = data.discount ?? 0;
  if (discount < 0) {
    throw new ValidationError('Field "discount" must not be negative');
  }
  if (discount > data.proposedPrice) {
    throw new ValidationError('Field "discount" must not exceed "proposedPrice"');
  }

  const total = computeTotal(data.proposedPrice, discount);
  if (total < 0) {
    throw new ValidationError('Computed "total" must not be negative');
  }

  return database.withTenantTransaction(async (client) => {
    const customerCheck = await client.query(
      `SELECT 1 FROM customers WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, customerId],
    );
    if (customerCheck.rows.length === 0) {
      throw new NotFoundError('Customer not found');
    }

    if (data.offerId !== undefined) {
      const offerCheck = await client.query(
        `SELECT 1 FROM offers WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.offerId],
      );
      if (offerCheck.rows.length === 0) {
        throw new NotFoundError('Offer not found');
      }
    }

    if (data.wishId !== undefined) {
      const wishCheck = await client.query(
        `SELECT 1 FROM wishes WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.wishId],
      );
      if (wishCheck.rows.length === 0) {
        throw new NotFoundError('Wish not found');
      }
    }

    const result = await client.query<ProposalRow>(
      `INSERT INTO proposals (agency_id, customer_id, offer_id, wish_id, proposed_price,
                               discount, total, valid_until, conditions, notes, title, subtitle,
                               destination_summary, travel_period, traveler_summary, intro_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${PROPOSAL_COLUMNS}`,
      [
        agencyId,
        customerId,
        data.offerId ?? null,
        data.wishId ?? null,
        data.proposedPrice,
        discount,
        total,
        data.validUntil ?? null,
        data.conditions ?? null,
        data.notes ?? null,
        data.title ?? null,
        data.subtitle ?? null,
        data.destinationSummary ?? null,
        data.travelPeriod ?? null,
        data.travelerSummary ?? null,
        data.introText ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Proposal insert did not return a row');
    }
    return toProposal(row);
  });
}

export async function updateProposal(
  database: DatabaseRuntime,
  id: string,
  data: UpdateProposalInput,
): Promise<Proposal | null> {
  const agencyId = getAgencyId();

  if (data.proposedPrice !== undefined && data.proposedPrice < 0) {
    throw new ValidationError('Field "proposedPrice" must not be negative');
  }
  if (data.discount !== undefined && data.discount < 0) {
    throw new ValidationError('Field "discount" must not be negative');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  let priceParamIndex: number | undefined;
  let discountParamIndex: number | undefined;

  if (data.proposedPrice !== undefined) {
    priceParamIndex = ++index;
    fields.push(`proposed_price = $${priceParamIndex}`);
    values.push(data.proposedPrice);
  }
  if (data.discount !== undefined) {
    discountParamIndex = ++index;
    fields.push(`discount = $${discountParamIndex}`);
    values.push(data.discount);
  }
  if (data.validUntil !== undefined) {
    fields.push(`valid_until = $${++index}`);
    values.push(data.validUntil);
  }
  if (data.conditions !== undefined) {
    fields.push(`conditions = $${++index}`);
    values.push(data.conditions);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${++index}`);
    values.push(data.notes);
  }
  if (data.title !== undefined) {
    fields.push(`title = $${++index}`);
    values.push(data.title);
  }
  if (data.subtitle !== undefined) {
    fields.push(`subtitle = $${++index}`);
    values.push(data.subtitle);
  }
  if (data.destinationSummary !== undefined) {
    fields.push(`destination_summary = $${++index}`);
    values.push(data.destinationSummary);
  }
  if (data.travelPeriod !== undefined) {
    fields.push(`travel_period = $${++index}`);
    values.push(data.travelPeriod);
  }
  if (data.travelerSummary !== undefined) {
    fields.push(`traveler_summary = $${++index}`);
    values.push(data.travelerSummary);
  }
  if (data.introText !== undefined) {
    fields.push(`intro_text = $${++index}`);
    values.push(data.introText);
  }

  // Effective (new-or-current) expressions for proposedPrice/discount, mirroring the
  // COALESCE-in-WHERE technique trips.ts (date range) and offers.ts (validity range) use:
  // reference the bound parameter directly when the field is being changed, otherwise the
  // current column value. NUMERIC(10,2) subtraction in Postgres is exact decimal arithmetic
  // (no floating point artifacts), so total is safely recomputed in the same statement.
  // Param indices are tracked explicitly (not via values.indexOf(value)) because
  // proposedPrice and discount can legitimately hold the same numeric value (e.g. a
  // discount equal to the full price, total = 0), which would make value-based lookup
  // ambiguous.
  const priceExpr = priceParamIndex !== undefined ? `$${priceParamIndex}::numeric` : 'proposed_price';
  const discountExpr = discountParamIndex !== undefined ? `$${discountParamIndex}::numeric` : 'discount';

  if (data.proposedPrice !== undefined || data.discount !== undefined) {
    fields.push(`total = ${priceExpr} - ${discountExpr}`);
  }

  if (fields.length === 0) {
    return getProposalById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const current = await client.query<{ status: Proposal['status'] }>(
      `SELECT status FROM proposals WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [agencyId, id],
    );
    const currentStatus = current.rows[0]?.status;
    if (currentStatus === undefined) return null;
    assertProposalContentEditable(currentStatus);

    const result = await client.query<ProposalRow>(
      `UPDATE proposals
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
         AND ${discountExpr} <= ${priceExpr}
       RETURNING ${PROPOSAL_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      const existsCheck = await client.query(
        `SELECT 1 FROM proposals WHERE agency_id = $1 AND id = $2`,
        [agencyId, id],
      );
      if (existsCheck.rows.length > 0) {
        throw new ValidationError('Field "discount" must not exceed "proposedPrice"');
      }
      return null;
    }
    return toProposal(row);
  });
}

export async function sendProposal(
  database: DatabaseRuntime,
  id: string,
): Promise<Proposal | null> {
  // published_at is set once, here, the first time a proposal leaves
  // DRAFT -- see 088_proposal_visual_cover.sql's note on the minimal
  // immutability decision (Fase 10).
  return transitionProposal(database, id, ProposalStatus.SENT, [ProposalStatus.DRAFT], {
    setPublishedAt: true,
  });
}

export async function cancelProposal(
  database: DatabaseRuntime,
  id: string,
): Promise<Proposal | null> {
  return transitionProposal(database, id, ProposalStatus.CANCELLED, [
    ProposalStatus.DRAFT,
    ProposalStatus.SENT,
  ]);
}

export async function acceptProposal(
  database: DatabaseRuntime,
  id: string,
): Promise<Proposal | null> {
  return transitionProposal(database, id, ProposalStatus.ACCEPTED, [ProposalStatus.SENT]);
}

export async function declineProposal(
  database: DatabaseRuntime,
  id: string,
): Promise<Proposal | null> {
  return transitionProposal(database, id, ProposalStatus.DECLINED, [ProposalStatus.SENT]);
}

async function transitionProposal(
  database: DatabaseRuntime,
  id: string,
  targetStatus: ProposalStatus,
  allowedFrom: ProposalStatus[],
  options?: { setPublishedAt?: boolean },
): Promise<Proposal | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const current = await client.query<ProposalRow>(
      `SELECT ${PROPOSAL_COLUMNS}
       FROM proposals
       WHERE agency_id = $1 AND id = $2
       FOR UPDATE`,
      [agencyId, id],
    );
    const currentRow = current.rows[0];
    if (!currentRow) return null;

    if (currentRow.status === targetStatus) {
      return toProposal(currentRow);
    }

    if (!allowedFrom.includes(currentRow.status)) {
      throw new ConflictError(
        `Cannot transition Proposal from ${currentRow.status} to ${targetStatus}`,
      );
    }

    const publishedAtClause = options?.setPublishedAt ? `, published_at = COALESCE(published_at, now())` : '';
    const updated = await client.query<ProposalRow>(
      `UPDATE proposals
       SET status = $3, updated_at = now()${publishedAtClause}
       WHERE agency_id = $1 AND id = $2
       RETURNING ${PROPOSAL_COLUMNS}`,
      [agencyId, id, targetStatus],
    );

    const row = updated.rows[0];
    if (!row) throw new Error('Proposal transition did not return a row');
    return toProposal(row);
  });
}

export interface ProposalWithCustomer extends Proposal {
  customerName: string;
}

interface ProposalWithCustomerRow extends ProposalRow {
  customer_name: string;
}

const PROPOSAL_WITH_CUSTOMER_QUERY = `
  SELECT p.id, p.agency_id, p.customer_id, p.offer_id, p.wish_id, p.user_id, p.proposed_price,
         p.discount, p.total, p.valid_until, p.conditions, p.notes, p.status, p.title, p.subtitle,
         p.destination_summary, p.travel_period, p.traveler_summary, p.intro_text, p.published_at,
         p.created_at, p.updated_at,
         c.name AS customer_name
  FROM proposals p
  JOIN customers c ON c.agency_id = p.agency_id AND c.id = p.customer_id
`;

// Read-model for UI surfaces that need the customer's name alongside the
// proposal, without changing listProposals/getProposalById's shape for
// other callers. One joined query, no N+1.
export async function listProposalsWithCustomer(
  database: DatabaseRuntime,
): Promise<ProposalWithCustomer[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalWithCustomerRow>(
      `${PROPOSAL_WITH_CUSTOMER_QUERY}
       WHERE p.agency_id = $1
       ORDER BY p.created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toProposalWithCustomer);
  });
}

export async function getProposalWithCustomerById(
  database: DatabaseRuntime,
  id: string,
): Promise<ProposalWithCustomer | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalWithCustomerRow>(
      `${PROPOSAL_WITH_CUSTOMER_QUERY}
       WHERE p.agency_id = $1 AND p.id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toProposalWithCustomer(row) : null;
  });
}

function toProposalWithCustomer(row: ProposalWithCustomerRow): ProposalWithCustomer {
  return {
    ...toProposal(row),
    customerName: row.customer_name,
  };
}

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    proposedPrice: Number(row.proposed_price),
    discount: Number(row.discount),
    total: Number(row.total),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.offer_id !== null ? { offerId: row.offer_id } : {}),
    ...(row.wish_id !== null ? { wishId: row.wish_id } : {}),
    ...(row.user_id !== null ? { userId: row.user_id } : {}),
    ...(row.valid_until !== null ? { validUntil: new Date(row.valid_until) } : {}),
    ...(row.conditions !== null ? { conditions: row.conditions } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.subtitle !== null ? { subtitle: row.subtitle } : {}),
    ...(row.destination_summary !== null ? { destinationSummary: row.destination_summary } : {}),
    ...(row.travel_period !== null ? { travelPeriod: row.travel_period } : {}),
    ...(row.traveler_summary !== null ? { travelerSummary: row.traveler_summary } : {}),
    ...(row.intro_text !== null ? { introText: row.intro_text } : {}),
    ...(row.published_at !== null ? { publishedAt: new Date(row.published_at) } : {}),
  };
}
