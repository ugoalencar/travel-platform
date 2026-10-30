/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- HTTP/JSON and pg row fixtures in this integration test are intentionally untyped */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

// Own container/port: never the shared Onda B database, the demo or 55438.
vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55625';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-cfs-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-cfs-int';
});

import { buildApp } from '../../../services/api/src/app';
import type { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../../../services/api/src/auth';
import { createDatabaseRuntime } from '../../../services/api/src/database';
import {
  startDisposableDb,
  type DisposableDb,
} from '../../../services/api/tests/helpers/disposable-postgres';

const migrationsDir = resolve(import.meta.dirname, '../../../infrastructure/migrations');
const MIGRATIONS = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

const agencyA = '10000000-0000-4000-8000-0000000000e1';
const agencyB = '20000000-0000-4000-8000-0000000000f1';
const ids = {
  ownerA: '11000000-0000-4000-8000-0000000000e1',
  adminA: '11000000-0000-4000-8000-0000000000e2',
  managerA: '11000000-0000-4000-8000-0000000000e3',
  agentA: '11000000-0000-4000-8000-0000000000e4',
  viewerA: '11000000-0000-4000-8000-0000000000e5',
  adminB: '21000000-0000-4000-8000-0000000000f1',
};
const roleOf: Record<keyof typeof ids, [string, UserRole]> = {
  ownerA: [agencyA, 'OWNER' as UserRole],
  adminA: [agencyA, 'ADMIN' as UserRole],
  managerA: [agencyA, 'MANAGER' as UserRole],
  agentA: [agencyA, 'AGENT' as UserRole],
  viewerA: [agencyA, 'VIEWER' as UserRole],
  adminB: [agencyB, 'ADMIN' as UserRole],
};

describe('Frente 2: customer field settings over HTTP with a real database', () => {
  let db: DisposableDb;
  let admin: Pool;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-cfs', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-cfs', 'b@example.test', 'FREE', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    for (const [key, id] of Object.entries(ids)) {
      const [agencyId, role] = roleOf[key as keyof typeof ids];
      await admin.query(
        `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'hash-test-only', 'ACTIVE')`,
        [id, agencyId, `${key}@example.test`, key, role],
      );
    }
  }, 300_000);

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
        (await admin.query(`SELECT 1 FROM users WHERE id = $1 AND agency_id = $2`, [userId, agencyId]))
          .rowCount === 1,
      database: createDatabaseRuntime(db.runtimePool),
    });
  }

  async function call(as: string | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) {
    const server = app();
    try {
      const response = await server.inject({
        method,
        url,
        ...(as ? { headers: { 'x-test-user': as } } : {}),
        ...(payload !== undefined ? { payload: payload as object } : {}),
      });
      return { status: response.statusCode, body: response.json<Record<string, any>>() };
    } finally {
      await server.close();
    }
  }

  const saveFields = (as: string | null, fields: unknown) =>
    call(as, 'PUT', '/settings/customers/field-settings', { fields });
  const reset = async () => {
    await admin.query('DELETE FROM customer_field_settings');
    await admin.query('DELETE FROM user_permission_overrides');
  };
  const phoneRequired = [{ fieldKey: 'phone', enabled: true, required: true }];

  describe('configuration endpoint', () => {
    it('requires authentication', async () => {
      expect((await saveFields(null, phoneRequired)).status).toBe(401);
      expect((await call(null, 'GET', '/customers/field-settings')).status).toBe(401);
    });
    it.each(['agentA', 'managerA', 'viewerA'] as const)('denies %s on PUT (administrator only)', async (who) => {
      expect((await saveFields(ids[who], phoneRequired)).status).toBe(403);
    });
    it('lets an ADMIN and an OWNER configure; any role can read the effective form', async () => {
      await reset();
      expect((await saveFields(ids.adminA, phoneRequired)).status).toBe(200);
      expect((await saveFields(ids.ownerA, phoneRequired)).status).toBe(200);
      const read = await call(ids.viewerA, 'GET', '/customers/field-settings');
      expect(read.status).toBe(200);
      const phone = (read.body.fields as Array<Record<string, any>>).find((field) => field.fieldKey === 'phone');
      expect(phone).toMatchObject({ enabled: true, required: true, locked: false });
      const name = (read.body.fields as Array<Record<string, any>>).find((field) => field.fieldKey === 'name');
      expect(name).toMatchObject({ enabled: true, required: true, locked: true });
    });
    it('keeps name locked and rejects unknown, inconsistent or injected input', async () => {
      for (const fields of [
        [{ fieldKey: 'name', enabled: false, required: false }],
        [{ fieldKey: 'nope', enabled: true, required: false }],
        [{ fieldKey: 'phone', enabled: false, required: true }],
        [{ fieldKey: 'phone', enabled: true, required: false, agencyId: agencyB }],
      ]) {
        expect((await saveFields(ids.adminA, fields)).status).toBe(400);
      }
    });
    it('is not delegable: an ADMIN-only key ignores a per-user GRANT attempt', async () => {
      const grant = await call(ids.adminA, 'PUT', `/settings/team/${ids.agentA}/permission-overrides`, {
        overrides: [{ resource: 'customers', action: 'fields_manage', effect: 'GRANT', reason: 'x' }],
      });
      expect(grant.status).toBe(400);
      expect((await saveFields(ids.agentA, phoneRequired)).status).toBe(403);
    });
    it('writes one audit event per real change and none for a no-op', async () => {
      await reset();
      const count = async () =>
        Number(
          (await admin.query(`SELECT count(*)::int AS n FROM audit_logs WHERE event_type = 'CUSTOMER_FIELD_SETTINGS_CHANGED'`))
            .rows[0].n,
        );
      const before = await count();
      await saveFields(ids.adminA, phoneRequired);
      expect(await count()).toBe(before + 1);
      await saveFields(ids.adminA, phoneRequired);
      expect(await count()).toBe(before + 1);
      // many changes at once: one event each, none truncated
      const many = ['phone', 'cpf', 'rg', 'passport', 'nationality', 'profession'].map((fieldKey) => ({
        fieldKey,
        enabled: false,
        required: false,
      }));
      await saveFields(ids.adminA, many);
      expect(await count()).toBe(before + 1 + many.length);
    });
  });

  describe('server-side enforcement on customers', () => {
    it('create: a required field missing is 422 FIELD_REQUIRED naming the field', async () => {
      await reset();
      await saveFields(ids.adminA, phoneRequired);
      const missing = await call(ids.agentA, 'POST', '/customers', { name: 'Ana' });
      expect(missing.status).toBe(422);
      expect(missing.body).toMatchObject({ code: 'FIELD_REQUIRED', field: 'phone' });
      const ok = await call(ids.agentA, 'POST', '/customers', { name: 'Ana', phone: '11999990000' });
      expect(ok.status).toBe(201);
    });
    it('edit: a disabled field is refused even when blank, so stored data is not wiped', async () => {
      await reset();
      const created = await call(ids.agentA, 'POST', '/customers', { name: 'Gil', rg: 'RG-9' });
      const id = created.body.customer.id as string;
      await saveFields(ids.adminA, [{ fieldKey: 'rg', enabled: false, required: false }]);
      const res = await call(ids.agentA, 'PATCH', `/customers/${id}`, { rg: '' });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'FIELD_DISABLED', field: 'rg' });
      expect((await call(ids.agentA, 'GET', `/customers/${id}`)).body.customer.rg).toBe('RG-9');
    });
    it('create: a disabled field sent with a value is 422 FIELD_DISABLED, never ignored', async () => {
      await reset();
      await saveFields(ids.adminA, [{ fieldKey: 'rg', enabled: false, required: false }]);
      const res = await call(ids.agentA, 'POST', '/customers', { name: 'Bia', rg: '123' });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'FIELD_DISABLED', field: 'rg' });
      expect((await call(ids.agentA, 'POST', '/customers', { name: 'Bia' })).status).toBe(201);
    });
    it('edit validates only the fields present: an old customer without phone can still change notes', async () => {
      await reset();
      const created = await call(ids.agentA, 'POST', '/customers', { name: 'Cris' });
      expect(created.status).toBe(201);
      await saveFields(ids.adminA, phoneRequired);
      const id = created.body.customer.id as string;
      expect((await call(ids.agentA, 'PATCH', `/customers/${id}`, { notes: 'ok' })).status).toBe(200);
      const blank = await call(ids.agentA, 'PATCH', `/customers/${id}`, { phone: '' });
      expect(blank.status).toBe(422);
      expect(blank.body).toMatchObject({ code: 'FIELD_REQUIRED', field: 'phone' });
    });
    it('disabling a field keeps the stored value readable', async () => {
      await reset();
      const created = await call(ids.agentA, 'POST', '/customers', { name: 'Dani', rg: 'RG-1' });
      const id = created.body.customer.id as string;
      await saveFields(ids.adminA, [{ fieldKey: 'rg', enabled: false, required: false }]);
      const read = await call(ids.agentA, 'GET', `/customers/${id}`);
      expect(read.status).toBe(200);
      expect(read.body.customer.rg).toBe('RG-1');
    });
    it('is per agency: agency A configuration does not affect agency B', async () => {
      await reset();
      await saveFields(ids.adminA, phoneRequired);
      expect((await call(ids.adminB, 'POST', '/customers', { name: 'Eva' })).status).toBe(201);
      const b = await call(ids.adminB, 'GET', '/customers/field-settings');
      const phone = (b.body.fields as Array<Record<string, any>>).find((field) => field.fieldKey === 'phone');
      expect(phone).toMatchObject({ enabled: true, required: false });
    });
    it('without any configuration nothing changes for customers', async () => {
      await reset();
      expect((await call(ids.agentA, 'POST', '/customers', { name: 'Fabi' })).status).toBe(201);
    });
  });

  describe('database guards', () => {
    it('the database refuses a required-but-disabled row and a name row', async () => {
      await expect(
        admin.query(
          `INSERT INTO customer_field_settings (agency_id, field_key, enabled, required) VALUES ($1, 'phone', false, true)`,
          [agencyA],
        ),
      ).rejects.toThrow();
      await expect(
        admin.query(
          `INSERT INTO customer_field_settings (agency_id, field_key, enabled, required) VALUES ($1, 'name', true, false)`,
          [agencyA],
        ),
      ).rejects.toThrow();
    });
    it("the runtime role cannot see or write another agency's rows", async () => {
      await reset();
      await saveFields(ids.adminA, phoneRequired);
      const client = await db.runtimePool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_agency_id', $1, true)`, [agencyB]);
        expect((await client.query('SELECT 1 FROM customer_field_settings')).rowCount).toBe(0);
        await expect(
          client.query(
            `INSERT INTO customer_field_settings (agency_id, field_key, enabled, required) VALUES ($1, 'cpf', true, false)`,
            [agencyA],
          ),
        ).rejects.toThrow();
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });
});
