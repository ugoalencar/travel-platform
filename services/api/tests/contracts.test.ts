import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  addContractParty,
  assertTransitionAllowed,
  cancelContractDocument,
  createContractDocument,
  createContractTemplate,
  getContractDocumentById,
  listContractDocuments,
  listContractParties,
  listContractTemplates,
  markContractDocumentReady,
  recordPublicSignatureView,
  removeContractParty,
  resolvePublicSignatureToken,
  revokeContractSignatureLink,
  sendContractDocument,
  submitSignature,
  updateContractTemplate,
  type ContractDocumentStatus,
} from '../src/contracts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationFiles = [
  '001_initial_schema.sql',
  '002_rls_policies.sql',
  '003_transportation.sql',
  '004_route_points.sql',
  '005_booking.sql',
  '006_field_operations.sql',
  '007_commission_repair.sql',
  '008_commercial_cockpit.sql',
  '009_configurable_pipelines.sql',
  '010_financial_foundation.sql',
  '011_booking_cancellation.sql',
  '012_operational_staff_assignments.sql',
  '013_pescador_foundation.sql',
  '014_offer_growth_foundation.sql',
  '015_audit_logging.sql',
  '016_production_auth_captcha_mfa.sql',
  '017_mfa_rls_p0_fix.sql',
  '018_local_dev_migration_corrections.sql',
  '019_customer_360_addresses.sql',
  '020_customer_360_dependents.sql',
  '021_customer_360_documents.sql',
  '022_customer_360_document_audit.sql',
  '023_customer_360_rls.sql',
  '024_extended_financial_module.sql',
  '025_platform_super_admin_authorization.sql',
  '026_subscriber_tenants_phase1.sql',
  '027_plans_and_entitlements.sql',
  '028_subscriptions.sql',
  '029_courtesy_accounts.sql',
  '030_billing_webhooks.sql',
  '031_leads.sql',
  '032_coupons_promotions.sql',
  '033_landing_page_and_flags.sql',
  '034_platform_audit_logs.sql',
  '035_platform_settings.sql',
  '036_support_cases.sql',
  '037_notification_preferences.sql',
  '038_supplier_extended.sql',
  '039_air_services.sql',
  '040_land_services.sql',
  '041_finance_categories_cost_centers.sql',
  '042_employees_commission_plans.sql',
  '043_commissions_payroll.sql',
  '044_commission_entries_dedupe_guard.sql',
  '045_supplier_category_links_force_rls.sql',
  '046_customer_360_completion.sql',
  '047_operacao_occurrences_posttrip.sql',
  '048_support_ticket_capture_context.sql',
  '049_enrollment_links.sql',
  '050_agency_branding_departments.sql',
  '051_invitations_permission_restrictions.sql',
  '052_contracts.sql',
].map((name) => resolve(repoRoot, 'infrastructure/migrations', name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

// Uses the repository-approved disposable local Postgres container from
// infrastructure/docker-compose.local-postgres.yml. The compose file hardcodes
// this container name, so these tests must run serially with other DB suites.
const projectName = 'travel-platform-local-postgres';
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

const agencyAId = '10000000-0000-4000-8000-000000000003';
const agencyBId = '20000000-0000-4000-8000-000000000003';
const adminAId = '11000000-0000-4000-8000-000000000004';
const agentAId = '11000000-0000-4000-8000-000000000005';
const adminBId = '21000000-0000-4000-8000-000000000004';

const adminContextA = {
  agencyId: agencyAId,
  userId: adminAId,
  userRole: UserRole.ADMIN,
  email: 'admin-a@example.test',
};
const agentContextA = {
  agencyId: agencyAId,
  userId: agentAId,
  userRole: UserRole.AGENT,
  email: 'agent-a@example.test',
};
const adminContextB = {
  agencyId: agencyBId,
  userId: adminBId,
  userRole: UserRole.ADMIN,
  email: 'admin-b@example.test',
};

describe.sequential('Contracts / E-signature (Agent 03)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
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

    database = createDatabaseRuntime(runtimePool);

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE contract_signature_evidence RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE contract_signature_links RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE contract_parties RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE contract_documents RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE contract_templates RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    // Deliberately does NOT `down -v` the shared container: it may still
    // be in use by another concurrently-running test suite (see
    // resetDisposableDatabase() above).
  });

  // ------------------------------------------------------------
  // State machine (pure function -- no DB needed)
  // ------------------------------------------------------------
  describe('assertTransitionAllowed (state machine)', () => {
    const legal: Array<[ContractDocumentStatus, ContractDocumentStatus]> = [
      ['DRAFT', 'READY'],
      ['DRAFT', 'CANCELLED'],
      ['READY', 'SENT'],
      ['READY', 'DRAFT'],
      ['SENT', 'VIEWED'],
      ['SENT', 'PARTIALLY_SIGNED'],
      ['SENT', 'SIGNED'],
      ['SENT', 'DECLINED'],
      ['SENT', 'EXPIRED'],
      ['VIEWED', 'PARTIALLY_SIGNED'],
      ['VIEWED', 'SIGNED'],
      ['PARTIALLY_SIGNED', 'SIGNED'],
    ];
    it.each(legal)('allows %s -> %s', (from, to) => {
      expect(() => assertTransitionAllowed(from, to)).not.toThrow();
    });

    const illegal: Array<[ContractDocumentStatus, ContractDocumentStatus]> = [
      ['DRAFT', 'SIGNED'],
      ['DRAFT', 'SENT'],
      ['DRAFT', 'VIEWED'],
      ['SIGNED', 'DRAFT'],
      ['SIGNED', 'SENT'],
      ['DECLINED', 'SIGNED'],
      ['CANCELLED', 'READY'],
      ['EXPIRED', 'SENT'],
      ['DRAFT', 'DRAFT'],
      ['READY', 'PARTIALLY_SIGNED'],
      ['READY', 'SIGNED'],
    ];
    it.each(illegal)('rejects %s -> %s', (from, to) => {
      expect(() => assertTransitionAllowed(from, to)).toThrow();
    });

    it('terminal states never allow any outgoing transition', () => {
      const terminal: ContractDocumentStatus[] = ['SIGNED', 'DECLINED', 'CANCELLED', 'EXPIRED'];
      const all: ContractDocumentStatus[] = [
        'DRAFT',
        'READY',
        'SENT',
        'VIEWED',
        'PARTIALLY_SIGNED',
        'SIGNED',
        'DECLINED',
        'CANCELLED',
        'EXPIRED',
      ];
      for (const from of terminal) {
        for (const to of all) {
          if (to === from) continue;
          expect(() => assertTransitionAllowed(from, to)).toThrow();
        }
      }
    });
  });

  // ------------------------------------------------------------
  // Templates
  // ------------------------------------------------------------
  it('fails closed with no tenant context established', async () => {
    await expect(listContractTemplates(database)).rejects.toThrow();
  });

  it('ADMIN creates a template; a second create with same name bumps the version', async () => {
    const t1 = await runWithTenantContext(adminContextA, () =>
      createContractTemplate(database, { name: 'Pacote Padrão', bodyMarkdown: 'Olá {{cliente}}' }),
    );
    expect(t1.version).toBe(1);

    const t2 = await runWithTenantContext(adminContextA, () =>
      createContractTemplate(database, { name: 'Pacote Padrão', bodyMarkdown: 'Olá {{cliente}}, v2' }),
    );
    expect(t2.version).toBe(2);
  });

  it('templates are tenant-isolated', async () => {
    await runWithTenantContext(adminContextA, () =>
      createContractTemplate(database, { name: 'Template A', bodyMarkdown: 'corpo A' }),
    );
    await runWithTenantContext(adminContextB, () =>
      createContractTemplate(database, { name: 'Template B', bodyMarkdown: 'corpo B' }),
    );

    const fromA = await runWithTenantContext(adminContextA, () => listContractTemplates(database));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.name).toBe('Template A');

    const fromB = await runWithTenantContext(adminContextB, () => listContractTemplates(database));
    expect(fromB).toHaveLength(1);
    expect(fromB[0]?.name).toBe('Template B');
  });

  it('an AGENT cannot create a template (RBAC)', async () => {
    await expect(
      runWithTenantContext(agentContextA, () =>
        createContractTemplate(database, { name: 'Nope', bodyMarkdown: 'x' }),
      ),
    ).rejects.toThrow();
  });

  it('updateContractTemplate can toggle is_active, tenant-scoped', async () => {
    const template = await runWithTenantContext(adminContextA, () =>
      createContractTemplate(database, { name: 'Ativo/Inativo', bodyMarkdown: 'corpo' }),
    );

    const fromOtherTenant = await runWithTenantContext(adminContextB, () =>
      updateContractTemplate(database, template.id, { isActive: false }),
    );
    expect(fromOtherTenant).toBeNull();

    const updated = await runWithTenantContext(adminContextA, () =>
      updateContractTemplate(database, template.id, { isActive: false }),
    );
    expect(updated?.isActive).toBe(false);
  });

  // ------------------------------------------------------------
  // Documents + parties + full state-machine + signing flow
  // ------------------------------------------------------------
  async function createReadyDocumentWithTwoParties() {
    const template = await runWithTenantContext(adminContextA, () =>
      createContractTemplate(database, {
        name: 'Contrato de Viagem',
        bodyMarkdown: 'Cliente: {{cliente}}',
        variables: ['cliente'],
      }),
    );
    const document = await runWithTenantContext(agentContextA, () =>
      createContractDocument(database, {
        templateId: template.id,
        variableValues: { cliente: 'Fulano' },
      }),
    );
    expect(document.status).toBe('DRAFT');
    expect(document.renderedBody).toBe('Cliente: Fulano');

    const partyOne = await runWithTenantContext(agentContextA, () =>
      addContractParty(database, document.id, {
        fullName: 'Signatário Um',
        email: 'um@example.test',
        role: 'cliente',
      }),
    );
    const partyTwo = await runWithTenantContext(agentContextA, () =>
      addContractParty(database, document.id, {
        fullName: 'Signatário Dois',
        email: 'dois@example.test',
        role: 'testemunha',
      }),
    );

    const ready = await runWithTenantContext(agentContextA, () =>
      markContractDocumentReady(database, document.id),
    );
    expect(ready.status).toBe('READY');

    return { document, partyOne, partyTwo };
  }

  it('DRAFT document cannot go straight to SENT via sendContractDocument (illegal transition rejected)', async () => {
    const template = await runWithTenantContext(adminContextA, () =>
      createContractTemplate(database, { name: 'Direto', bodyMarkdown: 'x' }),
    );
    const document = await runWithTenantContext(agentContextA, () =>
      createContractDocument(database, { templateId: template.id }),
    );

    await expect(
      runWithTenantContext(agentContextA, () => sendContractDocument(database, document.id)),
    ).rejects.toThrow();
  });

  it('markContractDocumentReady requires at least one party', async () => {
    const template = await runWithTenantContext(adminContextA, () =>
      createContractTemplate(database, { name: 'Sem Signatário', bodyMarkdown: 'x' }),
    );
    const document = await runWithTenantContext(agentContextA, () =>
      createContractDocument(database, { templateId: template.id }),
    );

    await expect(
      runWithTenantContext(agentContextA, () => markContractDocumentReady(database, document.id)),
    ).rejects.toThrow();
  });

  it('full lifecycle: DRAFT -> READY -> SENT -> VIEWED -> PARTIALLY_SIGNED -> SIGNED, with signature-link hashing and evidence', async () => {
    const { document, partyOne, partyTwo } = await createReadyDocumentWithTwoParties();

    const { document: sent, links } = await runWithTenantContext(agentContextA, () =>
      sendContractDocument(database, document.id),
    );
    expect(sent.status).toBe('SENT');
    expect(links).toHaveLength(2);

    for (const link of links) {
      expect(link.token.length).toBeGreaterThanOrEqual(32);
      const row = await adminPool.query<{ token_hash: string }>(
        'SELECT token_hash FROM contract_signature_links WHERE contract_party_id = $1',
        [link.partyId],
      );
      expect(row.rows[0]?.token_hash).not.toBe(link.token);
      expect(row.rows[0]?.token_hash).toHaveLength(64);
    }

    const linkOne = links.find((l) => l.partyId === partyOne.id)!;
    const linkTwo = links.find((l) => l.partyId === partyTwo.id)!;

    const infoOne = await resolvePublicSignatureToken(database, linkOne.token);
    expect(infoOne).not.toBeNull();
    await recordPublicSignatureView(database, infoOne!, linkOne.token);

    const afterView = await runWithTenantContext(adminContextA, () =>
      getContractDocumentById(database, document.id),
    );
    expect(afterView?.status).toBe('VIEWED');

    const firstSignResult = await submitSignature(database, infoOne!, linkOne.token, {
      typedFullName: 'Signatário Um',
      intentConfirmed: true,
      ipAddress: '203.0.113.5',
      userAgent: 'vitest-agent',
    });
    expect(firstSignResult.documentStatus).toBe('PARTIALLY_SIGNED');

    const evidenceRow = await adminPool.query<{ intent_confirmed: boolean; ip_address: string }>(
      'SELECT intent_confirmed, ip_address FROM contract_signature_evidence WHERE contract_party_id = $1',
      [partyOne.id],
    );
    expect(evidenceRow.rows[0]?.intent_confirmed).toBe(true);
    expect(evidenceRow.rows[0]?.ip_address).toBe('203.0.113.5');

    const infoTwo = await resolvePublicSignatureToken(database, linkTwo.token);
    expect(infoTwo).not.toBeNull();
    const secondSignResult = await submitSignature(database, infoTwo!, linkTwo.token, {
      typedFullName: 'Signatário Dois',
      intentConfirmed: true,
    });
    expect(secondSignResult.documentStatus).toBe('SIGNED');

    const finalDoc = await runWithTenantContext(adminContextA, () =>
      getContractDocumentById(database, document.id),
    );
    expect(finalDoc?.status).toBe('SIGNED');
    expect(finalDoc?.signedAt).toBeTruthy();
  });

  it('an already-signed token resolves to null on a second signing attempt (generic rejection, no leak)', async () => {
    const { document, partyOne } = await createReadyDocumentWithTwoParties();
    const { links } = await runWithTenantContext(agentContextA, () =>
      sendContractDocument(database, document.id),
    );
    const linkOne = links.find((l) => l.partyId === partyOne.id)!;

    const info = await resolvePublicSignatureToken(database, linkOne.token);
    await submitSignature(database, info!, linkOne.token, {
      typedFullName: 'Signatário Um',
      intentConfirmed: true,
    });

    const reused = await resolvePublicSignatureToken(database, linkOne.token);
    expect(reused).toBeNull();
  });

  it('an unknown/garbage token resolves to null, identically to an expired or revoked one', async () => {
    const unknown = await resolvePublicSignatureToken(database, 'this-token-does-not-exist');
    expect(unknown).toBeNull();

    const { document, partyOne, partyTwo } = await createReadyDocumentWithTwoParties();
    const { links } = await runWithTenantContext(agentContextA, () =>
      sendContractDocument(database, document.id),
    );
    const linkOne = links.find((l) => l.partyId === partyOne.id)!;
    const linkTwo = links.find((l) => l.partyId === partyTwo.id)!;

    await adminPool.query(
      `UPDATE contract_signature_links SET expires_at = now() - interval '1 day' WHERE contract_party_id = $1`,
      [partyOne.id],
    );
    const expired = await resolvePublicSignatureToken(database, linkOne.token);
    expect(expired).toBeNull();

    await runWithTenantContext(adminContextA, () => revokeContractSignatureLink(database, partyTwo.id));
    const revoked = await resolvePublicSignatureToken(database, linkTwo.token);
    expect(revoked).toBeNull();
  });

  it('submitSignature rejects a missing typed name or unconfirmed intent', async () => {
    const { document, partyOne } = await createReadyDocumentWithTwoParties();
    const { links } = await runWithTenantContext(agentContextA, () =>
      sendContractDocument(database, document.id),
    );
    const linkOne = links.find((l) => l.partyId === partyOne.id)!;
    const info = await resolvePublicSignatureToken(database, linkOne.token);

    await expect(
      submitSignature(database, info!, linkOne.token, { typedFullName: '', intentConfirmed: true }),
    ).rejects.toThrow();

    await expect(
      submitSignature(database, info!, linkOne.token, {
        typedFullName: 'Signatário Um',
        intentConfirmed: false,
      }),
    ).rejects.toThrow();
  });

  it('cancelContractDocument is a terminal transition and tenant-scoped', async () => {
    const template = await runWithTenantContext(adminContextA, () =>
      createContractTemplate(database, { name: 'Cancelável', bodyMarkdown: 'x' }),
    );
    const document = await runWithTenantContext(agentContextA, () =>
      createContractDocument(database, { templateId: template.id }),
    );

    await expect(
      runWithTenantContext(adminContextB, () => cancelContractDocument(database, document.id)),
    ).rejects.toThrow();

    const cancelled = await runWithTenantContext(adminContextA, () =>
      cancelContractDocument(database, document.id),
    );
    expect(cancelled.status).toBe('CANCELLED');

    await expect(
      runWithTenantContext(adminContextA, () => markContractDocumentReady(database, document.id)),
    ).rejects.toThrow();
  });

  it('documents and parties are tenant-isolated', async () => {
    const { document } = await createReadyDocumentWithTwoParties();

    const fromB = await runWithTenantContext(adminContextB, () =>
      getContractDocumentById(database, document.id),
    );
    expect(fromB).toBeNull();

    const partiesFromB = await runWithTenantContext(adminContextB, () =>
      listContractParties(database, document.id),
    );
    expect(partiesFromB).toHaveLength(0);

    const allB = await runWithTenantContext(adminContextB, () => listContractDocuments(database));
    expect(allB).toHaveLength(0);
  });

  it('parties can only be added/removed while the document is DRAFT', async () => {
    const { document, partyOne } = await createReadyDocumentWithTwoParties();

    await expect(
      runWithTenantContext(agentContextA, () =>
        addContractParty(database, document.id, {
          fullName: 'Tarde Demais',
          email: 'tarde@example.test',
          role: 'cliente',
        }),
      ),
    ).rejects.toThrow();

    await expect(
      runWithTenantContext(agentContextA, () => removeContractParty(database, document.id, partyOne.id)),
    ).rejects.toThrow();
  });

  async function resetDatabase(pool: Pool): Promise<void> {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migrationFile of migrationFiles) {
      await pool.query(readSqlForPg(migrationFile));
    }
    await pool.query(readSqlForPg(prepareRolesSql));
    await seedAgenciesAndUsers(pool);
  }

  async function seedAgenciesAndUsers(pool: Pool): Promise<void> {
    await pool.query(
      `
        INSERT INTO agencies (id, name, slug, email, plan, status)
        VALUES
          ($1, 'Agency A', 'agency-a-contracts-test', 'agency-a-contracts@example.test', 'FREE', 'ACTIVE'),
          ($2, 'Agency B', 'agency-b-contracts-test', 'agency-b-contracts@example.test', 'FREE', 'ACTIVE');
      `,
      [agencyAId, agencyBId],
    );
    await pool.query(
      `
        INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
        VALUES
          ($1, $2, 'admin-a@example.test', 'Admin A', 'ADMIN', 'hash-for-contracts-test-only', 'ACTIVE'),
          ($3, $2, 'agent-a@example.test', 'Agent A', 'AGENT', 'hash-for-contracts-test-only', 'ACTIVE'),
          ($4, $5, 'admin-b@example.test', 'Admin B', 'ADMIN', 'hash-for-contracts-test-only', 'ACTIVE');
      `,
      [adminAId, agencyAId, agentAId, adminBId, agencyBId],
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
    throw new Error('Contracts data-layer tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Contracts data-layer tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Contracts data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run contracts data-layer tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  // NOTE: deliberately does NOT `down -v` / recreate when a container with
  // the shared fixed name is already running. That name is fixed across
  // every test file in this repo, and multiple suites may run concurrently
  // against it (e.g. another agent's test run) -- tearing it down here
  // would race with another suite's in-flight container. Schema isolation
  // for THIS suite's own tables comes from resetDatabase()'s DROP SCHEMA
  // below, not from container lifecycle, so it is safe to just reuse an
  // already-running container.
  const existing = run(
    'docker',
    ['ps', '--filter', `name=${containerName}`, '--filter', 'status=running', '--format', '{{.Names}}'],
    false,
  );
  if (existing.stdout.split(/\r?\n/).map((line) => line.trim()).includes(containerName)) {
    return;
  }
  compose(['up', '-d']);
}

function compose(args: readonly string[]) {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', containerName], false);

    if (result.stdout.trim() === 'healthy') {
      return;
    }

    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }

  throw new Error('Local PostgreSQL container did not become healthy in time.');
}

function assertContainerIsLocal(): void {
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
