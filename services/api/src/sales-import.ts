import {buildImportFormSnapshot} from './sales-import-completion';
/**
 * Sales import service (IMP-01): dry run, then an atomic, idempotent confirm.
 * The plan is computed by the pure planner; this file only loads the lookups
 * of the session's agency and writes. Imported sales are historical: this code
 * never touches commissions or receivables (a test proves the counts do not move).
 */
import { getAgencyId, getUserId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, ValidationError } from './errors';
import {
  contentHash,
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  normalizeName,
  planSalesImport,
  type SalesImportPlan,
  type SalesImportRow,
} from './sales-import-plan';

export interface SalesImportInput {
  sourceSystem: string;
  rows: SalesImportRow[];
  /** Only on confirm: the hash the user saw in the dry run. */
  contentHash?: string;
}

export function parseSalesImportInput(body: unknown, confirm: boolean): SalesImportInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
  const record = body as Record<string, unknown>;
  const allowed = confirm ? ['sourceSystem', 'rows', 'contentHash'] : ['sourceSystem', 'rows'];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new ValidationError('Unknown field in request body');
  const sourceSystem = typeof record.sourceSystem === 'string' ? record.sourceSystem.trim() : '';
  if (sourceSystem.length < 1 || sourceSystem.length > 60 || sourceSystem.includes('|')) {
    throw new ValidationError('Field "sourceSystem" is required (1 to 60 characters, without "|")');
  }
  if (!Array.isArray(record.rows)) throw new ValidationError('Field "rows" must be a list');
  if (record.rows.length === 0 || record.rows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(`Field "rows" must have 1 to ${MAX_IMPORT_ROWS} rows`);
  }
  const columns = new Set<string>(IMPORT_COLUMNS);
  const rows = record.rows.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Each row must be an object');
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!columns.has(key)) throw new ValidationError(`Unknown column "${key}"`);
      if (typeof value !== 'string' || value.length > 500) throw new ValidationError(`Column "${key}" must be text (max 500)`);
      out[key] = value;
    }
    return out;
  });
  if (confirm && (typeof record.contentHash !== 'string' || !/^[0-9a-f]{64}$/.test(record.contentHash))) {
    throw new ValidationError('Field "contentHash" (from the dry run) is required');
  }
  return { sourceSystem, rows, ...(confirm ? { contentHash: record.contentHash as string } : {}) };
}

async function buildPlan(client: TenantTransactionClient, input: SalesImportInput): Promise<SalesImportPlan> {
  const agencyId = getAgencyId();
  const customers = await client.query<{ id: string; cpf: string }>(
    `SELECT id, regexp_replace(cpf, '\\D', '', 'g') AS cpf FROM customers WHERE agency_id = $1 AND cpf IS NOT NULL AND deleted_at IS NULL`,
    [agencyId],
  );
  const categories = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM commission_categories WHERE agency_id = $1`,
    [agencyId],
  );
  const suppliers = await client.query<{ id: string; name: string }>(`SELECT id, name FROM suppliers WHERE agency_id = $1 AND active`, [agencyId]);
  const keys = await client.query<{ source_system: string; external_ref: string }>(
    `SELECT source_system, external_ref FROM sale_import_keys WHERE agency_id = $1 AND source_system = $2`,
    [agencyId, input.sourceSystem],
  );
  const byName = (rows: Array<{ id: string; name: string }>) => {
    // An ambiguous name (two rows with the same normalized name) is not matched: it is reported "a completar".
    const map = new Map<string, string | null>();
    for (const row of rows) {
      const key = normalizeName(row.name);
      map.set(key, map.has(key) ? null : row.id);
    }
    return new Map([...map].filter((entry): entry is [string, string] => entry[1] !== null));
  };
  const cpfs = new Map<string, string | null>();
  for (const row of customers.rows) cpfs.set(row.cpf, cpfs.has(row.cpf) ? null : row.id);
  return planSalesImport(
    input.rows,
    {
      customersByCpf: new Map([...cpfs].filter((entry): entry is [string, string] => entry[1] !== null)),
      categoriesByName: byName(categories.rows),
      suppliersByName: byName(suppliers.rows),
      existingKeys: new Set(keys.rows.map((row) => `${row.source_system}|${row.external_ref}`)),
      today: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    },
    input.sourceSystem,
  );
}

export async function dryRunSalesImport(database: DatabaseRuntime, input: SalesImportInput) {
  requireRole(UserRole.MANAGER);
  const hash = contentHash(input.rows, input.sourceSystem);
  return database.withTenantTransaction(async (client) => {
    const plan = await buildPlan(client, input);
    const previous = await client.query<{ summary: unknown; created_at: Date }>(
      `SELECT summary, created_at FROM sale_import_batches WHERE agency_id = $1 AND content_hash = $2`,
      [getAgencyId(), hash],
    );
    return { contentHash: hash, alreadyImported: previous.rows[0] !== undefined, plan };
  });
}

export async function confirmSalesImport(database: DatabaseRuntime, input: SalesImportInput) {
  requireRole(UserRole.MANAGER);
  const hash = contentHash(input.rows, input.sourceSystem);
  if (input.contentHash !== hash) throw new ConflictError('The file differs from the one validated in the dry run');
  const agencyId = getAgencyId();
  const userId = getUserId();
  return database.withTenantTransaction(async (client) => {
    // One import per agency and source system at a time: the loser of a race replays the stored result or
    // re-plans against the keys the winner just wrote (different files may share natural keys).
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`sales-import:${agencyId}:${input.sourceSystem}`]);
    const replay = await client.query<{ summary: unknown }>(
      `SELECT summary FROM sale_import_batches WHERE agency_id = $1 AND content_hash = $2`,
      [agencyId, hash],
    );
    if (replay.rows[0]) return { replayed: true, contentHash: hash, summary: replay.rows[0].summary };

    const plan = await buildPlan(client, input);
    // Batches are append-only (no UPDATE grant): the summary is known from the plan before anything is written.
    const summary = {
      ...plan.summary,
      created: plan.summary.new,
      rejections: plan.rows.filter((r) => r.status === 'REJECTED').map((r) => ({ row: r.row, errors: r.errors })),
      toCompleteRows: plan.rows.filter((r) => r.toComplete.length > 0).map((r) => ({ row: r.row, reasons: r.toComplete })),
    };
    const batch = await client.query<{ id: string }>(
      `INSERT INTO sale_import_batches (agency_id, source_system, content_hash, summary, created_by_user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`,
      [agencyId, input.sourceSystem, hash, JSON.stringify(summary), userId],
    );
    const batchId = batch.rows[0]!.id;
    let created = 0;
    for (const row of plan.rows) {
      if (row.status !== 'NEW') continue;
      const sale = await client.query<{ id: string }>(
        `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status, sale_date, category_id,
                            origin_text, destination_text, travel_start_date, notes, form_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED', $7::date, $8, $9, $10, $11::date, $12, $13::jsonb) RETURNING id`,
        [agencyId, row.customerId, userId, row.total, row.discount, Math.round((row.total - row.discount) * 100) / 100,
          row.saleDate, row.categoryId, row.origin, row.destination, row.travelStartDate,
          [row.notes, `Importada de ${input.sourceSystem} #${row.naturalKey.split('|')[1]}`].filter(Boolean).join(' | '),JSON.stringify(buildImportFormSnapshot(row.toComplete))],
      );
      const saleId = sale.rows[0]!.id;
      if (row.supplierId) {
        await client.query(
          `INSERT INTO sale_items (agency_id, sale_id, description, supplier_id, qty, unit_price, discount, line_total, line_margin, created_by_user_id)
           VALUES ($1, $2, $3, $4, 1, $5, $6, $7, 0, $8)`,
          [agencyId, saleId, `Importado de ${input.sourceSystem}`, row.supplierId, row.total, row.discount,
            Math.round((row.total - row.discount) * 100) / 100, userId],
        );
      }
      await client.query(
        `INSERT INTO sale_import_keys (agency_id, source_system, external_ref, sale_id, batch_id) VALUES ($1, $2, $3, $4, $5)`,
        [agencyId, input.sourceSystem, row.naturalKey.split('|')[1], saleId, batchId],
      );
      created += 1;
    }
    await recordAuditEvent(client, {
      eventType: AuditEventType.SALES_IMPORTED,
      entityType: 'sale_import_batch',
      entityId: batchId,
      required: true,
      metadata: { result: `${created} created, ${plan.summary.rejected} rejected, ${plan.summary.alreadyImported + plan.summary.duplicateInFile} skipped`, reasonCode: `hash:${hash.slice(0, 16)}` },
    });
    return { replayed: false, contentHash: hash, summary };
  });
}
