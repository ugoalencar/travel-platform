import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/password';
import { createLiteFixture, FIXTURE_PASSWORD, type LiteFixture } from './helpers/fixture';

interface Person {
  name: string;
  email: string;
  role: string;
}
interface Summary {
  tenant: string;
  mode: string;
  alreadyProvisioned: boolean;
  users: Array<{ role: string; password: string; effectivePermissions: number; userCreated: boolean }>;
}

const require = createRequire(import.meta.url);
const lib = require('../../../scripts/travel-lite-gadotti-online.lib.cjs') as {
  PEOPLE: Person[];
  SELLER_PERMISSIONS: string[];
  provisionGadotti(
    pool: unknown,
    passwords: Record<string, string>,
    options?: { apply?: boolean; expectedDatabase?: string; hooks?: Record<string, () => Promise<void> | void> },
  ): Promise<Summary>;
  describeFailure(error: unknown): string;
  parseCredentialsDocument(markdown: string): Record<string, string>;
  parsePasswordsJson(raw: string): Record<string, string>;
};
const { PEOPLE, SELLER_PERMISSIONS } = lib;

const TENANT_NAME = 'B&B GADOTTI VIAGENS LTDA';
const TEST_DATABASE = 'travel_lite_test';
const PASSWORDS: Record<string, string> = Object.fromEntries(
  PEOPLE.map((person, index) => [person.email, `Temp-${index}-Pw!${'x'.repeat(10)}`]),
);

describe('Gadotti online provisioning', () => {
  let lite: LiteFixture;
  let tenantId: string;
  let otherTenantId: string;

  const run = (apply: boolean, extra: Record<string, unknown> = {}) =>
    lib.provisionGadotti(lite.runtimePool, PASSWORDS, { apply, expectedDatabase: TEST_DATABASE, ...extra });

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const result = await lite.adminPool.query<{ n: string }>(sql, params);
    return Number(result.rows[0]!.n);
  }

  async function snapshot() {
    const hashes = await lite.adminPool.query<{ email: string; password_hash: string }>(
      'SELECT email, password_hash FROM users WHERE tenant_id = $1 ORDER BY email',
      [tenantId],
    );
    return {
      hashes: hashes.rows,
      overrides: await count('SELECT count(*) n FROM user_permissions WHERE tenant_id = $1', [tenantId]),
      audits: await count('SELECT count(*) n FROM audit_logs WHERE tenant_id = $1', [tenantId]),
      sellers: await count('SELECT count(*) n FROM sellers WHERE tenant_id = $1', [tenantId]),
      sessions: await count('SELECT count(*) n FROM auth_sessions WHERE tenant_id = $1 AND revoked_at IS NULL', [tenantId]),
    };
  }

  async function seedGadotti() {
    for (const table of ['audit_logs', 'user_permissions', 'auth_sessions', 'sellers', 'users']) {
      await lite.adminPool.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`, [[tenantId, otherTenantId]]);
    }
    const oldHash = await hashPassword(FIXTURE_PASSWORD);
    for (const person of PEOPLE) {
      const user = await lite.adminPool.query<{ id: string }>(
        `INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenantId, person.name, person.email, oldHash, person.role],
      );
      await lite.adminPool.query(
        `INSERT INTO sellers (tenant_id, name, email, user_id) VALUES ($1, $2, $3, $4)`,
        [tenantId, person.name, person.email, user.rows[0]!.id],
      );
    }
    // A different seller that shares Andrielle's e-mail and is not linked.
    await lite.adminPool.query(`INSERT INTO sellers (tenant_id, name, email) VALUES ($1, 'Outra Vendedora', $2)`, [
      tenantId,
      PEOPLE[4]!.email,
    ]);
    const other = await lite.adminPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES ($1, 'Outro', 'outro@demo.test', $2, 'SELLER') RETURNING id`,
      [otherTenantId, oldHash],
    );
    await lite.adminPool.query(`INSERT INTO sellers (tenant_id, name, email, user_id) VALUES ($1, 'Outro', 'outro@demo.test', $2)`, [
      otherTenantId,
      other.rows[0]!.id,
    ]);
  }

  async function loginAs(email: string, password: string) {
    return lite.app.inject({ method: 'POST', url: '/auth/login', payload: { slug: 'gadotti', email, password } });
  }

  beforeAll(async () => {
    lite = await createLiteFixture();
    await lite.adminPool.query(
      `CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
    await lite.adminPool.query('GRANT SELECT ON migrations TO travel_lite_runtime');
    await lite.adminPool.query('DELETE FROM migrations');
    for (const name of ['001_a', '002_b', '003_c', '004_d', '005_e', '006_f', '007_g']) {
      await lite.adminPool.query('INSERT INTO migrations (name) VALUES ($1)', [`${name}.sql`]);
    }
    const tenant = await lite.adminPool.query<{ id: string }>(
      `INSERT INTO tenants (name, slug) VALUES ($1, 'gadotti') RETURNING id`,
      [TENANT_NAME],
    );
    tenantId = tenant.rows[0]!.id;
    const other = await lite.adminPool.query<{ id: string }>(
      `INSERT INTO tenants (name, slug) VALUES ('Demo', 'demo') RETURNING id`,
    );
    otherTenantId = other.rows[0]!.id;
  });

  beforeEach(async () => {
    await seedGadotti();
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('dry-run executes every step and leaves the database untouched', async () => {
    const before = await snapshot();
    const summary = await run(false);

    expect(summary.mode).toBe('dry-run');
    expect(summary.users).toHaveLength(5);
    expect(await snapshot()).toEqual(before);
  });

  it('applies temporary passwords, forces the first-login change and limits sellers', async () => {
    const summary = await run(true);
    expect(summary.alreadyProvisioned).toBe(false);
    expect(summary.users.filter((user) => user.password === 'temporary-set')).toHaveLength(5);

    for (const person of PEOPLE) {
      const response = await loginAs(person.email, PASSWORDS[person.email]!);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ passwordChangeRequired: true });
      expect((await loginAs(person.email, FIXTURE_PASSWORD)).statusCode).toBe(401);
    }

    const rows = await lite.adminPool.query<{ n: string }>(
      `SELECT count(*) n FROM sellers WHERE tenant_id = $1 AND user_id IS NOT NULL`,
      [tenantId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(5);
    const unlinked = await lite.adminPool.query<{ user_id: string | null }>(`SELECT user_id FROM sellers WHERE tenant_id = $1 AND name = 'Outra Vendedora'`, [tenantId]);
    expect(unlinked.rows[0]!.user_id).toBeNull();
  });

  it('lets each person finish the first login with their own password', async () => {
    await run(true);
    const seller = PEOPLE[1]!;
    const change = await lite.app.inject({
      method: 'POST',
      url: '/auth/change-required-password',
      payload: { slug: 'gadotti', email: seller.email, currentPassword: PASSWORDS[seller.email], newPassword: 'My-own-Passw0rd!' },
    });
    expect(change.statusCode).toBe(200);
    const next = await lite.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { slug: 'gadotti', email: seller.email, password: 'My-own-Passw0rd!' },
    });
    expect(next.json()).toHaveProperty('sessionToken');
  });

  it('gives sellers only own customers and sales; Patricia manages permissions', async () => {
    await run(true);
    const complete = async (person: Person) => {
      const done = await lite.app.inject({
        method: 'POST',
        url: '/auth/change-required-password',
        payload: { slug: 'gadotti', email: person.email, currentPassword: PASSWORDS[person.email], newPassword: 'Changed-Passw0rd!' },
      });
      expect(done.statusCode).toBe(200);
      const login = await lite.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { slug: 'gadotti', email: person.email, password: 'Changed-Passw0rd!' },
      });
      return login.json<{ sessionToken: string; user: { permissions: string[] } }>();
    };

    const seller = await complete(PEOPLE[2]!);
    expect(seller.user.permissions).toEqual([...SELLER_PERMISSIONS].sort());
    const get = (url: string, token: string) =>
      lite.app.inject({ method: 'GET', url, headers: lite.headers(token) });
    expect((await get('/customers', seller.sessionToken)).statusCode).toBe(200);
    expect((await get('/sales', seller.sessionToken)).statusCode).toBe(200);
    for (const url of ['/users', '/commissions', '/reports/sales', '/reports/cash-flow']) {
      expect((await get(url, seller.sessionToken)).statusCode, url).toBe(403);
    }
    for (const url of ['/imports', '/settings']) {
      expect((await get(url, seller.sessionToken)).statusCode, url).toBe(404);
    }
    // Without sellers.read the seller list only contains the person's own record.
    const sellers = (await get('/sellers', seller.sessionToken)).json<{ total: number; items: Array<{ email: string }> }>();
    expect(sellers.total).toBe(1);
    expect(sellers.items[0]?.email).toBe(PEOPLE[2]!.email);
    const dashboard = await get('/dashboard', seller.sessionToken);
    expect(dashboard.json<{ widgets: unknown[] }>().widgets).toEqual([]);

    const patricia = await complete(PEOPLE[0]!);
    const list = await get('/users', patricia.sessionToken);
    expect(list.statusCode).toBe(200);
    const target = list
      .json<{ items: Array<{ id: string; email: string; overrides: Array<{ permission: string; effect: string }> }> }>()
      .items.find((user) => user.email === PEOPLE[2]!.email)!;
    expect(target.overrides.every((override) => override.effect === 'REVOKE')).toBe(true);
    const widen = await lite.app.inject({
      method: 'PUT',
      url: `/users/${target.id}/permissions`,
      headers: lite.headers(patricia.sessionToken),
      payload: { overrides: [...target.overrides, { permission: 'customers.read_all', effect: 'GRANT' }] },
    });
    expect(widen.statusCode).toBe(200);
    const widened = await loginAs(PEOPLE[2]!.email, 'Changed-Passw0rd!');
    expect(widened.json<{ user: { permissions: string[] } }>().user.permissions).toContain('customers.read_all');
  });

  it('is run-once: a second run changes nothing, even after permissions were widened', async () => {
    await run(true);
    await lite.adminPool.query(
      `INSERT INTO user_permissions (tenant_id, user_id, permission, effect)
       SELECT $1, id, 'customers.read_all', 'GRANT' FROM users WHERE tenant_id = $1 AND email = $2`,
      [tenantId, PEOPLE[1]!.email],
    );
    const before = await snapshot();

    const again = await run(true);
    expect(again.alreadyProvisioned).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it('rolls everything back when a late step fails', async () => {
    const before = await snapshot();
    await expect(
      run(true, {
        hooks: {
          afterPermissions: () => {
            throw new Error('boom with secret@example.com');
          },
        },
      }),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect(await count(`SELECT count(*) n FROM audit_logs WHERE tenant_id = $1 AND event_type = 'GADOTTI_PROVISION_COMPLETED'`, [tenantId])).toBe(0);
  });

  it('does not overwrite a password the person already chose themselves', async () => {
    const target = await lite.adminPool.query<{ id: string }>('SELECT id FROM users WHERE tenant_id = $1 AND email = $2', [tenantId, PEOPLE[3]!.email]);
    await lite.adminPool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, event_type, entity_type, entity_id) VALUES ($1, $2, 'USER_REQUIRED_PASSWORD_CHANGED', 'user', $2)`,
      [tenantId, target.rows[0]!.id],
    );
    const before = await snapshot();
    const summary = await run(true);
    expect(summary.users[3]!.password).toBe('kept-user-owned');
    const after = await snapshot();
    const key = (rows: Array<{ email: string; password_hash: string }>) => rows.find((row) => row.email === PEOPLE[3]!.email)!.password_hash;
    expect(key(after.hashes)).toBe(key(before.hashes));
    expect(key(after.hashes)).not.toBe(undefined);
  });

  it('attributes nothing to employees: audit rows have no acting user and a system source', async () => {
    await run(true);
    const rows = await lite.adminPool.query<{ user_id: string | null; metadata: { source?: string } }>(
      `SELECT user_id, metadata FROM audit_logs
        WHERE tenant_id = $1 AND event_type IN ('USER_PASSWORD_RESET', 'USER_PERMISSIONS_CHANGED', 'GADOTTI_PROVISION_COMPLETED')`,
      [tenantId],
    );
    expect(rows.rowCount).toBe(5 + 4 + 1);
    for (const row of rows.rows) {
      expect(row.user_id).toBeNull();
      expect(row.metadata.source).toBe('travel-lite-gadotti-online');
    }
    const grants = await lite.adminPool.query<{ n: number }>(`SELECT count(*)::int n FROM user_permissions WHERE tenant_id = $1 AND granted_by IS NOT NULL`, [tenantId]);
    expect(grants.rows[0]!.n).toBe(0);
  });

  it('keeps other tenants untouched', async () => {
    const other = async () =>
      (
        await lite.adminPool.query<{ u: string; a: string; p: string; h: string }>(
          `SELECT (SELECT count(*) FROM users WHERE tenant_id = $1) u, (SELECT count(*) FROM audit_logs WHERE tenant_id = $1) a,
                  (SELECT count(*) FROM user_permissions WHERE tenant_id = $1) p, (SELECT password_hash FROM users WHERE tenant_id = $1) h`,
          [otherTenantId],
        )
      ).rows[0];
    const before = await other();
    await run(true);
    expect(await other()).toEqual(before);
  });

  it('refuses a wrong database, a wrong role, a second MASTER and a foreign seller link', async () => {
    const before = await snapshot();
    await expect(lib.provisionGadotti(lite.runtimePool, PASSWORDS, { apply: true, expectedDatabase: 'travel_lite' })).rejects.toThrow(/unexpected database/);

    await lite.adminPool.query(`UPDATE users SET role = 'ADMIN' WHERE tenant_id = $1 AND email = $2`, [tenantId, PEOPLE[1]!.email]);
    await expect(run(true)).rejects.toThrow(/different role/);
    await lite.adminPool.query(`UPDATE users SET role = 'SELLER' WHERE tenant_id = $1 AND email = $2`, [tenantId, PEOPLE[1]!.email]);

    await lite.adminPool.query(`UPDATE users SET role = 'MASTER' WHERE tenant_id = $1 AND email = $2`, [tenantId, PEOPLE[2]!.email]);
    await expect(run(true)).rejects.toThrow(/another MASTER|different role/);
    await lite.adminPool.query(`UPDATE users SET role = 'SELLER' WHERE tenant_id = $1 AND email = $2`, [tenantId, PEOPLE[2]!.email]);

    expect(await snapshot()).toEqual(before);
  });

  it('refuses a tenant whose name does not match', async () => {
    await lite.adminPool.query(`UPDATE tenants SET name = 'Outra Agencia' WHERE id = $1`, [tenantId]);
    try {
      await expect(run(true)).rejects.toThrow(/unexpected name/);
    } finally {
      await lite.adminPool.query(`UPDATE tenants SET name = $2 WHERE id = $1`, [tenantId, TENANT_NAME]);
    }
  });

  it('never prints secrets, hashes or personal data', async () => {
    const summary = await run(true);
    const printed = JSON.stringify(summary);
    for (const person of PEOPLE) {
      expect(printed).not.toContain(PASSWORDS[person.email]);
      expect(printed).not.toContain(person.email);
      expect(printed).not.toContain(person.name);
    }
    expect(printed).not.toContain('scrypt$');

    await seedGadotti();
    const failure = await lib
      .provisionGadotti(lite.runtimePool, PASSWORDS, {
        apply: true,
        expectedDatabase: TEST_DATABASE,
        hooks: {
          afterUsers: async () => {
            await lite.runtimePool.query('SELECT 1/0');
          },
        },
      })
      .catch((error: unknown) => lib.describeFailure(error));
    expect(failure).toMatch(/^(refused: |failed \(code )/);
    expect(failure).not.toContain('@');
  });
});

describe('Gadotti credential inputs', () => {
  const table = (rows: string[][]) =>
    ['| Nome | Usuario | Senha temporaria |', '|---|---|---|', ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
  const rows = PEOPLE.map((person) => [person.name, person.email, PASSWORDS[person.email]!]);

  it('parses the private markdown table and rejects mismatches', () => {
    expect(lib.parseCredentialsDocument(table(rows))).toEqual(PASSWORDS);
    expect(() => lib.parseCredentialsDocument(table(rows.slice(1)))).toThrow(/exactly one password/);
    expect(() => lib.parseCredentialsDocument(table([['Outro Nome', PEOPLE[0]!.email, 'x'.repeat(14)], ...rows.slice(1)]))).toThrow(/name does not match/);
    expect(() => lib.parseCredentialsDocument(table([[PEOPLE[0]!.name, PEOPLE[0]!.email, 'short'], ...rows.slice(1)]))).toThrow(/12-200 characters/);
  });

  it('requires unique passwords and valid JSON', () => {
    const duplicated = { ...PASSWORDS, [PEOPLE[1]!.email]: PASSWORDS[PEOPLE[0]!.email]! };
    expect(() => lib.parsePasswordsJson(JSON.stringify(duplicated))).toThrow(/unique/);
    expect(() => lib.parsePasswordsJson('{not json')).toThrow(/not valid JSON/);
    expect(lib.parsePasswordsJson(JSON.stringify(PASSWORDS))).toEqual(PASSWORDS);
  });
});
