/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- HTTP/JSON and pg row fixtures in this integration test are intentionally untyped */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

// Own container/port: never the shared Onda B database, the demo or 55438.
vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55632';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-dash-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-dash-int';
});

import { buildApp } from '../../../services/api/src/app';
import type { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../../../services/api/src/auth';
import { createDatabaseRuntime } from '../../../services/api/src/database';
import {
  startDisposableDb,
  type DisposableDb,
} from '../../../services/api/tests/helpers/disposable-postgres';

const MIGRATIONS = readdirSync(resolve(import.meta.dirname, '../../../infrastructure/migrations'))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

const agencyA = '10000000-0000-4000-8000-0000000000aa';
const agencyB = '20000000-0000-4000-8000-0000000000ba';
const ids = {
  adminA: '11000000-0000-4000-8000-0000000000a2',
  managerA: '11000000-0000-4000-8000-0000000000a3',
  agentA: '11000000-0000-4000-8000-0000000000a4',
  adminB: '21000000-0000-4000-8000-0000000000b1',
};
const roleOf: Record<keyof typeof ids, [string, UserRole]> = {
  adminA: [agencyA, 'ADMIN' as UserRole],
  managerA: [agencyA, 'MANAGER' as UserRole],
  agentA: [agencyA, 'AGENT' as UserRole],
  adminB: [agencyB, 'ADMIN' as UserRole],
};

describe('DASH-01 dashboard layout over HTTP with a real database', () => {
  let db: DisposableDb;
  let admin: Pool;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-dash', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-dash', 'b@example.test', 'FREE', 'ACTIVE')`,
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
          const row = (await admin.query<{ id: string; agency_id: string; role: string; email: string }>(
            `SELECT id, agency_id, role, email FROM users WHERE id = $1 AND status = 'ACTIVE'`, [token])).rows[0];
          if (!row) return null;
          const principal: AuthenticatedPrincipal = { userId: row.id, agencyId: row.agency_id, role: row.role as UserRole, email: row.email };
          return principal;
        },
      },
      validateUserAgencyAccess: async (userId, agencyId) =>
        (await admin.query(`SELECT 1 FROM users WHERE id = $1 AND agency_id = $2`, [userId, agencyId])).rowCount === 1,
      database: createDatabaseRuntime(db.runtimePool),
    });
  }

  async function get(as: string | null, url: string) {
    const server = app();
    try {
      const res = await server.inject({ url, ...(as ? { headers: { 'x-test-user': as } } : {}) });
      const type = String(res.headers['content-type'] ?? '');
      return { status: res.statusCode, headers: res.headers, text: res.body, body: type.includes('json') ? res.json<Record<string, any>>() : {} };
    } finally {
      await server.close();
    }
  }
  async function put(as: string | null, body: unknown) {
    const server = app();
    try {
      const res = await server.inject({ method: 'PUT', url: '/settings/dashboard', ...(as ? { headers: { 'x-test-user': as } } : {}), payload: body as object });
      return { status: res.statusCode, body: res.json<Record<string, any>>() };
    } finally {
      await server.close();
    }
  }
  const keys = async () => ((await get(ids.adminA, '/settings/dashboard')).body.widgets as Array<{ key: string }>).map((w) => w.key);
  const layoutOf = async (enabled: Record<string, boolean>) => {
    const settings = (await get(ids.adminA, '/settings/dashboard')).body;
    return { version: settings.version, widgets: (await keys()).map((key) => ({ key, enabled: enabled[key] ?? true })) };
  };
  const keysB = async () => ((await get(ids.adminB, '/settings/dashboard')).body.widgets as Array<{ key: string }>).map((w) => w.key);
  const viewerKeys = async (as: string) => ((await get(as, '/dashboard/widgets')).body.widgets as Array<{ key: string }>).map((w) => w.key);

  it('requires authentication; the default layout shows every widget the viewer may see', async () => {
    expect((await get(null, '/dashboard/widgets')).status).toBe(401);
    const manager = await viewerKeys(ids.managerA);
    expect(manager).toEqual(expect.arrayContaining(['commercial_overview', 'financial_overview', 'receivables_projection', 'commissions_projection']));
  });

  it('omits widgets the viewer cannot see: no key, no title, no data (enabling a widget never grants access)', async () => {
    const agent = await get(ids.agentA, '/dashboard/widgets');
    expect(agent.status).toBe(200);
    const agentKeys = (agent.body.widgets as Array<{ key: string }>).map((w) => w.key);
    expect(agentKeys).toEqual(['commercial_overview']);
    const text = JSON.stringify(agent.body);
    for (const hidden of ['financial_overview', 'receivables_projection', 'Recebíveis', 'Saldos com fornecedores']) expect(text).not.toContain(hidden);
    // enabling everything explicitly changes nothing for the agent
    const saved = await put(ids.adminA, await layoutOf({}));
    expect(saved.status).toBe(200);
    expect(await viewerKeys(ids.agentA)).toEqual(['commercial_overview']);
  });

  it('only an administrator reads or writes the layout', async () => {
    for (const as of [ids.agentA, ids.managerA]) {
      expect((await get(as, '/settings/dashboard')).status).toBe(403);
      expect((await put(as, { version: 0, widgets: [] })).status).toBe(403);
    }
    expect((await put(null, { version: 0, widgets: [] })).status).toBe(401);
  });

  it('disabling and reordering is respected; a disabled widget disappears for everyone', async () => {
    const all = await keys();
    const reversed = [...all].reverse();
    const settings = (await get(ids.adminA, '/settings/dashboard')).body;
    const res = await put(ids.adminA, { version: settings.version, widgets: reversed.map((key) => ({ key, enabled: key !== 'commissions_projection' })) });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(settings.version + 1);
    const manager = await viewerKeys(ids.managerA);
    expect(manager).not.toContain('commissions_projection');
    expect(manager).toEqual(reversed.filter((key) => manager.includes(key)));
  });

  it('validates the body: complete catalog once, no extra fields, nothing but key and enabled, version check (409)', async () => {
    const current = await layoutOf({});
    expect((await put(ids.adminA, { ...current, widgets: current.widgets.slice(1) })).status).toBe(400);
    expect((await put(ids.adminA, { ...current, widgets: [...current.widgets, current.widgets[0]] })).status).toBe(400);
    expect((await put(ids.adminA, { ...current, widgets: current.widgets.map((w) => ({ ...w, filter: 'x' })) })).status).toBe(400);
    expect((await put(ids.adminA, { ...current, widgets: current.widgets.map((w) => ({ ...w, permission: 'financial' })) })).status).toBe(400);
    expect((await put(ids.adminA, { ...current, agencyId: agencyB })).status).toBe(400);
    expect((await put(ids.adminA, { ...current, widgets: [{ key: 'nope', enabled: true }, ...current.widgets.slice(1)] })).status).toBe(400);
    const stale = await put(ids.adminA, { ...current, version: current.version - 1 });
    expect(stale.status).toBe(409);
    expect((await put(ids.adminA, current)).status).toBe(200);
  });

  it('a restriction or REVOKE on the source hides the widget from that viewer (and only that viewer)', async () => {
    await put(ids.adminA, await layoutOf({}));
    expect(await viewerKeys(ids.managerA)).toContain('financial_overview');
    await admin.query(`INSERT INTO permission_restrictions (agency_id, role, resource, action, created_by_user_id) VALUES ($1, 'MANAGER', 'financial', 'view', $2)`, [agencyA, ids.adminA]);
    const hidden = await get(ids.managerA, '/dashboard/widgets');
    expect(JSON.stringify(hidden.body)).not.toContain('financial_overview');
    expect(JSON.stringify(hidden.body)).not.toContain('Fluxo de caixa');
    expect(await viewerKeys(ids.adminA)).toContain('financial_overview');
    await admin.query('DELETE FROM permission_restrictions');
    await admin.query(`INSERT INTO user_permission_overrides (agency_id, user_id, resource, action, effect, reason, created_by_user_id) VALUES ($1, $2, 'financial', 'receivables.read', 'REVOKE', 'teste', $3)`, [agencyA, ids.managerA, ids.adminA]);
    expect(await viewerKeys(ids.managerA)).not.toContain('receivables_projection');
    await admin.query('DELETE FROM user_permission_overrides');
  });

  it('two simultaneous first saves: one wins, the other gets 409 (never a 500)', async () => {
    const results = await Promise.all([
      put(ids.adminB, { version: 0, widgets: (await keysB()).map((key) => ({ key, enabled: true })) }),
      put(ids.adminB, { version: 0, widgets: (await keysB()).map((key) => ({ key, enabled: false })) }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('is audited and isolated by agency', async () => {
    const events = (await admin.query(`SELECT metadata FROM audit_logs WHERE event_type = 'DASHBOARD_CONFIGURED'`)).rows;
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain('"data"');
    const b = await get(ids.adminB, '/settings/dashboard');
    expect(b.body.version).toBe(1);
    expect((await admin.query('SELECT 1 FROM dashboard_layouts WHERE agency_id = $1 AND version = 1', [agencyB])).rowCount).toBe(1);
    expect((await admin.query('SELECT 1 FROM dashboard_layouts WHERE agency_id = $1', [agencyA])).rowCount).toBe(1);
    const client = await db.runtimePool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_agency_id', $1, true)`, ['30000000-0000-4000-8000-0000000000cc']);
      expect((await client.query('SELECT 1 FROM dashboard_layouts')).rowCount).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
