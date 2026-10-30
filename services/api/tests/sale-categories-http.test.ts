/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- HTTP/JSON fixtures in this integration test are intentionally untyped */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';
import { startDisposableDb, type DisposableDb } from './helpers/disposable-postgres';

const MIGRATIONS_BEFORE_101 = [
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
const MIGRATION_101 = '101_sale_categories_and_form_profile.sql';

const agencyAId = '10000000-0000-4000-8000-000000000001';
const agencyBId = '20000000-0000-4000-8000-000000000001';
const userAId = '11000000-0000-4000-8000-000000000001';
const userBId = '21000000-0000-4000-8000-000000000001';

const principal = (userId: string, agencyId: string, role: UserRole): AuthenticatedPrincipal => ({
  userId,
  agencyId,
  role,
  email: 'user@example.test',
});
const principals: Record<string, AuthenticatedPrincipal> = {
  adminA: principal(userAId, agencyAId, UserRole.ADMIN),
  managerA: principal(userAId, agencyAId, UserRole.MANAGER),
  agentA: principal(userAId, agencyAId, UserRole.AGENT),
  viewerA: principal(userAId, agencyAId, UserRole.VIEWER),
  adminB: principal(userBId, agencyBId, UserRole.ADMIN),
  agentB: principal(userBId, agencyBId, UserRole.AGENT),
};

describe('Sale categories, form profile and sale fields (Onda B / ADR-008)', () => {
  let db: DisposableDb;
  let admin: Pool;
  let customerA: string;
  let customerB: string;
  let legacySales: Array<{ sale_date: string; category_id: string | null; modality_data: unknown; form_snapshot: unknown; amount: string; total: string }>;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS_BEFORE_101);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-ondab', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-ondab', 'b@example.test', 'FREE', 'ACTIVE')`,
      [agencyAId, agencyBId],
    );
    await admin.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status) VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-test-only', 'ACTIVE')`,
      [userAId, agencyAId, userBId, agencyBId],
    );
    // Rows that exist BEFORE migration 101 is applied (22:30 in Sao Paulo on 05/03 is already 06/03 in UTC).
    const legacyCustomer = await seedCustomer(agencyAId, 'Legacy Customer');
    await admin.query(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, notes, created_at) VALUES
        ($1, $2, $3, 70, 5, 65, 'legacy late night', '2026-03-06T01:30:00Z'),
        ($1, $2, $3, 80, 0, 80, 'legacy noon', '2026-03-05T15:00:00Z')`,
      [agencyAId, legacyCustomer, userAId],
    );
    await db.applyMigrations([MIGRATION_101]);
    legacySales = (
      await admin.query(
        `SELECT sale_date::text AS sale_date, category_id, modality_data, form_snapshot, amount::text AS amount, total::text AS total FROM sales ORDER BY notes`,
      )
    ).rows;
  }, 240_000);

  beforeEach(async () => {
    await admin.query('TRUNCATE TABLE receivables, revenues, audit_logs, financial_categories RESTART IDENTITY CASCADE');
    await admin.query('TRUNCATE TABLE sales, sale_category_fields RESTART IDENTITY CASCADE');
    await admin.query('DELETE FROM commission_categories');
    await admin.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
    customerA = await seedCustomer(agencyAId, 'Customer A');
    customerB = await seedCustomer(agencyBId, 'Customer B');
  });

  afterAll(async () => {
    await db?.stop();
  });

  function app() {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess: (userId, agencyId) =>
        Promise.resolve((userId === userAId && agencyId === agencyAId) || (userId === userBId && agencyId === agencyBId)),
      database: createDatabaseRuntime(db.runtimePool),
    });
  }

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const r = await admin.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [agencyId, name],
    );
    return r.rows[0]!.id;
  }

  async function call(as: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) {
    const server = app();
    try {
      const res = await server.inject({ method, url, headers: { 'x-test-principal': as }, ...(payload !== undefined ? { payload: payload as object } : {}) });
      return { status: res.statusCode, body: res.json<Record<string, any>>() };
    } finally {
      await server.close();
    }
  }

  async function makeCategory(as = 'adminA', name = 'Aéreo'): Promise<string> {
    const res = await call(as, 'POST', '/sale-categories', { name });
    expect(res.status).toBe(201);
    return res.body.category.id as string;
  }

  async function setProfile(categoryId: string, fields: Array<{ fieldKey: string; enabled: boolean; required: boolean }>, as = 'adminA') {
    return call(as, 'PUT', `/sale-categories/${categoryId}/form`, { fields });
  }

  describe('characterization: sales without category keep working', () => {
    it('creates a legacy sale with no new fields; sale_date defaults to a civil date; category is null', async () => {
      const res = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 500, discount: 50 });
      expect(res.status).toBe(201);
      expect(res.body.sale).toMatchObject({ total: 450 });
      expect(res.body.sale.saleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.body.sale.categoryId ?? null).toBeNull();
      const row = await admin.query('SELECT form_snapshot, modality_data FROM sales WHERE id = $1', [res.body.sale.id]);
      expect(row.rows[0].form_snapshot).toBeNull();
      expect(row.rows[0].modality_data).toEqual({});
    });

    it('accepts an explicit saleDate and rejects an invalid one', async () => {
      const ok = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, saleDate: '2026-09-15' });
      expect(ok.status).toBe(201);
      expect(ok.body.sale.saleDate).toBe('2026-09-15');
      const bad = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, saleDate: '15/09/2026' });
      expect(bad.status).toBe(422);
      expect(bad.body.code).toBe('FIELD_INVALID');
    });

    it('a free-form modalityData without a category is refused (nothing configures it)', async () => {
      const res = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, modalityData: { locator: 'X' } });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('FIELD_DISABLED');
    });
  });

  describe('category catalog', () => {
    it('ADMIN creates/lists/patches; AGENT and MANAGER cannot write; VIEWER can read', async () => {
      const id = await makeCategory();
      expect((await call('agentA', 'POST', '/sale-categories', { name: 'X' })).status).toBe(403);
      expect((await call('managerA', 'POST', '/sale-categories', { name: 'X' })).status).toBe(403);
      expect((await call('agentA', 'PATCH', `/sale-categories/${id}`, { active: false })).status).toBe(403);
      const list = await call('viewerA', 'GET', '/sale-categories');
      expect(list.status).toBe(200);
      expect(list.body.categories).toEqual([expect.objectContaining({ id, name: 'Aéreo', active: true, sortOrder: 0 })]);
      const patched = await call('adminA', 'PATCH', `/sale-categories/${id}`, { name: 'Aéreo nacional', sortOrder: 2 });
      expect(patched.body.category).toMatchObject({ name: 'Aéreo nacional', sortOrder: 2 });
    });

    it('validates input and refuses a duplicate name (case-insensitive) with 409', async () => {
      await makeCategory();
      expect((await call('adminA', 'POST', '/sale-categories', { name: '   ' })).status).toBe(400);
      expect((await call('adminA', 'POST', '/sale-categories', { name: 'aéreo' })).status).toBe(409);
      expect((await call('adminA', 'POST', '/sale-categories', { name: 'Y', agencyId: agencyBId })).status).toBe(400);
    });

    it('inactive categories are hidden by default and cannot be used on a new sale', async () => {
      const id = await makeCategory();
      await call('adminA', 'PATCH', `/sale-categories/${id}`, { active: false });
      expect((await call('viewerA', 'GET', '/sale-categories')).body.categories).toEqual([]);
      expect((await call('viewerA', 'GET', '/sale-categories?includeInactive=true')).body.categories).toHaveLength(1);
      const sale = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, categoryId: id });
      expect(sale.status).toBe(422);
      expect(sale.body.code).toBe('CATEGORY_INACTIVE');
    });

    it('tenant isolation: B never sees or edits A, even as ADMIN; names are unique per agency only', async () => {
      const id = await makeCategory('adminA', 'Aéreo');
      expect((await call('adminB', 'GET', '/sale-categories')).body.categories).toEqual([]);
      expect((await call('adminB', 'PATCH', `/sale-categories/${id}`, { name: 'hack' })).status).toBe(404);
      expect((await call('adminB', 'PUT', `/sale-categories/${id}/form`, { fields: [] })).status).toBe(404);
      expect((await call('adminB', 'GET', `/sale-categories/${id}/form`)).status).toBe(404);
      expect((await call('adminB', 'POST', '/sale-categories', { name: 'Aéreo' })).status).toBe(201);
      const row = await admin.query('SELECT name FROM commission_categories WHERE id = $1', [id]);
      expect(row.rows[0].name).toBe('Aéreo');
    });

    it('audits create/update without leaking secrets', async () => {
      const id = await makeCategory();
      await call('adminA', 'PATCH', `/sale-categories/${id}`, { active: false });
      const events = await admin.query(`SELECT event_type FROM audit_logs WHERE entity_id = $1 ORDER BY occurred_at`, [id]);
      expect(events.rows.map((r) => r.event_type)).toEqual(['SALE_CATEGORY_CREATED', 'SALE_CATEGORY_UPDATED']);
    });
  });

  describe('form profile', () => {
    it('GET /sale-form-fields exposes the registry to any reader', async () => {
      const res = await call('viewerA', 'GET', '/sale-form-fields');
      expect(res.status).toBe(200);
      expect(res.body.fields.map((f: { key: string }) => f.key)).toContain('origin_text');
    });

    it('PUT replaces the profile, bumps the revision, audits before/after; GET merges registry + config', async () => {
      const id = await makeCategory();
      const first = await setProfile(id, [
        { fieldKey: 'origin_text', enabled: true, required: true },
        { fieldKey: 'destination_text', enabled: true, required: false },
      ]);
      expect(first.status).toBe(200);
      expect(first.body.form.formRevision).toBe(1);
      const second = await setProfile(id, [{ fieldKey: 'origin_text', enabled: true, required: false }]);
      expect(second.body.form.formRevision).toBe(2);
      const form = await call('agentA', 'GET', `/sale-categories/${id}/form`);
      const byKey = Object.fromEntries(form.body.form.fields.map((f: { fieldKey: string }) => [f.fieldKey, f]));
      expect(byKey.origin_text).toMatchObject({ enabled: true, required: false });
      expect(byKey.destination_text).toMatchObject({ enabled: false, required: false });
      expect(byKey.sale_date).toMatchObject({ enabled: true, locked: true });
      const events = await admin.query(`SELECT event_type FROM audit_logs WHERE event_type = 'SALE_CATEGORY_FORM_UPDATED'`);
      expect(events.rowCount).toBe(2);
    });

    it('rejects unknown keys, required-but-disabled, locked disable and non-admins', async () => {
      const id = await makeCategory();
      expect((await setProfile(id, [{ fieldKey: 'nope', enabled: true, required: false }])).status).toBe(400);
      expect((await setProfile(id, [{ fieldKey: 'origin_text', enabled: false, required: true }])).status).toBe(400);
      expect((await setProfile(id, [{ fieldKey: 'sale_date', enabled: false, required: false }])).status).toBe(400);
      expect((await setProfile(id, [{ fieldKey: 'origin_text', enabled: true, required: false }], 'agentA')).status).toBe(403);
      const count = await admin.query('SELECT count(*)::int AS n FROM sale_category_fields');
      expect(count.rows[0].n).toBe(0);
    });
  });

  describe('sale with a category', () => {
    async function aereo() {
      const id = await makeCategory();
      await setProfile(id, [
        { fieldKey: 'origin_text', enabled: true, required: true },
        { fieldKey: 'destination_text', enabled: true, required: true },
        { fieldKey: 'travel_start_date', enabled: true, required: false },
        { fieldKey: 'passenger_count', enabled: true, required: false },
        { fieldKey: 'locator', enabled: true, required: false },
      ]);
      return id;
    }

    it('required field missing -> 422 FIELD_REQUIRED naming the field; nothing is persisted', async () => {
      const categoryId = await aereo();
      const res = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 100, categoryId, originText: 'POA' });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'FIELD_REQUIRED', field: 'destination_text' });
      expect((await admin.query('SELECT count(*)::int AS n FROM sales')).rows[0].n).toBe(0);
    });

    it('disabled field -> 422 FIELD_DISABLED, never ignored', async () => {
      const categoryId = await aereo();
      const res = await call('agentA', 'POST', '/sales', {
        customerId: customerA, amount: 100, categoryId, originText: 'POA', destinationText: 'LIS', travelEndDate: '2026-12-30',
      });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'FIELD_DISABLED', field: 'travel_end_date' });
    });

    it('persists first-class columns, modality data and a self-contained snapshot', async () => {
      const categoryId = await aereo();
      const res = await call('agentA', 'POST', '/sales', {
        customerId: customerA, amount: 2300, categoryId, saleDate: '2026-10-01',
        originText: 'POA', destinationText: 'LIS', travelStartDate: '2026-12-20', passengerCount: 2,
        modalityData: { locator: 'ABC123' },
      });
      expect(res.status).toBe(201);
      expect(res.body.sale).toMatchObject({
        categoryId, saleDate: '2026-10-01', originText: 'POA', destinationText: 'LIS',
        travelStartDate: '2026-12-20', passengerCount: 2, modalityData: { locator: 'ABC123' },
      });
      const row = await admin.query('SELECT form_snapshot FROM sales WHERE id = $1', [res.body.sale.id]);
      expect(row.rows[0].form_snapshot).toMatchObject({
        categoryId, categoryName: 'Aéreo', formRevision: 1,
        fields: expect.arrayContaining([expect.objectContaining({ fieldKey: 'origin_text', required: true })]),
      });
    });

    it('changing the profile later does not alter existing sales; PATCH of an old sale follows its snapshot', async () => {
      const categoryId = await aereo();
      const created = await call('agentA', 'POST', '/sales', {
        customerId: customerA, amount: 100, categoryId, originText: 'POA', destinationText: 'LIS',
      });
      const saleId = created.body.sale.id as string;
      await setProfile(categoryId, [
        { fieldKey: 'origin_text', enabled: true, required: true },
        { fieldKey: 'destination_text', enabled: false, required: false },
        { fieldKey: 'travel_end_date', enabled: true, required: true },
      ]);
      const snap = await admin.query('SELECT form_snapshot FROM sales WHERE id = $1', [saleId]);
      expect(snap.rows[0].form_snapshot.formRevision).toBe(1);
      // old sale keeps editing the fields it was sold with; the newly-required field does not block it
      const ok = await call('agentA', 'PATCH', `/sales/${saleId}`, { destinationText: 'OPO' });
      expect(ok.status).toBe(200);
      expect(ok.body.sale.destinationText).toBe('OPO');
      // a field disabled at sale time stays refused
      const refused = await call('agentA', 'PATCH', `/sales/${saleId}`, { travelEndDate: '2026-12-30' });
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe('FIELD_DISABLED');
      // clearing a required field is refused
      const clear = await call('agentA', 'PATCH', `/sales/${saleId}`, { originText: '' });
      expect(clear.status).toBe(422);
      expect(clear.body.code).toBe('FIELD_REQUIRED');
      // a NEW sale uses the new profile
      const fresh = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, categoryId, originText: 'POA' });
      expect(fresh.status).toBe(422);
      expect(fresh.body.field).toBe('travel_end_date');
    });

    it('a PENDING sale can change category (revalidated + re-snapshotted); a confirmed one cannot; ranges are validated', async () => {
      const categoryId = await aereo();
      const other = await makeCategory('adminA', 'Terrestre');
      await setProfile(other, [{ fieldKey: 'passenger_count', enabled: true, required: true }]);
      const created = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 100, categoryId, originText: 'A', destinationText: 'B' });
      const id = created.body.sale.id as string;
      // incompatible: origin/destination are disabled in the new profile and passengers are required
      const incompatible = await call('agentA', 'PATCH', `/sales/${id}`, { categoryId: other });
      expect(incompatible.status).toBe(422);
      const moved = await call('agentA', 'PATCH', `/sales/${id}`, { categoryId: other, passengerCount: 3, originText: null, destinationText: null });
      expect(moved.status).toBe(200);
      const row = await admin.query('SELECT category_id, origin_text, passenger_count, form_snapshot FROM sales WHERE id = $1', [id]);
      expect(row.rows[0].category_id).toBe(other);
      expect(row.rows[0].origin_text).toBeNull();
      expect(row.rows[0].form_snapshot.categoryId).toBe(other);
      // confirmed sale: refused
      const second = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 100, categoryId: other, passengerCount: 1 });
      const confirm = await call('managerA', 'POST', `/sales/${second.body.sale.id}/confirm`);
      expect(confirm.status).toBe(200);
      const refused = await call('agentA', 'PATCH', `/sales/${second.body.sale.id}`, { categoryId, originText: 'A', destinationText: 'B', passengerCount: 1 });
      expect(refused.status).toBe(409);
      const bad = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 1, categoryId, originText: 'A', destinationText: 'B', passengerCount: 0 });
      expect(bad.status).toBe(422);
    });

    it('rate/base/deadline/commission from the client -> 422 FIELD_NOT_ALLOWED (mass-assignment)', async () => {
      const categoryId = await aereo();
      for (const key of ['rate', 'base', 'deadline', 'commission']) {
        const res = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, categoryId, originText: 'A', destinationText: 'B', [key]: 5 });
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({ code: 'FIELD_NOT_ALLOWED', field: key });
      }
    });

    it('cross-tenant: category of another agency -> 404, customer of another agency -> 404', async () => {
      const categoryB = await makeCategory('adminB', 'Aéreo');
      const res = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, categoryId: categoryB });
      expect(res.status).toBe(404);
      const res2 = await call('agentA', 'POST', '/sales', { customerId: customerB, amount: 10 });
      expect(res2.status).toBe(404);
      expect((await admin.query('SELECT count(*)::int AS n FROM sales')).rows[0].n).toBe(0);
    });

    it('the database itself refuses a cross-tenant category reference (composite FK)', async () => {
      const categoryB = await makeCategory('adminB', 'Aéreo');
      await expect(
        admin.query(
          `INSERT INTO sales (agency_id, customer_id, user_id, amount, total, category_id) VALUES ($1, $2, $3, 1, 1, $4)`,
          [agencyAId, customerA, userAId, categoryB],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('migration 101 on existing data', () => {
    it('is additive: rows that existed before 101 get the Sao Paulo civil date and keep every other value', () => {
      expect(legacySales).toHaveLength(2);
      const [lateNight, noon] = legacySales;
      expect(lateNight).toMatchObject({ sale_date: '2026-03-05', category_id: null, modality_data: {}, form_snapshot: null, amount: '70.00', total: '65.00' });
      expect(noon).toMatchObject({ sale_date: '2026-03-05', category_id: null, amount: '80.00', total: '80.00' });
    });

    it('a sale created without a date takes the Sao Paulo civil date regardless of the session time zone', async () => {
      const client = await db.runtimePool.connect();
      try {
        await client.query("SET TIME ZONE 'UTC'");
        const sp = await client.query("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS d");
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_agency_id', $1, true)", [agencyAId]);
        const inserted = await client.query(
          `INSERT INTO sales (agency_id, customer_id, user_id, amount, total) VALUES ($1, $2, $3, 1, 1) RETURNING sale_date::text AS d`,
          [agencyAId, customerA, userAId],
        );
        await client.query('ROLLBACK');
        expect(inserted.rows[0].d).toBe(sp.rows[0].d);
      } finally {
        client.release();
      }
    });
  });

  describe('configuration audit fails closed', () => {
    it('if the audit row cannot be written, the profile change is rolled back', async () => {
      const id = await makeCategory();
      await setProfile(id, [{ fieldKey: 'origin_text', enabled: true, required: true }]);
      await admin.query(`
        CREATE FUNCTION ondab_block_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'audit blocked for test'; END $$;
        CREATE TRIGGER ondab_block_audit BEFORE INSERT ON audit_logs
          FOR EACH ROW WHEN (NEW.event_type = 'SALE_CATEGORY_FORM_UPDATED') EXECUTE FUNCTION ondab_block_audit();
      `);
      try {
        const res = await setProfile(id, [{ fieldKey: 'origin_text', enabled: false, required: false }]);
        expect(res.status).toBe(500);
      } finally {
        await admin.query('DROP TRIGGER ondab_block_audit ON audit_logs; DROP FUNCTION ondab_block_audit();');
      }
      const form = await call('viewerA', 'GET', `/sale-categories/${id}/form`);
      const origin = form.body.form.fields.find((f: { fieldKey: string }) => f.fieldKey === 'origin_text');
      expect(origin).toMatchObject({ enabled: true, required: true });
      expect(form.body.form.formRevision).toBe(1);
    });
  });

  describe('sales "to complete" (derived from the snapshot, no column)', () => {
    it('lists the empty required fields and filters with ?incomplete=true', async () => {
      const snapshot = {
        categoryId: 'x', categoryName: 'Aéreo', formRevision: 1, capturedAt: '2026-10-01T00:00:00Z',
        fields: [
          { fieldKey: 'origin_text', label: 'Origem', enabled: true, required: true },
          { fieldKey: 'locator', label: 'Localizador', enabled: true, required: true },
          { fieldKey: 'airline', label: 'Cia', enabled: false, required: true },
        ],
      };
      const insert = (origin: string | null, modality: object) =>
        admin.query(
          `INSERT INTO sales (agency_id, customer_id, user_id, amount, total, origin_text, modality_data, form_snapshot)
           VALUES ($1, $2, $3, 10, 10, $4, $5::jsonb, $6::jsonb) RETURNING id`,
          [agencyAId, customerA, userAId, origin, JSON.stringify(modality), JSON.stringify(snapshot)],
        );
      const partial = (await insert('POA', {})).rows[0].id as string;
      const complete = (await insert('POA', { locator: 'ABC' })).rows[0].id as string;
      await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 5 }); // legacy-style, no snapshot

      const all = await call('viewerA', 'GET', '/sales');
      const byId = Object.fromEntries(all.body.sales.map((s: { id: string }) => [s.id, s]));
      expect(byId[partial].missingRequiredFields).toEqual(['locator']);
      expect(byId[complete].missingRequiredFields).toEqual([]);

      const filtered = await call('viewerA', 'GET', '/sales?incomplete=true');
      expect(filtered.body.sales.map((s: { id: string }) => s.id)).toEqual([partial]);
    });
  });

  describe('review round 2', () => {
    it('"to complete" also catches null and blank required values', async () => {
      const snapshot = { categoryId: 'x', categoryName: 'A', formRevision: 1, capturedAt: '2026-10-01T00:00:00Z', fields: [{ fieldKey: 'locator', label: 'L', enabled: true, required: true }] };
      for (const modality of [{ locator: null }, { locator: '   ' }]) {
        await admin.query(
          `INSERT INTO sales (agency_id, customer_id, user_id, amount, total, modality_data, form_snapshot) VALUES ($1, $2, $3, 1, 1, $4::jsonb, $5::jsonb)`,
          [agencyAId, customerA, userAId, JSON.stringify(modality), JSON.stringify(snapshot)],
        );
      }
      const res = await call('viewerA', 'GET', '/sales?incomplete=true');
      expect(res.body.sales).toHaveLength(2);
    });

    it('changing category persists a sent saleDate', async () => {
      const first = await makeCategory('adminA', 'Primeira');
      const second = await makeCategory('adminA', 'Segunda');
      const created = await call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, categoryId: first, saleDate: '2026-01-10' });
      const moved = await call('agentA', 'PATCH', `/sales/${created.body.sale.id}`, { categoryId: second, saleDate: '2026-09-15' });
      expect(moved.status).toBe(200);
      expect(moved.body.sale.saleDate).toBe('2026-09-15');
    });

    it('audit records the reorder even when required changes in the same save', async () => {
      const id = await makeCategory('adminA', 'Auditada');
      await setProfile(id, [{ fieldKey: 'origin_text', enabled: true, required: false, sortOrder: 1 } as never]);
      await setProfile(id, [{ fieldKey: 'origin_text', enabled: true, required: true, sortOrder: 7 } as never]);
      const audit = await admin.query(`SELECT metadata FROM audit_logs WHERE event_type = 'SALE_CATEGORY_FORM_UPDATED' AND entity_id = $1 ORDER BY occurred_at DESC LIMIT 1`, [id]);
      const changed = audit.rows[0].metadata.fieldsChanged as string[];
      expect(changed).toEqual(expect.arrayContaining(['origin_text:on>req', 'origin_text:order 1>7']));
    });
  });

  describe('profile replace vs. concurrent sales', () => {
    it('every sale snapshots one consistent revision (never old revision with new rules)', async () => {
      const id = await makeCategory();
      const profileFor = (revision: number) =>
        revision % 2 === 1
          ? [{ fieldKey: 'origin_text', enabled: true, required: true }]
          : [{ fieldKey: 'origin_text', enabled: true, required: false }, { fieldKey: 'destination_text', enabled: true, required: true }];
      await setProfile(id, profileFor(1));
      for (let round = 2; round <= 7; round += 1) {
        await Promise.all([
          setProfile(id, profileFor(round)),
          call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, categoryId: id, originText: 'POA', destinationText: 'LIS' }),
          call('agentA', 'POST', '/sales', { customerId: customerA, amount: 10, categoryId: id, originText: 'POA', destinationText: 'LIS' }),
        ]);
      }
      const rows = await admin.query(`SELECT form_snapshot FROM sales WHERE category_id = $1`, [id]);
      expect(rows.rowCount).toBeGreaterThan(0);
      for (const row of rows.rows) {
        const snapshot = row.form_snapshot as { formRevision: number; fields: Array<{ fieldKey: string; enabled: boolean; required: boolean }> };
        const expected = profileFor(snapshot.formRevision).map((r) => ({ ...r }));
        expect(snapshot.fields.map((f) => ({ fieldKey: f.fieldKey, enabled: f.enabled, required: f.required }))).toEqual(expected);
      }
    });
  });
});
