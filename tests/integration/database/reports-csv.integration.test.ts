import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

// Own container/port so this suite never touches the shared Onda B database,
// the demo (55436/4010) or the presentation database (55438).
vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55621';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-csv-b2-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-csv-b2-int';
});

import { buildApp } from '../../../services/api/src/app';
import type { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../../../services/api/src/auth';
import { createDatabaseRuntime } from '../../../services/api/src/database';
import { startDisposableDb, type DisposableDb } from '../../../services/api/tests/helpers/disposable-postgres';

const MIGRATIONS = [
  '001_initial_schema.sql',
  '002_rls_policies.sql',
  '003_transportation.sql',
  '004_route_points.sql',
  '005_booking.sql',
  '006_field_operations.sql',
  '007_commission_repair.sql',
  '010_financial_foundation.sql',
  '015_audit_logging.sql',
  '024_extended_financial_module.sql',
];

const agencyA = '10000000-0000-4000-8000-0000000000a1';
const agencyB = '20000000-0000-4000-8000-0000000000b1';
const managerA = '11000000-0000-4000-8000-0000000000a1';
const agentA = '11000000-0000-4000-8000-0000000000a2';
const managerB = '21000000-0000-4000-8000-0000000000b1';
const formulaName = '=HYPERLINK("http://evil.test","x"),A';

// Principals are resolved from the users table (not a fixed map), so the
// authenticate hook and validateUserAgencyAccess run against real rows.
describe('Report CSV over HTTP with a real database (two agencies)', () => {
  let db: DisposableDb;
  let admin: Pool;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-csv', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-csv', 'b@example.test', 'FREE', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    await admin.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status) VALUES
        ($1, $4, 'm-a@example.test', 'Manager A', 'MANAGER', 'hash-test-only', 'ACTIVE'),
        ($2, $4, 'g-a@example.test', 'Agent A', 'AGENT', 'hash-test-only', 'ACTIVE'),
        ($3, $5, 'm-b@example.test', 'Manager B', 'MANAGER', 'hash-test-only', 'ACTIVE')`,
      [managerA, agentA, managerB, agencyA, agencyB],
    );
    const customer = async (agencyId: string, name: string) =>
      (
        await admin.query<{ id: string }>(
          `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
          [agencyId, name],
        )
      ).rows[0]!.id;
    const customerA = await customer(agencyA, formulaName);
    const customerB = await customer(agencyB, 'Cliente Exclusivo B');
    await admin.query(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total) VALUES
        ($1, $2, $3, 100, 0, 100), ($1, $2, $3, 50, 10, 40),
        ($4, $5, $6, 999, 0, 999)`,
      [agencyA, customerA, managerA, agencyB, customerB, managerB],
    );
  }, 240_000);

  afterAll(async () => {
    await db?.stop();
  });

  function app() {
    return buildApp({
      authProvider: {
        async authenticate(request) {
          const token = request.headers['x-test-user'];
          if (typeof token !== 'string') return null;
          const row = (
            await admin.query<{ id: string; agency_id: string; role: string; email: string }>(
              `SELECT id, agency_id, role, email FROM users WHERE id = $1 AND status = 'ACTIVE'`,
              [token],
            )
          ).rows[0];
          if (!row) return null;
          const principal: AuthenticatedPrincipal = {
            userId: row.id,
            agencyId: row.agency_id,
            role: row.role as UserRole,
            email: row.email,
          };
          return principal;
        },
      },
      validateUserAgencyAccess: async (userId, agencyId) =>
        (
          await admin.query(`SELECT 1 FROM users WHERE id = $1 AND agency_id = $2`, [userId, agencyId])
        ).rowCount === 1,
      database: createDatabaseRuntime(db.runtimePool),
    });
  }

  async function get(user: string | null, url: string) {
    const server = app();
    try {
      return await server.inject({
        url,
        ...(user ? { headers: { 'x-test-user': user } } : {}),
      });
    } finally {
      await server.close();
    }
  }

  const csvUrl = '/reports/sales?format=csv&groupBy=customer';

  it('rejects unauthenticated and under-privileged callers before any data is read', async () => {
    const anonymous = await get(null, csvUrl);
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.body).not.toContain('Cliente Exclusivo B');
    const agent = await get(agentA, csvUrl);
    expect(agent.statusCode).toBe(403);
    expect(agent.headers['content-disposition']).toBeUndefined();
  });

  it("exports only the caller's agency, neutralizing formulas, with private download headers", async () => {
    const response = await get(managerA, csvUrl);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe('attachment; filename="vendas-customer.csv"');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    const lines = response.body.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe('key,label,count,total');
    expect(lines[1]).toMatch(/^[0-9a-f-]{36},"'=HYPERLINK\(""http:\/\/evil\.test"",""x""\),A",2,140(\.0+)?$/);
    expect(lines).toHaveLength(3); // header, one agency-A customer, trailing empty
    expect(response.body).not.toContain('Cliente Exclusivo B');
    expect(lines.some((line) => /,999(\.0+)?$/.test(line))).toBe(false);
  });

  it('shows agency B only its own rows and ignores an agencyId override in the query', async () => {
    const own = await get(managerB, csvUrl);
    expect(own.statusCode).toBe(200);
    expect(own.body).toContain('Cliente Exclusivo B');
    expect(own.body).not.toContain('HYPERLINK');

    const spoofed = await get(managerB, `${csvUrl}&agencyId=${agencyA}`);
    expect(spoofed.statusCode).toBe(200);
    expect(spoofed.body).toContain('Cliente Exclusivo B');
    expect(spoofed.body).not.toContain('HYPERLINK');
  });

  it('keeps the JSON format working and rejects unknown formats', async () => {
    const json = await get(managerA, '/reports/sales?groupBy=customer');
    expect(json.statusCode).toBe(200);
    expect(json.json<{ rows: Array<{ label: string }> }>().rows.map((r) => r.label)).toEqual([formulaName]);
    expect((await get(managerA, '/reports/sales?format=xml')).statusCode).toBe(400);
  });
});
