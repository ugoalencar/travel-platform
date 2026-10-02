import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import readXlsxFile, { type Sheet } from 'read-excel-file/node';
import { requirePermission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import { recalculateSaleCostTotals } from './sale-costs';
import { confirmSaleDraft, createSaleDraft } from './sales';
import { getTenantContext } from '../tenant-context';
import { optionalDate, optionalUuid, parseObjectBody, requiredEnum, requiredString } from '../validation';
import { isValidCpf, normalizeCpf } from '../validation/cpf';

const IMPORT_TYPES = ['CUSTOMERS', 'SALES'] as const;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
type ImportType = (typeof IMPORT_TYPES)[number];
const RECONCILIATION_ACTIONS = ['LINK_CUSTOMER', 'CREATE_CUSTOMER', 'CORRECT', 'IGNORE'] as const;

interface ImportBatchRow {
  id: string;
  type: ImportType;
  filename: string;
  status: string;
  mapping: Record<string, string>;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

interface ImportRecordRow {
  id: string;
  batch_id: string;
  source_row: number;
  raw_data: Record<string, string>;
  normalized_data: Record<string, unknown>;
  customer_name_snapshot: string | null;
  customer_cpf_snapshot: string | null;
  customer_birth_date_snapshot: string | null;
  resolved_customer_id: string | null;
  resolved_sale_id: string | null;
  status: string;
  reason: string | null;
}

function parseCsv(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]!;
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell.trim());
  rows.push(row);
  const [headers, ...data] = rows.filter((r) => r.some((c) => c.length > 0));
  if (!headers || headers.length === 0) throw new ValidationError('CSV must include a header row');
  return data.map((values) => {
    const mapped: Record<string, string> = {};
    headers.forEach((header, index) => {
      mapped[header] = values[index] ?? '';
    });
    return mapped;
  });
}

async function parseWorkbook(content: string, sheetName: string | null): Promise<{
  rows: Array<Record<string, string>>;
  headers: string[];
  sheets: string[];
}> {
  let workbook: Array<Sheet<number>>;
  try {
    workbook = await readXlsxFile(Buffer.from(content, 'base64'));
  } catch {
    throw new ValidationError('XLSX file could not be read as spreadsheet data');
  }
  const sheets = workbook.map((sheet) => sheet.sheet);
  if (sheets.length === 0) throw new ValidationError('XLSX must include at least one sheet');
  const selected = sheetName ?? sheets[0]!;
  const sheet = workbook.find((item) => item.sheet === selected);
  if (!sheet) throw new ValidationError('Selected sheet was not found in the XLSX file');
  const [headerRow, ...dataRows] = sheet.data.filter((row) => row.some((cell) => spreadsheetCellToString(cell) !== ''));
  if (!headerRow || headerRow.length === 0) throw new ValidationError('XLSX must include a header row');
  const headers = headerRow.map(spreadsheetCellToString);
  const normalized = dataRows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = spreadsheetCellToString(row[index]);
    });
    return record;
  });
  return { rows: normalized, headers, sheets };
}

function mappingValue(raw: Record<string, string>, mapping: Record<string, string>, field: string): string | null {
  const header = mapping[field];
  if (!header) return null;
  const value = raw[header];
  return value === undefined || value.trim() === '' ? null : value.trim();
}

function jsonRecord(value: unknown): Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function spreadsheetCellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function optionalMapped(raw: Record<string, string>, mapping: Record<string, string>, field: string): string | null {
  return mappingValue(raw, mapping, field);
}

function parseMoneyValue(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || Math.round(amount * 100) !== amount * 100) return null;
  return amount;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadBatch(client: TenantClient, tenantId: string, batchId: string): Promise<ImportBatchRow> {
  const result = await client.query<ImportBatchRow>(
    `SELECT id, type, filename, status, mapping, total_rows, valid_rows, invalid_rows,
            created_by, created_at, completed_at
       FROM import_batches WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, batchId],
  );
  const batch = result.rows[0];
  if (!batch) throw new NotFoundError('Import batch not found');
  return batch;
}

async function summarizeBatch(client: TenantClient, tenantId: string, batchId: string): Promise<ImportBatchRow> {
  const counts = await client.query<{ total: number; invalid: number; valid: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status IN ('INVALID', 'CONFLICT'))::int AS invalid,
            count(*) FILTER (WHERE status NOT IN ('INVALID', 'CONFLICT', 'IGNORED'))::int AS valid
       FROM import_records WHERE tenant_id = $1 AND batch_id = $2`,
    [tenantId, batchId],
  );
  const row = counts.rows[0] ?? { total: 0, invalid: 0, valid: 0 };
  const updated = await client.query<ImportBatchRow>(
    `UPDATE import_batches
        SET total_rows = $3, valid_rows = $4, invalid_rows = $5, status = 'DRY_RUN'
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, type, filename, status, mapping, total_rows, valid_rows, invalid_rows,
                created_by, created_at, completed_at`,
    [tenantId, batchId, row.total, row.valid, row.invalid],
  );
  return updated.rows[0]!;
}

function serializeBatch(row: ImportBatchRow) {
  return row;
}

function serializeRecord(row: ImportRecordRow) {
  return row;
}

async function classifyCustomerRecord(
  client: TenantClient,
  tenantId: string,
  raw: Record<string, string>,
  mapping: Record<string, string>,
): Promise<{
  status: string;
  reason: string | null;
  normalized: Record<string, unknown>;
  customerId: string | null;
}> {
  const name = mappingValue(raw, mapping, 'name');
  const rawCpf = mappingValue(raw, mapping, 'cpf');
  const birthDate = optionalDate({ birth_date: mappingValue(raw, mapping, 'birth_date') }, 'birth_date');
  const normalized: Record<string, unknown> = {
    name,
    cpf: null,
    birth_date: birthDate,
    email: mappingValue(raw, mapping, 'email'),
    phone: mappingValue(raw, mapping, 'phone'),
    whatsapp: mappingValue(raw, mapping, 'whatsapp'),
    zip_code: mappingValue(raw, mapping, 'zip_code'),
    street: mappingValue(raw, mapping, 'street'),
    number: mappingValue(raw, mapping, 'number'),
    complement: mappingValue(raw, mapping, 'complement'),
    neighborhood: mappingValue(raw, mapping, 'neighborhood'),
    city: mappingValue(raw, mapping, 'city'),
    state: mappingValue(raw, mapping, 'state'),
    notes: mappingValue(raw, mapping, 'notes'),
  };
  if (!name) return { status: 'INVALID', reason: 'Nome do cliente ausente', normalized, customerId: null };
  if (rawCpf) {
    if (!isValidCpf(rawCpf)) return { status: 'INVALID', reason: 'CPF inválido', normalized, customerId: null };
    normalized.cpf = normalizeCpf(rawCpf);
    const existing = await client.query<{ id: string; birth_date: string | null }>(
      `SELECT id, birth_date FROM customers WHERE tenant_id = $1 AND cpf = $2 ORDER BY created_at LIMIT 1`,
      [tenantId, normalized.cpf],
    );
    const customer = existing.rows[0];
    if (customer) {
      if (customer.birth_date && birthDate && customer.birth_date !== birthDate) {
        return {
          status: 'CONFLICT',
          reason: 'CPF corresponde a um cliente existente com outra data de nascimento',
          normalized,
          customerId: customer.id,
        };
      }
      return { status: 'EXISTING', reason: null, normalized, customerId: customer.id };
    }
  }
  return { status: 'NEW', reason: null, normalized, customerId: null };
}

async function classifySaleRecord(
  client: TenantClient,
  tenantId: string,
  raw: Record<string, string>,
  mapping: Record<string, string>,
  defaults: Record<string, unknown>,
): Promise<{
  status: string;
  reason: string | null;
  normalized: Record<string, unknown>;
  customerId: string | null;
}> {
  const rawCpf = mappingValue(raw, mapping, 'customer_cpf');
  const birthDate = optionalDate({ birth_date: mappingValue(raw, mapping, 'customer_birth_date') }, 'birth_date');
  const amount = parseMoneyValue(mappingValue(raw, mapping, 'gross_amount'));
  const cost = parseMoneyValue(mappingValue(raw, mapping, 'cost_amount')) ?? 0;
  const dueDate = optionalDate({ due_date: mappingValue(raw, mapping, 'due_date') }, 'due_date');
  const saleDate = optionalDate({ sale_date: mappingValue(raw, mapping, 'sale_date') }, 'sale_date');
  const normalized: Record<string, unknown> = {
    external_reference: optionalMapped(raw, mapping, 'external_reference'),
    customer_name: mappingValue(raw, mapping, 'customer_name'),
    customer_cpf: rawCpf ? normalizeCpf(rawCpf) : null,
    customer_birth_date: birthDate,
    gross_amount: amount,
    cost_amount: cost,
    due_date: dueDate,
    sale_date: saleDate,
    description: optionalMapped(raw, mapping, 'description'),
    financial_party_name: optionalMapped(raw, mapping, 'financial_party_name'),
    payment_method_name: optionalMapped(raw, mapping, 'payment_method_name'),
    notes: optionalMapped(raw, mapping, 'notes'),
    seller_id: stringOrEmpty(defaults.seller_id),
    category_id: stringOrEmpty(defaults.category_id),
  };
  if (amount === null || amount <= 0 || cost < 0 || cost > amount || !dueDate) {
    return { status: 'INVALID', reason: 'Valor da venda ou vencimento ausente', normalized, customerId: null };
  }
  if (!normalized.seller_id || !normalized.category_id) {
    return { status: 'INVALID', reason: 'Vendedor ou categoria padrão ausente', normalized, customerId: null };
  }
  if (!rawCpf || !isValidCpf(rawCpf)) {
    return { status: 'UNLINKED', reason: 'CPF do cliente ausente ou inválido', normalized, customerId: null };
  }
  const customer = await client.query<{ id: string; birth_date: string | null }>(
    `SELECT id, birth_date FROM customers WHERE tenant_id = $1 AND cpf = $2 ORDER BY created_at LIMIT 1`,
    [tenantId, normalizeCpf(rawCpf)],
  );
  const row = customer.rows[0];
  if (!row) return { status: 'UNLINKED', reason: 'Cliente não encontrado pelo CPF', normalized, customerId: null };
  if (row.birth_date && birthDate && row.birth_date !== birthDate) {
    return {
      status: 'CONFLICT',
      reason: 'CPF corresponde a um cliente existente com outra data de nascimento',
      normalized,
      customerId: row.id,
    };
  }
  return { status: 'READY', reason: null, normalized, customerId: row.id };
}

async function createCustomerFromNormalized(
  client: TenantClient,
  tenantId: string,
  normalized: Record<string, unknown>,
): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO customers (tenant_id, name, cpf, birth_date, phone, whatsapp, email,
                            zip_code, street, number, complement, neighborhood, city, state, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      tenantId,
      String(normalized.name ?? normalized.customer_name),
      nullableString(normalized.cpf ?? normalized.customer_cpf),
      nullableString(normalized.birth_date ?? normalized.customer_birth_date),
      nullableString(normalized.phone),
      nullableString(normalized.whatsapp),
      nullableString(normalized.email),
      nullableString(normalized.zip_code),
      nullableString(normalized.street),
      nullableString(normalized.number),
      nullableString(normalized.complement),
      nullableString(normalized.neighborhood),
      nullableString(normalized.city),
      nullableString(normalized.state),
      nullableString(normalized.notes),
    ],
  );
  return inserted.rows[0]!.id;
}

async function findOrCreateFinancialParty(
  client: TenantClient,
  tenantId: string,
  name: string | null,
): Promise<string | null> {
  if (!name) return null;
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM financial_parties WHERE tenant_id = $1 AND lower(name) = lower($2) ORDER BY created_at LIMIT 1`,
    [tenantId, name],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await client.query<{ id: string }>(
    `INSERT INTO financial_parties (tenant_id, type, name)
     VALUES ($1, 'SUPPLIER', $2)
     RETURNING id`,
    [tenantId, name],
  );
  return created.rows[0]!.id;
}

export function registerImportRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.post('/imports/upload', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'imports.manage');
    const body = parseObjectBody(request.body);
    const type = requiredEnum(body, 'type', IMPORT_TYPES);
    const filename = requiredString(body, 'filename', { max: 255 });
    const mimeType = requiredString(body, 'mime_type', { max: 120 });
    const content = requiredString(body, 'content', { max: MAX_IMPORT_BYTES });
    const lower = filename.toLowerCase();
    let rows: Array<Record<string, string>>;
    let headers: string[];
    let sheets: string[] = [];
    if (lower.endsWith('.xlsx')) {
      if (!mimeType.includes('spreadsheetml')) throw new ValidationError('XLSX upload has invalid MIME type');
      const parsed = await parseWorkbook(content, optionalMapped(body as Record<string, string>, { sheet_name: 'sheet_name' }, 'sheet_name'));
      rows = parsed.rows;
      headers = parsed.headers;
      sheets = parsed.sheets;
    } else {
      if (!lower.endsWith('.csv') || !['text/csv', 'application/csv', 'application/vnd.ms-excel'].includes(mimeType)) {
        throw new ValidationError('Only CSV or XLSX uploads are allowed');
      }
      rows = parseCsv(content);
      headers = Object.keys(rows[0] ?? {});
    }
    if (headers.length === 0) throw new ValidationError('Import file must include headers and at least one data row');
    const created = await database.withTenantTransaction(async (client) => {
      const batch = await client.query<ImportBatchRow>(
        `INSERT INTO import_batches (tenant_id, type, filename, total_rows, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, type, filename, status, mapping, total_rows, valid_rows, invalid_rows,
                   created_by, created_at, completed_at`,
        [context.tenantId, type, filename, rows.length, context.userId],
      );
      const batchRow = batch.rows[0]!;
      for (let index = 0; index < rows.length; index += 1) {
        await client.query(
          `INSERT INTO import_records (tenant_id, batch_id, source_row, raw_data, status)
           VALUES ($1, $2, $3, $4::jsonb, 'READY')`,
          [context.tenantId, batchRow.id, index + 2, JSON.stringify(rows[index])],
        );
      }
      await recordAuditEvent(client, {
        eventType: 'IMPORT_UPLOADED',
        entityType: 'import_batch',
        entityId: batchRow.id,
        metadata: { type, rows: rows.length },
      });
      return batchRow;
    });
    reply.code(201);
    return { batch: serializeBatch(created), headers, sheets, preview: rows.slice(0, 10) };
  });

  app.post('/imports/:id/dry-run', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'imports.manage');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);
    const mapping = parseObjectBody(body.mapping);
    const defaults = typeof body.defaults === 'object' && body.defaults !== null ? (body.defaults as Record<string, unknown>) : {};
    return database.withTenantTransaction(async (client) => {
      const batch = await loadBatch(client, context.tenantId, id);
      if (batch.status === 'COMPLETED') throw new ConflictError('Import batch is already completed');
      const records = await client.query<{ id: string; raw_data: unknown }>(
        `SELECT id, raw_data FROM import_records WHERE tenant_id = $1 AND batch_id = $2 ORDER BY source_row`,
        [context.tenantId, id],
      );
      for (const record of records.rows) {
        const raw = jsonRecord(record.raw_data);
        const classified =
          batch.type === 'CUSTOMERS'
            ? await classifyCustomerRecord(client, context.tenantId, raw, mapping as Record<string, string>)
            : await classifySaleRecord(client, context.tenantId, raw, mapping as Record<string, string>, defaults);
        await client.query(
          `UPDATE import_records
              SET normalized_data = $3::jsonb,
                  customer_name_snapshot = $4,
                  customer_cpf_snapshot = $5,
                  customer_birth_date_snapshot = $6,
                  resolved_customer_id = $7,
                  status = $8,
                  reason = $9,
                  updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [
            context.tenantId,
            record.id,
            JSON.stringify(classified.normalized),
            stringOrEmpty(classified.normalized.name ?? classified.normalized.customer_name) || null,
            stringOrEmpty(classified.normalized.cpf ?? classified.normalized.customer_cpf) || null,
            stringOrEmpty(classified.normalized.birth_date ?? classified.normalized.customer_birth_date) || null,
            classified.customerId,
            classified.status,
            classified.reason,
          ],
        );
      }
      await client.query(`UPDATE import_batches SET mapping = $3::jsonb WHERE tenant_id = $1 AND id = $2`, [
        context.tenantId,
        id,
        JSON.stringify(mapping),
      ]);
      const updated = await summarizeBatch(client, context.tenantId, id);
      await recordAuditEvent(client, {
        eventType: 'IMPORT_DRY_RUN',
        entityType: 'import_batch',
        entityId: id,
        metadata: { invalid_rows: updated.invalid_rows, valid_rows: updated.valid_rows },
      });
      return { batch: serializeBatch(updated) };
    });
  });

  app.get('/imports/:id/records', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'imports.manage');
    const { id } = request.params as { id: string };
    const rows = await database.withTenantTransaction((client) =>
      client.query<ImportRecordRow>(
        `SELECT id, batch_id, source_row, raw_data, normalized_data, customer_name_snapshot,
                customer_cpf_snapshot, customer_birth_date_snapshot, resolved_customer_id,
                resolved_sale_id, status, reason
           FROM import_records
          WHERE tenant_id = $1 AND batch_id = $2
          ORDER BY source_row`,
        [context.tenantId, id],
      ),
    );
    return { items: rows.rows.map(serializeRecord) };
  });

  app.post('/imports/:batchId/records/:recordId/reconcile', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'imports.manage');
    const { batchId, recordId } = request.params as { batchId: string; recordId: string };
    const body = parseObjectBody(request.body);
    const action = requiredEnum(body, 'action', RECONCILIATION_ACTIONS);
    return database.withTenantTransaction(async (client) => {
      const batch = await loadBatch(client, context.tenantId, batchId);
      if (batch.status === 'COMPLETED') throw new ConflictError('Import batch is already completed');
      const row = await client.query<ImportRecordRow>(
        `SELECT id, batch_id, source_row, raw_data, normalized_data, customer_name_snapshot,
                customer_cpf_snapshot, customer_birth_date_snapshot, resolved_customer_id,
                resolved_sale_id, status, reason
           FROM import_records
          WHERE tenant_id = $1 AND batch_id = $2 AND id = $3
          FOR UPDATE`,
        [context.tenantId, batchId, recordId],
      );
      const record = row.rows[0];
      if (!record) throw new NotFoundError('Import record not found');
      const normalized = { ...record.normalized_data };
      let status = record.status;
      let reason: string | null = null;
      let customerId = record.resolved_customer_id;

      if (action === 'IGNORE') {
        status = 'IGNORED';
        reason = 'Ignorado pelo usuário';
      } else if (action === 'LINK_CUSTOMER') {
        customerId = optionalUuid(body, 'customer_id');
        if (!customerId) throw new ValidationError('Field customer_id is required');
        const exists = await client.query<{ id: string; birth_date: string | null }>(
          `SELECT id, birth_date FROM customers WHERE tenant_id = $1 AND id = $2`,
          [context.tenantId, customerId],
        );
        const customer = exists.rows[0];
        if (!customer) throw new ValidationError('Field customer_id must reference an existing customer');
        const importedBirth = nullableString(normalized.customer_birth_date ?? normalized.birth_date);
        if (customer.birth_date && importedBirth && customer.birth_date !== importedBirth) {
          throw new ConflictError('Selected customer has a different birth date');
        }
        status = batch.type === 'SALES' ? 'READY' : 'EXISTING';
      } else if (action === 'CREATE_CUSTOMER') {
        const customerPayload = parseObjectBody(body.customer);
        const created = await createCustomerFromNormalized(client, context.tenantId, {
          ...normalized,
          name: customerPayload.name ?? normalized.customer_name ?? normalized.name,
          cpf:
            typeof customerPayload.cpf === 'string' && customerPayload.cpf.trim()
              ? normalizeCpf(customerPayload.cpf)
              : normalized.customer_cpf ?? normalized.cpf,
          birth_date: customerPayload.birth_date ?? normalized.customer_birth_date ?? normalized.birth_date,
          phone: customerPayload.phone ?? normalized.phone,
          whatsapp: customerPayload.whatsapp ?? normalized.whatsapp,
          email: customerPayload.email ?? normalized.email,
        });
        customerId = created;
        status = batch.type === 'SALES' ? 'READY' : 'IMPORTED';
      } else if (action === 'CORRECT') {
        const corrections = parseObjectBody(body.corrections);
        Object.assign(normalized, corrections);
        if ('seller_id' in corrections) normalized.seller_id = optionalUuid(corrections, 'seller_id');
        if ('category_id' in corrections) normalized.category_id = optionalUuid(corrections, 'category_id');
        if ('customer_id' in corrections) customerId = optionalUuid(corrections, 'customer_id');
        status = batch.type === 'SALES' && customerId ? 'READY' : 'NEW';
      }

      const updated = await client.query<ImportRecordRow>(
        `UPDATE import_records
            SET normalized_data = $4::jsonb,
                resolved_customer_id = $5,
                status = $6,
                reason = $7,
                updated_at = now()
          WHERE tenant_id = $1 AND batch_id = $2 AND id = $3
          RETURNING id, batch_id, source_row, raw_data, normalized_data, customer_name_snapshot,
                    customer_cpf_snapshot, customer_birth_date_snapshot, resolved_customer_id,
                    resolved_sale_id, status, reason`,
        [context.tenantId, batchId, recordId, JSON.stringify(normalized), customerId, status, reason],
      );
      await summarizeBatch(client, context.tenantId, batchId);
      return { record: serializeRecord(updated.rows[0]!) };
    });
  });

  app.post('/imports/:id/confirm', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'imports.manage');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);
    const updateEmptyFields = body.update_empty_fields === true;
    return database.withTenantTransaction(async (client) => {
      const batch = await loadBatch(client, context.tenantId, id);
      if (batch.status === 'COMPLETED') throw new ConflictError('Import batch is already completed');
      const records = await client.query<ImportRecordRow>(
        `SELECT id, batch_id, source_row, raw_data, normalized_data, customer_name_snapshot,
                customer_cpf_snapshot, customer_birth_date_snapshot, resolved_customer_id,
                resolved_sale_id, status, reason
           FROM import_records
          WHERE tenant_id = $1 AND batch_id = $2
          ORDER BY source_row
          FOR UPDATE`,
        [context.tenantId, id],
      );
      let imported = 0;
      let skipped = 0;
      for (const record of records.rows) {
        const normalized = record.normalized_data;
        if (batch.type === 'CUSTOMERS' && record.status === 'NEW') {
          const customerId = await createCustomerFromNormalized(client, context.tenantId, normalized);
          await client.query(
            `UPDATE import_records
                SET status = 'IMPORTED', resolved_customer_id = $3, updated_at = now()
              WHERE tenant_id = $1 AND id = $2`,
            [context.tenantId, record.id, customerId],
          );
          await recordAuditEvent(client, {
            eventType: AUDIT_EVENTS.CUSTOMER_CREATED,
            entityType: 'customer',
            entityId: customerId,
            metadata: { import_batch_id: id },
          });
          await enqueueOutboxEvent(client, {
            eventType: 'CUSTOMER_CREATED',
            entityType: 'customer',
            entityId: customerId,
            payload: { import_batch_id: id },
          });
          imported += 1;
        } else if (batch.type === 'CUSTOMERS' && record.status === 'EXISTING' && record.resolved_customer_id) {
          if (updateEmptyFields) {
            await client.query(
              `UPDATE customers SET
                 phone = COALESCE(phone, $3),
                 whatsapp = COALESCE(whatsapp, $4),
                 email = COALESCE(email, $5),
                 zip_code = COALESCE(zip_code, $6),
                 street = COALESCE(street, $7),
                 number = COALESCE(number, $8),
                 complement = COALESCE(complement, $9),
                 neighborhood = COALESCE(neighborhood, $10),
                 city = COALESCE(city, $11),
                 state = COALESCE(state, $12),
                 notes = COALESCE(notes, $13),
                 updated_at = now()
               WHERE tenant_id = $1 AND id = $2`,
              [
                context.tenantId,
                record.resolved_customer_id,
                normalized.phone ?? null,
                normalized.whatsapp ?? null,
                normalized.email ?? null,
                normalized.zip_code ?? null,
                normalized.street ?? null,
                normalized.number ?? null,
                normalized.complement ?? null,
                normalized.neighborhood ?? null,
                normalized.city ?? null,
                normalized.state ?? null,
                normalized.notes ?? null,
              ],
            );
          }
          await client.query(
            `UPDATE import_records SET status = 'IMPORTED', updated_at = now()
              WHERE tenant_id = $1 AND id = $2`,
            [context.tenantId, record.id],
          );
          imported += 1;
        } else if (batch.type === 'SALES' && record.status === 'READY' && record.resolved_customer_id) {
          const sale = await createSaleDraft(client, context.tenantId, context, {
            customer_id: record.resolved_customer_id,
            seller_id: String(normalized.seller_id),
            category_id: String(normalized.category_id),
            payment_method_id: null,
            gross_amount: Number(normalized.gross_amount),
            cost_amount: 0,
            sale_date: nullableString(normalized.sale_date),
            due_date: String(normalized.due_date),
            installment_count: 1,
            description: nullableString(normalized.description ?? normalized.external_reference),
            notes: nullableString(normalized.notes),
          });
          const costAmount = Number(normalized.cost_amount ?? 0);
          if (costAmount > 0) {
            const partyId = await findOrCreateFinancialParty(
              client,
              context.tenantId,
              nullableString(normalized.financial_party_name),
            );
            await client.query(
              `INSERT INTO sale_cost_items (tenant_id, sale_id, financial_party_id, cost_type,
                                            description, amount, due_date, created_by)
               VALUES ($1, $2, $3, 'OTHER', $4, $5, $6, $7)`,
              [
                context.tenantId,
                sale.id,
                partyId,
                nullableString(normalized.financial_party_name) ?? 'Custo importado',
                costAmount,
                nullableString(normalized.due_date),
                context.userId,
              ],
            );
            await recalculateSaleCostTotals(client, context.tenantId, sale.id);
          }
          const confirmed = await confirmSaleDraft(client, context.tenantId, sale.id, { all: true });
          await client.query(
            `UPDATE import_records
                SET status = 'IMPORTED', resolved_sale_id = $3, updated_at = now()
              WHERE tenant_id = $1 AND id = $2`,
            [context.tenantId, record.id, confirmed.id],
          );
          imported += 1;
        } else {
          skipped += 1;
        }
      }
      const completed = await client.query<ImportBatchRow>(
        `UPDATE import_batches SET status = 'COMPLETED', completed_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, type, filename, status, mapping, total_rows, valid_rows, invalid_rows,
                    created_by, created_at, completed_at`,
        [context.tenantId, id],
      );
      await recordAuditEvent(client, {
        eventType: 'IMPORT_CONFIRMED',
        entityType: 'import_batch',
        entityId: id,
        metadata: { imported, skipped },
      });
      return { batch: serializeBatch(completed.rows[0]!), result: { imported, skipped } };
    });
  });
}
