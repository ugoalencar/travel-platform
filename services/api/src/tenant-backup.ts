/**
 * Per-agency operational backup (BAK-01), Full side.
 *
 * All tables carrying an `agency_id` are included or excluded with a reason.
 * A database test fails when a new
 * table is left unclassified, so the manifest can never silently forget one.
 * Never exported: credentials, sessions, tokens, MFA material, audit logs.
 * The file is returned encrypted and is never written on the server.
 * Restoring is NOT a self-service operation: `restoreBackupInto` is the
 * domain function used by the assisted operator procedure and by the round-trip
 * test, only for an agency whose manifest tables are empty.
 */
import { getAgencyId, getTenantContext, getUserId, requireExactRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, ValidationError } from './errors';
import { PENDING_INVENTORY } from './tenant-backup-pending';
import { verifyPassword } from './password-hashing';
import {
  BACKUP_FORMAT,
  canonicalTableHash,
  decryptBackup,
  encryptBackup,
  type BackupEnvelope,
  type BackupPlaintext,
} from './tenant-backup-crypto';

/** Default restore order; live FK dependencies are checked before restoring. Only tables without credential-like columns may be listed here. */
export const BACKUP_TABLES = [
  'customers',
  'suppliers',
  'payments',
  'customer_field_settings',
  'dashboard_layouts',
  'agency_entitlements',
  'agent_area_grants',
  'brokers',
  'campaign_partner_stubs',
  'campaigns',
  'cash_transactions',
  'commercial_partners',
  'commission_categories',
  'commission_financial_profiles',
  'commission_plans',
  'contract_templates',
  'cost_centers',
  'departments',
  'excursions',
  'financial_categories',
  'import_jobs',
  'import_mapping_templates',
  'media_assets',
  'notification_preferences',
  'offers',
  'operational_staff',
  'payment_conditions',
  'payment_method_receipt_rules',
  'permission_restrictions',
  'pescador_searches',
  'pescador_sources',
  'pipelines',
  'routes',
  'sale_import_batches',
  'agency_revenue_settlement_settings',
  'agency_revenue_batches',
  'agency_commission_engine_settings',
  'agency_commission_cost_policies',
  'upsell_rules',
  'user_permission_overrides',
  'campaign_offers',
  'coupons',
  'customer_addresses',
  'customer_dependents',
  'customer_documents',
  'employees',
  'enrollment_submissions',
  'excursion_departures',
  'expenses',
  'external_offer_captures',
  'insurance_products',
  'media_asset_links',
  'operational_staff_capabilities',
  'partner_campaigns',
  'partner_contracts',
  'payment_condition_categories',
  'payment_condition_methods',
  'pescador_search_results',
  'pipeline_access',
  'pipeline_stages',
  'publications',
  'reconciliations',
  'route_points',
  'sale_category_fields',
  'agency_revenue_batch_receipts',
  'supplier_category_links',
  'transport_products',
  'travel_products',
  'wishes',
  'agency_revenue_scopes',
  'assets',
  'automations',
  'campaign_placements',
  'campaign_products',
  'customer_segments',
  'document_attachments',
  'document_extractions',
  'employee_commission_rule_scopes',
  'employee_commission_payment_policies',
  'employee_commission_rules',
  'employee_deductions',
  'engagements',
  'enrollment_documents',
  'payment_condition_products',
  'payroll_entries',
  'proposals',
  'scheduled_departures',
  'travel_requirements',
  'sales',
  'agency_revenue_rule_versions',
  'agency_communications',
  'automation_executions',
  'bookings',
  'campaign_attributions',
  'connector_actions',
  'coupon_grants',
  'document_verifications',
  'employee_commission_rule_versions',
  'product_assets',
  'proposal_optional_items',
  'proposal_sections',
  'transport_operations',
  'receivables',
  'booking_passengers',
  'commercial_opportunities',
  'commission_entries',
  'commissions',
  'contract_documents',
  'coupon_redemptions',
  'employee_commission_rule_tiers',
  'operation_assignments',
  'operation_checkpoints',
  'operational_costs',
  'partner_attributions',
  'proposal_items',
  'revenues',
  'sale_commission_attributions',
  'sale_import_keys',
  'sale_payment_reversals',
  'sale_payment_condition_versions',
  'sale_payment_requests',
  'trips',
  'air_services',
  'commercial_tasks',
  'commission_release_events',
  'contract_parties',
  'customer_interactions',
  'excursion_customers',
  'insurance_policies',
  'land_services',
  'partner_commissions',
  'payables',
  'post_trip_checklist',
  'trip_occurrences',
  'trip_photos',
  'sale_items',
  'payment_allocations',
  'contract_signature_evidence',
  'insurance_documents',
  'insurance_travelers',
  'agency_revenue_entries',
  'upsell_suggestions',
  'agency_revenue_batch_entries',
  'agency_module_settings',
] as const;

/** Columns that must never travel in a backup. */
export const FORBIDDEN_COLUMN = /secret|token|password|credential|api_key/i;

/** Tables never exported, with the reason (checked by the completeness test). */
export const EXCLUDED_WITH_REASON: Readonly<Record<string, string>> = {
  support_cases: 'Platform support cases and access governance; recovered by the platform operator',
  audit_logs: 'immutable trail; only the backup event itself is recorded',
  captcha_verifications: 'Ephemeral anti-abuse proofs containing vendor tokens',
  contract_signature_links: 'Expiring signature access tokens; provision fresh links after recovery',
  customer_accounts: 'Customer login credentials; provision identities separately',
  enrollment_links: 'Expiring enrollment access tokens; provision fresh links after recovery',
  invitations: 'Expiring account invitations with access tokens',
  partner_links: 'Partner access tokens; provision fresh links after recovery',
  offer_growth_audit_log: 'Immutable operational audit trail',
  document_audit_events: 'Immutable document audit trail',
  subscriber_tenants: 'Platform subscription ownership and billing state; controlled outside tenant recovery',
  platform_referral_credits: 'Platform billing credits; controlled outside tenant recovery',
  users: 'credentials (password_hash): login identities are not restored from a file',
  auth_sessions: 'session credentials',
  customer_sessions: 'session credentials',
  password_reset_tokens: 'tokens',
  customer_password_reset_tokens: 'tokens',
  mfa_totp_secrets: 'MFA secrets',
  mfa_recovery_codes: 'MFA secrets',
  mfa_requirements: 'MFA state',
  mfa_totp_attempts: 'MFA state',
  tenant_backup_runs: 'Managed backup history references private storage objects that are not part of the tenant recovery archive',
  tenant_backup_schedules: 'Worker scheduling state must be reviewed and reconfigured after tenant recovery',
};

/** Test hook: the in-memory limiter is shared by the whole process. No-op outside tests. */
export function resetBackupRateLimitForTests(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) attempts.clear();
}

export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const EXPORT_WINDOW_MS = 15 * 60_000;
const EXPORT_MAX_PER_WINDOW = 3;
const attempts = new Map<string, number[]>();

export class BackupError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface ExportInput {
  currentPassword: string;
  archivePassword: string;
}

export function parseExportInput(body: unknown): ExportInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['currentPassword', 'archivePassword'].includes(key))) {
    throw new ValidationError('Unknown field in request body');
  }
  const { currentPassword, archivePassword } = record;
  if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > 200) {
    throw new ValidationError('Field "currentPassword" is required');
  }
  if (typeof archivePassword !== 'string' || archivePassword.length < 12 || archivePassword.length > 200) {
    throw new ValidationError('Field "archivePassword" must have 12 to 200 characters');
  }
  if (archivePassword === currentPassword) throw new ValidationError('The archive password must differ from the access password');
  return { currentPassword, archivePassword };
}

async function deny(database: DatabaseRuntime, reason: string): Promise<never> {
  await database.withTenantTransaction((client) =>
    recordAuditEvent(client, {
      eventType: AuditEventType.BACKUP_EXPORT_DENIED,
      entityType: 'backup',
      metadata: { reasonCode: reason },
    }),
  );
  throw new BackupError(403, 'BACKUP_NOT_ALLOWED', 'Não foi possível confirmar a sua identidade para exportar.');
}

/** Step-up: OWNER only, rate limited, current password verified; an enrolled MFA is refused (fail closed). */
export async function authorizeBackupStepUp(database: DatabaseRuntime, currentPassword: string): Promise<void> {
  requireExactRole(UserRole.OWNER);
  const userId = getUserId();
  const now = Date.now();
  const recent = (attempts.get(userId) ?? []).filter((at) => now - at < EXPORT_WINDOW_MS);
  if (recent.length >= EXPORT_MAX_PER_WINDOW) {
    throw new BackupError(429, 'BACKUP_RATE_LIMIT', 'Muitas tentativas de exportação. Aguarde alguns minutos.');
  }
  attempts.set(userId, [...recent, now]);

  const user = await database.withTenantTransaction(async (client) => {
    const row = await client.query<{ password_hash: string | null; mfa: boolean }>(
      `SELECT u.password_hash,
              EXISTS (SELECT 1 FROM mfa_totp_secrets m WHERE m.agency_id = u.agency_id AND m.user_id = u.id AND m.verified_at IS NOT NULL) AS mfa
         FROM users u WHERE u.agency_id = $1 AND u.id = $2 AND u.status = 'ACTIVE'`,
      [getAgencyId(), userId],
    );
    return row.rows[0];
  });
  if (!user?.password_hash || !(await verifyPassword(currentPassword, user.password_hash))) await deny(database, 'PASSWORD');
  // A TOTP step-up for backups is not implemented yet: an enrolled user cannot export (never bypass MFA).
  if (user?.mfa) await deny(database, 'MFA_REQUIRED');
}

/**
 * Compatibility fingerprint of the manifest tables (name, column, type) read from pg_catalog, so it
 * does not depend on grants or on a hand-maintained migration registry. A restore into a schema
 * with a different shape is refused.
 */
async function schemaVersion(client: TenantTransactionClient): Promise<string> {
  const columns = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "table", a.attname AS "column", format_type(a.atttypid, a.atttypmod) AS "type"
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1) AND a.attnum > 0 AND NOT a.attisdropped`,
    [[...BACKUP_TABLES]],
  );
  return `cols:${canonicalTableHash(columns.rows).slice(0, 16)}`;
}

/** Reads every manifest table in ONE transaction snapshot, scoped by RLS and an explicit agency filter. */
async function capture(client: TenantTransactionClient): Promise<BackupPlaintext> {
  const agencyId = getAgencyId();
  await client.query(`SET LOCAL statement_timeout = '30s'`);
  const tables: BackupPlaintext['tables'] = {};
  const manifest: BackupPlaintext['manifest'] = [];
  for (const table of BACKUP_TABLES) {
    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    if (columns.rows.some((column) => FORBIDDEN_COLUMN.test(column.column_name))) {
      throw new BackupError(500, 'BACKUP_MANIFEST_INVALID', 'Backup manifest contains a forbidden column');
    }
  }
  // All tables are read in ONE statement: one MVCC snapshot, not one moment per table.
  const object = BACKUP_TABLES.map(
    (table) => `SELECT '${table}' AS name, (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) FROM public.${table} t WHERE t.agency_id = $1) AS payload`,
  ).join(' UNION ALL ');
  const snapshot = await client.query<{ data: Record<string, Array<Record<string, unknown>>> }>(
    `SELECT jsonb_object_agg(name, payload) AS data FROM (${object}) snapshot`,
    [agencyId],
  );
  for (const table of BACKUP_TABLES) {
    tables[table] = snapshot.rows[0]?.data[table] ?? [];
    manifest.push({ table, rows: tables[table].length, sha256: canonicalTableHash(tables[table]) });
  }
  const payload: BackupPlaintext = {
    format: BACKUP_FORMAT,
    agencyId,
    createdAt: new Date().toISOString(),
    schemaVersion: await schemaVersion(client),
    manifest,
    tables,
  };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_BACKUP_BYTES) {
    throw new BackupError(413, 'BACKUP_TOO_LARGE', 'Backup excede o limite desta exportação; solicite uma cópia assistida.');
  }
  return payload;
}

export function captureTenantBackupSnapshot(client: TenantTransactionClient): Promise<BackupPlaintext> {
  return capture(client);
}

export async function exportTenantBackup(database: DatabaseRuntime, input: ExportInput) {
  await authorizeBackupStepUp(database, input.currentPassword);
  const plaintext = await database.withTenantTransaction(async (client) => {
    const snapshot = await capture(client);
    const manifestHash = canonicalTableHash(snapshot.manifest);
    // Required audit: if the event cannot be written no file is returned (fail closed).
    await recordAuditEvent(client, {
      eventType: AuditEventType.BACKUP_EXPORTED,
      entityType: 'backup',
      required: true,
      metadata: {
        fieldsChanged: snapshot.manifest.map((entry) => `${entry.table}:${entry.rows}`),
        reasonCode: `manifest:${manifestHash.slice(0, 16)}`,
      },
    });
    return snapshot;
  });
  const envelope = await encryptBackup(plaintext, input.archivePassword);
  return {
    envelope,
    summary: {
      scope: 'CLASSIFIED' as const,
      pendingInventory: pendingTables(),
      tables: plaintext.manifest,
      automatic: { configured: false },
    },
  };
}

export interface VerifyReport {
  ok: boolean;
  schemaVersion: string;
  tables: Array<{ table: string; rows: number; hashOk: boolean; existingRows: number; conflict: boolean }>;
  reportHash: string;
}

/** Reject incomplete manifests and foreign-agency rows before any write, including under an operator pool. */
export function validateBackupContent(plaintext: BackupPlaintext, agencyId: string): void {
  const invalid = () => new BackupError(422, 'BACKUP_INVALID', 'Invalid or incomplete backup manifest');
  if (plaintext.agencyId !== agencyId || plaintext.format !== BACKUP_FORMAT ||
      !Array.isArray(plaintext.manifest) || !plaintext.tables || typeof plaintext.tables !== 'object') throw invalid();
  if (plaintext.manifest.some(entry => !entry || typeof entry.table !== 'string' ||
      !Number.isSafeInteger(entry.rows) || entry.rows < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw invalid();
  const names = plaintext.manifest.map(entry => entry.table);
  if (new Set(names).size !== BACKUP_TABLES.length || names.length !== BACKUP_TABLES.length ||
      Object.keys(plaintext.tables).length !== BACKUP_TABLES.length ||
      BACKUP_TABLES.some(table => !names.includes(table))) throw invalid();
  for (const entry of plaintext.manifest) {
    const rows = plaintext.tables[entry.table];
    if (!(BACKUP_TABLES as readonly string[]).includes(entry.table) || !Array.isArray(rows)) throw invalid();
    if (rows.length !== entry.rows || canonicalTableHash(rows) !== entry.sha256) {
      throw new BackupError(422, 'BACKUP_CORRUPT', `Hash mismatch for ${entry.table}`);
    }
    if (rows.some(row => !row || row.agency_id !== agencyId || Object.keys(row).some(key => FORBIDDEN_COLUMN.test(key)))) throw invalid();
  }
}

/** Parents first. Cyclic financial references are inserted together in one SQL statement,
 * so PostgreSQL validates every FK at statement end without disabling any constraint. */
async function restoreOrder(client: TenantTransactionClient, plaintext: BackupPlaintext): Promise<string[][]> {
  const edges = await client.query<{ child: string; parent: string }>(
    `SELECT c.relname AS child, p.relname AS parent FROM pg_constraint f
       JOIN pg_class c ON c.oid=f.conrelid JOIN pg_class p ON p.oid=f.confrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE f.contype='f' AND n.nspname='public' AND c.relname=ANY($1) AND p.relname=ANY($1)`,
    [[...BACKUP_TABLES]],
  );
  let remaining: string[] = BACKUP_TABLES.filter(table => plaintext.tables[table]!.length > 0);
  const groups: string[][] = [];
  while (remaining.length) {
    const ready = remaining.filter(table => !edges.rows.some(edge => edge.child === table && edge.parent !== table && remaining.includes(edge.parent)));
    if (!ready.length) { groups.push(remaining); break; }
    groups.push(ready);
    remaining = remaining.filter(table => !ready.includes(table));
  }
  return groups;
}

/** Dry-run: decrypt, validate and compare with the live data. Writes nothing (only the audit event). */
export async function verifyTenantBackup(database: DatabaseRuntime, envelope: BackupEnvelope, archivePassword: string, currentPassword: string): Promise<VerifyReport> {
  await authorizeBackupStepUp(database, currentPassword);
  let plaintext: BackupPlaintext;
  try {
    plaintext = await decryptBackup(envelope, archivePassword, getAgencyId());
  } catch {
    throw new BackupError(422, 'BACKUP_INVALID', 'Arquivo de backup inválido, corrompido ou senha incorreta.');
  }
  return verifyBackupPlaintext(database, plaintext);
}

export async function verifyBackupPlaintext(
  database: DatabaseRuntime,
  plaintext: BackupPlaintext,
  eventType: AuditEventType = AuditEventType.BACKUP_VERIFIED,
): Promise<VerifyReport> {
  return database.withTenantTransaction(async (client) => {
    validateBackupContent(plaintext, getAgencyId());
    const current = await schemaVersion(client);
    const tables: VerifyReport['tables'] = [];
    for (const entry of plaintext.manifest) {
      if (!(BACKUP_TABLES as readonly string[]).includes(entry.table)) {
        throw new BackupError(422, 'BACKUP_INVALID', 'O backup contém uma tabela fora do manifesto.');
      }
      const rows = plaintext.tables[entry.table] ?? [];
      const existing = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.${entry.table} WHERE agency_id = $1`,
        [getAgencyId()],
      );
      tables.push({
        table: entry.table,
        rows: rows.length,
        hashOk: canonicalTableHash(rows) === entry.sha256 && rows.length === entry.rows,
        existingRows: existing.rows[0]?.n ?? 0,
        conflict: (existing.rows[0]?.n ?? 0) > 0,
      });
    }
    const ok = tables.every((table) => table.hashOk) && plaintext.schemaVersion === current;
    const reportHash = canonicalTableHash([{ tables, schemaVersion: plaintext.schemaVersion, current }]);
    await recordAuditEvent(client, {
      eventType,
      entityType: 'backup',
      required: true,
      metadata: { result: ok ? 'OK' : 'DIVERGENT', reasonCode: `report:${reportHash.slice(0, 16)}` },
    });
    return { ok, schemaVersion: plaintext.schemaVersion, tables, reportHash };
  });
}

export async function restoreManagedBackupPlaintext(
  database: DatabaseRuntime,
  plaintext: BackupPlaintext,
  reportHash: string,
): Promise<{ restored: true; tables: Array<{ table: string; rows: number }> }> {
  const report = await verifyBackupPlaintext(database, plaintext, AuditEventType.BACKUP_MANAGED_VERIFIED);
  if (!report.ok || report.reportHash !== reportHash || report.tables.some(table => table.conflict)) {
    throw new ConflictError('Restore requires a current verification report and empty destination tables');
  }
  await database.withTenantTransaction(async client => {
    await restoreBackupInto(client, getAgencyId(), plaintext);
    await recordAuditEvent(client, {
      eventType: AuditEventType.BACKUP_MANAGED_RESTORED,
      entityType: 'backup',
      required: true,
      metadata: { reasonCode: `report:${reportHash.slice(0, 16)}`, result: 'OK' },
    });
  });
  return { restored: true, tables: report.tables.map(({ table, rows }) => ({ table, rows })) };
}

/**
 * Restores a decrypted backup into the SAME agency, atomically, only when all
 * manifest tables are empty for that agency (default mode of the assisted
 * procedure). Verifies per-table counts and hashes against the manifest before
 * returning; any divergence throws so the caller's transaction rolls back.
 * HTTP uses the same empty-destination guard and explicit verification report.
 */
export async function restoreBackupInto(
  client: TenantTransactionClient,
  agencyId: string,
  plaintext: BackupPlaintext,
): Promise<void> {
  if (plaintext.agencyId !== agencyId) throw new BackupError(422, 'BACKUP_INVALID', 'Backup belongs to another agency');
  validateBackupContent(plaintext, agencyId);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`tenant-backup-restore:${agencyId}`]);
  const current = await schemaVersion(client);
  if (plaintext.schemaVersion !== current) throw new BackupError(409, 'BACKUP_SCHEMA_MISMATCH', 'Incompatible schema version');
  for (const table of BACKUP_TABLES) {
    const count = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId]);
    if ((count.rows[0]?.n ?? 0) > 0) throw new ConflictError(`Restore needs empty tables for the agency (${table} has rows)`);
  }
  const order = await restoreOrder(client, plaintext);
  for (const group of order) {
    const statements: string[] = [];
    const values: unknown[] = [];
    for (const table of group) {
      const columns = await client.query<{ name: string }>(
        `SELECT a.attname AS name FROM pg_attribute a
         WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' ORDER BY a.attnum`,
        [`public.${table}`],
      );
      const names = columns.rows.map(row => '"' + row.name.replaceAll('"', '""') + '"').join(', ');
      values.push(JSON.stringify(plaintext.tables[table]));
      statements.push(`restored_${statements.length} AS (INSERT INTO public.${table} (${names}) OVERRIDING SYSTEM VALUE SELECT ${names} FROM jsonb_populate_recordset(NULL::public.${table}, $${values.length}::jsonb) RETURNING 1)`);
    }
    await client.query(`WITH ${statements.join(', ')} SELECT 1`, values);
  }
  // Advance identity sequences without changing historical attribution ordering.
  await client.query('SELECT tenant_backup_sync_identity_sequences()');
  for (const entry of plaintext.manifest) {
    const after = await client.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(t) AS row FROM public.${entry.table} t WHERE t.agency_id = $1`,
      [agencyId],
    );
    if (after.rows.length !== entry.rows || canonicalTableHash(after.rows.map((r) => r.row)) !== entry.sha256) {
      throw new BackupError(500, 'BACKUP_RESTORE_DIVERGED', `Restored ${entry.table} differs from the manifest`);
    }
  }
}

/** Assisted recovery: exact owner, step-up, reviewed report, same agency and empty destination. */
export async function restoreTenantBackup(database: DatabaseRuntime, envelope: BackupEnvelope, archivePassword: string, currentPassword: string, reportHash: string) {
  const report = await verifyTenantBackup(database, envelope, archivePassword, currentPassword);
  if (!report.ok || report.reportHash !== reportHash || report.tables.some(table => table.conflict)) {
    throw new ConflictError('Restore requires a current verification report and empty destination tables');
  }
  const plaintext = await decryptBackup(envelope, archivePassword, getAgencyId());
  await database.withTenantTransaction(async client => {
    await restoreBackupInto(client, getAgencyId(), plaintext);
    await recordAuditEvent(client, {
      eventType: AuditEventType.BACKUP_RESTORED, entityType: 'backup', required: true,
      metadata: { reasonCode: `report:${reportHash.slice(0, 16)}`, result: 'OK' },
    });
  });
  return { restored: true, tables: report.tables.map(({ table, rows }) => ({ table, rows })) };
}

/** Status for the UI: recent events; the app never claims a schedule that does not exist. */
export async function getBackupStatus(database: DatabaseRuntime) {
  requireExactRole(UserRole.OWNER);
  getTenantContext();
  return database.withTenantTransaction(async (client) => {
    const events = await client.query(
      `SELECT event_type, outcome, occurred_at FROM audit_logs
        WHERE agency_id = $1 AND event_type IN ('BACKUP_EXPORTED', 'BACKUP_EXPORT_DENIED', 'BACKUP_VERIFIED', 'BACKUP_RESTORED')
        ORDER BY occurred_at DESC LIMIT 20`,
      [getAgencyId()],
    );
    return { automatic: { configured: false }, scope: 'CLASSIFIED', pendingInventory: pendingTables(), events: events.rows };
  });
}

export { PENDING_INVENTORY } from './tenant-backup-pending';
export const pendingTables = (): readonly string[] => PENDING_INVENTORY;
