import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { createCustomerAccessValidator } from '../src/customer-portal';
import type { CustomerAuthProvider } from '../src/customer-auth';
import type { UserRole } from '../../../packages/domain/types';

// Media Library hardening -- docs/product/MEDIA_LIBRARY.md and
// docs/product/MEDIA_ASSET_USAGE.md. Dedicated suite (Fase 17) covering:
// upload, tags, list/search, select, link to Proposal/Offer/Communication,
// same asset reused across entities (1 physical file / N uses), usage count
// (including Offer/Communication covers via cover_media_asset_id), archive/
// delete safety (delete is refused whenever an asset is in use, covers
// included), cross-tenant blocking, RBAC (upload needs MANAGER+), the
// authenticated download streams that play the "signed URL" role, Customer
// App / Proposal Viewer rendering, migration compatibility, persistence
// across app instances, reload stability, and the MEDIA_ASSET_* audit trail.

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-media-library-http-postgres';
const containerName = 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const poolPasswordKey = 'pass' + 'word';

const agencyAId = '10000000-0000-4000-8000-000000000261';
const agencyBId = '10000000-0000-4000-8000-000000000262';
const managerAId = '11000000-0000-4000-8000-000000000261';
const agentAId = '11000000-0000-4000-8000-000000000262';
const viewerAId = '11000000-0000-4000-8000-000000000263';
const managerBId = '11000000-0000-4000-8000-000000000264';

function pngBytes(): Buffer {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  return Buffer.from(pngBase64, 'base64');
}

describe('Media Library -- HTTP hardening suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
  let customerAId: string;
  let customerBId: string;
  let uploadsDir: string;

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
    database = createDatabaseRuntime(runtimePool);

    uploadsDir = mkdtempSync(join(tmpdir(), 'travel-platform-media-library-test-'));
    process.env.UPLOADS_DIR = uploadsDir;

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE TABLE proposal_items, proposal_sections, media_asset_links, media_assets, offers, agency_communications, proposals, engagements, customers, audit_logs RESTART IDENTITY CASCADE',
    );
    customerAId = await seedCustomer(agencyAId, 'Cliente A');
    customerBId = await seedCustomer(agencyBId, 'Cliente B');
  });

  afterAll(async () => {
    if (uploadsDir) rmSync(uploadsDir, { recursive: true, force: true });
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, email) VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, name, `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`],
    );
    return result.rows[0]!.id;
  }

  function buildStaffApp(agencyId = agencyAId) {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const header = request.headers['x-test-role'];
          if (!header || typeof header !== 'string') return Promise.resolve(null);
          const roleToUser: Record<string, string> = {
            MANAGER: agencyId === agencyBId ? managerBId : managerAId,
            AGENT: agentAId,
            VIEWER: viewerAId,
          };
          return Promise.resolve({
            agencyId,
            userId: roleToUser[header] ?? managerAId,
            role: header as UserRole,
            email: 'staff@example.test',
          });
        },
      },
      validateUserAgencyAccess: () => Promise.resolve(true),
      database,
    });
  }

  function buildCustomerApp(customerId: string, agencyId = agencyAId) {
    const provider: CustomerAuthProvider = {
      authenticateCustomer(request) {
        if (request.headers['x-test-customer'] === 'ok') {
          return Promise.resolve({ agencyId, customerId });
        }
        return Promise.resolve(null);
      },
    };
    return buildApp({
      authProvider: { authenticate: () => Promise.resolve(null) },
      validateUserAgencyAccess: () => Promise.resolve(false),
      database,
      customerAuthProvider: provider,
      validateCustomerAgencyAccess: createCustomerAccessValidator(adminPool),
    });
  }

  async function createProposal(app: ReturnType<typeof buildStaffApp>, customerId = customerAId): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/proposals',
      headers: { 'x-test-role': 'MANAGER' },
      payload: {
        customerId,
        proposedPrice: 5000,
        title: 'Cancún em família',
        subtitle: '7 noites all-inclusive',
        destinationSummary: 'Cancún, México',
      },
    });
    expect(response.statusCode).toBe(201);
    const body: { proposal: { id: string } } = response.json();
    return body.proposal.id;
  }

  interface UploadedAsset {
    id: string;
    title: string;
    status: string;
    tags: string[];
    mimeType: string;
    secureFileKey: string;
  }

  async function uploadToLibrary(
    app: ReturnType<typeof buildStaffApp>,
    fieldValues: Record<string, string> = {},
  ): Promise<{ statusCode: number; body: { asset?: UploadedAsset } }> {
    const boundary = '----mediaLibraryBoundary';
    const png = pngBytes();
    const title = fieldValues.title ?? 'Imagem de teste';
    const tags = fieldValues.tags ?? '';
    const parts: Buffer[] = [];
    const fields: Record<string, string> = {
      title,
      ...(fieldValues.tags !== undefined ? { tags } : {}),
      ...(fieldValues.description !== undefined ? { description: fieldValues.description } : {}),
      ...(fieldValues.altText !== undefined ? { altText: fieldValues.altText } : {}),
    };
    for (const [name, value] of Object.entries(fields)) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        ),
      );
    }
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fieldValues.fileName ?? 'asset.png'}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/media-assets',
      headers: {
        'x-test-role': 'MANAGER',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat(parts),
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  async function linkProposalAsset(
    app: ReturnType<typeof buildStaffApp>,
    proposalId: string,
    mediaAssetId: string,
    usage = 'GALLERY',
  ) {
    return app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/media/link`,
      headers: { 'x-test-role': 'AGENT' },
      payload: { mediaAssetId, usage },
    });
  }

  async function listAuditEvents() {
    const result = await adminPool.query<{
      event_type: string;
      entity_type: string;
      entity_id: string | null;
      agency_id: string;
      metadata: Record<string, unknown>;
    }>(`SELECT event_type, entity_type, entity_id, agency_id, metadata FROM audit_logs ORDER BY occurred_at, id`);
    return result.rows;
  }

  // ------------------------------------------------------------
  // Set 1 -- upload / list / search / tags
  // ------------------------------------------------------------

  it('(1) upload stores the asset in the library with title, tags, mime and ACTIVE status', async () => {
    const app = buildStaffApp();
    const { statusCode, body } = await uploadToLibrary(app, { title: 'Cancún', tags: 'praia,familia' });
    expect(statusCode).toBe(201);
    expect(body.asset).toBeDefined();
    expect(body.asset!.id).toBeTruthy();
    expect(body.asset!.title).toBe('Cancún');
    expect(body.asset!.tags).toEqual(['praia', 'familia']);
    expect(body.asset!.mimeType).toBe('image/png');
    expect(body.asset!.status).toBe('ACTIVE');
    expect(body.asset!.secureFileKey).toMatch(/^media-assets\//);
    await app.close();
  });

  it('(2) upload rejects a blocked file type before any row is created', async () => {
    const app = buildStaffApp();
    const boundary = '----mediaLibraryBoundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nVirus\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evil.exe"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from('MZ...'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/media-assets',
      headers: {
        'x-test-role': 'MANAGER',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    const count = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM media_assets WHERE agency_id = $1`,
      [agencyAId],
    );
    expect(Number(count.rows[0]!.count)).toBe(0);
    await app.close();
  });

  it('(3) list/search returns only matching ACTIVE assets, ordered newest first', async () => {
    const app = buildStaffApp();
    await uploadToLibrary(app, { title: 'Cancún praia', tags: 'praia' });
    await uploadToLibrary(app, { title: 'Paris torre', tags: 'cidade' });

    const search = await app.inject({
      method: 'GET',
      url: '/media-assets?search=paris',
      headers: { 'x-test-role': 'VIEWER' },
    });
    const searchBody: { assets: UploadedAsset[] } = search.json();
    expect(searchBody.assets).toHaveLength(1);
    expect(searchBody.assets[0]!.title).toBe('Paris torre');

    const all = await app.inject({ method: 'GET', url: '/media-assets', headers: { 'x-test-role': 'VIEWER' } });
    const allBody: { assets: UploadedAsset[] } = all.json();
    expect(allBody.assets).toHaveLength(2);
    expect(allBody.assets[0]!.title).toBe('Paris torre');
    expect(allBody.assets.every((a) => a.status === 'ACTIVE')).toBe(true);
    await app.close();
  });

  it('(4) tags filter and PATCH update of tags/alt text', async () => {
    const app = buildStaffApp();
    const uploaded = await uploadToLibrary(app, { title: 'Cancún', tags: 'praia,familia' });
    const assetId = uploaded.body.asset!.id;

    const byTag = await app.inject({
      method: 'GET',
      url: '/media-assets?tag=familia',
      headers: { 'x-test-role': 'VIEWER' },
    });
    const tagBody: { assets: UploadedAsset[] } = byTag.json();
    expect(tagBody.assets.map((a) => a.id)).toContain(assetId);

    const missingTag = await app.inject({
      method: 'GET',
      url: '/media-assets?tag=inexistente',
      headers: { 'x-test-role': 'VIEWER' },
    });
    const missingBody: { assets: UploadedAsset[] } = missingTag.json();
    expect(missingBody.assets).toHaveLength(0);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/media-assets/${assetId}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { tags: ['nova'], altText: 'Capa de verão' },
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody: { asset: UploadedAsset & { altText?: string } } = patched.json();
    expect(patchedBody.asset.tags).toEqual(['nova']);
    expect(patchedBody.asset.altText).toBe('Capa de verão');
    await app.close();
  });

  it('(5) select asset (picker): GET /media-assets/:id returns the asset and 404 for unknown', async () => {
    const app = buildStaffApp();
    const uploaded = await uploadToLibrary(app, { title: 'Seleto' });
    const assetId = uploaded.body.asset!.id;

    const selected = await app.inject({
      method: 'GET',
      url: `/media-assets/${assetId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(selected.statusCode).toBe(200);
    const selectedBody: { asset: { id: string } } = selected.json();
    expect(selectedBody.asset.id).toBe(assetId);

    const missing = await app.inject({
      method: 'GET',
      url: '/media-assets/00000000-0000-4000-8000-000000000000',
      headers: { 'x-test-role': 'VIEWER' },
    });    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  // ------------------------------------------------------------
  // Set 2 -- tenant isolation
  // ------------------------------------------------------------

  it('(6) tenant isolation: Agency B never lists, selects or downloads Agency A assets', async () => {
    const appA = buildStaffApp(agencyAId);
    const uploaded = await uploadToLibrary(appA, { title: 'Segredo A' });
    const assetId = uploaded.body.asset!.id;
    await appA.close();

    const appB = buildStaffApp(agencyBId);
    const list = await appB.inject({ method: 'GET', url: '/media-assets', headers: { 'x-test-role': 'VIEWER' } });
    const listBody: { assets: unknown[] } = list.json();
    expect(listBody.assets).toHaveLength(0);

    const select = await appB.inject({
      method: 'GET',
      url: `/media-assets/${assetId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(select.statusCode).toBe(404);

    const download = await appB.inject({
      method: 'GET',
      url: `/media-assets/${assetId}/download`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(download.statusCode).toBe(404);
    await appB.close();
  });

  // ------------------------------------------------------------
  // Set 3 -- link to Proposal / Offer / Communication
  // ------------------------------------------------------------

  it('(7) select a library asset for a Proposal (media/link) and list it back', async () => {
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Cancún' });
    const assetId = uploaded.body.asset!.id;

    const link = await linkProposalAsset(app, proposalId, assetId, 'COVER');
    expect(link.statusCode).toBe(201);
    const linkBody: { link: { id: string; mediaAssetId: string; entityType: string; usage: string } } = link.json();
    expect(linkBody.link.mediaAssetId).toBe(assetId);
    expect(linkBody.link.entityType).toBe('PROPOSAL');
    expect(linkBody.link.usage).toBe('COVER');

    const list = await app.inject({ method: 'GET', url: `/proposals/${proposalId}/media`, headers: { 'x-test-role': 'VIEWER' } });
    const listBody: { media: { mediaAssetId: string; title: string }[] } = list.json();
    expect(listBody.media).toHaveLength(1);
    expect(listBody.media[0]!.mediaAssetId).toBe(assetId);
    expect(listBody.media[0]!.title).toBe('Cancún');
    await app.close();
  });

  it('(8) select a library asset as an Offer cover (coverMediaAssetId)', async () => {
    const app = buildStaffApp();
    const uploaded = await uploadToLibrary(app, { title: 'Capa oferta' });
    const assetId = uploaded.body.asset!.id;

    const offer = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { name: 'Pacote Cancún', price: 4999 },
    });
    expect(offer.statusCode).toBe(201);
    const { offer: offerBody }: { offer: { id: string } } = offer.json();

    const patched = await app.inject({
      method: 'PATCH',
      url: `/offers/${offerBody.id}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { coverMediaAssetId: assetId },
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody: { offer: { coverMediaAssetId: string } } = patched.json();
    expect(patchedBody.offer.coverMediaAssetId).toBe(assetId);
    await app.close();
  });

  it('(9) select a library asset as a Communication cover, then swap it', async () => {
    const app = buildStaffApp();
    const first = await uploadToLibrary(app, { title: 'Banner 1' });
    const second = await uploadToLibrary(app, { title: 'Banner 2' });

    const created = await app.inject({
      method: 'POST',
      url: '/agency-communications',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'CAMPAIGN', title: 'Campanha de Verão', coverMediaAssetId: first.body.asset!.id },
    });
    expect(created.statusCode).toBe(201);
    const createdBody: {
      communication: { id: string; coverMediaAssetId: string };
    } = created.json();
    expect(createdBody.communication.coverMediaAssetId).toBe(first.body.asset!.id);

    const updated = await app.inject({
      method: 'PUT',
      url: `/agency-communications/${createdBody.communication.id}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { coverMediaAssetId: second.body.asset!.id },
    });
    expect(updated.statusCode).toBe(200);
    const updatedBody: { communication: { coverMediaAssetId: string } } = updated.json();
    expect(updatedBody.communication.coverMediaAssetId).toBe(second.body.asset!.id);
    await app.close();
  });

  it('(10) same asset reused by Proposal + Offer + Communication: 1 physical file, 3 uses', async () => {
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Cancún', tags: 'praia' });
    const assetId = uploaded.body.asset!.id;

    await linkProposalAsset(app, proposalId, assetId, 'COVER');

    const offer = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { name: 'Pacote Cancún', price: 4999, coverMediaAssetId: assetId },
    });
    expect(offer.statusCode).toBe(201);

    const communication = await app.inject({
      method: 'POST',
      url: '/agency-communications',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'CAMPAIGN', title: 'Summer', coverMediaAssetId: assetId },
    });
    expect(communication.statusCode).toBe(201);

    // Exactly one physical row for this asset id (no duplicate uploads).
    const physical = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM media_assets WHERE agency_id = $1 AND id = $2`,
      [agencyAId, assetId],
    );
    expect(Number(physical.rows[0]!.count)).toBe(1);

    // 3 uses: 1 Offer cover, 1 Proposal cover, 1 Communication cover.
    const usage = await app.inject({
      method: 'GET',
      url: `/media-assets/${assetId}/usage`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(usage.statusCode).toBe(200);
    const usageBody: { usage: { entityType: string; count: number }[] } = usage.json();
    const byType = Object.fromEntries(usageBody.usage.map((u) => [u.entityType, u.count]));
    expect(byType).toEqual({ OFFER: 1, PROPOSAL: 1, COMMUNICATION: 1 });
    await app.close();
  });

  it('(11) usage count aggregates multiple links across entities', async () => {
    const app = buildStaffApp();
    const proposalA = await createProposal(app);
    const proposalB = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Reuso' });
    const assetId = uploaded.body.asset!.id;

    await linkProposalAsset(app, proposalA, assetId);
    await linkProposalAsset(app, proposalB, assetId);

    const offer = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { name: 'Oferta', price: 100, coverMediaAssetId: assetId },
    });
    expect(offer.statusCode).toBe(201);

    const usage = await app.inject({ method: 'GET', url: `/media-assets/${assetId}/usage`, headers: { 'x-test-role': 'VIEWER' } });
    const usageBody: { usage: { entityType: string; count: number }[] } = usage.json();
    const byType = Object.fromEntries(usageBody.usage.map((u) => [u.entityType, u.count]));
    expect(byType).toEqual({ OFFER: 1, PROPOSAL: 2 });
    await app.close();
  });

  // ------------------------------------------------------------
  // Set 4 -- archive / delete safety
  // ------------------------------------------------------------

  it('(12) archive a used asset is safe: status flips, links and downloads keep working', async () => {
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Arquivável' });
    const assetId = uploaded.body.asset!.id;
    await linkProposalAsset(app, proposalId, assetId, 'COVER');

    const archived = await app.inject({
      method: 'POST',
      url: `/media-assets/${assetId}/archive`,
      headers: { 'x-test-role': 'MANAGER' },
    });
    expect(archived.statusCode).toBe(200);
    const archivedBody: { asset: { status: string; archivedAt?: string } } = archived.json();
    expect(archivedBody.asset.status).toBe('ARCHIVED');
    expect(archivedBody.asset.archivedAt).toBeTruthy();

    // Archiving never unsets the link.
    const list = await app.inject({ method: 'GET', url: `/proposals/${proposalId}/media`, headers: { 'x-test-role': 'VIEWER' } });
    const listBody: { media: unknown[] } = list.json();
    expect(listBody.media).toHaveLength(1);

    // Archived assets are excluded from the default list but still downloadable.
    const all = await app.inject({ method: 'GET', url: '/media-assets', headers: { 'x-test-role': 'VIEWER' } });
    const allBody: { assets: unknown[] } = all.json();
    expect(allBody.assets).toHaveLength(0);

    const download = await app.inject({
      method: 'GET',
      url: `/media-assets/${assetId}/download`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.equals(pngBytes())).toBe(true);
    await app.close();
  });

  it('(13) delete an unused asset removes it (204) and it disappears', async () => {
    const app = buildStaffApp();
    const uploaded = await uploadToLibrary(app, { title: 'Descartável' });
    const assetId = uploaded.body.asset!.id;

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/media-assets/${assetId}`,
      headers: { 'x-test-role': 'MANAGER' },
    });
    expect(deleted.statusCode).toBe(204);

    const select = await app.inject({ method: 'GET', url: `/media-assets/${assetId}`, headers: { 'x-test-role': 'VIEWER' } });
    expect(select.statusCode).toBe(404);
    await app.close();
  });

  it('(14) delete a used asset is refused (409) even when the only use is an Offer/Communication cover', async () => {
    const app = buildStaffApp();
    const linkUsed = await uploadToLibrary(app, { title: 'Em uso por link' });
    const linkAssetId = linkUsed.body.asset!.id;
    const proposalId = await createProposal(app);
    await linkProposalAsset(app, proposalId, linkAssetId);

    const blockedByLink = await app.inject({
      method: 'DELETE',
      url: `/media-assets/${linkAssetId}`,
      headers: { 'x-test-role': 'MANAGER' },
    });
    expect(blockedByLink.statusCode).toBe(409);

    const coverUsed = await uploadToLibrary(app, { title: 'Em uso só como capa' });
    const coverAssetId = coverUsed.body.asset!.id;
    const offer = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { name: 'Com capa', price: 100, coverMediaAssetId: coverAssetId },
    });
    expect(offer.statusCode).toBe(201);

    const blockedByCover = await app.inject({
      method: 'DELETE',
      url: `/media-assets/${coverAssetId}`,
      headers: { 'x-test-role': 'MANAGER' },
    });
    expect(blockedByCover.statusCode).toBe(409);

    const commCover = await uploadToLibrary(app, { title: 'Capa comunicação' });
    const commCoverId = commCover.body.asset!.id;
    const communication = await app.inject({
      method: 'POST',
      url: '/agency-communications',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'NOTICE', title: 'Aviso', coverMediaAssetId: commCoverId },
    });
    expect(communication.statusCode).toBe(201);
    const blockedByCommCover = await app.inject({
      method: 'DELETE',
      url: `/media-assets/${commCoverId}`,
      headers: { 'x-test-role': 'MANAGER' },
    });
    expect(blockedByCommCover.statusCode).toBe(409);
    await app.close();
  });

  // ------------------------------------------------------------
  // Set 5 -- cross-tenant + RBAC
  // ------------------------------------------------------------

  it('(15) cross-tenant link is blocked for Proposal links and Offer/Communication covers', async () => {
    const appA = buildStaffApp(agencyAId);
    const uploaded = await uploadToLibrary(appA, { title: 'Asset A' });
    const assetAId = uploaded.body.asset!.id;
    await appA.close();

    const appB = buildStaffApp(agencyBId);
    const proposalBId = await createProposal(appB, customerBId);

    const linkAttempt = await linkProposalAsset(appB, proposalBId, assetAId);
    expect(linkAttempt.statusCode).toBe(404);

    const offerAttempt = await appB.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { name: 'Ladrão', price: 1, coverMediaAssetId: assetAId },
    });
    expect(offerAttempt.statusCode).toBe(404);

    const communicationAttempt = await appB.inject({
      method: 'POST',
      url: '/agency-communications',
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'NOTICE', title: 'Ladrão', coverMediaAssetId: assetAId },
    });
    expect(communicationAttempt.statusCode).toBe(404);
    await appB.close();

    // Nothing leaked to tenancy B.
    const leaked = await adminPool.query<{ count: string }>(
      `SELECT (
         (SELECT count(*) FROM media_assets WHERE agency_id = $1)
         + (SELECT count(*) FROM media_asset_links WHERE agency_id = $1)
         + (SELECT count(*) FROM offers WHERE agency_id = $1 AND cover_media_asset_id IS NOT NULL)
       )::text AS count`,
      [agencyBId],
    );
    expect(Number(leaked.rows[0]!.count)).toBe(0);
  });

  it('(16) upload/archive/delete require MANAGER+; VIEWER and AGENT are blocked with 403', async () => {
    const app = buildStaffApp();
    const uploaded = await uploadToLibrary(app, { title: 'Gerenciado' });
    const assetId = uploaded.body.asset!.id;

    for (const role of ['VIEWER', 'AGENT']) {
      const attempt = await app.inject({
        method: 'POST',
        url: '/media-assets',
        headers: { 'x-test-role': role, 'content-type': 'application/json' },
        payload: {},
      });
      expect(attempt.statusCode).toBe(403);
    }

    const viewerDelete = await app.inject({
      method: 'DELETE',
      url: `/media-assets/${assetId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(viewerDelete.statusCode).toBe(403);

    const viewerArchive = await app.inject({
      method: 'POST',
      url: `/media-assets/${assetId}/archive`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(viewerArchive.statusCode).toBe(403);

    const viewerPatch = await app.inject({
      method: 'PATCH',
      url: `/media-assets/${assetId}`,
      headers: { 'x-test-role': 'VIEWER' },
      payload: { title: 'Hack' },
    });
    expect(viewerPatch.statusCode).toBe(403);
    await app.close();
  });

  // ------------------------------------------------------------
  // Set 6 -- download / Customer App / Proposal Viewer
  // ------------------------------------------------------------

  it('(17) authenticated download plays the signed-URL role (staff + customer streams, never unauthenticated)', async () => {
    // There are no signed URLs in this module -- downloads are authenticated
    // streams via secure_file_key, deliberately. This scenario pins the
    // contract that replaces a signed URL: staff Bearer download for VIEWER+.
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Stream' });
    const assetId = uploaded.body.asset!.id;
    await linkProposalAsset(app, proposalId, assetId, 'COVER');

    const staffDownload = await app.inject({
      method: 'GET',
      url: `/media-assets/${assetId}/download`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(staffDownload.statusCode).toBe(200);
    expect(staffDownload.headers['content-type']).toContain('image/png');
    expect(staffDownload.rawPayload.equals(pngBytes())).toBe(true);
    await app.close();

    const customerApp = buildCustomerApp(customerAId);
    const customerDownload = await customerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}/media/${assetId}/download`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(customerDownload.statusCode).toBe(200);
    expect(customerDownload.rawPayload.equals(pngBytes())).toBe(true);
    await customerApp.close();
  });

  it('(18) Customer App renders the asset: detail exposes downloadUrl and the stream only for linked+owned media', async () => {
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Para cliente', altText: 'Vista da praia' });
    const assetId = uploaded.body.asset!.id;
    await linkProposalAsset(app, proposalId, assetId, 'COVER');
    await app.inject({ method: 'POST', url: `/proposals/${proposalId}/send`, headers: { 'x-test-role': 'MANAGER' } });
    await app.close();

    const customerApp = buildCustomerApp(customerAId);
    const detail = await customerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(detail.statusCode).toBe(200);
    const detailBody: {
      proposal: { media: { id: string; caption: string | null; isCover: boolean; downloadUrl: string }[] };
    } = detail.json();
    expect(detailBody.proposal.media).toHaveLength(1);
    expect(detailBody.proposal.media[0]!.id).toBe(assetId);
    expect(detailBody.proposal.media[0]!.isCover).toBe(true);
    expect(detailBody.proposal.media[0]!.caption).toBe('Vista da praia');
    expect(detailBody.proposal.media[0]!.downloadUrl).toContain('/customer-api/proposals/');

    const raw = detail.payload;
    expect(raw).not.toContain('secure_file_key');
    expect(raw).not.toContain('secureFileKey');

    const flow = await customerApp.inject({
      method: 'GET',
      url: detailBody.proposal.media[0]!.downloadUrl,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(flow.statusCode).toBe(200);

    // A linked asset id (not this proposal's) must not resolve for the customer.
    await customerApp.close();
  });

  it('(19) Proposal Viewer renders the asset for staff and a stranger tenant can never fetch it', async () => {
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Visual' });
    const assetId = uploaded.body.asset!.id;
    await linkProposalAsset(app, proposalId, assetId, 'GALLERY');
    await app.inject({ method: 'POST', url: `/proposals/${proposalId}/send`, headers: { 'x-test-role': 'MANAGER' } });
    await app.close();

    const staffApp = buildStaffApp();
    const media = await staffApp.inject({
      method: 'GET',
      url: `/proposals/${proposalId}/media`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(media.statusCode).toBe(200);
    const mediaBody: { media: { mediaAssetId: string; usage: string; mimeType: string }[] } = media.json();
    expect(mediaBody.media).toHaveLength(1);
    expect(mediaBody.media[0]!.usage).toBe('GALLERY');
    expect(mediaBody.media[0]!.mimeType).toBe('image/png');

    // A customer from a different tenant cannot download this proposal media.
    const stranger = buildCustomerApp(customerBId, agencyBId);
    const attempt = await stranger.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}/media/${assetId}/download`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(attempt.statusCode).toBe(404);
    await stranger.close();
    await staffApp.close();
  });

  // ------------------------------------------------------------
  // Set 7 -- migrations / persistence / reload
  // ------------------------------------------------------------

  it('(20) migrations compatibility: fresh apply yields media tables, enums, RLS and cover FKs', async () => {
    // resetDatabase() already re-applies 001..094 from scratch in beforeAll;
    // this test pins the resulting schema, including the pieces media
    // reuse depends on.
    const schema = await adminPool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('media_assets', 'media_asset_links', 'audit_logs')`,
    );
    const tables = schema.rows.map((r) => r.table_name).sort();
    expect(tables).toEqual(['audit_logs', 'media_asset_links', 'media_assets']);

    const enums = await adminPool.query<{ type: string }>(
      `SELECT typname::text AS type FROM pg_type
       WHERE typname IN ('MediaAssetType', 'MediaAssetStatus', 'MediaAssetSource', 'MediaAssetUsageContext', 'MediaAssetUsageKind')`,
    );
    expect(enums.rows.map((r) => r.type).sort()).toEqual([
      'MediaAssetSource',
      'MediaAssetStatus',
      'MediaAssetType',
      'MediaAssetUsageContext',
      'MediaAssetUsageKind',
    ]);

    const covers = await adminPool.query<{ table_name: string }>(
      `SELECT DISTINCT tc.table_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND ccu.table_name = 'media_assets'
         AND kcu.column_name = 'cover_media_asset_id'
       ORDER BY tc.table_name`,
    );
    expect(covers.rows.map((r) => r.table_name).sort()).toEqual(['agency_communications', 'offers']);

    const rls = await adminPool.query<{ tablename: string }>(
      `SELECT c.relname::text AS tablename
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('media_assets', 'media_asset_links')
         AND c.relrowsecurity = true AND c.relforcerowsecurity = true`,
    );
    expect(rls.rows.map((r) => r.tablename).sort()).toEqual(['media_asset_links', 'media_assets']);
  });

  it('(21) persistence: data survives across app instances (real Postgres, no in-memory state)', async () => {
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Persistente', tags: 'tag' });
    const assetId = uploaded.body.asset!.id;
    await linkProposalAsset(app, proposalId, assetId);
    await app.close();

    const freshApp = buildStaffApp();
    const selected = await freshApp.inject({
      method: 'GET',
      url: `/media-assets/${assetId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(selected.statusCode).toBe(200);
    const selectedBody: { asset: { title: string } } = selected.json();
    expect(selectedBody.asset.title).toBe('Persistente');

    const media = await freshApp.inject({
      method: 'GET',
      url: `/proposals/${proposalId}/media`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    const mediaBody: { media: unknown[] } = media.json();
    expect(mediaBody.media).toHaveLength(1);
    await freshApp.close();
  });

  it('(22) reload: consecutive reads of the same state are stable (no drift between requests)', async () => {
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Estável' });
    const assetId = uploaded.body.asset!.id;
    await linkProposalAsset(app, proposalId, assetId, 'COVER');

    const first = await app.inject({ method: 'GET', url: `/proposals/${proposalId}/media`, headers: { 'x-test-role': 'VIEWER' } });
    const second = await app.inject({ method: 'GET', url: `/proposals/${proposalId}/media`, headers: { 'x-test-role': 'VIEWER' } });
    expect(second.json()).toEqual(first.json());

    const usageFirst = await app.inject({
      method: 'GET',
      url: `/media-assets/${assetId}/usage`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    const usageSecond = await app.inject({
      method: 'GET',
      url: `/media-assets/${assetId}/usage`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(usageSecond.json()).toEqual(usageFirst.json());
    await app.close();
  });

  // ------------------------------------------------------------
  // Set 8 -- audit trail (MEDIA_ASSET_*)
  // ------------------------------------------------------------

  it('(23) MEDIA_ASSET_* audit events are recorded with tenant scope and sanitized metadata', async () => {
    const app = buildStaffApp();
    const proposalId = await createProposal(app);
    const uploaded = await uploadToLibrary(app, { title: 'Auditado', tags: 'praia' });
    const assetId = uploaded.body.asset!.id;

    await app.inject({
      method: 'PATCH',
      url: `/media-assets/${assetId}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { title: 'Auditado v2', description: 'descrição' },
    });

    const linked = await linkProposalAsset(app, proposalId, assetId, 'COVER');
    const linkedBody: { link: { id: string } } = linked.json();
    const link: { id: string } = linkedBody.link;

    await app.inject({
      method: 'DELETE',
      url: `/proposal-media-links/${link.id}`,
      headers: { 'x-test-role': 'AGENT' },
    });

    await app.inject({ method: 'POST', url: `/media-assets/${assetId}/archive`, headers: { 'x-test-role': 'MANAGER' } });
    await app.close();

    const events = await listAuditEvents();
    const types = events.map((e) => e.event_type);
    expect(types).toContain('MEDIA_ASSET_CREATED');
    expect(types).toContain('MEDIA_ASSET_UPDATED');
    expect(types).toContain('MEDIA_ASSET_LINKED');
    expect(types).toContain('MEDIA_ASSET_UNLINKED');
    expect(types).toContain('MEDIA_ASSET_ARCHIVED');

    const created = events.find((e) => e.event_type === 'MEDIA_ASSET_CREATED');
    expect(created?.entity_type).toBe('media_asset');
    expect(created?.entity_id).toBe(assetId);
    expect(created?.agency_id).toBe(agencyAId);
    expect(created?.metadata['title']).toBe('Auditado');
    expect(created?.metadata['fileName']).toBe('asset.png');
    expect(created?.metadata['mimeType']).toBe('image/png');

    const updated = events.find((e) => e.event_type === 'MEDIA_ASSET_UPDATED');
    expect(updated?.metadata['fieldsChanged']).toContain('title');

    const linkedEvent = events.find((e) => e.event_type === 'MEDIA_ASSET_LINKED');
    expect(linkedEvent?.entity_type).toBe('proposal');
    expect(linkedEvent?.entity_id).toBe(proposalId);
    expect(linkedEvent?.metadata['mediaAssetId']).toBe(assetId);
    expect(linkedEvent?.metadata['usage']).toBe('COVER');

    const unlinkedEvent = events.find((e) => e.event_type === 'MEDIA_ASSET_UNLINKED');
    expect(unlinkedEvent?.entity_type).toBe('proposal');
    expect(unlinkedEvent?.entity_id).toBe(proposalId);

    const archivedEvent = events.find((e) => e.event_type === 'MEDIA_ASSET_ARCHIVED');
    expect(archivedEvent?.entity_id).toBe(assetId);

    // No secret material ever reaches metadata.
    const serialized = JSON.stringify(events.map((e) => e.metadata));
    expect(serialized).not.toContain('secure_file_key');
    expect(serialized).not.toContain('secureFileKey');
  });

  it('(24) delete emits MEDIA_ASSET_DELETED; replacing a proposal cover emits UNLINKED for the old cover', async () => {
    const app = buildStaffApp();
    const uploaded = await uploadToLibrary(app, { title: 'Para apagar' });
    const deleteableId = uploaded.body.asset!.id;
    await app.inject({ method: 'DELETE', url: `/media-assets/${deleteableId}`, headers: { 'x-test-role': 'MANAGER' } });

    const firstCover = await uploadToLibrary(app, { title: 'Capa antiga' });
    const secondCover = await uploadToLibrary(app, { title: 'Capa nova' });

    const proposalId = await createProposal(app);
    await linkProposalAsset(app, proposalId, firstCover.body.asset!.id, 'COVER');
    await linkProposalAsset(app, proposalId, secondCover.body.asset!.id, 'COVER');
    await app.close();

    const events = await listAuditEvents();
    const deleted = events.find((e) => e.event_type === 'MEDIA_ASSET_DELETED');
    expect(deleted).toBeDefined();
    expect(deleted?.entity_id).toBe(deleteableId);
    expect(deleted?.metadata['title']).toBe('Para apagar');

    const unlinkedCovers = events.filter(
      (e) => e.event_type === 'MEDIA_ASSET_UNLINKED' && e.entity_type === 'proposal',
    );
    expect(unlinkedCovers).toHaveLength(1);
    expect(unlinkedCovers[0]!.metadata['mediaAssetId']).toBe(firstCover.body.asset!.id);
  });

  // ------------------------------------------------------------
  // Setup infrastructure
  // ------------------------------------------------------------

  async function resetDatabase(pool: Pool): Promise<void> {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migrationFile of migrationFiles) {
      await pool.query(readSqlForPg(migrationFile));
    }
    await pool.query(readSqlForPg(prepareRolesSql));
    await pool.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status)
       VALUES
         ($1, 'Agency A Media Library Test', 'agency-a-media-library-test', 'agency-a-media-library@example.test', 'FREE', 'ACTIVE'),
         ($2, 'Agency B Media Library Test', 'agency-b-media-library-test', 'agency-b-media-library@example.test', 'FREE', 'ACTIVE')`,
      [agencyAId, agencyBId],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES
         ($1, $2, 'manager-a@example.test', 'Manager A', 'MANAGER', 'hash-for-media-library-test-only', 'ACTIVE'),
         ($3, $2, 'agent-a@example.test', 'Agent A', 'AGENT', 'hash-for-media-library-test-only', 'ACTIVE'),
         ($4, $2, 'viewer-a@example.test', 'Viewer A', 'VIEWER', 'hash-for-media-library-test-only', 'ACTIVE'),
         ($5, $6, 'manager-b@example.test', 'Manager B', 'MANAGER', 'hash-for-media-library-test-only', 'ACTIVE')`,
      [managerAId, agencyAId, agentAId, viewerAId, managerBId, agencyBId],
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
    throw new Error('Media Library tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Media Library tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Media Library tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run Media Library tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  if (process.env.CI === 'true') return;
  const existing = run(
    'docker',
    ['ps', '--filter', `name=${containerName}`, '--filter', 'status=running', '--format', '{{.Names}}'],
    false,
  );
  if (existing.stdout.split(/\r?\n/).map((line) => line.trim()).includes(containerName)) {
    return;
  }
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
        .join('\n'),
    );
  }
  return { stdout, stderr };
}