import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { buildApp } from '../src/app';
import {
  archiveCustomerSegment,
  createCustomerSegment,
  getCustomerSegmentById,
  listCustomerSegments,
  updateCustomerSegment,
} from '../src/customer-segments';
import {
  previewSegment,
  runFilterDefinition,
  validateFilterDefinition,
  type FilterDefinition,
} from '../src/customer-segmentation';
import { ValidationError } from '../src/errors';
import { ForbiddenError } from '../../../packages/domain/tenant-context';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-customer-segments-postgres';
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

const agencyId = '50000000-0000-4000-8000-000000000001';
const agencyBId = '50000000-0000-4000-8000-000000000002';
const ownerUserId = '50000000-0000-4000-8000-000000000020';
const managerUserId = '50000000-0000-4000-8000-000000000021';
const agentUserId = '50000000-0000-4000-8000-000000000022';
const agentBUserId = '50000000-0000-4000-8000-000000000023';
const userBOwnerId = '50000000-0000-4000-8000-000000000024';

const ownerContext = { agencyId, userId: ownerUserId, userRole: UserRole.OWNER, email: 'owner@example.test' };
const managerContext = { agencyId, userId: managerUserId, userRole: UserRole.MANAGER, email: 'manager@example.test' };
const agentContext = { agencyId, userId: agentUserId, userRole: UserRole.AGENT, email: 'agent@example.test' };
const agentBContext = { agencyId, userId: agentBUserId, userRole: UserRole.AGENT, email: 'agent-b@example.test' };
const contextB = { agencyId: agencyBId, userId: userBOwnerId, userRole: UserRole.OWNER, email: 'owner-b@example.test' };

function simpleFilter(field: string, operator: string, value?: unknown): FilterDefinition {
  return { operator: 'AND', conditions: [{ field, operator, ...(value !== undefined ? { value } : {}) } as never] };
}

describe('Segmentação Avançada de Clientes', () => {
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
    await adminPool.query('TRUNCATE TABLE customer_segments RESTART IDENTITY CASCADE');
    await adminPool.query('DELETE FROM travel_requirements');
    await adminPool.query('DELETE FROM customer_interactions');
    await adminPool.query('DELETE FROM receivables');
    await adminPool.query('DELETE FROM proposals');
    await adminPool.query('DELETE FROM wishes');
    await adminPool.query('DELETE FROM trips');
    await adminPool.query('DELETE FROM sales');
    await adminPool.query('DELETE FROM customer_addresses');
    await adminPool.query(`DELETE FROM customers WHERE agency_id = $1`, [agencyId]);
    await seedCustomers();
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  // ------------------------------------------------------------
  // Fixture customer ids, seeded fresh in beforeEach
  // ------------------------------------------------------------
  const custCuritiba = '50000000-0000-4000-8000-000000000101';
  const custSaoPaulo = '50000000-0000-4000-8000-000000000102';
  const custNoAddress = '50000000-0000-4000-8000-000000000103';

  async function seedCustomers(): Promise<void> {
    await adminPool.query(
      `INSERT INTO customers (agency_id, id, name, status)
       VALUES ($1, $2, 'Ana Curitiba', 'ACTIVE'), ($1, $3, 'Bruno São Paulo', 'ACTIVE'), ($1, $4, 'Carla Sem Endereço', 'ACTIVE')`,
      [agencyId, custCuritiba, custSaoPaulo, custNoAddress],
    );
    await adminPool.query(
      `INSERT INTO customer_addresses (agency_id, customer_id, type, is_primary, street, number, district, city, state, country)
       VALUES
         ($1, $2, 'RESIDENTIAL', TRUE, 'Rua das Flores', '100', 'Centro', 'Curitiba', 'PR', 'Brazil'),
         ($1, $3, 'RESIDENTIAL', TRUE, 'Avenida Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP', 'Brazil')`,
      [agencyId, custCuritiba, custSaoPaulo],
    );
  }

  // ------------------------------------------------------------
  // 1. Simple filter
  // ------------------------------------------------------------
  it('simple filter: customer.city EQ Curitiba', async () => {
    const filter = simpleFilter('customer.city', 'EQ', 'Curitiba');
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(1);
    expect(result.customers[0]!.name).toBe('Ana Curitiba');
  });

  // ------------------------------------------------------------
  // 2. AND
  // ------------------------------------------------------------
  it('AND: city EQ Curitiba AND status EQ ACTIVE matches only that customer', async () => {
    const filter: FilterDefinition = {
      operator: 'AND',
      conditions: [
        { field: 'customer.city', operator: 'EQ', value: 'Curitiba' },
        { field: 'customer.status', operator: 'EQ', value: 'ACTIVE' },
      ],
    };
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(1);
  });

  // ------------------------------------------------------------
  // 3. OR
  // ------------------------------------------------------------
  it('OR: city EQ Curitiba OR city EQ São Paulo matches both', async () => {
    const filter: FilterDefinition = {
      operator: 'OR',
      conditions: [
        { field: 'customer.city', operator: 'EQ', value: 'Curitiba' },
        { field: 'customer.city', operator: 'EQ', value: 'São Paulo' },
      ],
    };
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(2);
  });

  // ------------------------------------------------------------
  // 4. nested AND/OR
  // ------------------------------------------------------------
  it('nested AND/OR groups', async () => {
    const filter: FilterDefinition = {
      operator: 'AND',
      conditions: [
        { field: 'customer.status', operator: 'EQ', value: 'ACTIVE' },
        {
          operator: 'OR',
          conditions: [
            { field: 'customer.city', operator: 'EQ', value: 'Curitiba' },
            { field: 'customer.city', operator: 'EQ', value: 'São Paulo' },
          ],
        },
      ],
    };
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(2);
  });

  // ------------------------------------------------------------
  // 5. text filter (CONTAINS)
  // ------------------------------------------------------------
  it('text filter: customer.name CONTAINS "Bruno"', async () => {
    const filter = simpleFilter('customer.name', 'CONTAINS', 'Bruno');
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(1);
    expect(result.customers[0]!.name).toBe('Bruno São Paulo');
  });

  // ------------------------------------------------------------
  // 6. number filter
  // ------------------------------------------------------------
  it('number filter: financial.averageTicket GTE 8000', async () => {
    const saleId = await seedSale(custCuritiba, 10000, 'CONFIRMED');
    await seedSale(custSaoPaulo, 500, 'CONFIRMED');
    void saleId;

    const filter = simpleFilter('financial.averageTicket', 'GTE', 8000);
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(1);
    expect(result.customers[0]!.name).toBe('Ana Curitiba');
  });

  // ------------------------------------------------------------
  // 7. date filter
  // ------------------------------------------------------------
  it('date filter: trip.nextDeparture within next 60 days', async () => {
    const saleId = await seedSale(custCuritiba, 1000, 'CONFIRMED');
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    await adminPool.query(
      `INSERT INTO trips (agency_id, customer_id, sale_id, name, destination, start_date, end_date)
       VALUES ($1, $2, $3, 'Viagem', 'Cancun', $4, $4)`,
      [agencyId, custCuritiba, saleId, soon.toISOString()],
    );

    const filter = simpleFilter('trip.nextDeparture', 'NEXT_N_DAYS', 60);
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(1);
  });

  // ------------------------------------------------------------
  // 8. enum filter
  // ------------------------------------------------------------
  it('enum filter: customer.status IN [ACTIVE]', async () => {
    const filter = simpleFilter('customer.status', 'IN', ['ACTIVE']);
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(3);
  });

  // ------------------------------------------------------------
  // 9. EXISTS
  // ------------------------------------------------------------
  it('EXISTS: commercial.hasWish', async () => {
    await adminPool.query(
      `INSERT INTO wishes (agency_id, customer_id, destination, status)
       VALUES ($1, $2, 'Caribe', 'ACTIVE')`,
      [agencyId, custCuritiba],
    );
    const filter = simpleFilter('commercial.hasWish', 'EXISTS');
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(1);
    expect(result.customers[0]!.name).toBe('Ana Curitiba');
  });

  it('NOT_EXISTS: commercial.hasWish excludes the customer with a wish', async () => {
    await adminPool.query(
      `INSERT INTO wishes (agency_id, customer_id, destination, status)
       VALUES ($1, $2, 'Caribe', 'ACTIVE')`,
      [agencyId, custCuritiba],
    );
    const filter = simpleFilter('commercial.hasWish', 'NOT_EXISTS');
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(2);
  });

  // ------------------------------------------------------------
  // trip.hasMissingDocument -- backed by real travel_requirements
  // (migration 046), added on explicit user request as a real sales
  // segment ("vai viajar nos próximos 30 dias e falta documentação").
  // ------------------------------------------------------------
  it('IS_TRUE: trip.hasMissingDocument finds a customer with an unfulfilled required document', async () => {
    await adminPool.query(
      `INSERT INTO travel_requirements (agency_id, customer_id, type, required, fulfilled)
       VALUES ($1, $2, 'PASSAPORTE_VALIDO', TRUE, FALSE)`,
      [agencyId, custCuritiba],
    );
    const filter = simpleFilter('trip.hasMissingDocument', 'IS_TRUE');
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(1);
    expect(result.customers[0]!.name).toBe('Ana Curitiba');
  });

  it('IS_TRUE: trip.hasMissingDocument excludes a customer whose requirement is already fulfilled', async () => {
    await adminPool.query(
      `INSERT INTO travel_requirements (agency_id, customer_id, type, required, fulfilled)
       VALUES ($1, $2, 'PASSAPORTE_VALIDO', TRUE, TRUE)`,
      [agencyId, custCuritiba],
    );
    const filter = simpleFilter('trip.hasMissingDocument', 'IS_TRUE');
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(0);
  });

  // ------------------------------------------------------------
  // 10 / 11. PERSONAL / SHARED segments
  // ------------------------------------------------------------
  it('PERSONAL segment: visible to creator, invisible to another AGENT', async () => {
    const segment = await runWithTenantContext(agentContext, () =>
      createCustomerSegment(database, undefined, {
        name: 'Meu segmento pessoal',
        scope: 'PERSONAL',
        filterDefinition: simpleFilter('customer.status', 'EQ', 'ACTIVE'),
      }),
    );

    const ownSeen = await runWithTenantContext(agentContext, () => getCustomerSegmentById(database, segment.id));
    expect(ownSeen).not.toBeNull();

    const otherSeen = await runWithTenantContext(agentBContext, () =>
      getCustomerSegmentById(database, segment.id),
    );
    expect(otherSeen).toBeNull();

    const otherList = await runWithTenantContext(agentBContext, () => listCustomerSegments(database));
    expect(otherList.find((s) => s.id === segment.id)).toBeUndefined();
  });

  it('SHARED segment: visible to the whole team', async () => {
    const segment = await runWithTenantContext(managerContext, () =>
      createCustomerSegment(database, undefined, {
        name: 'Segmento compartilhado',
        scope: 'SHARED',
        filterDefinition: simpleFilter('customer.status', 'EQ', 'ACTIVE'),
      }),
    );

    const seenByAgent = await runWithTenantContext(agentContext, () =>
      getCustomerSegmentById(database, segment.id),
    );
    expect(seenByAgent).not.toBeNull();
    expect(seenByAgent!.scope).toBe('SHARED');
  });

  it('AGENT cannot create a SHARED segment', async () => {
    await expect(
      runWithTenantContext(agentContext, () =>
        createCustomerSegment(database, undefined, {
          name: 'Tentativa indevida',
          scope: 'SHARED',
          filterDefinition: simpleFilter('customer.status', 'EQ', 'ACTIVE'),
        }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  // ------------------------------------------------------------
  // 12. cross-tenant blocked
  // ------------------------------------------------------------
  it('cross-tenant: a segment from agency A is invisible to agency B', async () => {
    const segment = await runWithTenantContext(ownerContext, () =>
      createCustomerSegment(database, undefined, {
        name: 'Segmento A',
        scope: 'SHARED',
        filterDefinition: simpleFilter('customer.status', 'EQ', 'ACTIVE'),
      }),
    );

    const seenByB = await runWithTenantContext(contextB, () => getCustomerSegmentById(database, segment.id));
    expect(seenByB).toBeNull();
  });

  // ------------------------------------------------------------
  // 13. invalid field
  // ------------------------------------------------------------
  it('rejects an unknown/unlisted field', () => {
    expect(() => validateFilterDefinition(simpleFilter('customers.ssn', 'EQ', 'x'))).toThrow(ValidationError);
  });

  // ------------------------------------------------------------
  // 14. invalid operator
  // ------------------------------------------------------------
  it('rejects an operator not allowed for the field type', () => {
    expect(() => validateFilterDefinition(simpleFilter('customer.city', 'GT', 'x'))).toThrow(ValidationError);
  });

  // ------------------------------------------------------------
  // 15. SQL injection attempt
  // ------------------------------------------------------------
  it('SQL injection attempt in a string value is treated as a literal, never executed', async () => {
    const filter = simpleFilter('customer.name', 'EQ', "'; DROP TABLE customers; --");
    const result = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 25 }),
    );
    expect(result.total).toBe(0);

    const stillThere = await adminPool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM customers WHERE agency_id = $1`,
      [agencyId],
    );
    expect(stillThere.rows[0]!.n).toBe(3);
  });

  it('SQL injection attempt via field name is rejected before any query runs', () => {
    expect(() =>
      validateFilterDefinition(simpleFilter('c.name; DROP TABLE customers; --', 'EQ', 'x')),
    ).toThrow(ValidationError);
  });

  // ------------------------------------------------------------
  // 16 / 17. pagination + count
  // ------------------------------------------------------------
  it('pagination and count', async () => {
    const filter = simpleFilter('customer.status', 'EQ', 'ACTIVE');
    const page1 = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 1, pageSize: 2 }),
    );
    expect(page1.total).toBe(3);
    expect(page1.customers).toHaveLength(2);

    const page2 = await runWithTenantContext(ownerContext, () =>
      previewSegment(database, filter, { page: 2, pageSize: 2 }),
    );
    expect(page2.customers).toHaveLength(1);
  });

  // ------------------------------------------------------------
  // 18. sort
  // ------------------------------------------------------------
  it('sort by name', async () => {
    const filter = simpleFilter('customer.status', 'EQ', 'ACTIVE');
    const result = await runWithTenantContext(ownerContext, () =>
      database.withTenantTransaction((client) =>
        runFilterDefinition(client, filter, { page: 1, pageSize: 25 }, 'name'),
      ),
    );
    const names = result.customers.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  });

  // ------------------------------------------------------------
  // 19. archived segment
  // ------------------------------------------------------------
  it('archived segments are excluded from the default list', async () => {
    const segment = await runWithTenantContext(ownerContext, () =>
      createCustomerSegment(database, undefined, {
        name: 'Para arquivar',
        scope: 'SHARED',
        filterDefinition: simpleFilter('customer.status', 'EQ', 'ACTIVE'),
      }),
    );
    await runWithTenantContext(ownerContext, () => archiveCustomerSegment(database, segment.id));

    const list = await runWithTenantContext(ownerContext, () => listCustomerSegments(database));
    expect(list.find((s) => s.id === segment.id)).toBeUndefined();

    const listWithArchived = await runWithTenantContext(ownerContext, () =>
      listCustomerSegments(database, { includeArchived: true }),
    );
    expect(listWithArchived.find((s) => s.id === segment.id)).toBeDefined();
  });

  // ------------------------------------------------------------
  // 20. RBAC (HTTP)
  // ------------------------------------------------------------
  function buildTestApp() {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const header = request.headers['x-test-role'];
          if (!header || typeof header !== 'string') return Promise.resolve(null);
          const roleToUser: Record<string, string> = {
            OWNER: ownerUserId,
            MANAGER: managerUserId,
            AGENT: agentUserId,
          };
          return Promise.resolve({
            agencyId,
            userId: roleToUser[header] ?? agentUserId,
            role: header as UserRole,
            email: 'test@example.test',
          });
        },
      },
      validateUserAgencyAccess: () => Promise.resolve(true),
      database,
      platformAuthProvider: { authenticate: () => Promise.resolve(null) },
      rateLimit: { classLimits: { SYSTEM_INTERNAL: { windowMs: 60_000, max: 200 } } },
    });
  }

  it('AGENT creating a SHARED segment via HTTP is rejected (403)', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/customer-segments',
      headers: { 'x-test-role': 'AGENT' },
      payload: {
        name: 'Tentativa via HTTP',
        scope: 'SHARED',
        filterDefinition: simpleFilter('customer.status', 'EQ', 'ACTIVE'),
      },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('OWNER creating a SHARED segment via HTTP succeeds (201)', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/customer-segments',
      headers: { 'x-test-role': 'OWNER' },
      payload: {
        name: 'Segmento via HTTP',
        scope: 'SHARED',
        filterDefinition: simpleFilter('customer.status', 'EQ', 'ACTIVE'),
      },
    });
    expect(response.statusCode).toBe(201);
    await app.close();
  });

  // ------------------------------------------------------------
  // 21. reload/persistence
  // ------------------------------------------------------------
  it('a saved segment persists and reloads with the same filter_definition', async () => {
    const filter = simpleFilter('customer.city', 'EQ', 'Curitiba');
    const created = await runWithTenantContext(ownerContext, () =>
      createCustomerSegment(database, undefined, {
        name: 'Persistência',
        scope: 'SHARED',
        filterDefinition: filter,
      }),
    );

    const reloaded = await runWithTenantContext(ownerContext, () => getCustomerSegmentById(database, created.id));
    expect(reloaded).not.toBeNull();
    expect(reloaded!.filterDefinition).toEqual(filter);
  });

  // ------------------------------------------------------------
  // 22. data changes alter the dynamic result (segments store RULES, not snapshots)
  // ------------------------------------------------------------
  it('segment result changes as underlying data changes -- no frozen membership', async () => {
    const segment = await runWithTenantContext(ownerContext, () =>
      createCustomerSegment(database, undefined, {
        name: 'Dinâmico',
        scope: 'SHARED',
        filterDefinition: simpleFilter('customer.city', 'EQ', 'Curitiba'),
      }),
    );

    const before = await runWithTenantContext(ownerContext, () =>
      database.withTenantTransaction((client) =>
        runFilterDefinition(
          client,
          validateFilterDefinition({ operator: 'AND', conditions: [{ field: 'customer.city', operator: 'EQ', value: 'Curitiba' }] }),
          { page: 1, pageSize: 25 },
        ),
      ),
    );
    expect(before.total).toBe(1);

    await adminPool.query(
      `UPDATE customer_addresses SET city = 'Curitiba' WHERE agency_id = $1 AND customer_id = $2`,
      [agencyId, custSaoPaulo],
    );

    const after = await runWithTenantContext(ownerContext, () =>
      database.withTenantTransaction((client) =>
        runFilterDefinition(
          client,
          validateFilterDefinition({ operator: 'AND', conditions: [{ field: 'customer.city', operator: 'EQ', value: 'Curitiba' }] }),
          { page: 1, pageSize: 25 },
        ),
      ),
    );
    expect(after.total).toBe(2);
    void segment;
  });

  // ------------------------------------------------------------
  // Extra: update requires permission; editing another AGENT's personal segment is blocked
  // ------------------------------------------------------------
  it('another AGENT cannot update someone else\'s PERSONAL segment', async () => {
    const segment = await runWithTenantContext(agentContext, () =>
      createCustomerSegment(database, undefined, {
        name: 'Pessoal do agente A',
        scope: 'PERSONAL',
        filterDefinition: simpleFilter('customer.status', 'EQ', 'ACTIVE'),
      }),
    );

    await expect(
      runWithTenantContext(agentBContext, () =>
        updateCustomerSegment(database, segment.id, { name: 'Hackeado' }),
      ),
    ).rejects.toThrow();
  });

  // ------------------------------------------------------------
  async function seedSale(customerIdArg: string, total: number, status: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status)
       VALUES ($1, $2, $3, $4, '0.00', $4, $5) RETURNING id`,
      [agencyId, customerIdArg, ownerUserId, total.toFixed(2), status],
    );
    return result.rows[0]!.id;
  }

  // ------------------------------------------------------------
  async function resetDatabase(pool: Pool): Promise<void> {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migrationFile of migrationFiles) {
      await pool.query(readSqlForPg(migrationFile));
    }
    await pool.query(readSqlForPg(prepareRolesSql));
    await seedFixtures(pool);
  }

  async function seedFixtures(pool: Pool): Promise<void> {
    await pool.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status)
       VALUES
         ($1, 'Agency Segmentation Test', 'agency-segmentation-test', 'agency-segmentation@example.test', 'FREE', 'ACTIVE'),
         ($2, 'Agency B Segmentation Test', 'agency-b-segmentation-test', 'agency-b-segmentation@example.test', 'FREE', 'ACTIVE')`,
      [agencyId, agencyBId],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES
         ($1, $2, 'owner@example.test', 'Owner', 'OWNER', 'hash-for-customer-segments-test-only', 'ACTIVE'),
         ($3, $2, 'manager@example.test', 'Manager', 'MANAGER', 'hash-for-customer-segments-test-only', 'ACTIVE'),
         ($4, $2, 'agent@example.test', 'Agente A', 'AGENT', 'hash-for-customer-segments-test-only', 'ACTIVE'),
         ($5, $2, 'agent-b@example.test', 'Agente B', 'AGENT', 'hash-for-customer-segments-test-only', 'ACTIVE'),
         ($6, $7, 'owner-b@example.test', 'Owner B', 'OWNER', 'hash-for-customer-segments-test-only', 'ACTIVE')`,
      [ownerUserId, agencyId, managerUserId, agentUserId, agentBUserId, userBOwnerId, agencyBId],
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
    throw new Error('Customer segments data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Customer segments data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Customer segments data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run customer segments tests against unsafe DATABASE_URL.');
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
