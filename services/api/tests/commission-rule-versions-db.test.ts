/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- SQL fixtures */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { startDisposableDb, type DisposableDb } from './helpers/disposable-postgres';

const migrationsDir = resolve(import.meta.dirname, '../../../infrastructure/migrations');
const ALL_MIGRATIONS = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const agencyA = '10000000-0000-4000-8000-000000000001';
const agencyB = '20000000-0000-4000-8000-000000000001';

describe('migration 107: commission rule versions, tiers and sale attributions', () => {
  let db: DisposableDb;
  let admin: Pool;
  let employeeA: string;
  let employeeB: string;
  let categoryA: string;
  let categoryB: string;
  let saleA: string;
  let saleB: string;

  beforeAll(async () => {
    db = await startDisposableDb(ALL_MIGRATIONS);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'A', 'a-107', 'a@example.test', 'FREE', 'ACTIVE'), ($2, 'B', 'b-107', 'b@example.test', 'FREE', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    await admin.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status) VALUES
        ('11000000-0000-4000-8000-000000000001', $1, 'ua@example.test', 'UA', 'ADMIN', 'x', 'ACTIVE'),
        ('21000000-0000-4000-8000-000000000001', $2, 'ub@example.test', 'UB', 'ADMIN', 'x', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    const one = async (sql: string, args: unknown[]) => (await admin.query(sql, args)).rows[0].id as string;
    employeeA = await one(`INSERT INTO employees (agency_id, name) VALUES ($1, 'Func A') RETURNING id`, [agencyA]);
    employeeB = await one(`INSERT INTO employees (agency_id, name) VALUES ($1, 'Func B') RETURNING id`, [agencyB]);
    categoryA = await one(`INSERT INTO commission_categories (agency_id, name) VALUES ($1, 'Aéreo') RETURNING id`, [agencyA]);
    categoryB = await one(`INSERT INTO commission_categories (agency_id, name) VALUES ($1, 'Aéreo') RETURNING id`, [agencyB]);
    const customerA = await one(`INSERT INTO customers (agency_id, name, status) VALUES ($1, 'C', 'ACTIVE') RETURNING id`, [agencyA]);
    const customerB = await one(`INSERT INTO customers (agency_id, name, status) VALUES ($1, 'C', 'ACTIVE') RETURNING id`, [agencyB]);
    saleA = await one(`INSERT INTO sales (agency_id, customer_id, user_id, amount, total) VALUES ($1, $2, '11000000-0000-4000-8000-000000000001', 100, 100) RETURNING id`, [agencyA, customerA]);
    saleB = await one(`INSERT INTO sales (agency_id, customer_id, user_id, amount, total) VALUES ($1, $2, '21000000-0000-4000-8000-000000000001', 100, 100) RETURNING id`, [agencyB, customerB]);
  }, 300_000);

  afterAll(async () => {
    await db?.stop();
  });

  const scope = (agency: string, employee: string | null, category: string | null, status = 'ACTIVE') =>
    admin.query(
      `INSERT INTO employee_commission_rule_scopes (agency_id, employee_id, category_id, status) VALUES ($1, $2, $3, $4) RETURNING id`,
      [agency, employee, category, status],
    );
  const version = (agency: string, scopeId: string, n: number, from: string, extra = '') =>
    admin.query(
      `INSERT INTO employee_commission_rule_versions (agency_id, scope_id, version_number, effective_from, mode, value${extra ? ', ' + extra.split('=')[0] : ''})
       VALUES ($1, $2, $3, $4, 'PERCENTAGE', 3${extra ? ', ' + extra.split('=')[1] : ''}) RETURNING id`,
      [agency, scopeId, n, from],
    );

  it('keeps two revisions of the same day; version_number is unique per scope; versions are immutable', async () => {
    const s = (await scope(agencyA, employeeA, categoryA)).rows[0].id as string;
    const v1 = (await version(agencyA, s, 1, '2026-11-01')).rows[0].id as string;
    await version(agencyA, s, 2, '2026-11-01');
    expect((await admin.query('SELECT count(*)::int AS n FROM employee_commission_rule_versions WHERE scope_id = $1', [s])).rows[0].n).toBe(2);
    await expect(version(agencyA, s, 2, '2026-12-01')).rejects.toMatchObject({ code: '23505' });
    await expect(admin.query('UPDATE employee_commission_rule_versions SET value = 9 WHERE id = $1', [v1])).rejects.toMatchObject({ code: '55000' });
    await expect(admin.query('DELETE FROM employee_commission_rule_versions WHERE id = $1', [v1])).rejects.toMatchObject({ code: '55000' });
  });

  it('rejects an inconsistent mode/value pair and a non-marginal or excess-basis variant', async () => {
    const s = (await scope(agencyA, employeeA, null)).rows[0].id as string;
    await expect(admin.query(`INSERT INTO employee_commission_rule_versions (agency_id, scope_id, version_number, effective_from, mode) VALUES ($1, $2, 1, '2026-11-01', 'PERCENTAGE')`, [agencyA, s])).rejects.toMatchObject({ code: '23514' });
    await expect(version(agencyA, s, 1, '2026-11-01', `tier_mode='BOGUS'`)).rejects.toMatchObject({ code: '23514' });
    await expect(version(agencyA, s, 1, '2026-11-01', `excess_basis='X'`)).rejects.toMatchObject({ code: '23514' });
  });

  it('partial unique indexes: one ACTIVE scope per combination; archived ones do not count', async () => {
    const e2 = (await admin.query(`INSERT INTO employees (agency_id, name) VALUES ($1, 'Func A2') RETURNING id`, [agencyA])).rows[0].id as string;
    await scope(agencyA, e2, categoryA);
    await expect(scope(agencyA, e2, categoryA)).rejects.toMatchObject({ code: '23505' });
    await scope(agencyA, e2, categoryA, 'ARCHIVED');
    await scope(agencyA, null, null); // agency default
    await expect(scope(agencyA, null, null)).rejects.toMatchObject({ code: '23505' });
    await scope(agencyA, null, categoryA);
    await expect(scope(agencyA, null, categoryA)).rejects.toMatchObject({ code: '23505' });
    await scope(agencyB, null, null); // another agency is independent
  });

  it('composite tenant FKs refuse cross-agency references', async () => {
    await expect(scope(agencyA, employeeB, null)).rejects.toMatchObject({ code: '23503' });
    await expect(scope(agencyA, null, categoryB)).rejects.toMatchObject({ code: '23503' });
    await expect(
      admin.query(`INSERT INTO sale_commission_attributions (agency_id, sale_id, employee_id, recognition_date, gross_amount) VALUES ($1, $2, $3, '2026-11-01', 100)`, [agencyA, saleB, employeeA]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('attributions: one per sale+employee, seq grows, runtime role is tenant-isolated and cannot touch versions', async () => {
    const first = await admin.query(`INSERT INTO sale_commission_attributions (agency_id, sale_id, employee_id, recognition_date, gross_amount, margin_amount) VALUES ($1, $2, $3, '2026-11-01', 100, 20) RETURNING seq::int AS seq`, [agencyA, saleA, employeeA]);
    await expect(
      admin.query(`INSERT INTO sale_commission_attributions (agency_id, sale_id, employee_id, recognition_date, gross_amount) VALUES ($1, $2, $3, '2026-11-01', 100)`, [agencyA, saleA, employeeA]),
    ).rejects.toMatchObject({ code: '23505' });
    await admin.query(`INSERT INTO sale_commission_attributions (agency_id, sale_id, employee_id, recognition_date, gross_amount) VALUES ($1, $2, $3, '2026-11-01', 100)`, [agencyB, saleB, employeeB]);

    const client = await db.runtimePool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_agency_id', $1, true)`, [agencyA]);
      const visible = await client.query('SELECT agency_id FROM sale_commission_attributions');
      expect(visible.rows.every((r) => r.agency_id === agencyA)).toBe(true);
      expect(visible.rowCount).toBe(1);
      expect(first.rows[0].seq).toBeGreaterThan(0);
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_agency_id', $1, true)`, [agencyA]);
      await expect(client.query(`UPDATE employee_commission_rule_versions SET value = 1`)).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('commission_entries: version lineage and PENDING_RULE (amount 0) are accepted; mixed lineage is refused', async () => {
    const scopeId = (await admin.query(`SELECT id FROM employee_commission_rule_scopes WHERE agency_id=$1 AND employee_id=$2 AND category_id IS NULL AND status='ACTIVE'`, [agencyA, employeeA])).rows[0].id as string;
    const v = (await version(agencyA, scopeId, 1, '2026-11-01')).rows[0].id as string;
    const insert = (cols: string, vals: unknown[]) =>
      admin.query(`INSERT INTO commission_entries (agency_id, employee_id, sale_id, calculation_base, amount${cols}) VALUES ($1, $2, $3, 100, $4${vals.length ? ', ' + vals.map((_, i) => `$${i + 5}`).join(', ') : ''}) RETURNING id`, [agencyA, employeeA, saleA, 5, ...vals]);
    await insert(', rule_version_id, accumulated_before', [v, 0]);
    await admin.query(`DELETE FROM commission_entries`);
    await expect(
      admin.query(`INSERT INTO commission_entries (agency_id, employee_id, sale_id, calculation_base, amount, status) VALUES ($1, $2, $3, 0, 0, 'PENDING_RULE')`, [agencyA, employeeA, saleA]),
    ).resolves.toBeDefined();
    await admin.query(`DELETE FROM commission_entries`);
    await expect(
      admin.query(`INSERT INTO commission_entries (agency_id, employee_id, sale_id, calculation_base, amount, status) VALUES ($1, $2, $3, 0, 7, 'PENDING_RULE')`, [agencyA, employeeA, saleA]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(insert('', [])).rejects.toMatchObject({ code: '23514' }); // no lineage at all
  });
});
