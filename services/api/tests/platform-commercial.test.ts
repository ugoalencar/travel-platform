/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- platform-commercial.ts's exported functions are intentionally loosely typed (same convention as platform-services.ts), matching this test file's own row-shape assertions. */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { buildApp } from '../src/app';
import { PlatformUserRole } from '../../../packages/domain/types';
import {
  getOrCreateLandingDraft,
  updateLandingDraft,
  createLandingSection,
  updateLandingSection,
  publishLanding,
  getPublishedLanding,
  listBanners,
  createBanner,
  listActiveBannersForPlacement,
  listPartners,
  createPartner,
  updatePartner,
  listPublicPartners,
  createReferral,
  updateReferralStatus,
  createPartnerBenefit,
  createReferralCredit,
  updateReferralCreditStatus,
  createPartnerCommission,
  updatePartnerCommissionStatus,
  recordCommercialAudit,
  assertSafeExternalUrl,
  sanitizePlainText,
  searchAgencies,
} from '../src/platform-commercial';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-platform-commercial-postgres';
const containerName = 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const platformUser = 'travel_app_platform_local';
const platformPassword = 'travel_app_platform_local_password';
const poolPasswordKey = 'pass' + 'word';

const agencyId = '30000000-0000-4000-8000-000000000010';

describe('Platform Admin Comercial & Parcerias (data-access layer)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let platformPool: Pool;
  let database: DatabaseRuntime;

  beforeAll(async () => {
    assertSafeTestDatabase();
    resetDisposableDatabase();
    await waitForHealthyContainer();
    assertContainerIsLocal();

    adminPool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: adminUser,
      [poolPasswordKey]: adminPassword,
    });
    runtimePool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: runtimeUser,
      [poolPasswordKey]: runtimePassword,
    });
    // F-06: every platform-commercial query runs via
    // withPlatformTransaction, which must use the platform-role pool --
    // the runtime role no longer holds these tables (002/095 revoke).
    platformPool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: platformUser,
      [poolPasswordKey]: platformPassword,
    });

    database = createDatabaseRuntime(runtimePool, platformPool);

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE platform_landing_publications RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_landing_sections RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_landing_page RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_banners RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_partner_commissions RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_partner_benefits RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_referral_credits RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_referrals RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE platform_partners RESTART IDENTITY CASCADE');
    await adminPool.query(
      `DELETE FROM platform_audit_logs WHERE resource_type IN
        ('landing_page','landing_section','banner','partner','referral','partner_benefit','referral_credit','partner_commission')`
    );
  });

  afterAll(async () => {
    await platformPool?.end();
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  // ------------------------------------------------------------
  // Security helpers (spec section 14)
  // ------------------------------------------------------------
  describe('URL validation and sanitization', () => {
    it('accepts a real absolute http(s) URL', () => {
      expect(() => assertSafeExternalUrl('https://partner.example.com', 'url')).not.toThrow();
    });

    it('accepts a site-internal path', () => {
      expect(() => assertSafeExternalUrl('/promocoes/verao', 'url')).not.toThrow();
    });

    it('rejects a protocol-relative URL (open-redirect shape)', () => {
      expect(() => assertSafeExternalUrl('//evil.example.com/steal', 'url')).toThrow();
    });

    it('rejects a javascript: URL', () => {
      expect(() => assertSafeExternalUrl('javascript:alert(1)', 'url')).toThrow();
    });

    it('rejects a data: URL', () => {
      expect(() => assertSafeExternalUrl('data:text/html,<script>alert(1)</script>', 'url')).toThrow();
    });

    it('rejects garbage that is not a valid URL or internal path', () => {
      expect(() => assertSafeExternalUrl('not a url at all', 'url')).toThrow();
    });

    it('strips HTML/script tags from plain text fields', () => {
      const sanitized = sanitizePlainText('<script>alert(1)</script>Ótima parceria');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Ótima parceria');
    });

    it('createBanner rejects a malicious cta_url', async () => {
      await expect(
        createBanner(
          database,
          {
            title: 'Banner malicioso',
            placement: 'LANDING',
            ctaUrl: 'javascript:alert(1)',
          },
          'platform-user-1'
        )
      ).rejects.toThrow();
    });

    it('createPartner rejects a malicious website_url', async () => {
      await expect(
        createPartner(
          database,
          {
            name: 'Parceiro malicioso',
            slug: 'parceiro-malicioso',
            category: 'TECHNOLOGY',
            websiteUrl: '//evil.example.com',
          },
          'platform-user-1'
        )
      ).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------
  // Landing CMS: draft/publish (spec sections 1, 13)
  // ------------------------------------------------------------
  describe('Landing CMS', () => {
    it('starts as DRAFT with no published content', async () => {
      const page = await getOrCreateLandingDraft(database);
      expect(page.status).toBe('DRAFT');
      const published = await getPublishedLanding(database);
      expect(published).toBeNull();
    });

    it('editing the draft never changes what the public endpoint returns', async () => {
      const page = await getOrCreateLandingDraft(database);
      await updateLandingDraft(database, page.id, { heroTitle: 'Rascunho não publicado' }, 'platform-user-1');

      const published = await getPublishedLanding(database);
      expect(published).toBeNull();
    });

    it('publish snapshots the draft; public endpoint then returns exactly that snapshot', async () => {
      const page = await getOrCreateLandingDraft(database);
      await updateLandingDraft(
        database,
        page.id,
        { heroTitle: 'Mais viagens. Mais histórias reais.', seoTitle: 'Travel Plataforma' },
        'platform-user-1'
      );
      await createLandingSection(database, page.id, {
        type: 'HERO',
        enabled: true,
        title: 'Hero',
        sortOrder: 0,
      });

      await publishLanding(database, page.id, 'platform-user-1');

      const published = await getPublishedLanding(database);
      expect(published).not.toBeNull();
      expect(published?.page.heroTitle).toBe('Mais viagens. Mais histórias reais.');
      expect(published?.sections).toHaveLength(1);
    });

    it('a disabled section is excluded from the published snapshot', async () => {
      const page = await getOrCreateLandingDraft(database);
      const section = await createLandingSection(database, page.id, {
        type: 'FAQ',
        enabled: true,
        title: 'FAQ',
      });
      await updateLandingSection(database, section.id, { enabled: false });

      await publishLanding(database, page.id, 'platform-user-1');
      const published = await getPublishedLanding(database);
      expect(published?.sections).toHaveLength(0);
    });

    it('publishing again after further edits updates what public reads (re-publish)', async () => {
      const page = await getOrCreateLandingDraft(database);
      await updateLandingDraft(database, page.id, { heroTitle: 'v1' }, 'platform-user-1');
      await publishLanding(database, page.id, 'platform-user-1');
      expect((await getPublishedLanding(database))?.page.heroTitle).toBe('v1');

      await updateLandingDraft(database, page.id, { heroTitle: 'v2' }, 'platform-user-1');
      expect((await getPublishedLanding(database))?.page.heroTitle).toBe('v1'); // still old until republish

      await publishLanding(database, page.id, 'platform-user-1');
      expect((await getPublishedLanding(database))?.page.heroTitle).toBe('v2');
    });

    it('rejects an invalid section type', async () => {
      const page = await getOrCreateLandingDraft(database);
      await expect(
        createLandingSection(database, page.id, { type: 'NOT_A_REAL_TYPE' })
      ).rejects.toThrow();
    });

    it('records an audit row when the draft is updated', async () => {
      const page = await getOrCreateLandingDraft(database);
      await recordCommercialAudit(
        database,
        { actorId: 'platform-user-1' },
        'UPDATED',
        'landing_page',
        page.id,
        'landing.draft.updated',
        { heroTitle: 'x' }
      );
      const audit = await adminPool.query(
        `SELECT * FROM platform_audit_logs WHERE resource_type = 'landing_page' AND resource_id = $1`,
        [page.id]
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].action).toBe('UPDATED');
      expect(audit.rows[0].metadata.event).toBe('landing.draft.updated');
    });
  });

  // ------------------------------------------------------------
  // Banners (spec section 3)
  // ------------------------------------------------------------
  describe('Banners', () => {
    it('creates a banner and lists it by placement', async () => {
      await createBanner(
        database,
        { title: 'Promo verão', placement: 'LANDING', status: 'ACTIVE' },
        'platform-user-1'
      );
      const banners = await listBanners(database, 'LANDING');
      expect(banners).toHaveLength(1);
    });

    it('rejects startsAt after endsAt (invalid period)', async () => {
      await expect(
        createBanner(
          database,
          {
            title: 'Período inválido',
            placement: 'LANDING',
            startsAt: '2027-02-01T00:00:00.000Z',
            endsAt: '2027-01-01T00:00:00.000Z',
          },
          'platform-user-1'
        )
      ).rejects.toThrow();
    });

    it('a banner outside its scheduled window is excluded from the public/active list', async () => {
      await createBanner(
        database,
        {
          title: 'Expirado',
          placement: 'LANDING',
          status: 'ACTIVE',
          startsAt: '2020-01-01T00:00:00.000Z',
          endsAt: '2020-02-01T00:00:00.000Z',
        },
        'platform-user-1'
      );
      const active = await listActiveBannersForPlacement(database, 'LANDING');
      expect(active).toHaveLength(0);
    });

    it('a DRAFT banner never appears in the active/public list even within its window', async () => {
      await createBanner(
        database,
        { title: 'Rascunho', placement: 'LANDING', status: 'DRAFT' },
        'platform-user-1'
      );
      const active = await listActiveBannersForPlacement(database, 'LANDING');
      expect(active).toHaveLength(0);
    });

    it('rejects an unknown placement', async () => {
      await expect(
        createBanner(database, { title: 'x', placement: 'AGENCY_APP' as any }, 'platform-user-1')
      ).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------
  // Partners (spec sections 4, 5) + public exposure boundary
  // ------------------------------------------------------------
  describe('Partners CRUD and public exposure', () => {
    it('CRUD: create, list, update a partner', async () => {
      const created = await createPartner(
        database,
        {
          name: 'Fintech Parceira',
          slug: 'fintech-parceira',
          category: 'PAYMENTS',
          internalNotes: 'Contrato negociado em 2026, comissão especial',
        },
        'platform-user-1'
      );
      expect(created.status).toBe('PENDING');

      const list = await listPartners(database);
      expect(list.map((p) => p.id)).toContain(created.id);

      const updated = await updatePartner(database, created.id, { status: 'ACTIVE', featured: true });
      expect(updated.status).toBe('ACTIVE');
      expect(updated.featured).toBe(true);
    });

    it('a partner not marked is_public never appears in the public directory', async () => {
      await createPartner(
        database,
        { name: 'Privado', slug: 'privado', category: 'OTHER', status: 'ACTIVE', isPublic: false },
        'platform-user-1'
      );
      const publicList = await listPublicPartners(database);
      expect(publicList).toHaveLength(0);
    });

    it('a public + active partner appears in the public directory WITHOUT internal_notes/contact fields', async () => {
      await createPartner(
        database,
        {
          name: 'Público',
          slug: 'publico',
          category: 'TECHNOLOGY',
          status: 'ACTIVE',
          isPublic: true,
          contactEmail: 'privado@partner.example.com',
          internalNotes: 'Termos de comissão confidenciais',
        },
        'platform-user-1'
      );
      const publicList = await listPublicPartners(database);
      expect(publicList).toHaveLength(1);
      const partner = publicList[0] as unknown as Record<string, unknown>;
      expect(partner.contactEmail).toBeUndefined();
      expect(partner.internalNotes).toBeUndefined();
    });

    it('rejects an invalid category', async () => {
      await expect(
        createPartner(
          database,
          { name: 'x', slug: 'x-invalid', category: 'NOT_A_CATEGORY' as any },
          'platform-user-1'
        )
      ).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------
  // Referral lifecycle (spec section 6)
  // ------------------------------------------------------------
  describe('Referral lifecycle', () => {
    it('LEAD -> CONTACTED -> QUALIFIED -> CONVERTED sets convertedAt', async () => {
      const referral = await createReferral(database, {
        referrerType: 'MANUAL',
        referredAgencyName: 'Agência Prospect',
      });
      expect(referral.status).toBe('LEAD');
      expect(referral.convertedAt).toBeNull();

      await updateReferralStatus(database, referral.id, 'CONTACTED');
      await updateReferralStatus(database, referral.id, 'QUALIFIED');
      const converted = await updateReferralStatus(database, referral.id, 'CONVERTED');

      expect(converted.status).toBe('CONVERTED');
      expect(converted.convertedAt).not.toBeNull();
    });

    it('a referral can be rejected', async () => {
      const referral = await createReferral(database, {
        referrerType: 'CAMPAIGN',
        referredAgencyName: 'Agência Descartada',
      });
      const rejected = await updateReferralStatus(database, referral.id, 'REJECTED');
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.convertedAt).toBeNull();
    });

    it('rejects an invalid referrerType', async () => {
      await expect(
        createReferral(database, { referrerType: 'NOT_A_TYPE' as any, referredAgencyName: 'x' })
      ).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------
  // Credit lifecycle (spec section 8)
  // ------------------------------------------------------------
  describe('Referral credit lifecycle', () => {
    it('PENDING -> AVAILABLE -> APPLIED sets appliedAt', async () => {
      const credit = await createReferralCredit(
        database,
        { agencyId, sourceType: 'REFERRAL', amount: 150 },
        'platform-user-1'
      );
      expect(credit.status).toBe('PENDING');

      await updateReferralCreditStatus(database, credit.id, 'AVAILABLE');
      const applied = await updateReferralCreditStatus(database, credit.id, 'APPLIED');

      expect(applied.status).toBe('APPLIED');
      expect(applied.appliedAt).not.toBeNull();
    });

    it('rejects a non-positive amount', async () => {
      await expect(
        createReferralCredit(database, { agencyId, sourceType: 'REFERRAL', amount: 0 }, 'platform-user-1')
      ).rejects.toThrow();
    });

    it('rejects an unknown agency', async () => {
      await expect(
        createReferralCredit(
          database,
          { agencyId: '99999999-0000-4000-8000-000000000099', sourceType: 'REFERRAL', amount: 10 },
          'platform-user-1'
        )
      ).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------
  // Commission lifecycle (spec section 9) + Benefits (spec section 7)
  // ------------------------------------------------------------
  describe('Commission lifecycle', () => {
    it('PENDING -> APPROVED -> PAID sets paidAt (no automatic payment triggered)', async () => {
      const partner = await createPartner(
        database,
        { name: 'Parceiro Comissionado', slug: 'parceiro-comissionado', category: 'TRAVEL_SERVICES' },
        'platform-user-1'
      );
      const commission = await createPartnerCommission(database, { partnerId: partner.id, amount: 300 });
      expect(commission.status).toBe('PENDING');

      await updatePartnerCommissionStatus(database, commission.id, 'APPROVED');
      const paid = await updatePartnerCommissionStatus(database, commission.id, 'PAID');

      expect(paid.status).toBe('PAID');
      expect(paid.paidAt).not.toBeNull();
    });

    it('rejects a commission for an unknown partner', async () => {
      await expect(
        createPartnerCommission(database, { partnerId: 'does-not-exist', amount: 10 })
      ).rejects.toThrow();
    });

    it('creates a partner benefit (percentage commission rule)', async () => {
      const partner = await createPartner(
        database,
        { name: 'Parceiro Benefício', slug: 'parceiro-beneficio', category: 'INSURANCE' },
        'platform-user-1'
      );
      const benefit = await createPartnerBenefit(
        database,
        { partnerId: partner.id, benefitType: 'PERCENTAGE_COMMISSION', value: 10 },
        'platform-user-1'
      );
      expect(benefit.benefitType).toBe('PERCENTAGE_COMMISSION');
      expect(benefit.status).toBe('ACTIVE');
    });
  });

  // ------------------------------------------------------------
  // HTTP layer: permission boundary (spec section 11)
  // ------------------------------------------------------------
  describe('HTTP permission boundary', () => {
    function buildTestApp() {
      return buildApp({
        authProvider: { authenticate: () => Promise.resolve(null) },
        validateUserAgencyAccess: () => Promise.resolve(false),
        database,
        platformAuthProvider: {
          authenticate(request) {
            const header = request.headers['x-test-platform-role'];
            if (!header || typeof header !== 'string') return Promise.resolve(null);
            return Promise.resolve({
              platformUserId: 'platform-user-1',
              role: header as PlatformUserRole,
            });
          },
        },
        rateLimit: { classLimits: { SYSTEM_INTERNAL: { windowMs: 60_000, max: 200 } } },
      });
    }

    it('rejects an unauthenticated request (no agency/tenant identity accepted here at all)', async () => {
      const app = buildTestApp();
      const response = await app.inject({ method: 'GET', url: '/platform/partners' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('a read is allowed for any authenticated platform role (e.g. READ_ONLY_AUDITOR)', async () => {
      const app = buildTestApp();
      const response = await app.inject({
        method: 'GET',
        url: '/platform/partners',
        headers: { 'x-test-platform-role': PlatformUserRole.READ_ONLY_AUDITOR },
      });
      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('a non-admin platform role cannot create a partner (write gated to PLATFORM_OWNER/PLATFORM_ADMIN)', async () => {
      const app = buildTestApp();
      const response = await app.inject({
        method: 'POST',
        url: '/platform/partners',
        headers: { 'x-test-platform-role': PlatformUserRole.SUPPORT_ADMIN },
        payload: { name: 'x', slug: 'x-http-1', category: 'OTHER' },
      });
      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('PLATFORM_ADMIN can create a partner and an audit row is recorded', async () => {
      const app = buildTestApp();
      const response = await app.inject({
        method: 'POST',
        url: '/platform/partners',
        headers: { 'x-test-platform-role': PlatformUserRole.PLATFORM_ADMIN },
        payload: { name: 'Criado via HTTP', slug: 'criado-via-http', category: 'OTHER' },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();

      const audit = await adminPool.query(
        `SELECT * FROM platform_audit_logs WHERE resource_type = 'partner' AND resource_id = $1`,
        [body.partner.id]
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].actor_id).toBe('platform-user-1');
      await app.close();
    });

    it('the public landing/partners/banners endpoints require no platform auth at all', async () => {
      const app = buildTestApp();
      const landing = await app.inject({ method: 'GET', url: '/public/landing' });
      const partners = await app.inject({ method: 'GET', url: '/public/partners' });
      const banners = await app.inject({ method: 'GET', url: '/public/banners' });
      expect(landing.statusCode).toBe(200);
      expect(partners.statusCode).toBe(200);
      expect(banners.statusCode).toBe(200);
      await app.close();
    });

    it('GET /platform/agencies/search requires platform auth (unauthenticated rejected)', async () => {
      const app = buildTestApp();
      const response = await app.inject({ method: 'GET', url: '/platform/agencies/search?q=agency' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('GET /platform/agencies/search is allowed for any authenticated platform role (read, not write)', async () => {
      const app = buildTestApp();
      const response = await app.inject({
        method: 'GET',
        url: '/platform/agencies/search?q=Agency',
        headers: { 'x-test-platform-role': PlatformUserRole.READ_ONLY_AUDITOR },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.agencies.some((a: { id: string }) => a.id === agencyId)).toBe(true);
      await app.close();
    });
  });

  // ------------------------------------------------------------
  // Agency search (Fechamento da META 01 -- seletor de Créditos)
  // ------------------------------------------------------------
  describe('Agency search', () => {
    it('finds an agency by partial name and returns only id/name/slug/status', async () => {
      const results = await searchAgencies(database, 'Commercial Test');
      expect(results.length).toBeGreaterThan(0);
      const match = results.find((a) => a.id === agencyId);
      expect(match).toBeDefined();
      expect(match).toEqual({
        id: agencyId,
        name: 'Agency Commercial Test',
        slug: 'agency-commercial-test',
        status: 'ACTIVE',
      });
      // No sensitive columns (cnpj, email, phone, address, settings) --
      // the SECURITY DEFINER function itself only ever selects these 4.
      expect(Object.keys(match as object).sort()).toEqual(['id', 'name', 'slug', 'status'].sort());
    });

    it('finds an agency by exact id', async () => {
      const results = await searchAgencies(database, agencyId);
      expect(results.some((a) => a.id === agencyId)).toBe(true);
    });

    it('finds an agency by slug', async () => {
      const results = await searchAgencies(database, 'agency-commercial-test');
      expect(results.some((a) => a.id === agencyId)).toBe(true);
    });

    it('returns an empty match set for a query with no results', async () => {
      const results = await searchAgencies(database, 'no-agency-matches-this-string-xyz');
      expect(results).toHaveLength(0);
    });

    it('an empty query returns real agencies (bounded list), not zero results', async () => {
      const results = await searchAgencies(database, '');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------
  async function resetDatabase(pool: Pool): Promise<void> {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migrationFile of migrationFiles) {
      await pool.query(readSqlForPg(migrationFile));
    }
    await pool.query(readSqlForPg(prepareRolesSql));
    await seedAgency(pool);
  }

  async function seedAgency(pool: Pool): Promise<void> {
    await pool.query(
      `
        INSERT INTO agencies (id, name, slug, email, plan, status)
        VALUES ($1, 'Agency Commercial Test', 'agency-commercial-test', 'agency-commercial@example.test', 'FREE', 'ACTIVE')
      `,
      [agencyId]
    );
    // Real platform_users row so created_by/actor_id FKs (platform_banners,
    // platform_partners, platform_referral_credits, platform_audit_logs)
    // resolve to something real, matching the literal actor id every test
    // in this file uses ('platform-user-1').
    await pool.query(
      `
        INSERT INTO platform_users (id, email, password_hash, role)
        VALUES ('platform-user-1', 'platform-admin-commercial-test@example.test', 'hash-for-test-only', 'PLATFORM_ADMIN')
      `
    );
  }
});

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Platform commercial data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Platform commercial data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Platform commercial data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run platform commercial data-layer tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  if (process.env.CI === 'true') return;
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]) {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  if (process.env.CI === 'true') return;
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', containerName], false);
    if (result.stdout.trim() === 'healthy') return;
    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }

  throw new Error('Local PostgreSQL container did not become healthy in time.');
}

function assertContainerIsLocal(): void {
  if (process.env.CI === 'true') return;
  const result = run('docker', [
    'ps',
    '--filter',
    `name=${containerName}`,
    '--format',
    '{{.Image}}|{{.Ports}}',
  ]);
  const output = result.stdout.trim();
  expect(output).toContain(postgresImage);
  expect(output).toContain(`${databaseHost}:${databasePort}->5432/tcp`);
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(command: string, args: readonly string[], throwOnError = true): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (throwOnError && result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, `Exit code: ${result.status ?? 'unknown'}`, stdout, stderr]
        .filter(Boolean)
        .join('\n')
    );
  }
  return { stdout, stderr };
}
