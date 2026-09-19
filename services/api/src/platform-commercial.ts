/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
// Platform Admin Comercial & Parcerias (META PÓS-PILOTO 01).
//
// Landing CMS, banners, platform-level Partners, Referrals, partner
// Benefits and Commissions, and a Referral Credit ledger -- all owned by
// the Travel Plataforma itself (Platform Admin), never by a
// tenant/agency. Deliberately separate from the tenant-scoped
// `commercial_partners` / `partner_commissions` family in
// commercial-partners.ts (an agency's own affiliate program) -- see
// infrastructure/migrations/078_platform_commercial_partnerships.sql for
// the full rationale.
//
// All queries run via database.withPlatformTransaction (no tenant RLS
// context), matching every other platform-global table in
// platform-services.ts.
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ValidationError } from './errors';

function withPlatform<T>(
  database: DatabaseRuntime,
  operation: (client: TenantTransactionClient) => Promise<T>
): Promise<T> {
  return database.withPlatformTransaction(operation);
}

function iso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// ============================================================
// URL / content validation (spec section 14 -- security)
// ============================================================

const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:']);

// Rejects open-redirect-shaped values (protocol-relative "//evil.com",
// javascript:, data:, bare relative paths that aren't site-internal) --
// only accepts a real absolute http(s) URL or a site-internal path that
// starts with exactly one leading slash.
export function assertSafeExternalUrl(value: string, fieldName: string): void {
  const trimmed = value.trim();
  if (trimmed.startsWith('//')) {
    throw new ValidationError(`${fieldName}: protocol-relative URLs are not allowed`);
  }
  if (trimmed.startsWith('/')) {
    return; // site-internal path, safe
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError(`${fieldName}: must be a valid absolute URL or an internal path`);
  }
  if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
    throw new ValidationError(`${fieldName}: only http(s) URLs are allowed`);
  }
}

// Strips any HTML tags entirely -- CMS/banner/partner text fields are
// plain text or Markdown-safe text only, never arbitrary HTML/script
// (spec: "Não permitir HTML arbitrário inseguro" / "Não permitir
// script/HTML arbitrário").
export function sanitizePlainText(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function sanitizeOptional(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return sanitizePlainText(value);
}

// ============================================================
// AUDIT (reuses the existing generic platform_audit_logs table --
// no new audit table for this feature set)
// ============================================================

export interface AuditActor {
  actorId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
}

// platform_audit_logs.action is a coarse, fixed Postgres enum
// (audit_action_type: CREATED/UPDATED/DELETED/PUBLISHED/...) shared by
// every platform domain -- it is not free text. `eventName` (this
// feature's own fine-grained action, e.g. "landing.section.created")
// is preserved losslessly in `metadata.event` instead, alongside the
// coarse action, so nothing about "what actually happened" is lost.
export type CommercialAuditAction = 'CREATED' | 'UPDATED' | 'DELETED' | 'PUBLISHED';

export async function recordCommercialAudit(
  database: DatabaseRuntime,
  actor: AuditActor,
  action: CommercialAuditAction,
  resourceType: string,
  resourceId: string,
  eventName: string,
  changes?: Record<string, unknown>,
  reason?: string
): Promise<void> {
  await withPlatform(database, async (client) => {
    await client.query(
      `INSERT INTO platform_audit_logs
        (actor_id, actor_email, actor_role, action, resource_type, resource_id, changes, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        actor.actorId,
        actor.actorEmail ?? null,
        actor.actorRole ?? null,
        action,
        resourceType,
        resourceId,
        changes ? JSON.stringify(changes) : null,
        reason ?? null,
        JSON.stringify({ event: eventName }),
      ]
    );
  });
}

// ============================================================
// 1. LANDING CMS
// ============================================================

const LANDING_SLUG = 'main';

export async function getOrCreateLandingDraft(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const existing = await client.query(
      `SELECT * FROM platform_landing_page WHERE slug = $1`,
      [LANDING_SLUG]
    );
    if (existing.rows[0]) return mapLandingPage(existing.rows[0]);

    const created = await client.query(
      `INSERT INTO platform_landing_page (slug) VALUES ($1) RETURNING *`,
      [LANDING_SLUG]
    );
    return mapLandingPage(created.rows[0]);
  });
}

interface LandingPageUpdateInput {
  heroTitle?: string;
  heroSubtitle?: string;
  heroImageUrl?: string;
  ctaPrimaryLabel?: string;
  ctaPrimaryUrl?: string;
  ctaSecondaryLabel?: string;
  ctaSecondaryUrl?: string;
  footerContent?: string;
  seoTitle?: string;
  seoDescription?: string;
  ogImageUrl?: string;
}

export async function updateLandingDraft(
  database: DatabaseRuntime,
  id: string,
  input: LandingPageUpdateInput,
  updatedBy: string
) {
  if (input.ctaPrimaryUrl) assertSafeExternalUrl(input.ctaPrimaryUrl, 'ctaPrimaryUrl');
  if (input.ctaSecondaryUrl) assertSafeExternalUrl(input.ctaSecondaryUrl, 'ctaSecondaryUrl');
  if (input.heroImageUrl) assertSafeExternalUrl(input.heroImageUrl, 'heroImageUrl');
  if (input.ogImageUrl) assertSafeExternalUrl(input.ogImageUrl, 'ogImageUrl');

  return withPlatform(database, async (client) => {
    const result = await client.query(
      `UPDATE platform_landing_page SET
        hero_title = COALESCE($2, hero_title),
        hero_subtitle = COALESCE($3, hero_subtitle),
        hero_image_url = COALESCE($4, hero_image_url),
        cta_primary_label = COALESCE($5, cta_primary_label),
        cta_primary_url = COALESCE($6, cta_primary_url),
        cta_secondary_label = COALESCE($7, cta_secondary_label),
        cta_secondary_url = COALESCE($8, cta_secondary_url),
        footer_content = COALESCE($9, footer_content),
        seo_title = COALESCE($10, seo_title),
        seo_description = COALESCE($11, seo_description),
        og_image_url = COALESCE($12, og_image_url),
        updated_by = $13,
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        sanitizeOptional(input.heroTitle),
        sanitizeOptional(input.heroSubtitle),
        input.heroImageUrl ?? null,
        sanitizeOptional(input.ctaPrimaryLabel),
        input.ctaPrimaryUrl ?? null,
        sanitizeOptional(input.ctaSecondaryLabel),
        input.ctaSecondaryUrl ?? null,
        sanitizeOptional(input.footerContent),
        sanitizeOptional(input.seoTitle),
        sanitizeOptional(input.seoDescription),
        input.ogImageUrl ?? null,
        updatedBy,
      ]
    );
    if (!result.rows[0]) throw new ValidationError('Landing page not found');
    return mapLandingPage(result.rows[0]);
  });
}

export async function listLandingSections(database: DatabaseRuntime, pageId: string) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `SELECT * FROM platform_landing_sections WHERE page_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [pageId]
    );
    return result.rows.map(mapLandingSection);
  });
}

interface LandingSectionInput {
  type: string;
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
  sortOrder?: number;
}

const VALID_SECTION_TYPES = new Set([
  'HERO', 'FEATURES', 'WORKFLOW', 'CUSTOMER_PORTAL', 'SECURITY',
  'PARTNERS', 'TESTIMONIALS', 'FAQ', 'CTA',
]);

export async function createLandingSection(
  database: DatabaseRuntime,
  pageId: string,
  input: LandingSectionInput
) {
  if (!VALID_SECTION_TYPES.has(input.type)) {
    throw new ValidationError(`Invalid section type: ${input.type}`);
  }
  if (input.imageUrl) assertSafeExternalUrl(input.imageUrl, 'imageUrl');

  return withPlatform(database, async (client) => {
    const result = await client.query(
      `INSERT INTO platform_landing_sections
        (page_id, type, enabled, title, subtitle, content, image_url, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        pageId,
        input.type,
        input.enabled ?? true,
        sanitizeOptional(input.title),
        sanitizeOptional(input.subtitle),
        sanitizeOptional(input.content),
        input.imageUrl ?? null,
        input.sortOrder ?? 0,
      ]
    );
    return mapLandingSection(result.rows[0]);
  });
}

export async function updateLandingSection(
  database: DatabaseRuntime,
  id: string,
  input: Partial<LandingSectionInput>
) {
  if (input.type && !VALID_SECTION_TYPES.has(input.type)) {
    throw new ValidationError(`Invalid section type: ${input.type}`);
  }
  if (input.imageUrl) assertSafeExternalUrl(input.imageUrl, 'imageUrl');

  return withPlatform(database, async (client) => {
    const result = await client.query(
      `UPDATE platform_landing_sections SET
        type = COALESCE($2, type),
        enabled = COALESCE($3, enabled),
        title = COALESCE($4, title),
        subtitle = COALESCE($5, subtitle),
        content = COALESCE($6, content),
        image_url = COALESCE($7, image_url),
        sort_order = COALESCE($8, sort_order),
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.type ?? null,
        input.enabled ?? null,
        input.title !== undefined ? sanitizeOptional(input.title) : null,
        input.subtitle !== undefined ? sanitizeOptional(input.subtitle) : null,
        input.content !== undefined ? sanitizeOptional(input.content) : null,
        input.imageUrl ?? null,
        input.sortOrder ?? null,
      ]
    );
    if (!result.rows[0]) throw new ValidationError('Landing section not found');
    return mapLandingSection(result.rows[0]);
  });
}

export async function deleteLandingSection(database: DatabaseRuntime, id: string): Promise<void> {
  await withPlatform(database, async (client) => {
    await client.query(`DELETE FROM platform_landing_sections WHERE id = $1`, [id]);
  });
}

// Publishes: snapshots the current draft page + its enabled sections into
// an immutable JSONB row. This is the ONLY write the public landing
// endpoint ever reads from -- editing the draft tables never changes
// what the public site shows until this runs again.
export async function publishLanding(
  database: DatabaseRuntime,
  pageId: string,
  publishedBy: string
) {
  return withPlatform(database, async (client) => {
    const pageResult = await client.query(`SELECT * FROM platform_landing_page WHERE id = $1`, [
      pageId,
    ]);
    const page = pageResult.rows[0];
    if (!page) throw new ValidationError('Landing page not found');

    const sectionsResult = await client.query(
      `SELECT * FROM platform_landing_sections WHERE page_id = $1 AND enabled = true ORDER BY sort_order ASC`,
      [pageId]
    );

    const snapshot = {
      page: mapLandingPage(page),
      sections: sectionsResult.rows.map(mapLandingSection),
    };

    const publication = await client.query(
      `INSERT INTO platform_landing_publications (page_id, snapshot, published_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [pageId, JSON.stringify(snapshot), publishedBy]
    );

    await client.query(
      `UPDATE platform_landing_page SET status = 'PUBLISHED', last_published_at = now(), updated_at = now()
       WHERE id = $1`,
      [pageId]
    );

    const publicationRow = publication.rows[0];
    if (!publicationRow) throw new ValidationError('Failed to record publication');
    return {
      id: publicationRow.id,
      pageId,
      publishedAt: iso(publicationRow.published_at),
      snapshot,
    };
  });
}

// Public read: the ONLY function the public landing route may call.
// Never touches draft tables, never exposes DRAFT content.
export async function getPublishedLanding(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `SELECT lp.snapshot, lp.published_at
       FROM platform_landing_publications lp
       JOIN platform_landing_page p ON p.id = lp.page_id
       WHERE p.slug = $1
       ORDER BY lp.published_at DESC
       LIMIT 1`,
      [LANDING_SLUG]
    );
    if (!result.rows[0]) return null;
    return {
      publishedAt: iso(result.rows[0].published_at),
      ...result.rows[0].snapshot,
    };
  });
}

export async function listLandingPublications(database: DatabaseRuntime, pageId: string) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `SELECT id, published_at, published_by FROM platform_landing_publications
       WHERE page_id = $1 ORDER BY published_at DESC LIMIT 20`,
      [pageId]
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      publishedAt: iso(row.published_at),
      publishedBy: row.published_by,
    }));
  });
}

function mapLandingPage(row: any) {
  return {
    id: row.id,
    slug: row.slug,
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    heroImageUrl: row.hero_image_url,
    ctaPrimaryLabel: row.cta_primary_label,
    ctaPrimaryUrl: row.cta_primary_url,
    ctaSecondaryLabel: row.cta_secondary_label,
    ctaSecondaryUrl: row.cta_secondary_url,
    footerContent: row.footer_content,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    ogImageUrl: row.og_image_url,
    status: row.status,
    lastPublishedAt: iso(row.last_published_at),
    updatedBy: row.updated_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapLandingSection(row: any) {
  return {
    id: row.id,
    pageId: row.page_id,
    type: row.type,
    enabled: row.enabled,
    title: row.title,
    subtitle: row.subtitle,
    content: row.content,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ============================================================
// 2. BANNERS / CAMPANHAS
// ============================================================

interface BannerInput {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  placement: string;
  startsAt?: string;
  endsAt?: string;
  status?: string;
  sortOrder?: number;
}

const VALID_PLACEMENTS = new Set(['LANDING', 'PLATFORM_ADMIN']);
const VALID_BANNER_STATUSES = new Set(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED']);

function validateBannerInput(input: Partial<BannerInput>): void {
  if (input.placement && !VALID_PLACEMENTS.has(input.placement)) {
    throw new ValidationError(`Invalid placement: ${input.placement}`);
  }
  if (input.status && !VALID_BANNER_STATUSES.has(input.status)) {
    throw new ValidationError(`Invalid status: ${input.status}`);
  }
  if (input.ctaUrl) assertSafeExternalUrl(input.ctaUrl, 'ctaUrl');
  if (input.imageUrl) assertSafeExternalUrl(input.imageUrl, 'imageUrl');
  if (input.startsAt && input.endsAt && new Date(input.startsAt) > new Date(input.endsAt)) {
    throw new ValidationError('startsAt must be before endsAt');
  }
}

export async function listBanners(database: DatabaseRuntime, placement?: string) {
  return withPlatform(database, async (client) => {
    const result = placement
      ? await client.query(
          `SELECT * FROM platform_banners WHERE placement = $1 ORDER BY sort_order ASC, created_at DESC`,
          [placement]
        )
      : await client.query(`SELECT * FROM platform_banners ORDER BY sort_order ASC, created_at DESC`);
    return result.rows.map(mapBanner);
  });
}

// Public read: only ACTIVE banners currently within their scheduling
// window, for a given placement.
export async function listActiveBannersForPlacement(database: DatabaseRuntime, placement: string) {
  if (!VALID_PLACEMENTS.has(placement)) throw new ValidationError(`Invalid placement: ${placement}`);
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `SELECT * FROM platform_banners
       WHERE placement = $1 AND status = 'ACTIVE'
         AND (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at >= now())
       ORDER BY sort_order ASC`,
      [placement]
    );
    return result.rows.map(mapBanner);
  });
}

export async function createBanner(database: DatabaseRuntime, input: BannerInput, createdBy: string) {
  validateBannerInput(input);
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `INSERT INTO platform_banners
        (title, subtitle, image_url, cta_label, cta_url, placement, starts_at, ends_at, status, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        sanitizePlainText(input.title),
        sanitizeOptional(input.subtitle),
        input.imageUrl ?? null,
        sanitizeOptional(input.ctaLabel),
        input.ctaUrl ?? null,
        input.placement,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.status ?? 'DRAFT',
        input.sortOrder ?? 0,
        createdBy,
      ]
    );
    return mapBanner(result.rows[0]);
  });
}

export async function updateBanner(
  database: DatabaseRuntime,
  id: string,
  input: Partial<BannerInput>
) {
  validateBannerInput(input);
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `UPDATE platform_banners SET
        title = COALESCE($2, title),
        subtitle = COALESCE($3, subtitle),
        image_url = COALESCE($4, image_url),
        cta_label = COALESCE($5, cta_label),
        cta_url = COALESCE($6, cta_url),
        placement = COALESCE($7, placement),
        starts_at = COALESCE($8, starts_at),
        ends_at = COALESCE($9, ends_at),
        status = COALESCE($10, status),
        sort_order = COALESCE($11, sort_order),
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.title !== undefined ? sanitizePlainText(input.title) : null,
        input.subtitle !== undefined ? sanitizeOptional(input.subtitle) : null,
        input.imageUrl ?? null,
        input.ctaLabel !== undefined ? sanitizeOptional(input.ctaLabel) : null,
        input.ctaUrl ?? null,
        input.placement ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.status ?? null,
        input.sortOrder ?? null,
      ]
    );
    if (!result.rows[0]) throw new ValidationError('Banner not found');
    return mapBanner(result.rows[0]);
  });
}

export async function deleteBanner(database: DatabaseRuntime, id: string): Promise<void> {
  await withPlatform(database, async (client) => {
    await client.query(`DELETE FROM platform_banners WHERE id = $1`, [id]);
  });
}

function mapBanner(row: any) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    placement: row.placement,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ============================================================
// 3. PARTNERS
// ============================================================

interface PartnerInput {
  name: string;
  slug: string;
  logoUrl?: string;
  category: string;
  description?: string;
  websiteUrl?: string;
  contactName?: string;
  contactEmail?: string;
  status?: string;
  featured?: boolean;
  isPublic?: boolean;
  startsAt?: string;
  endsAt?: string;
  internalNotes?: string;
}

const VALID_PARTNER_CATEGORIES = new Set([
  'TECHNOLOGY', 'PAYMENTS', 'INSURANCE', 'TRAVEL_SERVICES', 'EDUCATION', 'MARKETING', 'OTHER',
]);
const VALID_PARTNER_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'PENDING']);

function validatePartnerInput(input: Partial<PartnerInput>): void {
  if (input.category && !VALID_PARTNER_CATEGORIES.has(input.category)) {
    throw new ValidationError(`Invalid category: ${input.category}`);
  }
  if (input.status && !VALID_PARTNER_STATUSES.has(input.status)) {
    throw new ValidationError(`Invalid status: ${input.status}`);
  }
  if (input.websiteUrl) assertSafeExternalUrl(input.websiteUrl, 'websiteUrl');
  if (input.logoUrl) assertSafeExternalUrl(input.logoUrl, 'logoUrl');
}

export async function listPartners(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(`SELECT * FROM platform_partners ORDER BY name ASC`);
    return result.rows.map(mapPartnerAdmin);
  });
}

export async function getPartnerById(database: DatabaseRuntime, id: string) {
  return withPlatform(database, async (client) => {
    const result = await client.query(`SELECT * FROM platform_partners WHERE id = $1`, [id]);
    return result.rows[0] ? mapPartnerAdmin(result.rows[0]) : null;
  });
}

// Public read: ONLY partners marked is_public. NEVER selects
// internal_notes, contact_name, contact_email (spec section 5).
export async function listPublicPartners(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `SELECT id, name, slug, logo_url, category, description, website_url, featured
       FROM platform_partners
       WHERE is_public = true AND status = 'ACTIVE'
         AND (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at >= now())
       ORDER BY featured DESC, name ASC`
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logo_url,
      category: row.category,
      description: row.description,
      websiteUrl: row.website_url,
      featured: row.featured,
    }));
  });
}

export async function createPartner(database: DatabaseRuntime, input: PartnerInput, createdBy: string) {
  validatePartnerInput(input);
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `INSERT INTO platform_partners
        (name, slug, logo_url, category, description, website_url, contact_name, contact_email,
         status, featured, is_public, starts_at, ends_at, internal_notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        sanitizePlainText(input.name),
        input.slug,
        input.logoUrl ?? null,
        input.category,
        sanitizeOptional(input.description),
        input.websiteUrl ?? null,
        sanitizeOptional(input.contactName),
        input.contactEmail ?? null,
        input.status ?? 'PENDING',
        input.featured ?? false,
        input.isPublic ?? false,
        input.startsAt ?? null,
        input.endsAt ?? null,
        sanitizeOptional(input.internalNotes),
        createdBy,
      ]
    );
    return mapPartnerAdmin(result.rows[0]);
  });
}

export async function updatePartner(
  database: DatabaseRuntime,
  id: string,
  input: Partial<PartnerInput>
) {
  validatePartnerInput(input);
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `UPDATE platform_partners SET
        name = COALESCE($2, name),
        slug = COALESCE($3, slug),
        logo_url = COALESCE($4, logo_url),
        category = COALESCE($5, category),
        description = COALESCE($6, description),
        website_url = COALESCE($7, website_url),
        contact_name = COALESCE($8, contact_name),
        contact_email = COALESCE($9, contact_email),
        status = COALESCE($10, status),
        featured = COALESCE($11, featured),
        is_public = COALESCE($12, is_public),
        starts_at = COALESCE($13, starts_at),
        ends_at = COALESCE($14, ends_at),
        internal_notes = COALESCE($15, internal_notes),
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.name !== undefined ? sanitizePlainText(input.name) : null,
        input.slug ?? null,
        input.logoUrl ?? null,
        input.category ?? null,
        input.description !== undefined ? sanitizeOptional(input.description) : null,
        input.websiteUrl ?? null,
        input.contactName !== undefined ? sanitizeOptional(input.contactName) : null,
        input.contactEmail ?? null,
        input.status ?? null,
        input.featured ?? null,
        input.isPublic ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.internalNotes !== undefined ? sanitizeOptional(input.internalNotes) : null,
      ]
    );
    if (!result.rows[0]) throw new ValidationError('Partner not found');
    return mapPartnerAdmin(result.rows[0]);
  });
}

function mapPartnerAdmin(row: any) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    category: row.category,
    description: row.description,
    websiteUrl: row.website_url,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    status: row.status,
    featured: row.featured,
    isPublic: row.is_public,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    internalNotes: row.internal_notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ============================================================
// 4. REFERRALS
// ============================================================

interface ReferralInput {
  referrerType: string;
  referrerId?: string;
  referredAgencyName: string;
  referredContact?: string;
  status?: string;
  notes?: string;
}

const VALID_REFERRER_TYPES = new Set(['PARTNER', 'AGENCY', 'MANUAL', 'CAMPAIGN']);
const VALID_REFERRAL_STATUSES = new Set(['LEAD', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'REJECTED']);

export async function listReferrals(database: DatabaseRuntime) {
  return withPlatform(database, async (client) => {
    const result = await client.query(`SELECT * FROM platform_referrals ORDER BY created_at DESC`);
    return result.rows.map(mapReferral);
  });
}

export async function getReferralById(database: DatabaseRuntime, id: string) {
  return withPlatform(database, async (client) => {
    const result = await client.query(`SELECT * FROM platform_referrals WHERE id = $1`, [id]);
    return result.rows[0] ? mapReferral(result.rows[0]) : null;
  });
}

export async function createReferral(database: DatabaseRuntime, input: ReferralInput) {
  if (!VALID_REFERRER_TYPES.has(input.referrerType)) {
    throw new ValidationError(`Invalid referrerType: ${input.referrerType}`);
  }
  if (input.status && !VALID_REFERRAL_STATUSES.has(input.status)) {
    throw new ValidationError(`Invalid status: ${input.status}`);
  }
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `INSERT INTO platform_referrals
        (referrer_type, referrer_id, referred_agency_name, referred_contact, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.referrerType,
        input.referrerId ?? null,
        sanitizePlainText(input.referredAgencyName),
        sanitizeOptional(input.referredContact),
        input.status ?? 'LEAD',
        sanitizeOptional(input.notes),
      ]
    );
    return mapReferral(result.rows[0]);
  });
}

export async function updateReferralStatus(
  database: DatabaseRuntime,
  id: string,
  status: string,
  notes?: string
) {
  if (!VALID_REFERRAL_STATUSES.has(status)) {
    throw new ValidationError(`Invalid status: ${status}`);
  }
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `UPDATE platform_referrals SET
        status = $2::platform_referral_status,
        notes = COALESCE($3, notes),
        converted_at = CASE WHEN $2::text = 'CONVERTED' THEN now() ELSE converted_at END,
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, status, notes !== undefined ? sanitizeOptional(notes) : null]
    );
    if (!result.rows[0]) throw new ValidationError('Referral not found');
    return mapReferral(result.rows[0]);
  });
}

function mapReferral(row: any) {
  return {
    id: row.id,
    referrerType: row.referrer_type,
    referrerId: row.referrer_id,
    referredAgencyName: row.referred_agency_name,
    referredContact: row.referred_contact,
    status: row.status,
    notes: row.notes,
    createdAt: iso(row.created_at),
    convertedAt: iso(row.converted_at),
    updatedAt: iso(row.updated_at),
  };
}

// ============================================================
// 5. BENEFÍCIOS / COMISSIONAMENTO (rule)
// ============================================================

interface PartnerBenefitInput {
  partnerId?: string;
  referralId?: string;
  benefitType: string;
  value: number;
  currency?: string;
  validFrom?: string;
  validUntil?: string;
  status?: string;
}

const VALID_BENEFIT_TYPES = new Set([
  'FIXED_COMMISSION', 'PERCENTAGE_COMMISSION', 'MONTHLY_CREDIT', 'PERCENTAGE_CREDIT', 'MANUAL_BENEFIT',
]);
const VALID_BENEFIT_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'EXPIRED']);

export async function listPartnerBenefits(database: DatabaseRuntime, partnerId?: string) {
  return withPlatform(database, async (client) => {
    const result = partnerId
      ? await client.query(
          `SELECT * FROM platform_partner_benefits WHERE partner_id = $1 ORDER BY created_at DESC`,
          [partnerId]
        )
      : await client.query(`SELECT * FROM platform_partner_benefits ORDER BY created_at DESC`);
    return result.rows.map(mapBenefit);
  });
}

export async function createPartnerBenefit(
  database: DatabaseRuntime,
  input: PartnerBenefitInput,
  createdBy: string
) {
  if (!VALID_BENEFIT_TYPES.has(input.benefitType)) {
    throw new ValidationError(`Invalid benefitType: ${input.benefitType}`);
  }
  if (input.status && !VALID_BENEFIT_STATUSES.has(input.status)) {
    throw new ValidationError(`Invalid status: ${input.status}`);
  }
  if (input.value < 0) throw new ValidationError('value must be non-negative');

  return withPlatform(database, async (client) => {
    const result = await client.query(
      `INSERT INTO platform_partner_benefits
        (partner_id, referral_id, benefit_type, value, currency, valid_from, valid_until, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.partnerId ?? null,
        input.referralId ?? null,
        input.benefitType,
        input.value,
        input.currency ?? 'BRL',
        input.validFrom ?? null,
        input.validUntil ?? null,
        input.status ?? 'ACTIVE',
        createdBy,
      ]
    );
    return mapBenefit(result.rows[0]);
  });
}

export async function updatePartnerBenefitStatus(
  database: DatabaseRuntime,
  id: string,
  status: string
) {
  if (!VALID_BENEFIT_STATUSES.has(status)) throw new ValidationError(`Invalid status: ${status}`);
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `UPDATE platform_partner_benefits SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, status]
    );
    if (!result.rows[0]) throw new ValidationError('Benefit not found');
    return mapBenefit(result.rows[0]);
  });
}

function mapBenefit(row: any) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    referralId: row.referral_id,
    benefitType: row.benefit_type,
    value: row.value !== null ? Number(row.value) : null,
    currency: row.currency,
    validFrom: iso(row.valid_from),
    validUntil: iso(row.valid_until),
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ============================================================
// 6. CRÉDITOS (referral credit ledger)
// ============================================================

interface ReferralCreditInput {
  agencyId: string;
  sourceType: string;
  sourceId?: string;
  amount: number;
  currency?: string;
}

const VALID_CREDIT_STATUSES = new Set(['PENDING', 'AVAILABLE', 'APPLIED', 'CANCELLED']);

export async function listReferralCredits(database: DatabaseRuntime, agencyId?: string) {
  return withPlatform(database, async (client) => {
    const result = agencyId
      ? await client.query(
          `SELECT * FROM platform_referral_credits WHERE agency_id = $1 ORDER BY created_at DESC`,
          [agencyId]
        )
      : await client.query(`SELECT * FROM platform_referral_credits ORDER BY created_at DESC`);
    return result.rows.map(mapCredit);
  });
}

export async function createReferralCredit(
  database: DatabaseRuntime,
  input: ReferralCreditInput,
  createdBy: string
) {
  if (input.amount <= 0) throw new ValidationError('amount must be positive');
  return withPlatform(database, async (client) => {
    // No manual SELECT-based existence check here: `agencies` has FORCE
    // ROW LEVEL SECURITY (002_rls_policies.sql, tenant-scoped by
    // current_agency_id()), which a platform transaction never sets --
    // any SELECT against it here would always return zero rows even for
    // a real agency. The `agency_id` foreign key on this table enforces
    // existence instead: Postgres FK constraint checks run internally
    // and are NOT subject to the inserting role's RLS policies, so a
    // nonexistent agencyId still fails correctly, just as a real 23503.
    let result;
    try {
      result = await client.query(
        `INSERT INTO platform_referral_credits
          (agency_id, source_type, source_id, amount, currency, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
         RETURNING *`,
        [
          input.agencyId,
          sanitizePlainText(input.sourceType),
          input.sourceId ?? null,
          input.amount,
          input.currency ?? 'BRL',
          createdBy,
        ]
      );
    } catch (error: any) {
      if (error?.code === '23503') throw new ValidationError('Agency not found');
      throw error;
    }
    return mapCredit(result.rows[0]);
  });
}

// Status transitions are one-directional and explicit: PENDING ->
// AVAILABLE -> APPLIED, or -> CANCELLED from PENDING/AVAILABLE. This
// never touches real subscription/billing amounts (spec: "Não alterar
// mensalidade real nesta fase").
export async function updateReferralCreditStatus(
  database: DatabaseRuntime,
  id: string,
  status: string
) {
  if (!VALID_CREDIT_STATUSES.has(status)) throw new ValidationError(`Invalid status: ${status}`);
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `UPDATE platform_referral_credits SET
        status = $2::platform_credit_status,
        applied_at = CASE WHEN $2::text = 'APPLIED' THEN now() ELSE applied_at END
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    if (!result.rows[0]) throw new ValidationError('Credit not found');
    return mapCredit(result.rows[0]);
  });
}

function mapCredit(row: any) {
  return {
    id: row.id,
    agencyId: row.agency_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    createdAt: iso(row.created_at),
    appliedAt: iso(row.applied_at),
  };
}

// ============================================================
// 7. COMISSÕES
// ============================================================

interface PartnerCommissionInput {
  partnerId: string;
  referralId?: string;
  amount: number;
  currency?: string;
}

const VALID_COMMISSION_STATUSES = new Set(['PENDING', 'APPROVED', 'PAID', 'CANCELLED']);

export async function listPartnerCommissions(database: DatabaseRuntime, partnerId?: string) {
  return withPlatform(database, async (client) => {
    const result = partnerId
      ? await client.query(
          `SELECT * FROM platform_partner_commissions WHERE partner_id = $1 ORDER BY earned_at DESC`,
          [partnerId]
        )
      : await client.query(`SELECT * FROM platform_partner_commissions ORDER BY earned_at DESC`);
    return result.rows.map(mapCommission);
  });
}

export async function createPartnerCommission(database: DatabaseRuntime, input: PartnerCommissionInput) {
  if (input.amount <= 0) throw new ValidationError('amount must be positive');
  return withPlatform(database, async (client) => {
    const partnerCheck = await client.query(`SELECT id FROM platform_partners WHERE id = $1`, [
      input.partnerId,
    ]);
    if (!partnerCheck.rows[0]) throw new ValidationError('Partner not found');

    const result = await client.query(
      `INSERT INTO platform_partner_commissions (partner_id, referral_id, amount, currency, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING *`,
      [input.partnerId, input.referralId ?? null, input.amount, input.currency ?? 'BRL']
    );
    return mapCommission(result.rows[0]);
  });
}

// No automatic payment (spec: "Não integrar pagamento automático") --
// PAID only ever reflects a manual, already-completed real-world payment
// being recorded, never triggers one.
export async function updatePartnerCommissionStatus(
  database: DatabaseRuntime,
  id: string,
  status: string
) {
  if (!VALID_COMMISSION_STATUSES.has(status)) throw new ValidationError(`Invalid status: ${status}`);
  return withPlatform(database, async (client) => {
    const result = await client.query(
      `UPDATE platform_partner_commissions SET
        status = $2::platform_commission_status,
        paid_at = CASE WHEN $2::text = 'PAID' THEN now() ELSE paid_at END,
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    if (!result.rows[0]) throw new ValidationError('Commission not found');
    return mapCommission(result.rows[0]);
  });
}

function mapCommission(row: any) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    referralId: row.referral_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    earnedAt: iso(row.earned_at),
    paidAt: iso(row.paid_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
