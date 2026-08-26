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
}

export interface UpdateProposalInput {
  proposedPrice?: number;
  discount?: number;
  validUntil?: Date;
  conditions?: string;
  notes?: string;
}

const PROPOSAL_COLUMNS = `id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price,
              discount, total, valid_until, conditions, notes, status, created_at, updated_at`;

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
                               discount, total, valid_until, conditions, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
  return transitionProposal(database, id, ProposalStatus.SENT, [ProposalStatus.DRAFT]);
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

    const updated = await client.query<ProposalRow>(
      `UPDATE proposals
       SET status = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${PROPOSAL_COLUMNS}`,
      [agencyId, id, targetStatus],
    );

    const row = updated.rows[0];
    if (!row) throw new Error('Proposal transition did not return a row');
    return toProposal(row);
  });
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
  };
}
