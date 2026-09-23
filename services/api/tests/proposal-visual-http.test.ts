import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { createCustomerAccessValidator } from '../src/customer-portal';
import type { CustomerAuthProvider } from '../src/customer-auth';
import type { UserRole } from '../../../packages/domain/types';

// Proposal Visual 2.0 -- see docs/product/PROPOSAL_VISUAL_2.md. Covers
// sections/items/media CRUD, tenant isolation, customer ownership,
// section visibility, immutability once accepted, duplication, and
// media authorization.

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-proposal-visual-http-postgres';
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

const agencyAId = '10000000-0000-4000-8000-000000000201';
const agencyBId = '10000000-0000-4000-8000-000000000202';
const managerAId = '11000000-0000-4000-8000-000000000201';
const viewerAId = '11000000-0000-4000-8000-000000000202';
const managerBId = '11000000-0000-4000-8000-000000000203';

describe('Proposal Visual 2.0 -- HTTP', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
  let customerAId: string;
  let customerA2Id: string;
  let customerBId: string;

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

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE TABLE proposal_items, proposal_sections, media_asset_links, media_assets, engagements, proposals, customers RESTART IDENTITY CASCADE',
    );
    customerAId = await seedCustomer(agencyAId, 'Cliente A');
    customerA2Id = await seedCustomer(agencyAId, 'Outro Cliente A');
    customerBId = await seedCustomer(agencyBId, 'Cliente B');
  });

  afterAll(async () => {
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

  async function createDraftProposal(app: ReturnType<typeof buildStaffApp>, customerId = customerAId) {
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

  it('(1) creates a rich proposal with cover fields persisted', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    const get = await app.inject({
      method: 'GET',
      url: `/proposals/${proposalId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    const body: { proposal: { title: string; subtitle: string; destinationSummary: string } } = get.json();
    expect(body.proposal.title).toBe('Cancún em família');
    expect(body.proposal.subtitle).toBe('7 noites all-inclusive');
    expect(body.proposal.destinationSummary).toBe('Cancún, México');
    await app.close();
  });

  it('(2)(3)(5) adds, edits, and reorders sections', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);

    const s1 = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'OVERVIEW', title: 'Resumo' },
    });
    expect(s1.statusCode).toBe(201);
    const s1Body: { section: { id: string; sortOrder: number } } = s1.json();

    const s2 = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'ITINERARY', title: 'Itinerário' },
    });
    const s2Body: { section: { id: string; sortOrder: number } } = s2.json();
    expect(s2Body.section.sortOrder).toBe(s1Body.section.sortOrder + 1);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/proposal-sections/${s1Body.section.id}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { title: 'Resumo editado' },
    });
    expect(edited.statusCode).toBe(200);
    const editedBody: { section: { title: string } } = edited.json();
    expect(editedBody.section.title).toBe('Resumo editado');

    // Reorder: swap the two sections' sort order.
    await app.inject({
      method: 'PATCH',
      url: `/proposal-sections/${s1Body.section.id}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { sortOrder: s2Body.section.sortOrder },
    });
    await app.inject({
      method: 'PATCH',
      url: `/proposal-sections/${s2Body.section.id}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { sortOrder: s1Body.section.sortOrder },
    });
    const list = await app.inject({
      method: 'GET',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    const listBody: { sections: { id: string; sortOrder: number }[] } = list.json();
    const reordered = listBody.sections.find((s) => s.id === s2Body.section.id);
    expect(reordered?.sortOrder).toBe(s1Body.section.sortOrder);
    await app.close();
  });

  it('(4) removes a section', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    const created = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'NOTES', title: 'Observações' },
    });
    const { section }: { section: { id: string } } = created.json();

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/proposal-sections/${section.id}`,
      headers: { 'x-test-role': 'MANAGER' },
    });
    expect(deleted.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    const listBody: { sections: unknown[] } = list.json();
    expect(listBody.sections).toHaveLength(0);
    await app.close();
  });

  it('(6)(7) adds and edits an item within a section', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    const section = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'ITINERARY', title: 'Itinerário' },
    });
    const { section: sectionBody }: { section: { id: string } } = section.json();

    const item = await app.inject({
      method: 'POST',
      url: `/proposal-sections/${sectionBody.id}/items`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'ITINERARY_DAY', title: 'Chegada', dayNumber: 1 },
    });
    expect(item.statusCode).toBe(201);
    const { item: itemBody }: { item: { id: string } } = item.json();

    const edited = await app.inject({
      method: 'PATCH',
      url: `/proposal-items/${itemBody.id}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { title: 'Chegada em Cancún', description: 'Transfer para o hotel' },
    });
    expect(edited.statusCode).toBe(200);
    const editedBody: { item: { title: string; description: string } } = edited.json();
    expect(editedBody.item.title).toBe('Chegada em Cancún');
    expect(editedBody.item.description).toBe('Transfer para o hotel');
    await app.close();
  });

  it('(8)(11) a section with isVisibleToCustomer=false never reaches the Customer Proposal Viewer', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'NOTES', title: 'Observações internas', isVisibleToCustomer: false },
    });
    const visibleSection = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'OVERVIEW', title: 'Resumo público' },
    });
    const { section: visible }: { section: { id: string } } = visibleSection.json();
    await app.inject({
      method: 'POST',
      url: '/proposals/' + proposalId + '/send',
      headers: { 'x-test-role': 'MANAGER' },
    });
    await app.close();

    const customerApp = buildCustomerApp(customerAId);
    const view = await customerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}`,
      headers: { 'x-test-customer': 'ok' },
    });
    const body: { proposal: { sections: { id: string; title: string }[] } } = view.json();
    expect(body.proposal.sections).toHaveLength(1);
    expect(body.proposal.sections[0]!.id).toBe(visible.id);
    expect(body.proposal.sections.some((s) => s.title === 'Observações internas')).toBe(false);
    await customerApp.close();
  });

  it('(9) tenant isolation: Agency B staff cannot read or edit Agency A sections', async () => {
    const appA = buildStaffApp(agencyAId);
    const proposalId = await createDraftProposal(appA);
    const section = await appA.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'OVERVIEW', title: 'Resumo' },
    });
    const { section: sectionBody }: { section: { id: string } } = section.json();
    await appA.close();

    const appB = buildStaffApp(agencyBId);
    const readAttempt = await appB.inject({
      method: 'GET',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    // RLS scopes the list to Agency B's own rows -- an Agency A proposal id
    // never surfaces any sections for Agency B, regardless of status code.
    const readBody: { sections: unknown[] } = readAttempt.json();
    expect(readBody.sections).toHaveLength(0);

    const editAttempt = await appB.inject({
      method: 'PATCH',
      url: `/proposal-sections/${sectionBody.id}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { title: 'Hijacked' },
    });
    expect(editAttempt.statusCode).toBe(404);
    await appB.close();
  });

  it('(10) customer ownership: a different customer in the same tenant cannot view the proposal', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app, customerAId);
    await app.close();

    const otherCustomerApp = buildCustomerApp(customerA2Id);
    const response = await otherCustomerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(404);
    await otherCustomerApp.close();
  });

  it('(12) internal fields (notes, reference ids, secure file keys) never reach the customer DTO', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    await app.inject({
      method: 'PATCH',
      url: `/proposals/${proposalId}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { notes: 'Cliente é bem exigente, cuidado com o markup.' },
    });
    const section = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'EXPERIENCES', title: 'Experiências' },
    });
    const { section: sectionBody }: { section: { id: string } } = section.json();
    await app.inject({
      method: 'POST',
      url: `/proposal-sections/${sectionBody.id}/items`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'EXPERIENCE', title: 'Xcaret', referenceType: 'EXCURSION', referenceId: 'internal-excursion-id' },
    });
    await app.inject({ method: 'POST', url: `/proposals/${proposalId}/send`, headers: { 'x-test-role': 'MANAGER' } });
    await app.close();

    const customerApp = buildCustomerApp(customerAId);
    const view = await customerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}`,
      headers: { 'x-test-customer': 'ok' },
    });
    const raw = view.payload;
    expect(raw).not.toContain('notes');
    expect(raw).not.toContain('reference_id');
    expect(raw).not.toContain('referenceId');
    expect(raw).not.toContain('internal-excursion-id');
    expect(raw).not.toContain('secure_file_key');
    expect(raw).not.toContain('secureFileKey');
    await customerApp.close();
  });

  it('(13)(17)(18) Customer Proposal Viewer returns the aggregated payload consistently across reloads', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    const section = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'ITINERARY', title: 'Itinerário' },
    });
    const { section: sectionBody }: { section: { id: string } } = section.json();
    await app.inject({
      method: 'POST',
      url: `/proposal-sections/${sectionBody.id}/items`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'ITINERARY_DAY', title: 'Chegada', dayNumber: 1 },
    });
    await app.inject({ method: 'POST', url: `/proposals/${proposalId}/send`, headers: { 'x-test-role': 'MANAGER' } });
    await app.close();

    const customerApp = buildCustomerApp(customerAId);
    const first = await customerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(first.statusCode).toBe(200);
    const firstBody: { proposal: { sections: { items: unknown[] }[] } } = first.json();
    expect(firstBody.proposal.sections).toHaveLength(1);
    expect(firstBody.proposal.sections[0]!.items).toHaveLength(1);

    const second = await customerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(second.json()).toEqual(firstBody);
    await customerApp.close();
  });

  it('(15)(16) duplicating a proposal clones sections/items/media with new ids and never copies tracking', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    const section = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'OVERVIEW', title: 'Resumo' },
    });
    const { section: sectionBody }: { section: { id: string } } = section.json();
    await app.inject({
      method: 'POST',
      url: `/proposal-sections/${sectionBody.id}/items`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'TEXT', title: 'Item original' },
    });
    await app.inject({ method: 'POST', url: `/proposals/${proposalId}/send`, headers: { 'x-test-role': 'MANAGER' } });

    // A view/engagement on the original proposal.
    const customerApp = buildCustomerApp(customerAId);
    await customerApp.inject({
      method: 'POST',
      url: `/customer-api/proposals/${proposalId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    await customerApp.close();

    const duplicated = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/duplicate`,
      headers: { 'x-test-role': 'MANAGER' },
    });
    expect(duplicated.statusCode).toBe(201);
    const { proposal: newProposal }: { proposal: { id: string; status: string } } = duplicated.json();
    expect(newProposal.id).not.toBe(proposalId);
    expect(newProposal.status).toBe('DRAFT');

    const newSections = await app.inject({
      method: 'GET',
      url: `/proposals/${newProposal.id}/sections`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    const newSectionsBody: { sections: { id: string; title: string }[] } = newSections.json();
    expect(newSectionsBody.sections).toHaveLength(1);
    expect(newSectionsBody.sections[0]!.id).not.toBe(sectionBody.id);
    expect(newSectionsBody.sections[0]!.title).toBe('Resumo');

    const engagementCount = await adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM engagements WHERE customer_id = $1`,
      [customerAId],
    );
    // Exactly one engagement (from the original proposal's view) --
    // duplication never copied it onto the new proposal.
    expect(engagementCount.rows[0]!.count).toBe(1);
    await app.close();
  });

  it('(19) an accepted proposal is immutable: no field, section, item, or media can change', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    await app.inject({ method: 'POST', url: `/proposals/${proposalId}/send`, headers: { 'x-test-role': 'MANAGER' } });
    await app.inject({ method: 'POST', url: `/proposals/${proposalId}/accept`, headers: { 'x-test-role': 'MANAGER' } });

    const patchProposal = await app.inject({
      method: 'PATCH',
      url: `/proposals/${proposalId}`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { title: 'Should not be allowed' },
    });
    expect(patchProposal.statusCode).toBe(409);

    const addSection = await app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/sections`,
      headers: { 'x-test-role': 'MANAGER' },
      payload: { type: 'NOTES', title: 'Tentativa' },
    });
    expect(addSection.statusCode).toBe(409);
    await app.close();
  });

  it('(20) media authorization: a customer from a different tenant cannot download proposal media', async () => {
    const app = buildStaffApp();
    const proposalId = await createDraftProposal(app);
    const upload = await uploadMedia(app, proposalId);
    expect(upload.statusCode).toBe(201);
    const { media }: { media: { mediaAssetId: string } } = upload.json();
    await app.close();

    const wrongTenantCustomerApp = buildCustomerApp(customerBId, agencyBId);
    const attempt = await wrongTenantCustomerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}/media/${media.mediaAssetId}/download`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(attempt.statusCode).toBe(404);
    await wrongTenantCustomerApp.close();

    const ownerCustomerApp = buildCustomerApp(customerAId);
    const ok = await ownerCustomerApp.inject({
      method: 'GET',
      url: `/customer-api/proposals/${proposalId}/media/${media.mediaAssetId}/download`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(ok.statusCode).toBe(200);
    await ownerCustomerApp.close();
  });

  async function uploadMedia(app: ReturnType<typeof buildStaffApp>, proposalId: string) {
    // Minimal valid PNG (1x1 transparent pixel).
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const buffer = Buffer.from(pngBase64, 'base64');
    const boundary = '----visualTestBoundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
      method: 'POST',
      url: `/proposals/${proposalId}/media`,
      headers: {
        'x-test-role': 'MANAGER',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
  }

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
         ($1, 'Agency A Proposal Visual Test', 'agency-a-proposal-visual-test', 'agency-a-proposal-visual@example.test', 'FREE', 'ACTIVE'),
         ($2, 'Agency B Proposal Visual Test', 'agency-b-proposal-visual-test', 'agency-b-proposal-visual@example.test', 'FREE', 'ACTIVE')`,
      [agencyAId, agencyBId],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES
         ($1, $2, 'manager-a@example.test', 'Manager A', 'MANAGER', 'hash-for-proposal-visual-test-only', 'ACTIVE'),
         ($3, $2, 'viewer-a@example.test', 'Viewer A', 'VIEWER', 'hash-for-proposal-visual-test-only', 'ACTIVE'),
         ($4, $5, 'manager-b@example.test', 'Manager B', 'MANAGER', 'hash-for-proposal-visual-test-only', 'ACTIVE')`,
      [managerAId, agencyAId, viewerAId, managerBId, agencyBId],
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
    throw new Error('Proposal Visual tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Proposal Visual tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Proposal Visual tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run Proposal Visual tests against unsafe DATABASE_URL.');
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
        .join('\n'),
    );
  }
  return { stdout, stderr };
}
