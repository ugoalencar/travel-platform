import { getAgencyId } from '../../../packages/domain/tenant-context';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import { MAX_CSV_BYTES, MAX_CSV_ROWS, toCsv } from './report-csv';

const SALES_STATUSES = ['PENDING', 'CONFIRMED', 'PAID', 'CANCELLED', 'REFUNDED'] as const;
const OBLIGATION_STATUSES = ['OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
const EXPENSE_STATUSES = ['OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
const REVENUE_STATUSES = ['PENDING_RULE', 'FORECAST', 'ENTITLED', 'AVAILABLE', 'RECEIVED', 'CANCELLED'] as const;

type StatusValue = string;
type FilterKey = 'statuses' | 'customerId' | 'sellerId' | 'supplierId' | 'categoryId' | 'search';
type ColumnDefinition = { label: string; expression: string };
type DatasetDefinition = {
  id: string;
  label: string;
  fromSql: string;
  agencyExpression: string;
  dateExpression: string;
  columns: Readonly<Record<string, ColumnDefinition>>;
  allowedFilters: readonly FilterKey[];
  statusValues?: readonly StatusValue[];
  filterExpressions: Partial<Record<Exclude<FilterKey, 'statuses' | 'search'>, string>>;
  searchExpressions: readonly string[];
};

const datasets: readonly DatasetDefinition[] = [
  {
    id: 'sales', label: 'Vendas',
    fromSql: `FROM public.sales s
      LEFT JOIN public.customers c ON c.agency_id = s.agency_id AND c.id = s.customer_id
      LEFT JOIN public.users seller ON seller.agency_id = s.agency_id AND seller.id = s.user_id`,
    agencyExpression: 's.agency_id',
    dateExpression: 's.created_at',
    columns: {
      sale_id: { label: 'Venda (ID)', expression: 's.id' },
      created_at: { label: 'Data da venda', expression: 's.created_at' },
      customer_id: { label: 'Cliente (ID)', expression: 's.customer_id' },
      customer_name: { label: 'Cliente', expression: 'c.name' },
      customer_email: { label: 'E-mail do cliente', expression: 'c.email' },
      seller_id: { label: 'Vendedor (ID)', expression: 's.user_id' },
      seller_name: { label: 'Vendedor', expression: 'seller.name' },
      amount: { label: 'Valor bruto', expression: 's.amount' },
      discount: { label: 'Desconto', expression: 's.discount' },
      total: { label: 'Total da venda', expression: 's.total' },
      status: { label: 'Situação', expression: 's.status::text' },
      paid_at: { label: 'Data de pagamento', expression: 's.paid_at' },
    },
    allowedFilters: ['statuses', 'customerId', 'sellerId', 'search'],
    statusValues: SALES_STATUSES,
    filterExpressions: { customerId: 's.customer_id', sellerId: 's.user_id' },
    searchExpressions: ['c.name', 'c.email', 'seller.name', 's.id'],
  },
  {
    id: 'customers', label: 'Clientes',
    fromSql: 'FROM public.customers c', agencyExpression: 'c.agency_id', dateExpression: 'c.created_at',
    columns: {
      customer_id: { label: 'Cliente (ID)', expression: 'c.id' },
      customer_name: { label: 'Nome', expression: 'c.name' },
      email: { label: 'E-mail', expression: 'c.email' },
      phone: { label: 'Telefone', expression: 'c.phone' },
      cpf: { label: 'CPF', expression: 'c.cpf' },
      status: { label: 'Situação', expression: 'c.status::text' },
      created_at: { label: 'Data de cadastro', expression: 'c.created_at' },
    },
    allowedFilters: ['search'], filterExpressions: {}, searchExpressions: ['c.name', 'c.email', 'c.phone', 'c.cpf'],
  },
  {
    id: 'receivables', label: 'Contas a receber',
    fromSql: `FROM public.receivables r
      LEFT JOIN public.customers c ON c.agency_id = r.agency_id AND c.id = r.customer_id`,
    agencyExpression: 'r.agency_id',
    dateExpression: 'r.due_at',
    columns: {
      receivable_id: { label: 'Recebível (ID)', expression: 'r.id' },
      sale_id: { label: 'Venda (ID)', expression: 'r.sale_id' },
      customer_id: { label: 'Cliente (ID)', expression: 'r.customer_id' },
      customer_name: { label: 'Cliente', expression: 'c.name' },
      customer_email: { label: 'E-mail do cliente', expression: 'c.email' },
      description: { label: 'Descrição', expression: 'r.description' },
      amount: { label: 'Valor', expression: 'r.amount' },
      due_at: { label: 'Vencimento', expression: 'r.due_at' },
      status: { label: 'Situação', expression: 'r.status::text' },
      created_at: { label: 'Data de criação', expression: 'r.created_at' },
    },
    allowedFilters: ['statuses', 'customerId', 'search'], statusValues: OBLIGATION_STATUSES,
    filterExpressions: { customerId: 'r.customer_id' }, searchExpressions: ['c.name', 'c.email', 'r.description', 'r.sale_id'],
  },
  {
    id: 'payables', label: 'Contas a pagar',
    fromSql: `FROM public.payables p
      LEFT JOIN public.sales sale ON sale.agency_id = p.agency_id AND sale.id = p.sale_id
      LEFT JOIN public.customers c ON c.agency_id = sale.agency_id AND c.id = sale.customer_id
      LEFT JOIN public.suppliers supplier ON supplier.agency_id = p.agency_id AND supplier.id = p.supplier_id`,
    agencyExpression: 'p.agency_id',
    dateExpression: 'p.due_at',
    columns: {
      payable_id: { label: 'Pagável (ID)', expression: 'p.id' },
      sale_id: { label: 'Venda (ID)', expression: 'p.sale_id' },
      customer_id: { label: 'Cliente (ID)', expression: 'sale.customer_id' },
      customer_name: { label: 'Cliente', expression: 'c.name' },
      supplier_id: { label: 'Fornecedor (ID)', expression: 'p.supplier_id' },
      supplier_name: { label: 'Fornecedor', expression: 'supplier.name' },
      description: { label: 'Descrição', expression: 'p.description' },
      amount: { label: 'Valor', expression: 'p.amount' },
      due_at: { label: 'Vencimento', expression: 'p.due_at' },
      status: { label: 'Situação', expression: 'p.status::text' },
      created_at: { label: 'Data de criação', expression: 'p.created_at' },
    },
    allowedFilters: ['statuses', 'customerId', 'supplierId', 'search'], statusValues: OBLIGATION_STATUSES,
    filterExpressions: { customerId: 'sale.customer_id', supplierId: 'p.supplier_id' },
    searchExpressions: ['c.name', 'supplier.name', 'p.description', 'p.sale_id'],
  },
  {
    id: 'expenses', label: 'Despesas operacionais',
    fromSql: `FROM public.expenses e
      LEFT JOIN public.suppliers supplier ON supplier.agency_id = e.agency_id AND supplier.id = e.supplier_id
      LEFT JOIN public.financial_categories category ON category.agency_id = e.agency_id AND category.id = e.category_id`,
    agencyExpression: 'e.agency_id',
    dateExpression: 'e.incurred_at',
    columns: {
      expense_id: { label: 'Despesa (ID)', expression: 'e.id' },
      supplier_name: { label: 'Fornecedor', expression: 'supplier.name' },
      category_name: { label: 'Categoria', expression: 'category.name' },
      description: { label: 'Descrição', expression: 'e.description' },
      amount: { label: 'Valor', expression: 'e.amount' },
      currency: { label: 'Moeda', expression: 'e.currency' },
      incurred_at: { label: 'Data da despesa', expression: 'e.incurred_at' },
      due_date: { label: 'Vencimento', expression: 'e.due_date' },
      payment_date: { label: 'Data de pagamento', expression: 'e.payment_date' },
      status: { label: 'Situação', expression: 'e.status::text' },
    },
    allowedFilters: ['statuses', 'supplierId', 'categoryId', 'search'], statusValues: EXPENSE_STATUSES,
    filterExpressions: { supplierId: 'e.supplier_id', categoryId: 'e.category_id' },
    searchExpressions: ['e.description', 'supplier.name', 'category.name'],
  },
  {
    id: 'agency_revenue', label: 'Receitas da agência',
    fromSql: `FROM public.agency_revenue_entries revenue
      LEFT JOIN public.sales sale ON sale.agency_id = revenue.agency_id AND sale.id = revenue.sale_id
      LEFT JOIN public.customers c ON c.agency_id = sale.agency_id AND c.id = sale.customer_id
      LEFT JOIN public.suppliers supplier ON supplier.agency_id = revenue.agency_id AND supplier.id = revenue.supplier_id`,
    agencyExpression: 'revenue.agency_id',
    dateExpression: 'revenue.created_at',
    columns: {
      revenue_id: { label: 'Receita (ID)', expression: 'revenue.id' },
      sale_id: { label: 'Venda (ID)', expression: 'revenue.sale_id' },
      customer_id: { label: 'Cliente (ID)', expression: 'sale.customer_id' },
      customer_name: { label: 'Cliente', expression: 'c.name' },
      supplier_name: { label: 'Fornecedor', expression: 'supplier.name' },
      status: { label: 'Situação', expression: 'revenue.status' },
      amount: { label: 'Receita', expression: 'revenue.amount' },
      base_amount: { label: 'Base de cálculo', expression: 'revenue.base_amount' },
      received_amount: { label: 'Valor recebido', expression: 'revenue.received_amount' },
      received_at: { label: 'Data de recebimento', expression: 'revenue.received_at' },
      created_at: { label: 'Data de criação', expression: 'revenue.created_at' },
    },
    allowedFilters: ['statuses', 'customerId', 'supplierId', 'search'], statusValues: REVENUE_STATUSES,
    filterExpressions: { customerId: 'sale.customer_id', supplierId: 'revenue.supplier_id' },
    searchExpressions: ['c.name', 'supplier.name', 'revenue.sale_id'],
  },
];

export interface DatasetExportRequest {
  dataset: string;
  from: string;
  to: string;
  columns: string[];
  filters: Partial<Record<FilterKey, string | string[]>>;
}

export interface CompiledDatasetExport {
  dataset: string;
  filename: string;
  columns: string[];
  headers: string[];
  sql: string;
  values: unknown[];
}

const invalid = (message: string): never => { throw new ValidationError(message); };
const own = (record: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

function parseDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid(`Field "${field}" must be an ISO date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return invalid(`Field "${field}" must be a valid date.`);
  return value;
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function parseFilters(value: unknown, definition: DatasetDefinition): DatasetExportRequest['filters'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Field "filters" must be an object.');
  const filters = value as Record<string, unknown>;
  for (const key of Object.keys(filters)) {
    if (!definition.allowedFilters.includes(key as FilterKey)) return invalid(`Filter "${key}" is not available for this dataset.`);
  }
  const parsed: DatasetExportRequest['filters'] = {};
  if (own(filters, 'statuses')) {
    if (!definition.statusValues || !Array.isArray(filters.statuses) || filters.statuses.length < 1 || filters.statuses.length > definition.statusValues.length) {
      return invalid('Filter "statuses" is invalid.');
    }
    if (filters.statuses.some(status => typeof status !== 'string' || !definition.statusValues!.includes(status))) return invalid('Filter "statuses" contains an unsupported value.');
    parsed.statuses = [...new Set(filters.statuses as string[])];
  }
  for (const key of ['customerId', 'sellerId', 'supplierId', 'categoryId'] as const) {
    if (!own(filters, key)) continue;
    const id = filters[key];
    if (!definition.allowedFilters.includes(key) || typeof id !== 'string' || !id.trim() || id.length > 200) {
      return invalid(`Filter "${key}" is invalid.`);
    }
    parsed[key] = id.trim();
  }
  if (own(filters, 'search')) {
    const search = filters.search;
    if (typeof search !== 'string' || !search.trim() || search.trim().length > 100) return invalid('Filter "search" must contain 1 to 100 characters.');
    parsed.search = search.trim();
  }
  return parsed;
}

export function parseDatasetExportRequest(value: unknown): DatasetExportRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Request body must be an object.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !['dataset', 'from', 'to', 'columns', 'filters'].includes(key))) return invalid('Request contains an unsupported field.');
  if (typeof record.dataset !== 'string') return invalid('Field "dataset" is required.');
  const definition = datasets.find(item => item.id === record.dataset);
  if (!definition) return invalid('Dataset is not available.');
  const from = parseDate(record.from, 'from');
  const to = parseDate(record.to, 'to');
  const first = Date.parse(`${from}T00:00:00.000Z`);
  const last = Date.parse(`${to}T00:00:00.000Z`);
  if (first > last) return invalid('Field "from" must not be after "to".');
  if ((last - first) / 86_400_000 > 3660) return invalid('Date range must not exceed 10 years.');
  if (!Array.isArray(record.columns) || record.columns.length < 1 || record.columns.length > 30 ||
      record.columns.some(column => typeof column !== 'string' || !own(definition.columns, column)) ||
      new Set(record.columns).size !== record.columns.length) return invalid('Selected columns are invalid.');
  return {
    dataset: definition.id,
    from,
    to,
    columns: record.columns as string[],
    filters: parseFilters(record.filters, definition),
  };
}

export function getReportExportCatalog() {
  return datasets.map(dataset => ({
    id: dataset.id,
    label: dataset.label,
    columns: Object.entries(dataset.columns).map(([id, column]) => ({ id, label: column.label })),
    filters: dataset.allowedFilters.map(id => ({
      id,
      options: id === 'statuses' ? dataset.statusValues : undefined,
    })),
  }));
}

export function compileDatasetExport(input: unknown, agencyId: string): CompiledDatasetExport {
  if (typeof agencyId !== 'string' || !agencyId.trim() || agencyId.length > 200) return invalid('Agency context is invalid.');
  const request = parseDatasetExportRequest(input);
  const definition = datasets.find(item => item.id === request.dataset)!;
  const values: unknown[] = [agencyId, request.from, nextDate(request.to)];
  const where = [
    `${definition.agencyExpression} = $1`,
    `${definition.dateExpression} >= $2::date`,
    `${definition.dateExpression} < $3::date`,
  ];
  if (request.filters.statuses) {
    values.push(request.filters.statuses);
    const statusExpression = definition.columns.status?.expression;
    if (!statusExpression) return invalid('Status filter is not available for this dataset.');
    where.push(`${statusExpression} = ANY($${values.length}::text[])`);
  }
  for (const key of ['customerId', 'sellerId', 'supplierId', 'categoryId'] as const) {
    const filter = request.filters[key];
    if (typeof filter !== 'string') continue;
    const expression = definition.filterExpressions[key];
    if (!expression) return invalid(`Filter "${key}" is not available for this dataset.`);
    values.push(filter);
    where.push(`${expression} = $${values.length}`);
  }
  if (typeof request.filters.search === 'string') {
    values.push(`%${request.filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    const parameter = `$${values.length}`;
    where.push(`(${definition.searchExpressions.map(expression => `${expression}::text ILIKE ${parameter} ESCAPE '\\'`).join(' OR ')})`);
  }
  const selected = request.columns.map(column => definition.columns[column]!);
  const outputColumns = request.columns.map((column, index) => `${selected[index]!.expression} AS "${column}"`);
  const sql = `SELECT ${outputColumns.join(', ')} ${definition.fromSql} WHERE ${where.join(' AND ')} ORDER BY ${definition.dateExpression} DESC, ${outputColumns[0]!.split(' AS ')[0]} LIMIT ${MAX_CSV_ROWS + 1}`;
  return {
    dataset: definition.id,
    filename: `${definition.id.replace(/_/g, '-')}-${request.from}-${request.to}.csv`,
    columns: request.columns,
    headers: request.columns.map(column => definition.columns[column]!.label),
    sql,
    values,
  };
}

export async function generateDatasetExport(database: DatabaseRuntime, input: unknown): Promise<{ filename: string; csv: string; rows: number }> {
  const request = parseDatasetExportRequest(input);
  const compiled = compileDatasetExport(request, getAgencyId());
  return database.withTenantTransaction(async client => {
    const result = await client.query<Record<string, unknown>>(compiled.sql, compiled.values);
    if (result.rows.length > MAX_CSV_ROWS) throw new ValidationError(`The export exceeds the limit of ${MAX_CSV_ROWS} rows. Narrow the date range or filters.`);
    const csv = toCsv(compiled.headers, result.rows.map(row => compiled.columns.map(column => {
      const value = row[column];
      return value instanceof Date ? value.toISOString() : value === null || ['string', 'number'].includes(typeof value) ? value as string | number | null : value === undefined ? null : JSON.stringify(value);
    })), MAX_CSV_BYTES);
    if (csv === null) throw new ValidationError(`The export exceeds the ${MAX_CSV_BYTES / 1024 / 1024} MB file limit. Narrow the date range or filters.`);
    await recordAuditEvent(client, {
      eventType: AuditEventType.REPORT_EXPORTED,
      entityType: 'report_export',
      required: true,
      metadata: {
        dataset: compiled.dataset,
        columns: compiled.columns,
        filterKeys: Object.keys(request.filters),
        rowCount: result.rows.length,
      },
    });
    return { filename: compiled.filename, csv, rows: result.rows.length };
  });
}
