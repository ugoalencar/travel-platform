/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- HTTP/JSON and pg row fixtures in this integration test are intentionally untyped */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

// Own container/port: never the shared Onda B database, the demo or 55438.
vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55623';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-sec01-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-sec01-int';
});

import { buildApp } from '../../../services/api/src/app';
import type { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../../../services/api/src/auth';
import { createDatabaseRuntime } from '../../../services/api/src/database';
import {
  startDisposableDb,
  type DisposableDb,
} from '../../../services/api/tests/helpers/disposable-postgres';

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
  '051_invitations_permission_restrictions.sql',
  '064_agent_area_grants.sql',
  '065_agent_area_grants_modules.sql',
  '103_user_permission_overrides.sql',
];

const agencyA = '10000000-0000-4000-8000-0000000000c1';
const agencyB = '20000000-0000-4000-8000-0000000000d1';
const ids = {
  ownerA: '11000000-0000-4000-8000-0000000000c1',
  adminA: '11000000-0000-4000-8000-0000000000c2',
  adminA2: '11000000-0000-4000-8000-0000000000c3',
  managerA: '11000000-0000-4000-8000-0000000000c4',
  agentA: '11000000-0000-4000-8000-0000000000c5',
  viewerA: '11000000-0000-4000-8000-0000000000c6',
  adminB: '21000000-0000-4000-8000-0000000000d1',
  agentB: '21000000-0000-4000-8000-0000000000d2',
};
const roles: Record<keyof typeof ids, [string, UserRole]> = {
  ownerA: [agencyA, 'OWNER' as UserRole],
  adminA: [agencyA, 'ADMIN' as UserRole],
  adminA2: [agencyA, 'ADMIN' as UserRole],
  managerA: [agencyA, 'MANAGER' as UserRole],
  agentA: [agencyA, 'AGENT' as UserRole],
  viewerA: [agencyA, 'VIEWER' as UserRole],
  adminB: [agencyB, 'ADMIN' as UserRole],
  agentB: [agencyB, 'AGENT' as UserRole],
};

const reason = 'Acompanhar contas a receber';
const grantReceivables = {
  resource: 'financial',
  action: 'receivables.read',
  effect: 'GRANT',
  reason,
};

describe('SEC-01 per-user permission overrides over HTTP with a real database', () => {
  let db: DisposableDb;
  let admin: Pool;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-sec01', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-sec01', 'b@example.test', 'FREE', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    for (const [key, id] of Object.entries(ids)) {
      const [agencyId, role] = roles[key as keyof typeof ids];
      await admin.query(
        `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'hash-test-only', 'ACTIVE')`,
        [id, agencyId, `${key}@example.test`, key, role],
      );
    }
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
        (await admin.query(`SELECT 1 FROM users WHERE id = $1 AND agency_id = $2`, [userId, agencyId]))
          .rowCount === 1,
      database: createDatabaseRuntime(db.runtimePool),
    });
  }

  async function call(
    as: string | null,
    method: 'GET' | 'PUT',
    url: string,
    payload?: unknown,
  ) {
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

  const put = (as: string | null, target: string, overrides: unknown) =>
    call(as, 'PUT', `/settings/team/${target}/permission-overrides`, { overrides });
  const clear = async () => {
    await admin.query('DELETE FROM user_permission_overrides');
    await admin.query('DELETE FROM permission_restrictions');
  };
  const canReceivables = async (as: string) => {
    const res = await call(as, 'GET', '/settings/my-permissions');
    expect(res.status).toBe(200);
    const row = (res.body.permissions as Array<{ resource: string; action: string; allowed: boolean }>).find(
      (item) => item.resource === 'financial' && item.action === 'receivables.read',
    );
    return row?.allowed;
  };

  describe('who may edit', () => {
    it('requires authentication', async () => {
      expect((await put(null, ids.agentA, [])).status).toBe(401);
    });
    it.each(['agentA', 'managerA', 'viewerA'] as const)('denies %s on GET and PUT', async (who) => {
      expect((await put(ids[who], ids.agentA, [])).status).toBe(403);
      expect((await call(ids[who], 'GET', `/settings/team/${ids.agentA}/permission-overrides`)).status).toBe(403);
      expect((await call(ids[who], 'GET', '/settings/permission-catalog')).status).toBe(403);
    });
    it('lets an ADMIN edit an AGENT and an OWNER do the same', async () => {
      await clear();
      expect((await put(ids.adminA, ids.agentA, [grantReceivables])).status).toBe(200);
      expect((await put(ids.ownerA, ids.agentA, [])).status).toBe(200);
    });
    it('denies self-edit, and any edit of OWNER or ADMIN targets', async () => {
      expect((await put(ids.adminA, ids.adminA, [])).status).toBe(403);
      expect((await put(ids.adminA, ids.ownerA, [])).status).toBe(403);
      expect((await put(ids.adminA, ids.adminA2, [])).status).toBe(403);
      expect((await put(ids.ownerA, ids.adminA, [])).status).toBe(403);
    });
    it("answers 404 for another agency's user, with no existence leak", async () => {
      const cross = await put(ids.adminA, ids.agentB, [grantReceivables]);
      expect(cross.status).toBe(404);
      expect(cross.body.error).toBe('Membro não encontrado');
      const missing = await put(ids.adminA, '99999999-0000-4000-8000-000000000000', []);
      expect(missing.status).toBe(404);
    });
  });

  describe('validation', () => {
    it.each([
      ['key outside the catalog', [{ ...grantReceivables, resource: 'nope', action: 'x' }]],
      ['GRANT on a non-delegable key', [{ resource: 'customers', action: 'fields_manage', effect: 'GRANT', reason }]],
      ['GRANT on a mutation key', [{ resource: 'air-services', action: 'create', effect: 'GRANT', reason }]],
      ['missing reason', [{ ...grantReceivables, reason: '' }]],
      ['unknown effect', [{ ...grantReceivables, effect: 'ALLOW' }]],
      ['duplicate key', [grantReceivables, { ...grantReceivables, effect: 'REVOKE' }]],
      ['REVOKE on a sales read the server does not enforce yet', [{ resource: 'sales', action: 'sales.read', effect: 'REVOKE', reason }]],
      ['reason longer than the audit can keep', [{ ...grantReceivables, reason: 'x'.repeat(121) }]],
      ['REVOKE on a key the server does not enforce yet', [{ resource: 'customers', action: 'read', effect: 'REVOKE', reason }]],
      ['extra field inside the override', [{ ...grantReceivables, agencyId: agencyB }]],
    ])('rejects %s with 400 and persists nothing', async (_name, overrides) => {
      await clear();
      const response = await put(ids.adminA, ids.agentA, overrides);
      expect(response.status).toBe(400);
      expect((await admin.query('SELECT 1 FROM user_permission_overrides')).rowCount).toBe(0);
    });
    it('rejects extra body fields such as agencyId', async () => {
      const server = app();
      try {
        const response = await server.inject({
          method: 'PUT',
          url: `/settings/team/${ids.agentA}/permission-overrides`,
          headers: { 'x-test-user': ids.adminA },
          payload: { overrides: [], agencyId: agencyB },
        });
        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
      }
    });
    it('rejects GRANT to MANAGER and VIEWER targets', async () => {
      expect((await put(ids.adminA, ids.managerA, [grantReceivables])).status).toBe(400);
      expect((await put(ids.adminA, ids.viewerA, [grantReceivables])).status).toBe(400);
    });
  });

  describe('precedence: restriction > grant > role', () => {
    it('GRANT lets an AGENT read what the role floor denies, only for that key', async () => {
      await clear();
      expect(await canReceivables(ids.agentA)).toBe(false);
      expect((await put(ids.adminA, ids.agentA, [grantReceivables])).status).toBe(200);
      expect(await canReceivables(ids.agentA)).toBe(true);
      const mine = await call(ids.agentA, 'GET', '/settings/my-permissions');
      const allowed = (mine.body.permissions as Array<{ resource: string; action: string; allowed: boolean }>)
        .filter((item) => item.allowed)
        .map((item) => `${item.resource}:${item.action}`);
      expect(allowed).toContain('financial:receivables.read');
      expect(allowed).not.toContain('financial:payables.read');
      expect(allowed).not.toContain('customers:fields_manage');
    });
    it('a GRANT never opens settings or mutations', async () => {
      const settings = await call(ids.agentA, 'GET', `/settings/team/${ids.viewerA}/permission-overrides`);
      expect(settings.status).toBe(403);
      const selfEdit = await put(ids.agentA, ids.viewerA, [grantReceivables]);
      expect(selfEdit.status).toBe(403);
    });
    it('a role restriction beats the GRANT', async () => {
      await admin.query(
        `INSERT INTO permission_restrictions (agency_id, role, resource, action, created_by_user_id)
         VALUES ($1, 'AGENT', 'financial', 'receivables.read', $2)`,
        [agencyA, ids.ownerA],
      );
      expect(await canReceivables(ids.agentA)).toBe(false);
      await admin.query('DELETE FROM permission_restrictions');
      expect(await canReceivables(ids.agentA)).toBe(true);
    });
    it('REVOKE removes a permission the role would grant, without touching others', async () => {
      await clear();
      expect(await canReceivables(ids.managerA)).toBe(true);
      const revoke = { resource: 'financial', action: 'receivables.read', effect: 'REVOKE', reason: 'Sem acesso' };
      expect((await put(ids.adminA, ids.managerA, [revoke])).status).toBe(200);
      expect(await canReceivables(ids.managerA)).toBe(false);
      const peers = await canReceivables(ids.ownerA);
      expect(peers).toBe(true);
    });
    it('OWNER and ADMIN stay allowed even with a role restriction row for another role', async () => {
      expect(await canReceivables(ids.adminA)).toBe(true);
      expect(await canReceivables(ids.ownerA)).toBe(true);
    });
  });

  describe('enforcement on a real financial route', () => {
    const receivables = (as: string) => call(as, 'GET', '/financial/receivables');
    it('a GRANT opens only the matching read route for an AGENT', async () => {
      await clear();
      expect((await receivables(ids.agentA)).status).toBe(403);
      await put(ids.adminA, ids.agentA, [grantReceivables]);
      expect((await receivables(ids.agentA)).status).toBe(200);
      expect((await call(ids.agentA, 'GET', '/financial/payables')).status).toBe(403);
    });
    it('a REVOKE blocks a MANAGER on that route only', async () => {
      await clear();
      expect((await receivables(ids.managerA)).status).toBe(200);
      await put(ids.adminA, ids.managerA, [
        { resource: 'financial', action: 'receivables.read', effect: 'REVOKE', reason: 'Sem acesso' },
      ]);
      expect((await receivables(ids.managerA)).status).toBe(403);
      expect((await call(ids.managerA, 'GET', '/financial/payables')).status).not.toBe(403);
    });
    it('a role restriction beats both the role floor and a legacy area grant', async () => {
      await clear();
      await admin.query(
        `INSERT INTO agent_area_grants (agency_id, user_id, area, granted_by_user_id)
         VALUES ($1, $2, 'FINANCIAL_RECEIVABLES', $3)`,
        [agencyA, ids.agentA, ids.ownerA],
      );
      expect((await receivables(ids.agentA)).status).toBe(200);
      await admin.query(
        `INSERT INTO permission_restrictions (agency_id, role, resource, action, created_by_user_id)
         VALUES ($1, 'AGENT', 'financial', 'receivables.read', $2), ($1, 'MANAGER', 'financial', 'receivables.read', $2)`,
        [agencyA, ids.ownerA],
      );
      expect((await receivables(ids.agentA)).status).toBe(403);
      expect((await receivables(ids.managerA)).status).toBe(403);
      expect((await receivables(ids.adminA)).status).toBe(200);
      await admin.query('DELETE FROM agent_area_grants');
    });
  });

  describe('audit, isolation and database guards', () => {
    it('writes one required audit event per real change and none for a no-op', async () => {
      await clear();
      await admin.query(`DELETE FROM audit_logs WHERE event_type = 'USER_PERMISSION_OVERRIDES_CHANGED'`).catch(() => undefined);
      const count = async () =>
        Number(
          (await admin.query(`SELECT count(*)::int AS n FROM audit_logs WHERE event_type = 'USER_PERMISSION_OVERRIDES_CHANGED'`))
            .rows[0].n,
        );
      const before = await count();
      await put(ids.adminA, ids.agentA, [grantReceivables]);
      expect(await count()).toBe(before + 1);
      await put(ids.adminA, ids.agentA, [grantReceivables]);
      expect(await count()).toBe(before + 1);
      const row = (
        await admin.query(
          `SELECT metadata, actor_id FROM audit_logs WHERE event_type = 'USER_PERMISSION_OVERRIDES_CHANGED' LIMIT 1`,
        )
      ).rows[0];
      expect(row.actor_id).toBe(ids.adminA);
      expect(JSON.stringify(row.metadata)).toContain('+financial:receivables.read:GRANT');
    });
    it('rolls back the whole change when the required audit row cannot be written', async () => {
      await clear();
      await admin.query(`
        CREATE OR REPLACE FUNCTION test_fail_override_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.event_type = 'USER_PERMISSION_OVERRIDES_CHANGED' THEN RAISE EXCEPTION 'audit down'; END IF;
          RETURN NEW;
        END $$`);
      await admin.query(
        'CREATE TRIGGER test_fail_override_audit_trg BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_fail_override_audit()',
      );
      try {
        const res = await put(ids.adminA, ids.agentA, [grantReceivables]);
        expect(res.status).toBe(500);
        expect((await admin.query('SELECT 1 FROM user_permission_overrides')).rowCount).toBe(0);
      } finally {
        await admin.query('DROP TRIGGER test_fail_override_audit_trg ON audit_logs');
      }
    });
    it('serializes two simultaneous replacements: the final state is exactly one of them', async () => {
      await clear();
      const payloadA = [grantReceivables];
      const payloadB = [{ resource: 'financial', action: 'payables.read', effect: 'GRANT', reason }];
      const [first, second] = await Promise.all([
        put(ids.adminA, ids.agentA, payloadA),
        put(ids.ownerA, ids.agentA, payloadB),
      ]);
      expect([first.status, second.status]).toEqual([200, 200]);
      const rows = (await admin.query('SELECT action FROM user_permission_overrides ORDER BY action')).rows.map(
        (row) => row.action as string,
      );
      expect(['payables.read', 'receivables.read']).toContain(rows[0]);
      expect(rows).toHaveLength(1);
    });
    it('reports a legacy area grant as allowed in my-permissions, until a restriction blocks it', async () => {
      await clear();
      await admin.query(
        `INSERT INTO agent_area_grants (agency_id, user_id, area, granted_by_user_id)
         VALUES ($1, $2, 'FINANCIAL_RECEIVABLES', $3)`,
        [agencyA, ids.agentA, ids.ownerA],
      );
      expect(await canReceivables(ids.agentA)).toBe(true);
      await admin.query(
        `INSERT INTO permission_restrictions (agency_id, role, resource, action, created_by_user_id)
         VALUES ($1, 'AGENT', 'financial', 'receivables.read', $2)`,
        [agencyA, ids.ownerA],
      );
      expect(await canReceivables(ids.agentA)).toBe(false);
      await clear();
      await admin.query('DELETE FROM agent_area_grants');
    });
    it('audits removals and reason changes with the stated reason, never truncated', async () => {
      await clear();
      await put(ids.adminA, ids.agentA, [grantReceivables]);
      const events = async () =>
        (
          await admin.query(
            "SELECT metadata FROM audit_logs WHERE event_type = 'USER_PERMISSION_OVERRIDES_CHANGED' AND entity_id = $1",
            [ids.agentA],
          )
        ).rows.map((row) => JSON.stringify(row.metadata));
      const base = (await events()).length;
      // a reason-only change is a real change: it must persist and be audited
      const changed = await put(ids.adminA, ids.agentA, [{ ...grantReceivables, reason: 'Novo motivo completo' }]);
      expect(changed.status).toBe(200);
      expect(changed.body.overrides[0].reason).toBe('Novo motivo completo');
      let all = await events();
      expect(all.length).toBe(base + 2);
      expect(all.some((entry) => entry.includes('-financial:receivables.read:GRANT') && entry.includes(reason))).toBe(true);
      expect(all.some((entry) => entry.includes('+financial:receivables.read:GRANT') && entry.includes('Novo motivo completo'))).toBe(true);
      // a removal carries the reason it had
      await put(ids.adminA, ids.agentA, []);
      all = await events();
      expect(all.length).toBe(base + 3);
      expect(all.some((entry) => entry.includes('-financial:receivables.read:GRANT') && entry.includes('Novo motivo completo'))).toBe(true);
    });
    it("does not show agency A's overrides to agency B, even through the runtime role", async () => {
      await clear();
      await put(ids.adminA, ids.agentA, [grantReceivables]);
      const client = await db.runtimePool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_agency_id', $1, true)`, [agencyB]);
        const visible = await client.query('SELECT 1 FROM user_permission_overrides');
        expect(visible.rowCount).toBe(0);
        await expect(
          client.query(
            `INSERT INTO user_permission_overrides (agency_id, user_id, resource, action, effect, reason, created_by_user_id)
             VALUES ($1, $2, 'financial', 'cash.read', 'GRANT', 'x', $3)`,
            [agencyA, ids.agentA, ids.adminB],
          ),
        ).rejects.toThrow();
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
    it('the database itself refuses overrides for OWNER/ADMIN and has no UPDATE path', async () => {
      await expect(
        admin.query(
          `INSERT INTO user_permission_overrides (agency_id, user_id, resource, action, effect, reason, created_by_user_id)
           VALUES ($1, $2, 'financial', 'cash.read', 'REVOKE', 'x', $3)`,
          [agencyA, ids.adminA, ids.ownerA],
        ),
      ).rejects.toThrow(/cannot hold permission overrides/);
      await expect(
        db.runtimePool.query(`UPDATE user_permission_overrides SET reason = 'x'`),
      ).rejects.toThrow();
    });
    it('removes overrides when the user is removed (cascade)', async () => {
      await clear();
      const tmp = '11000000-0000-4000-8000-0000000000c9';
      await admin.query(
        `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
         VALUES ($1, $2, 'tmp@example.test', 'tmp', 'AGENT', 'hash-test-only', 'ACTIVE')`,
        [tmp, agencyA],
      );
      expect((await put(ids.adminA, tmp, [grantReceivables])).status).toBe(200);
      await admin.query('DELETE FROM users WHERE id = $1', [tmp]);
      const left = await admin.query('SELECT 1 FROM user_permission_overrides WHERE user_id = $1', [tmp]);
      expect(left.rowCount).toBe(0);
    });
  });
});
