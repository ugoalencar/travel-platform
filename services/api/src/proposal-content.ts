// Proposal Visual 2.0 -- rich content: Proposal -> ProposalSection ->
// ProposalItem, plus ProposalMedia (cover/gallery). See
// docs/product/PROPOSAL_CONTENT_MODEL.md for the model decisions.
//
// Every mutation here re-checks the parent Proposal's status via
// assertProposalContentEditable (proposals.ts) -- once a proposal
// leaves DRAFT/SENT, its content is immutable (Fase 10).
import { randomUUID } from 'node:crypto';
import { ProposalItemType, ProposalSectionType } from '../../../packages/domain/types';
import type { Proposal, ProposalItem, ProposalMedia, ProposalSection } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError, ValidationError } from './errors';
import { assertProposalContentEditable } from './proposals';
import {
  MAX_ATTACHMENT_BYTES,
  isBlockedFileName,
  validateFileSize,
  validateFileType,
} from './document-attachments';

// ============================================================
// Shared: fetch + guard the parent Proposal's editable status
// ============================================================

async function requireEditableProposal(
  client: TenantTransactionClient,
  agencyId: string,
  proposalId: string,
): Promise<void> {
  const result = await client.query<{ status: Proposal['status'] }>(
    `SELECT status FROM proposals WHERE agency_id = $1 AND id = $2`,
    [agencyId, proposalId],
  );
  const status = result.rows[0]?.status;
  if (status === undefined) {
    throw new NotFoundError('Proposal not found');
  }
  assertProposalContentEditable(status);
}

async function proposalIdForSection(
  client: TenantTransactionClient,
  agencyId: string,
  sectionId: string,
): Promise<string | null> {
  const result = await client.query<{ proposal_id: string }>(
    `SELECT proposal_id FROM proposal_sections WHERE agency_id = $1 AND id = $2`,
    [agencyId, sectionId],
  );
  return result.rows[0]?.proposal_id ?? null;
}

// ============================================================
// ProposalSection
// ============================================================

interface ProposalSectionRow {
  id: string;
  agency_id: string;
  proposal_id: string;
  type: ProposalSectionType;
  title: string;
  description: string | null;
  sort_order: number;
  is_visible_to_customer: boolean;
  created_at: string;
  updated_at: string;
}

const SECTION_COLUMNS = `id, agency_id, proposal_id, type, title, description, sort_order,
  is_visible_to_customer, created_at, updated_at`;

export interface CreateProposalSectionInput {
  type: ProposalSectionType;
  title: string;
  description?: string;
  sortOrder?: number;
  isVisibleToCustomer?: boolean;
}

export interface UpdateProposalSectionInput {
  title?: string;
  description?: string;
  sortOrder?: number;
  isVisibleToCustomer?: boolean;
}

export async function listProposalSections(
  database: DatabaseRuntime,
  proposalId: string,
): Promise<ProposalSection[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalSectionRow>(
      `SELECT ${SECTION_COLUMNS} FROM proposal_sections
       WHERE agency_id = $1 AND proposal_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [agencyId, proposalId],
    );
    return result.rows.map(toSection);
  });
}

export async function createProposalSection(
  database: DatabaseRuntime,
  proposalId: string,
  data: CreateProposalSectionInput,
): Promise<ProposalSection> {
  const agencyId = getAgencyId();
  if (!data.title || data.title.trim().length === 0) {
    throw new ValidationError('Field "title" is required');
  }

  return database.withTenantTransaction(async (client) => {
    await requireEditableProposal(client, agencyId, proposalId);

    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const next = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM proposal_sections
         WHERE agency_id = $1 AND proposal_id = $2`,
        [agencyId, proposalId],
      );
      sortOrder = next.rows[0]?.next ?? 0;
    }

    const result = await client.query<ProposalSectionRow>(
      `INSERT INTO proposal_sections
         (agency_id, proposal_id, type, title, description, sort_order, is_visible_to_customer)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SECTION_COLUMNS}`,
      [
        agencyId,
        proposalId,
        data.type,
        data.title,
        data.description ?? null,
        sortOrder,
        data.isVisibleToCustomer ?? true,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('ProposalSection insert did not return a row');
    return toSection(row);
  });
}

export async function updateProposalSection(
  database: DatabaseRuntime,
  id: string,
  data: UpdateProposalSectionInput,
): Promise<ProposalSection | null> {
  const agencyId = getAgencyId();

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  if (data.title !== undefined) {
    if (data.title.trim().length === 0) {
      throw new ValidationError('Field "title" must not be blank');
    }
    fields.push(`title = $${++index}`);
    values.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${++index}`);
    values.push(data.description);
  }
  if (data.sortOrder !== undefined) {
    fields.push(`sort_order = $${++index}`);
    values.push(data.sortOrder);
  }
  if (data.isVisibleToCustomer !== undefined) {
    fields.push(`is_visible_to_customer = $${++index}`);
    values.push(data.isVisibleToCustomer);
  }
  if (fields.length === 0) {
    return getProposalSectionById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const proposalId = await proposalIdForSection(client, agencyId, id);
    if (proposalId === null) return null;
    await requireEditableProposal(client, agencyId, proposalId);

    const result = await client.query<ProposalSectionRow>(
      `UPDATE proposal_sections SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${SECTION_COLUMNS}`,
      [agencyId, ...values, id],
    );
    const row = result.rows[0];
    return row ? toSection(row) : null;
  });
}

export async function getProposalSectionById(
  database: DatabaseRuntime,
  id: string,
): Promise<ProposalSection | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalSectionRow>(
      `SELECT ${SECTION_COLUMNS} FROM proposal_sections WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toSection(row) : null;
  });
}

export async function deleteProposalSection(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const proposalId = await proposalIdForSection(client, agencyId, id);
    if (proposalId === null) return false;
    await requireEditableProposal(client, agencyId, proposalId);

    const result = await client.query(
      `DELETE FROM proposal_sections WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

function toSection(row: ProposalSectionRow): ProposalSection {
  return {
    id: row.id,
    agencyId: row.agency_id,
    proposalId: row.proposal_id,
    type: row.type,
    title: row.title,
    sortOrder: row.sort_order,
    isVisibleToCustomer: row.is_visible_to_customer,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
  };
}

// ============================================================
// ProposalItem
// ============================================================

interface ProposalItemRow {
  id: string;
  agency_id: string;
  proposal_section_id: string;
  type: ProposalItemType;
  title: string | null;
  description: string | null;
  sort_order: number;
  day_number: number | null;
  location_name: string | null;
  price: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
  updated_at: string;
}

const ITEM_COLUMNS = `id, agency_id, proposal_section_id, type, title, description, sort_order,
  day_number, location_name, price, reference_type, reference_id, created_at, updated_at`;

export interface CreateProposalItemInput {
  type: ProposalItemType;
  title?: string;
  description?: string;
  sortOrder?: number;
  dayNumber?: number;
  locationName?: string;
  price?: number;
  referenceType?: string;
  referenceId?: string;
}

export interface UpdateProposalItemInput {
  title?: string;
  description?: string;
  sortOrder?: number;
  dayNumber?: number;
  locationName?: string;
  price?: number;
}

export async function listProposalItems(
  database: DatabaseRuntime,
  sectionId: string,
): Promise<ProposalItem[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM proposal_items
       WHERE agency_id = $1 AND proposal_section_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [agencyId, sectionId],
    );
    return result.rows.map(toItem);
  });
}

export async function createProposalItem(
  database: DatabaseRuntime,
  sectionId: string,
  data: CreateProposalItemInput,
): Promise<ProposalItem> {
  const agencyId = getAgencyId();
  if (data.price !== undefined && data.price < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }
  if (data.dayNumber !== undefined && data.dayNumber <= 0) {
    throw new ValidationError('Field "dayNumber" must be a positive integer');
  }

  return database.withTenantTransaction(async (client) => {
    const proposalId = await proposalIdForSection(client, agencyId, sectionId);
    if (proposalId === null) throw new NotFoundError('Proposal section not found');
    await requireEditableProposal(client, agencyId, proposalId);

    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const next = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM proposal_items
         WHERE agency_id = $1 AND proposal_section_id = $2`,
        [agencyId, sectionId],
      );
      sortOrder = next.rows[0]?.next ?? 0;
    }

    const result = await client.query<ProposalItemRow>(
      `INSERT INTO proposal_items
         (agency_id, proposal_section_id, type, title, description, sort_order, day_number,
          location_name, price, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${ITEM_COLUMNS}`,
      [
        agencyId,
        sectionId,
        data.type,
        data.title ?? null,
        data.description ?? null,
        sortOrder,
        data.dayNumber ?? null,
        data.locationName ?? null,
        data.price ?? null,
        data.referenceType ?? null,
        data.referenceId ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('ProposalItem insert did not return a row');
    return toItem(row);
  });
}

export async function updateProposalItem(
  database: DatabaseRuntime,
  id: string,
  data: UpdateProposalItemInput,
): Promise<ProposalItem | null> {
  const agencyId = getAgencyId();
  if (data.price !== undefined && data.price < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }
  if (data.dayNumber !== undefined && data.dayNumber <= 0) {
    throw new ValidationError('Field "dayNumber" must be a positive integer');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  if (data.title !== undefined) {
    fields.push(`title = $${++index}`);
    values.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${++index}`);
    values.push(data.description);
  }
  if (data.sortOrder !== undefined) {
    fields.push(`sort_order = $${++index}`);
    values.push(data.sortOrder);
  }
  if (data.dayNumber !== undefined) {
    fields.push(`day_number = $${++index}`);
    values.push(data.dayNumber);
  }
  if (data.locationName !== undefined) {
    fields.push(`location_name = $${++index}`);
    values.push(data.locationName);
  }
  if (data.price !== undefined) {
    fields.push(`price = $${++index}`);
    values.push(data.price);
  }
  if (fields.length === 0) {
    return getProposalItemById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const parent = await client.query<{ proposal_id: string }>(
      `SELECT ps.proposal_id FROM proposal_items pi
       JOIN proposal_sections ps ON ps.agency_id = pi.agency_id AND ps.id = pi.proposal_section_id
       WHERE pi.agency_id = $1 AND pi.id = $2`,
      [agencyId, id],
    );
    const proposalId = parent.rows[0]?.proposal_id;
    if (proposalId === undefined) return null;
    await requireEditableProposal(client, agencyId, proposalId);

    const result = await client.query<ProposalItemRow>(
      `UPDATE proposal_items SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${ITEM_COLUMNS}`,
      [agencyId, ...values, id],
    );
    const row = result.rows[0];
    return row ? toItem(row) : null;
  });
}

export async function getProposalItemById(
  database: DatabaseRuntime,
  id: string,
): Promise<ProposalItem | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM proposal_items WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toItem(row) : null;
  });
}

export async function deleteProposalItem(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const parent = await client.query<{ proposal_id: string }>(
      `SELECT ps.proposal_id FROM proposal_items pi
       JOIN proposal_sections ps ON ps.agency_id = pi.agency_id AND ps.id = pi.proposal_section_id
       WHERE pi.agency_id = $1 AND pi.id = $2`,
      [agencyId, id],
    );
    const proposalId = parent.rows[0]?.proposal_id;
    if (proposalId === undefined) return false;
    await requireEditableProposal(client, agencyId, proposalId);

    const result = await client.query(`DELETE FROM proposal_items WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  });
}

function toItem(row: ProposalItemRow): ProposalItem {
  return {
    id: row.id,
    agencyId: row.agency_id,
    proposalSectionId: row.proposal_section_id,
    type: row.type,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.day_number !== null ? { dayNumber: row.day_number } : {}),
    ...(row.location_name !== null ? { locationName: row.location_name } : {}),
    ...(row.price !== null ? { price: Number(row.price) } : {}),
    ...(row.reference_type !== null ? { referenceType: row.reference_type } : {}),
    ...(row.reference_id !== null ? { referenceId: row.reference_id } : {}),
  };
}

// ============================================================
// ProposalMedia -- same secure_file_key pattern as trip_photos.ts
// ============================================================

interface ProposalMediaRow {
  id: string;
  agency_id: string;
  proposal_id: string;
  secure_file_key: string;
  file_name: string;
  file_mime_type: string;
  file_size_bytes: string;
  caption: string | null;
  is_cover: boolean;
  sort_order: number;
  created_at: string;
}

const MEDIA_COLUMNS = `id, agency_id, proposal_id, secure_file_key, file_name, file_mime_type,
  file_size_bytes, caption, is_cover, sort_order, created_at`;

const ALLOWED_MEDIA_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export function validateProposalMediaFileType(mimeType: string | null | undefined): boolean {
  if (typeof mimeType !== 'string') return false;
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return ALLOWED_MEDIA_MIME_TYPES.includes(normalized);
}

export function generateProposalMediaSecureFileKey(proposalId: string, fileName: string): string {
  const safeProposalId = proposalId.replace(/[^A-Za-z0-9-]/g, '');
  const extension = fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? `.${extension}` : '';
  return `proposal-media/${safeProposalId}/${randomUUID()}${safeExtension}`;
}

export interface CreateProposalMediaInput {
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  secureFileKey: string;
  caption?: string;
  isCover?: boolean;
}

export async function createProposalMedia(
  database: DatabaseRuntime,
  proposalId: string,
  data: CreateProposalMediaInput,
): Promise<ProposalMedia> {
  const agencyId = getAgencyId();

  if (isBlockedFileName(data.fileName)) {
    throw new ValidationError('File type is not permitted');
  }
  if (!validateProposalMediaFileType(data.fileMimeType) || !validateFileType(data.fileMimeType)) {
    throw new ValidationError(`Unsupported file type. Allowed types: ${ALLOWED_MEDIA_MIME_TYPES.join(', ')}`);
  }
  if (!validateFileSize(data.fileSizeBytes)) {
    throw new ValidationError(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`);
  }

  return database.withTenantTransaction(async (client) => {
    await requireEditableProposal(client, agencyId, proposalId);

    if (data.isCover) {
      await client.query(
        `UPDATE proposal_media SET is_cover = false WHERE agency_id = $1 AND proposal_id = $2 AND deleted_at IS NULL`,
        [agencyId, proposalId],
      );
    }

    const next = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM proposal_media
       WHERE agency_id = $1 AND proposal_id = $2 AND deleted_at IS NULL`,
      [agencyId, proposalId],
    );
    const sortOrder = next.rows[0]?.next ?? 0;

    const result = await client.query<ProposalMediaRow>(
      `INSERT INTO proposal_media
         (agency_id, proposal_id, secure_file_key, file_name, file_mime_type, file_size_bytes,
          caption, is_cover, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${MEDIA_COLUMNS}`,
      [
        agencyId,
        proposalId,
        data.secureFileKey,
        data.fileName,
        data.fileMimeType,
        data.fileSizeBytes,
        data.caption ?? null,
        data.isCover ?? false,
        sortOrder,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('ProposalMedia insert did not return a row');
    return toMedia(row);
  });
}

export async function listProposalMedia(
  database: DatabaseRuntime,
  proposalId: string,
): Promise<ProposalMedia[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalMediaRow>(
      `SELECT ${MEDIA_COLUMNS} FROM proposal_media
       WHERE agency_id = $1 AND proposal_id = $2 AND deleted_at IS NULL
       ORDER BY is_cover DESC, sort_order ASC, created_at ASC`,
      [agencyId, proposalId],
    );
    return result.rows.map(toMedia);
  });
}

export async function getProposalMediaById(
  database: DatabaseRuntime,
  id: string,
): Promise<ProposalMedia | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalMediaRow>(
      `SELECT ${MEDIA_COLUMNS} FROM proposal_media WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toMedia(row) : null;
  });
}

export async function deleteProposalMedia(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const owner = await client.query<{ proposal_id: string }>(
      `SELECT proposal_id FROM proposal_media WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    const proposalId = owner.rows[0]?.proposal_id;
    if (proposalId === undefined) return false;
    await requireEditableProposal(client, agencyId, proposalId);

    const result = await client.query(
      `UPDATE proposal_media SET deleted_at = now() WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

function toMedia(row: ProposalMediaRow): ProposalMedia {
  return {
    id: row.id,
    agencyId: row.agency_id,
    proposalId: row.proposal_id,
    secureFileKey: row.secure_file_key,
    fileName: row.file_name,
    fileMimeType: row.file_mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    isCover: row.is_cover,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    ...(row.caption !== null ? { caption: row.caption } : {}),
  };
}

// ============================================================
// Duplicate Proposal (Fase 13) -- clones the base proposal plus its
// sections/items/media, with new ids, tenant preserved, always starting
// as DRAFT (never copies status/publishedAt), and never copies
// tracking (engagements are never touched here). Media rows point at
// the SAME secure_file_key as the original -- no re-upload needed,
// consistent with trip_photos' soft-delete (deleting one copy's media
// row never touches the underlying stored bytes).
// ============================================================

export async function duplicateProposal(database: DatabaseRuntime, id: string): Promise<Proposal> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const source = await client.query<{
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
      title: string | null;
      subtitle: string | null;
      destination_summary: string | null;
      travel_period: string | null;
      traveler_summary: string | null;
      intro_text: string | null;
    }>(
      `SELECT customer_id, offer_id, wish_id, user_id, proposed_price, discount, total, valid_until,
              conditions, notes, title, subtitle, destination_summary, travel_period,
              traveler_summary, intro_text
       FROM proposals WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const src = source.rows[0];
    if (!src) throw new NotFoundError('Proposal not found');

    const created = await client.query<{ id: string }>(
      `INSERT INTO proposals (agency_id, customer_id, offer_id, wish_id, proposed_price, discount,
                               total, valid_until, conditions, notes, title, subtitle,
                               destination_summary, travel_period, traveler_summary, intro_text, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'DRAFT')
       RETURNING id`,
      [
        agencyId,
        src.customer_id,
        src.offer_id,
        src.wish_id,
        src.proposed_price,
        src.discount,
        src.total,
        src.valid_until,
        src.conditions,
        src.notes,
        src.title,
        src.subtitle,
        src.destination_summary,
        src.travel_period,
        src.traveler_summary,
        src.intro_text,
      ],
    );
    const newProposalId = created.rows[0]!.id;

    const sections = await client.query<{ id: string; type: string; title: string; description: string | null; sort_order: number; is_visible_to_customer: boolean }>(
      `SELECT id, type, title, description, sort_order, is_visible_to_customer
       FROM proposal_sections WHERE agency_id = $1 AND proposal_id = $2`,
      [agencyId, id],
    );

    for (const section of sections.rows) {
      const newSection = await client.query<{ id: string }>(
        `INSERT INTO proposal_sections
           (agency_id, proposal_id, type, title, description, sort_order, is_visible_to_customer)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [agencyId, newProposalId, section.type, section.title, section.description, section.sort_order, section.is_visible_to_customer],
      );
      const newSectionId = newSection.rows[0]!.id;

      const items = await client.query<{
        type: string;
        title: string | null;
        description: string | null;
        sort_order: number;
        day_number: number | null;
        location_name: string | null;
        price: string | null;
        reference_type: string | null;
        reference_id: string | null;
      }>(
        `SELECT type, title, description, sort_order, day_number, location_name, price,
                reference_type, reference_id
         FROM proposal_items WHERE agency_id = $1 AND proposal_section_id = $2`,
        [agencyId, section.id],
      );
      for (const item of items.rows) {
        await client.query(
          `INSERT INTO proposal_items
             (agency_id, proposal_section_id, type, title, description, sort_order, day_number,
              location_name, price, reference_type, reference_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            agencyId,
            newSectionId,
            item.type,
            item.title,
            item.description,
            item.sort_order,
            item.day_number,
            item.location_name,
            item.price,
            item.reference_type,
            item.reference_id,
          ],
        );
      }
    }

    const media = await client.query<{
      secure_file_key: string;
      file_name: string;
      file_mime_type: string;
      file_size_bytes: string;
      caption: string | null;
      is_cover: boolean;
      sort_order: number;
    }>(
      `SELECT secure_file_key, file_name, file_mime_type, file_size_bytes, caption, is_cover, sort_order
       FROM proposal_media WHERE agency_id = $1 AND proposal_id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    for (const item of media.rows) {
      await client.query(
        `INSERT INTO proposal_media
           (agency_id, proposal_id, secure_file_key, file_name, file_mime_type, file_size_bytes,
            caption, is_cover, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          agencyId,
          newProposalId,
          item.secure_file_key,
          item.file_name,
          item.file_mime_type,
          item.file_size_bytes,
          item.caption,
          item.is_cover,
          item.sort_order,
        ],
      );
    }

    const finalResult = await client.query(
      `SELECT id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price, discount,
              total, valid_until, conditions, notes, status, title, subtitle, destination_summary,
              travel_period, traveler_summary, intro_text, published_at, created_at, updated_at
       FROM proposals WHERE agency_id = $1 AND id = $2`,
      [agencyId, newProposalId],
    );
    const finalRow = finalResult.rows[0];
    if (!finalRow) throw new Error('Duplicated proposal was not found after insert');
    return mapDuplicatedProposal(finalRow);
  });
}

// Local mapper mirroring proposals.ts's toProposal (kept private to this
// file to avoid exporting an internal row shape from proposals.ts just
// for this one call site).
function mapDuplicatedProposal(row: Record<string, unknown>): Proposal {
  return {
    id: row.id as string,
    agencyId: row.agency_id as string,
    customerId: row.customer_id as string,
    proposedPrice: Number(row.proposed_price),
    discount: Number(row.discount),
    total: Number(row.total),
    status: row.status as Proposal['status'],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    ...(row.offer_id !== null ? { offerId: row.offer_id as string } : {}),
    ...(row.wish_id !== null ? { wishId: row.wish_id as string } : {}),
    ...(row.user_id !== null ? { userId: row.user_id as string } : {}),
    ...(row.valid_until !== null ? { validUntil: new Date(row.valid_until as string) } : {}),
    ...(row.conditions !== null ? { conditions: row.conditions as string } : {}),
    ...(row.notes !== null ? { notes: row.notes as string } : {}),
    ...(row.title !== null ? { title: row.title as string } : {}),
    ...(row.subtitle !== null ? { subtitle: row.subtitle as string } : {}),
    ...(row.destination_summary !== null ? { destinationSummary: row.destination_summary as string } : {}),
    ...(row.travel_period !== null ? { travelPeriod: row.travel_period as string } : {}),
    ...(row.traveler_summary !== null ? { travelerSummary: row.traveler_summary as string } : {}),
    ...(row.intro_text !== null ? { introText: row.intro_text as string } : {}),
    ...(row.published_at !== null ? { publishedAt: new Date(row.published_at as string) } : {}),
  };
}

// ============================================================
// Request-body parsing (allowlist pattern, same convention as
// commercial-input-parsing.ts) -- kept here rather than growing that
// already-large shared file, since these parsers are proposal-content
// specific.
// ============================================================

function isRecord(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body);
}

function requireAllowedFields(record: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
}

const SECTION_CREATE_FIELDS = ['type', 'title', 'description', 'sortOrder', 'isVisibleToCustomer'] as const;
const SECTION_UPDATE_FIELDS = ['title', 'description', 'sortOrder', 'isVisibleToCustomer'] as const;

export function parseCreateProposalSectionInput(body: unknown): CreateProposalSectionInput {
  if (!isRecord(body)) throw new ValidationError('Request body must be an object');
  requireAllowedFields(body, SECTION_CREATE_FIELDS);

  if (typeof body.type !== 'string' || !Object.values(ProposalSectionType).includes(body.type as ProposalSectionType)) {
    throw new ValidationError('Field "type" must be a valid ProposalSectionType');
  }
  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    throw new ValidationError('Field "title" is required and must be a non-empty string');
  }

  const data: CreateProposalSectionInput = { type: body.type as ProposalSectionType, title: body.title };
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') throw new ValidationError('Field "description" must be a string');
    data.description = body.description;
  }
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder)) {
      throw new ValidationError('Field "sortOrder" must be an integer');
    }
    data.sortOrder = body.sortOrder;
  }
  if (body.isVisibleToCustomer !== undefined) {
    if (typeof body.isVisibleToCustomer !== 'boolean') {
      throw new ValidationError('Field "isVisibleToCustomer" must be a boolean');
    }
    data.isVisibleToCustomer = body.isVisibleToCustomer;
  }
  return data;
}

export function parseUpdateProposalSectionInput(body: unknown): UpdateProposalSectionInput {
  if (!isRecord(body)) throw new ValidationError('Request body must be an object');
  requireAllowedFields(body, SECTION_UPDATE_FIELDS);

  const data: UpdateProposalSectionInput = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      throw new ValidationError('Field "title" must be a non-empty string');
    }
    data.title = body.title;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') throw new ValidationError('Field "description" must be a string');
    data.description = body.description;
  }
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder)) {
      throw new ValidationError('Field "sortOrder" must be an integer');
    }
    data.sortOrder = body.sortOrder;
  }
  if (body.isVisibleToCustomer !== undefined) {
    if (typeof body.isVisibleToCustomer !== 'boolean') {
      throw new ValidationError('Field "isVisibleToCustomer" must be a boolean');
    }
    data.isVisibleToCustomer = body.isVisibleToCustomer;
  }
  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }
  return data;
}

const ITEM_CREATE_FIELDS = [
  'type', 'title', 'description', 'sortOrder', 'dayNumber', 'locationName', 'price',
  'referenceType', 'referenceId',
] as const;
const ITEM_UPDATE_FIELDS = [
  'title', 'description', 'sortOrder', 'dayNumber', 'locationName', 'price',
] as const;

function parseOptionalString(body: Record<string, unknown>, field: string, data: Record<string, unknown>): void {
  if (body[field] === undefined) return;
  if (typeof body[field] !== 'string') throw new ValidationError(`Field "${field}" must be a string`);
  data[field] = body[field];
}

export function parseCreateProposalItemInput(body: unknown): CreateProposalItemInput {
  if (!isRecord(body)) throw new ValidationError('Request body must be an object');
  requireAllowedFields(body, ITEM_CREATE_FIELDS);

  if (typeof body.type !== 'string' || !Object.values(ProposalItemType).includes(body.type as ProposalItemType)) {
    throw new ValidationError('Field "type" must be a valid ProposalItemType');
  }
  const data: Record<string, unknown> = { type: body.type };
  parseOptionalString(body, 'title', data);
  parseOptionalString(body, 'description', data);
  parseOptionalString(body, 'locationName', data);
  parseOptionalString(body, 'referenceType', data);
  parseOptionalString(body, 'referenceId', data);
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder)) {
      throw new ValidationError('Field "sortOrder" must be an integer');
    }
    data.sortOrder = body.sortOrder;
  }
  if (body.dayNumber !== undefined) {
    if (typeof body.dayNumber !== 'number' || !Number.isInteger(body.dayNumber) || body.dayNumber <= 0) {
      throw new ValidationError('Field "dayNumber" must be a positive integer');
    }
    data.dayNumber = body.dayNumber;
  }
  if (body.price !== undefined) {
    if (typeof body.price !== 'number' || Number.isNaN(body.price) || body.price < 0) {
      throw new ValidationError('Field "price" must be a non-negative number');
    }
    data.price = body.price;
  }
  return data as unknown as CreateProposalItemInput;
}

export function parseUpdateProposalItemInput(body: unknown): UpdateProposalItemInput {
  if (!isRecord(body)) throw new ValidationError('Request body must be an object');
  requireAllowedFields(body, ITEM_UPDATE_FIELDS);

  const data: Record<string, unknown> = {};
  parseOptionalString(body, 'title', data);
  parseOptionalString(body, 'description', data);
  parseOptionalString(body, 'locationName', data);
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder)) {
      throw new ValidationError('Field "sortOrder" must be an integer');
    }
    data.sortOrder = body.sortOrder;
  }
  if (body.dayNumber !== undefined) {
    if (typeof body.dayNumber !== 'number' || !Number.isInteger(body.dayNumber) || body.dayNumber <= 0) {
      throw new ValidationError('Field "dayNumber" must be a positive integer');
    }
    data.dayNumber = body.dayNumber;
  }
  if (body.price !== undefined) {
    if (typeof body.price !== 'number' || Number.isNaN(body.price) || body.price < 0) {
      throw new ValidationError('Field "price" must be a non-negative number');
    }
    data.price = body.price;
  }
  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }
  return data;
}
