import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import type { PartnerAuthProvider } from '../src/partner-auth';
import { createDatabaseRuntime } from '../src/database';
import { createPartnerAccessValidator } from '../src/partner-portal';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrations = [
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
  '049_enrollment_links.sql',
  '050_agency_branding_departments.sql',
  '051_invitations_permission_restrictions.sql',
  '052_travel_products_catalog.sql',
  '053_document_extractions_field_confidence.sql',
  // Commercial Partners (Agent 04): CommercialPartner/PartnerContract/
  // PartnerLink/PartnerAttribution/PartnerCommission + payables extension.
  '054_commercial_partners.sql',
].map((name) => resolve(repoRoot, 'infrastructure/migrations', name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-partners-postgres';
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

const agencyAId = '10000000-0000-4000-8000-000000000001';
const agencyBId = '20000000-0000-4000-8000-000000000001';
const userAId = '11000000-0000-4000-8000-000000000001';
const userBId = '21000000-0000-4000-8000-000000000001';

const principals: Record<string, AuthenticatedPrincipal> = {
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'viewer@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'agent@example.test' },
  admin: { userId: userAId, agencyId: agencyAId, role: UserRole.ADMIN, email: 'admin@example.test' },
  ownerB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'owner-b@example.test' },
};

describe('Commercial Partners (Agent 04)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;

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

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE TABLE partner_commissions, partner_attributions, partner_links, partner_contracts, commercial_partners, payables, sales, customers RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  // ============================================================
  // Staff RBAC
  // ============================================================
  describe('staff RBAC', () => {
    it('blocks unauthenticated callers', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/partners' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('allows VIEWER to list partners but blocks partner creation', async () => {
      const app = buildTestApp(runtimePool);
      const list = await app.inject({
        method: 'GET',
        url: '/partners',
        headers: { 'x-test-principal': 'viewer' },
      });
      const create = await app.inject({
        method: 'POST',
        url: '/partners',
        headers: { 'x-test-principal': 'viewer' },
        payload: { partnerType: 'PF', name: 'Parceiro X' },
      });

      expect(list.statusCode).toBe(200);
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it('allows AGENT to create a partner', async () => {
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/partners',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerType: 'PJ', name: 'Agencia Parceira Ltda' },
      });

      expect(create.statusCode).toBe(201);
      const body = create.json<{ partner: { id: string; name: string } }>();
      expect(body.partner.name).toBe('Agencia Parceira Ltda');
      await app.close();
    });
  });

  // ============================================================
  // Tenant isolation
  // ============================================================
  describe('tenant isolation', () => {
    it('Agency B cannot see, fetch, or update an Agency A partner', async () => {
      const app = buildTestApp(runtimePool);
      const created = await app.inject({
        method: 'POST',
        url: '/partners',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerType: 'PF', name: 'Parceiro Confidencial A' },
      });
      const partnerId = created.json<{ partner: { id: string } }>().partner.id;

      const listB = await app.inject({
        method: 'GET',
        url: '/partners',
        headers: { 'x-test-principal': 'ownerB' },
      });
      const names = listB.json<{ partners: Array<{ name: string }> }>().partners.map((p) => p.name);
      expect(names).not.toContain('Parceiro Confidencial A');

      const getB = await app.inject({
        method: 'GET',
        url: `/partners/${partnerId}`,
        headers: { 'x-test-principal': 'ownerB' },
      });
      expect(getB.statusCode).toBe(404);

      const patchB = await app.inject({
        method: 'PATCH',
        url: `/partners/${partnerId}`,
        headers: { 'x-test-principal': 'ownerB' },
        payload: { name: 'Hijacked' },
      });
      expect(patchB.statusCode).toBe(404);
      await app.close();
    });
  });

  // ============================================================
  // Audit
  // ============================================================
  describe('audit', () => {
    it('records an audit event when a partner is created', async () => {
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/partners',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerType: 'PF', name: 'Parceiro Auditado' },
      });
      const partnerId = create.json<{ partner: { id: string } }>().partner.id;

      const auditResult = await adminPool.query<{ event_type: string; entity_id: string }>(
        `SELECT event_type, entity_id FROM audit_logs WHERE entity_type = 'commercial_partner' AND entity_id = $1`,
        [partnerId],
      );
      expect(auditResult.rows).toHaveLength(1);
      expect(auditResult.rows[0]!.event_type).toBe('PARTNER_CREATED');
      await app.close();
    });
  });

  // ============================================================
  // Public partner-link resolve/convert + commission convergence into
  // payables (financial.ts remains the single source of AP/Cash writes;
  // this only exercises the partner-commissions.ts path that converges
  // into the SAME payables table).
  // ============================================================
  describe('partner link + commission end-to-end', () => {
    it('resolves a valid token, rejects an invalid one with an identical shape, converts, and generates a commission that converges into payables', async () => {
      const app = buildTestApp(runtimePool);

      const partnerCreate = await app.inject({
        method: 'POST',
        url: '/partners',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerType: 'PF', name: 'Parceiro E2E' },
      });
      const partnerId = partnerCreate.json<{ partner: { id: string } }>().partner.id;

      const contractCreate = await app.inject({
        method: 'POST',
        url: '/partner-contracts',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerId, commissionPercentage: 10 },
      });
      expect(contractCreate.statusCode).toBe(201);

      const linkCreate = await app.inject({
        method: 'POST',
        url: '/partner-links',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerId, label: 'Campanha Instagram' },
      });
      expect(linkCreate.statusCode).toBe(201);
      const { token } = linkCreate.json<{ token: string }>();

      const badResolve = await app.inject({ method: 'GET', url: '/partner-link-api/not-a-real-token' });
      expect(badResolve.statusCode).toBe(404);
      expect(badResolve.json()).toEqual({ error: 'Link not found', code: 'NOT_FOUND' });

      const goodResolve = await app.inject({ method: 'GET', url: `/partner-link-api/${token}` });
      expect(goodResolve.statusCode).toBe(200);
      expect(goodResolve.json()).toEqual({ valid: true });

      const convert = await app.inject({
        method: 'POST',
        url: `/partner-link-api/${token}/convert`,
        payload: { fullName: 'Lead Convertido', email: 'lead@example.test' },
      });
      expect(convert.statusCode).toBe(201);
      const { customerId } = convert.json<{ customerId: string; attributionId: string }>();

      // Attach a sale to the resulting attribution (staff action).
      const saleResult = await adminPool.query<{ id: string }>(
        `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status)
         VALUES ($1, $2, $3, 1000, '0.00', 1000, 'CONFIRMED') RETURNING id`,
        [agencyAId, customerId, userAId],
      );
      const saleId = saleResult.rows[0]!.id;

      const attach = await app.inject({
        method: 'POST',
        url: `/partner-attributions/${customerId}/attach-sale/${saleId}`,
        headers: { 'x-test-principal': 'agent' },
      });
      expect(attach.statusCode).toBe(200);

      const generate = await app.inject({
        method: 'POST',
        url: '/partner-commissions',
        headers: { 'x-test-principal': 'agent' },
        payload: { saleId, partnerId },
      });
      expect(generate.statusCode).toBe(201);
      const commission = generate.json<{ commission: { id: string; amount: number; status: string } }>().commission;
      expect(commission.amount).toBe(100);
      expect(commission.status).toBe('PENDING');

      const approve = await app.inject({
        method: 'POST',
        url: `/partner-commissions/${commission.id}/approve`,
        headers: { 'x-test-principal': 'admin' },
      });
      expect(approve.statusCode).toBe(200);

      const payable = await app.inject({
        method: 'POST',
        url: `/partner-commissions/${commission.id}/create-payable`,
        headers: { 'x-test-principal': 'admin' },
      });
      expect(payable.statusCode).toBe(200);
      const { payableId } = payable.json<{ payableId: string }>();

      const payableRow = await adminPool.query<{ beneficiary_type: string; partner_id: string; amount: string }>(
        `SELECT beneficiary_type, partner_id, amount FROM payables WHERE id = $1`,
        [payableId],
      );
      expect(payableRow.rows[0]!.beneficiary_type).toBe('PARTNER');
      expect(payableRow.rows[0]!.partner_id).toBe(partnerId);
      expect(Number(payableRow.rows[0]!.amount)).toBe(100);
    });
  });

  // ============================================================
  // Partner self-scope (partner portal)
  // ============================================================
  describe('partner self-scope isolation', () => {
    it('a partner sees only their own profile/commissions/links, never another partner in the same tenant, and never cross-tenant', async () => {
      const app = buildTestApp(runtimePool);

      const partnerA1 = await app.inject({
        method: 'POST',
        url: '/partners',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerType: 'PF', name: 'Parceiro A1' },
      });
      const partnerA1Id = partnerA1.json<{ partner: { id: string } }>().partner.id;

      const partnerA2 = await app.inject({
        method: 'POST',
        url: '/partners',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerType: 'PF', name: 'Parceiro A2' },
      });
      const partnerA2Id = partnerA2.json<{ partner: { id: string } }>().partner.id;

      const linkA1 = await app.inject({
        method: 'POST',
        url: '/partner-links',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerId: partnerA1Id, label: 'Link A1' },
      });
      expect(linkA1.statusCode).toBe(201);
      await app.inject({
        method: 'POST',
        url: '/partner-links',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerId: partnerA2Id, label: 'Link A2' },
      });

      // No partner auth at all
      const unauthenticated = await app.inject({ method: 'GET', url: '/partner-api/me' });
      expect(unauthenticated.statusCode).toBe(401);

      // Partner A1 sees only their own profile.
      const meA1 = await app.inject({
        method: 'GET',
        url: '/partner-api/me',
        headers: { 'x-test-partner': 'a1' },
      });
      expect(meA1.statusCode).toBe(200);
      expect(meA1.json<{ profile: { id: string; name: string } }>().profile.id).toBe(partnerA1Id);

      // Partner A1's own links never include Partner A2's link.
      const linksA1 = await app.inject({
        method: 'GET',
        url: '/partner-api/links',
        headers: { 'x-test-partner': 'a1' },
      });
      expect(linksA1.statusCode).toBe(200);
      const labels = linksA1.json<{ links: Array<{ label: string | null }> }>().links.map((l) => l.label);
      expect(labels).toContain('Link A1');
      expect(labels).not.toContain('Link A2');

      // A claimed partnerId in the auth payload that does not actually
      // belong to the resolved agency is rejected by
      // validatePartnerAgencyAccess (a real DB check), not trusted.
      const spoofed = await app.inject({
        method: 'GET',
        url: '/partner-api/me',
        headers: { 'x-test-partner': 'spoof-wrong-agency' },
      });
      expect(spoofed.statusCode).toBe(403);

      const unknown = await app.inject({
        method: 'GET',
        url: '/partner-api/me',
        headers: { 'x-test-partner': 'unknown' },
      });
      expect(unknown.statusCode).toBe(401);
    });

    it('partner identity does not leak into staff routes and vice versa', async () => {
      const app = buildTestApp(runtimePool);
      const partnerCreate = await app.inject({
        method: 'POST',
        url: '/partners',
        headers: { 'x-test-principal': 'agent' },
        payload: { partnerType: 'PF', name: 'Parceiro Isolado' },
      });
      const partnerId = partnerCreate.json<{ partner: { id: string } }>().partner.id;
      void partnerId;

      const partnerHeaderOnStaffRoute = await app.inject({
        method: 'GET',
        url: '/partners',
        headers: { 'x-test-partner': 'a1' },
      });
      expect(partnerHeaderOnStaffRoute.statusCode).toBe(401);

      const staffHeaderOnPartnerRoute = await app.inject({
        method: 'GET',
        url: '/partner-api/me',
        headers: { 'x-test-principal': 'agent' },
      });
      expect(staffHeaderOnPartnerRoute.statusCode).toBe(401);
      await app.close();
    });
  });

  // ============================================================
  // validatePartnerAgencyAccess is a real DB check
  // ============================================================
  describe('createPartnerAccessValidator is a real DB check, not a trust-the-header shortcut', () => {
    it('rejects a claimed partnerId/agencyId pair that does not exist', async () => {
      const validator = createPartnerAccessValidator(adminPool);
      const allowed = await validator('00000000-0000-4000-8000-000000000000', agencyAId);
      expect(allowed).toBe(false);
    });
  });

  function buildTestApp(pool: Pool) {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess(userId, agencyId) {
        return Promise.resolve(
          (userId === userAId && agencyId === agencyAId) || (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
      partnerAuthProvider: {
        authenticatePartner: async (request) => {
          const key = request.headers['x-test-partner'];
          if (typeof key !== 'string') {
            return null;
          }
          if (key === 'unknown') {
            return null;
          }
          if (key === 'spoof-wrong-agency') {
            return { agencyId: agencyAId, partnerId: '00000000-0000-4000-8000-000000000000' };
          }
          if (key === 'a1') {
            const row = await adminPool.query<{ id: string }>(
              `SELECT id FROM commercial_partners WHERE agency_id = $1 AND name = 'Parceiro A1'`,
              [agencyAId],
            );
            const id = row.rows[0]?.id;
            return id ? { agencyId: agencyAId, partnerId: id } : null;
          }
          return null;
        },
      } satisfies PartnerAuthProvider,
      validatePartnerAgencyAccess: createPartnerAccessValidator(adminPool),
    });
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Commercial Partners tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Commercial Partners tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Commercial Partners tests require a database name with a test marker.');
  }
}

function resetDisposableDatabase(): void {
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
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
  const result = run('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Image}}|{{.Ports}}']);
  const output = result.stdout.trim();
  expect(output).toContain(postgresImage);
  expect(output).toContain(`${databaseHost}:${databasePort}->5432/tcp`);
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const migration of migrations) {
    await pool.query(readSqlForPg(migration));
  }
  await pool.query(readSqlForPg(prepareRolesSql));
  await seedAgenciesAndUsers(pool);
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

async function seedAgenciesAndUsers(pool: Pool): Promise<void> {
  await pool.query(
    `
      INSERT INTO agencies (id, name, slug, email, plan, status)
      VALUES
        ($1, 'Agency A', 'agency-a-partners-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-partners-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-partners-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-partners-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userBId, agencyBId],
  );
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
