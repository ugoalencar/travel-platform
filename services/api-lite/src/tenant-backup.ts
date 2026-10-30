import { createCipheriv, randomBytes, scrypt } from 'node:crypto';
import type { TenantClient } from './database';
import { HttpError } from './errors';

// Operational recovery preserves the tenant's login identities and immutable audit trail.
export const BACKUP_TABLES = [
  'sellers', 'sale_categories', 'sale_category_fields', 'payment_methods', 'financial_accounts', 'financial_categories',
  'financial_parties', 'catalog_products', 'customers', 'sales', 'sale_items', 'commission_rules', 'commission_rule_versions',
  'commission_rule_tiers', 'seller_commissions', 'sale_cost_items', 'payables', 'receivables',
  'payments', 'payment_allocations', 'financial_transactions', 'import_batches', 'import_records',
  'integration_outbox', 'tenant_branding', 'tenant_sequences', 'dashboard_settings', 'user_permissions',
] as const;
const MAX_BYTES = 2 * 1024 * 1024;
export interface OperationalSnapshot {
  format: 'travel-lite-tenant-operations-v1';
  tenantId: string;
  createdAt: string;
  tables: Record<string, unknown[]>;
}

export async function captureOperationalSnapshot(client: TenantClient, tenantId: string): Promise<OperationalSnapshot> {
  // All tables are read in one SQL statement: one MVCC snapshot, not one moment per table.
  const object = BACKUP_TABLES.map((table) =>
    `'${table}',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM public.${table} r WHERE tenant_id=$1)`,
  ).join(',');
  const result = await client.query<{ bytes: number; tables: Record<string, unknown[]> | null }>(
    `WITH snapshot AS MATERIALIZED (SELECT jsonb_build_object(${object}) AS data)
     SELECT octet_length(data::text) AS bytes,
            CASE WHEN octet_length(data::text) <= $2 THEN data ELSE NULL END AS tables FROM snapshot`,
    [tenantId, MAX_BYTES],
  );
  const row = result.rows[0];
  if (!row?.tables) throw new HttpError(413, 'BACKUP_TOO_LARGE', 'Backup excede o limite desta exportação; solicite uma cópia assistida.');
  return { format: 'travel-lite-tenant-operations-v1', tenantId, createdAt: new Date().toISOString(), tables: row.tables };
}

export async function encryptOperationalSnapshot(snapshot: OperationalSnapshot, password: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, (error, derived) => error ? reject(error) : resolve(derived));
  });
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`travel-lite-backup-v1:${snapshot.tenantId}`));
    const data = Buffer.concat([cipher.update(JSON.stringify(snapshot), 'utf8'), cipher.final()]);
    return { format: 'travel-lite-encrypted-v1', tenantId: snapshot.tenantId, algorithm: 'aes-256-gcm',
      kdf: 'scrypt-N16384-r8-p1', salt: salt.toString('base64'), iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  } finally { key.fill(0); }
}
