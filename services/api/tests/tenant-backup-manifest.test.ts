import { describe, expect, it, vi } from 'vitest';
import { BACKUP_TABLES, EXCLUDED_WITH_REASON, PENDING_INVENTORY, restoreBackupInto, validateBackupContent } from '../src/tenant-backup';
import { BACKUP_FORMAT, canonicalTableHash, type BackupPlaintext } from '../src/tenant-backup-crypto';
import type { TenantTransactionClient } from '../src/database';

const fixture = (): BackupPlaintext => ({
  format: BACKUP_FORMAT, agencyId: 'A', createdAt: '2026-10-25T00:00:00Z', schemaVersion: 'test',
  manifest: BACKUP_TABLES.map(table => ({ table, rows: 0, sha256: canonicalTableHash([]) })),
  tables: Object.fromEntries(BACKUP_TABLES.map(table => [table, []])),
});

describe('complete tenant backup manifest', () => {
  it('classifies business history, configuration, permissions, financials and import keys', () => {
    expect(PENDING_INVENTORY).toEqual([]);
    for (const table of ['commission_entries', 'employee_commission_rules', 'employee_commission_rule_versions',
      'employee_commission_rule_tiers', 'sale_commission_attributions', 'commission_financial_profiles',
      'commission_release_events', 'payroll_entries', 'payables', 'receivables', 'payment_allocations',
      'payment_conditions', 'sale_payment_condition_versions', 'sale_payment_requests', 'sale_payment_reversals',
      'agency_revenue_entries', 'agency_revenue_batches', 'agency_revenue_batch_receipts', 'agency_revenue_batch_entries',
      'user_permission_overrides', 'sale_category_fields', 'dashboard_layouts', 'sale_import_keys']) {
      expect(BACKUP_TABLES).toContain(table);
    }
    expect(BACKUP_TABLES).toContain('agency_module_settings');
    expect(EXCLUDED_WITH_REASON.tenant_backup_runs).toMatch(/managed backup history/i);
    expect(EXCLUDED_WITH_REASON.tenant_backup_schedules).toMatch(/scheduling state/i);
    for (const table of BACKUP_TABLES) expect(EXCLUDED_WITH_REASON[table]).toBeUndefined();
    expect(new Set(BACKUP_TABLES).size).toBe(BACKUP_TABLES.length);
    expect(() => validateBackupContent(fixture(), 'A')).not.toThrow();
  });

  it('rejects missing/duplicate manifests, extra tables and tampered rows', () => {
    const missing = fixture(); missing.manifest.pop();
    expect(() => validateBackupContent(missing, 'A')).toThrow(/manifest/);
    const duplicate = fixture(); duplicate.manifest[0] = duplicate.manifest[1]!;
    expect(() => validateBackupContent(duplicate, 'A')).toThrow(/manifest/);
    const extra = fixture(); extra.tables.users = [];
    expect(() => validateBackupContent(extra, 'A')).toThrow(/manifest/);
    const corrupt = fixture(); corrupt.tables.customers = [{ agency_id: 'A', id: 'c' }];
    expect(() => validateBackupContent(corrupt, 'A')).toThrow(/Hash mismatch/);
  });

  it('rejects a foreign tenant row or forbidden column even when its hash is valid', () => {
    for (const row of [{ id: 'c', agency_id: 'B' }, { id: 'c', agency_id: 'A', password_hash: 'forbidden' }]) {
      const payload = fixture(); payload.tables.customers = [row];
      const manifest = payload.manifest.find(entry => entry.table === 'customers')!;
      manifest.rows = 1; manifest.sha256 = canonicalTableHash([row]);
      expect(() => validateBackupContent(payload, 'A')).toThrow(/manifest/);
    }
    expect(() => validateBackupContent(fixture(), 'B')).toThrow(/manifest/);
  });

  it('keeps cyclic financial references in one insert statement without disabling constraints', async () => {
    const payload = fixture();
    payload.schemaVersion = `cols:${canonicalTableHash([]).slice(0, 16)}`;
    const cycle = ['sale_items', 'payables', 'commission_entries', 'agency_revenue_entries'];
    for (const table of cycle) {
      payload.tables[table] = [{ agency_id: 'A', id: table }];
      const entry = payload.manifest.find(row => row.table === table)!;
      entry.rows = 1; entry.sha256 = canonicalTableHash(payload.tables[table]);
    }
    const query = vi.fn((sql: string, values?: readonly unknown[]) => {
      if (sql.includes('FROM pg_constraint')) return Promise.resolve({ rows: cycle.map((child, i) => ({ child, parent: cycle[(i + 1) % cycle.length] })) });
      if (sql.includes('count(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      if (sql.includes('a.attgenerated')) return Promise.resolve({ rows: [{ name: 'agency_id' }, { name: 'id' }] });
      if (sql.startsWith('SELECT to_jsonb(t)')) {
        const table = sql.match(/FROM public\.(\w+)/)![1]!;
        expect(values).toEqual(['A']);
        return Promise.resolve({ rows: payload.tables[table]!.map(row => ({ row })) });
      }
      return Promise.resolve({ rows: [] });
    });
    await restoreBackupInto({ query } as unknown as TenantTransactionClient, 'A', payload);
    const inserts = query.mock.calls.filter(([sql]) => sql.startsWith('WITH restored_'));
    expect(inserts).toHaveLength(1);
    for (const table of cycle) expect(inserts[0]![0]).toContain(`INSERT INTO public.${table}`);
    expect(inserts[0]![0]).toContain('OVERRIDING SYSTEM VALUE');
    expect(query.mock.calls.some(([sql]) => /DISABLE|session_replication_role|DROP CONSTRAINT/.test(sql))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('tenant_backup_sync_identity_sequences()'))).toBe(true);
  });
});
