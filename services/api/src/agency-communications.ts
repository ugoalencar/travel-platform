/**
 * Agency Communications — CRUD para comunicações da agência
 * (banners, avisos, campanhas) com controle de visibilidade
 * e segmentação de clientes.
 *
 * Tenant-scoped: todas as operações usam getAgencyId().
 */

import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError, NotFoundError } from './errors';

// ============================================================
// Types
// ============================================================

export type CommunicationType = 'OFFER' | 'NOTICE' | 'CAMPAIGN' | 'INFORMATION';
export type CommunicationStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';
export type CommunicationPlacement = 'CUSTOMER_APP_HOME' | 'CUSTOMER_APP_OFFERS' | 'AGENCY_DASHBOARD';

export interface AgencyCommunication {
  id: string;
  agencyId: string;
  type: CommunicationType;
  title: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  placement: CommunicationPlacement;
  displayPriority: number;
  targetSegmentId?: string;
  visibleFrom?: Date;
  visibleUntil?: Date;
  status: CommunicationStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CommunicationRow {
  id: string;
  agency_id: string;
  type: CommunicationType;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  placement: CommunicationPlacement;
  display_priority: number;
  target_segment_id: string | null;
  visible_from: string | null;
  visible_until: string | null;
  status: CommunicationStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const COMMUNICATION_COLUMNS = `id, agency_id, type, title, body, image_url, cta_label, cta_url,
  placement, display_priority, target_segment_id, visible_from, visible_until,
  status, created_by, created_at, updated_at`;

const VALID_COMMUNICATION_TYPES = ['OFFER', 'NOTICE', 'CAMPAIGN', 'INFORMATION'] as const;
const VALID_COMMUNICATION_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED'] as const;
const VALID_PLACEMENTS = ['CUSTOMER_APP_HOME', 'CUSTOMER_APP_OFFERS', 'AGENCY_DASHBOARD'] as const;

// ============================================================
// Input Types
// ============================================================

export interface CreateCommunicationInput {
  type: CommunicationType;
  title: string;
  body?: string;
  imageUrl?: string | null;
  ctaLabel?: string;
  ctaUrl?: string;
  placement?: CommunicationPlacement;
  displayPriority?: number;
  targetSegmentId?: string | null;
  visibleFrom?: Date;
  visibleUntil?: Date;
}

export interface UpdateCommunicationInput {
  type?: CommunicationType;
  title?: string;
  body?: string;
  imageUrl?: string | null;
  ctaLabel?: string;
  ctaUrl?: string;
  placement?: CommunicationPlacement;
  displayPriority?: number;
  targetSegmentId?: string | null;
  visibleFrom?: Date;
  visibleUntil?: Date;
  status?: CommunicationStatus;
}

// ============================================================
// CRUD Operations
// ============================================================

export async function createCommunication(
  database: DatabaseRuntime,
  input: CreateCommunicationInput,
  createdByUserId: string,
): Promise<AgencyCommunication> {
  const agencyId = getAgencyId();

  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError('Field "title" is required');
  }
  if (!VALID_COMMUNICATION_TYPES.includes(input.type)) {
    throw new ValidationError(`Field "type" must be one of: ${VALID_COMMUNICATION_TYPES.join(', ')}`);
  }
  if (input.placement && !VALID_PLACEMENTS.includes(input.placement)) {
    throw new ValidationError(`Field "placement" must be one of: ${VALID_PLACEMENTS.join(', ')}`);
  }
  if (input.visibleFrom && input.visibleUntil && input.visibleFrom.getTime() > input.visibleUntil.getTime()) {
    throw new ValidationError('Field "visibleFrom" must not be after "visibleUntil"');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommunicationRow>(
      `INSERT INTO agency_communications
        (agency_id, type, title, body, image_url, cta_label, cta_url,
         placement, display_priority, target_segment_id, visible_from, visible_until,
         status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13)
       RETURNING ${COMMUNICATION_COLUMNS}`,
      [
        agencyId,
        input.type,
        input.title.trim(),
        input.body ?? null,
        input.imageUrl ?? null,
        input.ctaLabel ?? null,
        input.ctaUrl ?? null,
        input.placement ?? 'CUSTOMER_APP_HOME',
        input.displayPriority ?? 0,
        input.targetSegmentId ?? null,
        input.visibleFrom ?? null,
        input.visibleUntil ?? null,
        createdByUserId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Communication insert did not return a row');
    return toCommunication(row);
  });
}

export async function updateCommunication(
  database: DatabaseRuntime,
  id: string,
  input: UpdateCommunicationInput,
): Promise<AgencyCommunication> {
  const agencyId = getAgencyId();

  if (input.type && !VALID_COMMUNICATION_TYPES.includes(input.type)) {
    throw new ValidationError(`Field "type" must be one of: ${VALID_COMMUNICATION_TYPES.join(', ')}`);
  }
  if (input.placement && !VALID_PLACEMENTS.includes(input.placement)) {
    throw new ValidationError(`Field "placement" must be one of: ${VALID_PLACEMENTS.join(', ')}`);
  }
  if (input.status && !VALID_COMMUNICATION_STATUSES.includes(input.status)) {
    throw new ValidationError(`Field "status" must be one of: ${VALID_COMMUNICATION_STATUSES.join(', ')}`);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (input.type !== undefined) { fields.push(`type = $${++index}`); values.push(input.type); }
  if (input.title !== undefined) { fields.push(`title = $${++index}`); values.push(input.title.trim()); }
  if (input.body !== undefined) { fields.push(`body = $${++index}`); values.push(input.body); }
  if (input.imageUrl !== undefined) { fields.push(`image_url = $${++index}`); values.push(input.imageUrl); }
  if (input.ctaLabel !== undefined) { fields.push(`cta_label = $${++index}`); values.push(input.ctaLabel); }
  if (input.ctaUrl !== undefined) { fields.push(`cta_url = $${++index}`); values.push(input.ctaUrl); }
  if (input.placement !== undefined) { fields.push(`placement = $${++index}`); values.push(input.placement); }
  if (input.displayPriority !== undefined) { fields.push(`display_priority = $${++index}`); values.push(input.displayPriority); }
  if (input.targetSegmentId !== undefined) { fields.push(`target_segment_id = $${++index}`); values.push(input.targetSegmentId); }
  if (input.visibleFrom !== undefined) { fields.push(`visible_from = $${++index}`); values.push(input.visibleFrom); }
  if (input.visibleUntil !== undefined) { fields.push(`visible_until = $${++index}`); values.push(input.visibleUntil); }
  if (input.status !== undefined) { fields.push(`status = $${++index}`); values.push(input.status); }

  if (fields.length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommunicationRow>(
      `UPDATE agency_communications SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${COMMUNICATION_COLUMNS}`,
      [agencyId, ...values, id],
    );
    const row = result.rows[0];
    if (!row) {
      const existsCheck = await client.query(
        `SELECT 1 FROM agency_communications WHERE agency_id = $1 AND id = $2`,
        [agencyId, id],
      );
      if (existsCheck.rows.length === 0) {
        throw new NotFoundError('Communication not found');
      }
      throw new ValidationError('No valid fields to update');
    }
    return toCommunication(row);
  });
}

export async function getCommunicationById(
  database: DatabaseRuntime,
  id: string,
): Promise<AgencyCommunication | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommunicationRow>(
      `SELECT ${COMMUNICATION_COLUMNS} FROM agency_communications
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toCommunication(row) : null;
  });
}

export async function listCommunications(
  database: DatabaseRuntime,
  filters?: {
    placement?: CommunicationPlacement;
    status?: CommunicationStatus;
    type?: CommunicationType;
  },
): Promise<AgencyCommunication[]> {
  const agencyId = getAgencyId();

  const conditions: string[] = ['agency_id = $1'];
  const values: unknown[] = [agencyId];
  let index = 1;

  if (filters?.placement) {
    conditions.push(`placement = $${++index}`);
    values.push(filters.placement);
  }
  if (filters?.status) {
    conditions.push(`status = $${++index}`);
    values.push(filters.status);
  }
  if (filters?.type) {
    conditions.push(`type = $${++index}`);
    values.push(filters.type);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommunicationRow>(
      `SELECT ${COMMUNICATION_COLUMNS} FROM agency_communications
       WHERE ${conditions.join(' AND ')}
       ORDER BY display_priority DESC, created_at DESC`,
      values,
    );
    return result.rows.map(toCommunication);
  });
}

export async function publishCommunication(
  database: DatabaseRuntime,
  id: string,
): Promise<AgencyCommunication> {
  return updateCommunication(database, id, { status: 'ACTIVE' });
}

export async function archiveCommunication(
  database: DatabaseRuntime,
  id: string,
): Promise<AgencyCommunication> {
  return updateCommunication(database, id, { status: 'ARCHIVED' });
}

export async function deleteCommunication(
  database: DatabaseRuntime,
  id: string,
): Promise<void> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM agency_communications WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Communication not found');
    }
  });
}

// ============================================================
// Customer-facing: visible communications
// ============================================================

export async function listVisibleCommunications(
  database: DatabaseRuntime,
  placement: CommunicationPlacement,
): Promise<AgencyCommunication[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommunicationRow>(
      `SELECT ${COMMUNICATION_COLUMNS} FROM agency_communications
       WHERE agency_id = $1
         AND placement = $2
         AND status = 'ACTIVE'
         AND (visible_from IS NULL OR visible_from <= now())
         AND (visible_until IS NULL OR visible_until >= now())
         AND (target_segment_id IS NULL)
       ORDER BY display_priority DESC, created_at DESC`,
      [agencyId, placement],
    );
    return result.rows.map(toCommunication);
  });
}

// Same visibility rule as listVisibleCommunications, scoped to a single
// id -- used to validate a customer-app view/click event actually
// targets a communication that is real, belongs to this tenant, and is
// currently visible (never trusts the frontend's claim alone).
export async function getVisibleCommunicationById(
  database: DatabaseRuntime,
  id: string,
): Promise<AgencyCommunication | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CommunicationRow>(
      `SELECT ${COMMUNICATION_COLUMNS} FROM agency_communications
       WHERE agency_id = $1
         AND id = $2
         AND status = 'ACTIVE'
         AND (visible_from IS NULL OR visible_from <= now())
         AND (visible_until IS NULL OR visible_until >= now())`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toCommunication(row) : null;
  });
}

// ============================================================
// Mapping
// ============================================================

function toCommunication(row: CommunicationRow): AgencyCommunication {
  return {
    id: row.id,
    agencyId: row.agency_id,
    type: row.type,
    title: row.title,
    placement: row.placement,
    displayPriority: row.display_priority,
    status: row.status,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.body !== null ? { body: row.body } : {}),
    ...(row.image_url !== null ? { imageUrl: row.image_url } : {}),
    ...(row.cta_label !== null ? { ctaLabel: row.cta_label } : {}),
    ...(row.cta_url !== null ? { ctaUrl: row.cta_url } : {}),
    ...(row.target_segment_id !== null ? { targetSegmentId: row.target_segment_id } : {}),
    ...(row.visible_from !== null ? { visibleFrom: new Date(row.visible_from) } : {}),
    ...(row.visible_until !== null ? { visibleUntil: new Date(row.visible_until) } : {}),
  };
}
