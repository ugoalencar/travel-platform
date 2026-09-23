/**
 * Segmentação Avançada de Clientes -- the ONLY place in the codebase
 * allowed to turn a browser-supplied filter definition into SQL.
 *
 * Security contract (never relaxed):
 *   - fields are drawn EXCLUSIVELY from FIELD_REGISTRY below (allowlist);
 *     an unknown `field` string is rejected before any SQL is built.
 *   - operators are drawn EXCLUSIVELY from OPERATORS_BY_TYPE for the
 *     field's declared type; an operator/type mismatch is rejected.
 *   - every value is bound as a parameterized query argument ($n) --
 *     nothing from the browser is ever concatenated into SQL text.
 *   - agency_id always comes from the authenticated tenant context
 *     (getAgencyId()), never from filter_definition or any request body.
 *   - table/column/join fragments are fixed strings baked into
 *     FIELD_REGISTRY at compile time -- the browser can only SELECT
 *     which registry entry to use (by field key), never supply a raw
 *     column/table/join itself.
 *
 * Segments store RULES, not frozen membership: `runFilterDefinition()`
 * is always executed against the live `customers` table at read time.
 */

import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { TenantTransactionClient, DatabaseRuntime } from './database';
import { ValidationError } from './errors';

// ============================================================
// DSL TYPES
// ============================================================

export type SegmentFieldType = 'STRING' | 'NUMBER' | 'MONEY' | 'DATE' | 'BOOLEAN' | 'ENUM';

export type SegmentOperator =
  | 'EQ' | 'NEQ' | 'CONTAINS' | 'STARTS_WITH'
  | 'GT' | 'GTE' | 'LT' | 'LTE' | 'BETWEEN'
  | 'BEFORE' | 'AFTER' | 'LAST_N_DAYS' | 'NEXT_N_DAYS'
  | 'IS_TRUE' | 'IS_FALSE'
  | 'IN' | 'NOT_IN'
  | 'EXISTS' | 'NOT_EXISTS';

export interface SegmentCondition {
  field: string;
  operator: SegmentOperator;
  value?: unknown;
}

export interface SegmentGroup {
  operator: 'AND' | 'OR';
  conditions: Array<SegmentCondition | SegmentGroup>;
}

export type FilterDefinition = SegmentGroup;

function isGroup(node: SegmentCondition | SegmentGroup): node is SegmentGroup {
  return (node as SegmentGroup).conditions !== undefined;
}

// ============================================================
// FIELD REGISTRY -- every field the query builder is allowed to touch.
// `expr` is a fixed SQL fragment (never built from user input) that
// evaluates to the field's value for customer row `c`. Fields backed by
// a 1:N relation use an EXISTS/subquery fragment instead of a plain
// column, so they naturally read "customer HAS a matching row".
// ============================================================

export interface SegmentFieldDef {
  type: SegmentFieldType;
  label: string;
  category: 'CLIENTE' | 'COMERCIAL' | 'VIAGENS' | 'FINANCEIRO';
  operators: SegmentOperator[];
  /** SQL expression yielding the field's scalar value, keyed off `c` (customers). */
  expr?: string;
  /** For EXISTS-shaped fields: a SQL boolean expression (no operator needed beyond EXISTS/NOT_EXISTS). */
  existsExpr?: string;
  enumValues?: string[];
}

const TEXT_OPS: SegmentOperator[] = ['EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH'];
const NUMBER_OPS: SegmentOperator[] = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'];
const DATE_OPS: SegmentOperator[] = ['BEFORE', 'AFTER', 'BETWEEN', 'LAST_N_DAYS', 'NEXT_N_DAYS'];
const BOOL_OPS: SegmentOperator[] = ['IS_TRUE', 'IS_FALSE'];
const ENUM_OPS: SegmentOperator[] = ['EQ', 'IN', 'NOT_IN'];
const EXISTS_OPS: SegmentOperator[] = ['EXISTS', 'NOT_EXISTS'];

// Field expressions reference the primary address of a customer via this
// correlated subquery fragment (customer_addresses has no city/state/country
// columns on `customers` itself -- audited, see docs/product/SEGMENTACAO_AVANCADA.md).
const PRIMARY_ADDRESS = `(SELECT ca.%COLUMN% FROM customer_addresses ca
  WHERE ca.agency_id = c.agency_id AND ca.customer_id = c.id
    AND ca.is_primary = TRUE AND ca.deleted_at IS NULL LIMIT 1)`;

export const FIELD_REGISTRY: Record<string, SegmentFieldDef> = {
  // -------------------- CLIENTE --------------------
  'customer.name': {
    type: 'STRING', label: 'Nome', category: 'CLIENTE', operators: TEXT_OPS, expr: 'c.name',
  },
  'customer.protocolNumber': {
    type: 'STRING', label: 'Protocolo', category: 'CLIENTE', operators: TEXT_OPS, expr: 'c.protocol_number',
  },
  'customer.city': {
    type: 'STRING', label: 'Cidade', category: 'CLIENTE', operators: TEXT_OPS,
    expr: PRIMARY_ADDRESS.replace('%COLUMN%', 'city'),
  },
  'customer.state': {
    type: 'STRING', label: 'Estado', category: 'CLIENTE', operators: TEXT_OPS,
    expr: PRIMARY_ADDRESS.replace('%COLUMN%', 'state'),
  },
  'customer.country': {
    type: 'STRING', label: 'País', category: 'CLIENTE', operators: TEXT_OPS,
    expr: PRIMARY_ADDRESS.replace('%COLUMN%', 'country'),
  },
  'customer.createdAt': {
    type: 'DATE', label: 'Data de cadastro', category: 'CLIENTE', operators: DATE_OPS, expr: 'c.created_at',
  },
  'customer.status': {
    type: 'ENUM', label: 'Status', category: 'CLIENTE', operators: ENUM_OPS, expr: 'c.status',
    enumValues: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
  },
  'customer.interactionsCount': {
    type: 'NUMBER', label: 'Quantidade de interações', category: 'CLIENTE', operators: NUMBER_OPS,
    expr: `(SELECT COUNT(*) FROM customer_interactions ci WHERE ci.agency_id = c.agency_id AND ci.customer_id = c.id)`,
  },
  'customer.daysSinceLastContact': {
    // NULL (never contacted) is treated as "infinitely long ago" via COALESCE,
    // so "sem contato há 30 dias" correctly includes customers with zero interactions.
    type: 'NUMBER', label: 'Dias sem contato (último contato)', category: 'CLIENTE', operators: NUMBER_OPS,
    expr: `COALESCE((SELECT EXTRACT(DAY FROM now() - MAX(ci.occurred_at))
      FROM customer_interactions ci WHERE ci.agency_id = c.agency_id AND ci.customer_id = c.id), 999999)`,
  },

  // -------------------- COMERCIAL --------------------
  'commercial.hasWish': {
    type: 'BOOLEAN', label: 'Possui Wish', category: 'COMERCIAL', operators: [...BOOL_OPS, ...EXISTS_OPS],
    existsExpr: `EXISTS (SELECT 1 FROM wishes w WHERE w.agency_id = c.agency_id AND w.customer_id = c.id)`,
  },
  'commercial.wishDestination': {
    type: 'STRING', label: 'Destino/interesse do Wish', category: 'COMERCIAL', operators: ['CONTAINS'],
    expr: `(SELECT string_agg(w.destination, ' | ') FROM wishes w WHERE w.agency_id = c.agency_id AND w.customer_id = c.id)`,
  },
  'commercial.hasActiveProposal': {
    type: 'BOOLEAN', label: 'Possui proposta ativa', category: 'COMERCIAL', operators: [...BOOL_OPS, ...EXISTS_OPS],
    existsExpr: `EXISTS (SELECT 1 FROM proposals p WHERE p.agency_id = c.agency_id AND p.customer_id = c.id AND p.status IN ('DRAFT', 'SENT'))`,
  },
  'commercial.proposalStatus': {
    // %OP% template only supports scalarOperatorSql's simple comparisons
    // (EQ/NEQ/GT/GTE/LT/LTE) -- IN/NOT_IN are deliberately NOT declared
    // here since they are not implemented for this templated shape.
    type: 'ENUM', label: 'Status da proposta', category: 'COMERCIAL', operators: ['EQ'],
    enumValues: ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
    existsExpr: `EXISTS (SELECT 1 FROM proposals p WHERE p.agency_id = c.agency_id AND p.customer_id = c.id AND p.status %OP%)`,
  },
  'commercial.proposalValue': {
    type: 'MONEY', label: 'Valor da proposta', category: 'COMERCIAL', operators: ['GT', 'GTE', 'LT', 'LTE', 'BETWEEN'],
    existsExpr: `EXISTS (SELECT 1 FROM proposals p WHERE p.agency_id = c.agency_id AND p.customer_id = c.id AND p.total %OP%)`,
  },
  'commercial.pipelineStageId': {
    type: 'STRING', label: 'Estágio de pipeline', category: 'COMERCIAL', operators: ['EQ'],
    existsExpr: `EXISTS (SELECT 1 FROM commercial_opportunities co WHERE co.agency_id = c.agency_id AND co.customer_id = c.id AND co.stage_id %OP%)`,
  },
  'commercial.proposalsCount': {
    type: 'NUMBER', label: 'Quantidade de propostas', category: 'COMERCIAL', operators: NUMBER_OPS,
    expr: `(SELECT COUNT(*) FROM proposals p WHERE p.agency_id = c.agency_id AND p.customer_id = c.id)`,
  },

  // -------------------- VIAGENS --------------------
  'trip.hasFuture': {
    type: 'BOOLEAN', label: 'Possui viagem futura', category: 'VIAGENS', operators: [...BOOL_OPS, ...EXISTS_OPS],
    existsExpr: `EXISTS (SELECT 1 FROM trips t WHERE t.agency_id = c.agency_id AND t.customer_id = c.id AND t.start_date > now() AND t.status <> 'CANCELLED')`,
  },
  'trip.nextDeparture': {
    type: 'DATE', label: 'Data da próxima viagem', category: 'VIAGENS', operators: DATE_OPS,
    expr: `(SELECT MIN(t.start_date) FROM trips t WHERE t.agency_id = c.agency_id AND t.customer_id = c.id AND t.start_date > now() AND t.status <> 'CANCELLED')`,
  },
  'trip.lastTrip': {
    type: 'DATE', label: 'Última viagem', category: 'VIAGENS', operators: DATE_OPS,
    expr: `(SELECT MAX(t.start_date) FROM trips t WHERE t.agency_id = c.agency_id AND t.customer_id = c.id AND t.start_date <= now())`,
  },
  'trip.destination': {
    type: 'STRING', label: 'Destino', category: 'VIAGENS', operators: ['CONTAINS'],
    expr: `(SELECT string_agg(t.destination, ' | ') FROM trips t WHERE t.agency_id = c.agency_id AND t.customer_id = c.id)`,
  },
  'trip.category': {
    type: 'ENUM', label: 'Tipo de viagem', category: 'VIAGENS', operators: ['EQ', 'IN', 'NOT_IN'],
    enumValues: ['AIR', 'LAND', 'EXCURSION'],
    existsExpr: `EXISTS (SELECT 1 FROM trips t WHERE t.agency_id = c.agency_id AND t.customer_id = c.id AND (
      (%VALUE% = 'AIR' AND EXISTS (SELECT 1 FROM air_services a WHERE a.agency_id = t.agency_id AND a.trip_id = t.id))
      OR (%VALUE% = 'LAND' AND EXISTS (SELECT 1 FROM land_services l WHERE l.agency_id = t.agency_id AND l.trip_id = t.id))
      OR (%VALUE% = 'EXCURSION' AND EXISTS (SELECT 1 FROM excursion_customers ec WHERE ec.agency_id = t.agency_id AND ec.trip_id = t.id))
    ))`,
  },
  'trip.count': {
    type: 'NUMBER', label: 'Quantidade de viagens', category: 'VIAGENS', operators: NUMBER_OPS,
    expr: `(SELECT COUNT(*) FROM trips t WHERE t.agency_id = c.agency_id AND t.customer_id = c.id)`,
  },
  'trip.totalValue': {
    type: 'MONEY', label: 'Total histórico de viagens', category: 'VIAGENS', operators: NUMBER_OPS,
    expr: `(SELECT COALESCE(SUM(s.total), 0) FROM trips t JOIN sales s ON s.agency_id = t.agency_id AND s.id = t.sale_id WHERE t.agency_id = c.agency_id AND t.customer_id = c.id)`,
  },
  // Backed by travel_requirements (migration 046) -- required=true AND
  // fulfilled=false is the real, existing "missing document" signal;
  // no new table/migration needed. Not scoped to a specific trip_id
  // (travel_requirements.trip_id is nullable), so this reads any
  // outstanding requirement for the customer.
  'trip.hasMissingDocument': {
    type: 'BOOLEAN', label: 'Documentação pendente', category: 'VIAGENS', operators: [...BOOL_OPS, ...EXISTS_OPS],
    existsExpr: `EXISTS (SELECT 1 FROM travel_requirements tr WHERE tr.agency_id = c.agency_id AND tr.customer_id = c.id AND tr.required = TRUE AND tr.fulfilled = FALSE AND tr.deleted_at IS NULL)`,
  },

  // -------------------- FINANCEIRO --------------------
  'financial.totalPurchased': {
    type: 'MONEY', label: 'Total comprado', category: 'FINANCEIRO', operators: NUMBER_OPS,
    expr: `(SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.agency_id = c.agency_id AND s.customer_id = c.id AND s.status IN ('CONFIRMED', 'PAID'))`,
  },
  'financial.averageTicket': {
    type: 'MONEY', label: 'Ticket médio', category: 'FINANCEIRO', operators: NUMBER_OPS,
    expr: `(SELECT COALESCE(AVG(s.total), 0) FROM sales s WHERE s.agency_id = c.agency_id AND s.customer_id = c.id AND s.status IN ('CONFIRMED', 'PAID'))`,
  },
  'financial.hasOpenBalance': {
    type: 'BOOLEAN', label: 'Possui saldo em aberto', category: 'FINANCEIRO', operators: [...BOOL_OPS, ...EXISTS_OPS],
    existsExpr: `EXISTS (SELECT 1 FROM receivables r WHERE r.agency_id = c.agency_id AND r.customer_id = c.id AND r.status IN ('OPEN', 'PARTIALLY_PAID'))`,
  },
  'financial.hasOverdueReceivable': {
    type: 'BOOLEAN', label: 'Possui recebível vencido', category: 'FINANCEIRO', operators: [...BOOL_OPS, ...EXISTS_OPS],
    existsExpr: `EXISTS (SELECT 1 FROM receivables r WHERE r.agency_id = c.agency_id AND r.customer_id = c.id AND r.status IN ('OPEN', 'PARTIALLY_PAID') AND r.due_at < now())`,
  },
};

// Fields NOT implemented, deliberately, per the audit -- see
// docs/product/SEGMENTACAO_AVANCADA.md "Campos não implementados":
// tags (no such column/table exists), agente/responsável fixo (no fixed
// owner field on customers), forma de pagamento mais usada / parcelamento
// médio (no structured installment concept), preferências livres tipo
// "gosta de praia" (only free-text notes exist, not structured data),
// dias no estágio de pipeline (no stage-transition history table).

const OPERATOR_ARITY: Record<SegmentOperator, 'none' | 'single' | 'pair' | 'list'> = {
  EQ: 'single', NEQ: 'single', CONTAINS: 'single', STARTS_WITH: 'single',
  GT: 'single', GTE: 'single', LT: 'single', LTE: 'single', BETWEEN: 'pair',
  BEFORE: 'single', AFTER: 'single', LAST_N_DAYS: 'single', NEXT_N_DAYS: 'single',
  IS_TRUE: 'none', IS_FALSE: 'none',
  IN: 'list', NOT_IN: 'list',
  EXISTS: 'none', NOT_EXISTS: 'none',
};

// ============================================================
// VALIDATION + SQL BUILD
// ============================================================

const MAX_CONDITIONS = 30;
const MAX_NESTING_DEPTH = 4;

export function validateFilterDefinition(input: unknown): FilterDefinition {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('filter_definition must be an object');
  }
  const countRef = { count: 0 };
  return validateGroup(input as Record<string, unknown>, 1, countRef);
}

function validateGroup(
  raw: Record<string, unknown>,
  depth: number,
  countRef: { count: number },
): SegmentGroup {
  if (depth > MAX_NESTING_DEPTH) {
    throw new ValidationError(`filter_definition nesting exceeds maximum depth of ${MAX_NESTING_DEPTH}`);
  }
  const operator = raw.operator;
  if (operator !== 'AND' && operator !== 'OR') {
    throw new ValidationError('Group "operator" must be "AND" or "OR"');
  }
  if (!Array.isArray(raw.conditions) || raw.conditions.length === 0) {
    throw new ValidationError('Group "conditions" must be a non-empty array');
  }

  const conditions: Array<SegmentCondition | SegmentGroup> = raw.conditions.map((node: unknown) => {
    if (typeof node !== 'object' || node === null) {
      throw new ValidationError('Each condition/group must be an object');
    }
    const record = node as Record<string, unknown>;
    if (record.conditions !== undefined) {
      return validateGroup(record, depth + 1, countRef);
    }
    countRef.count += 1;
    if (countRef.count > MAX_CONDITIONS) {
      throw new ValidationError(`filter_definition exceeds maximum of ${MAX_CONDITIONS} conditions`);
    }
    return validateCondition(record);
  });

  return { operator, conditions };
}

function validateCondition(record: Record<string, unknown>): SegmentCondition {
  const field = record.field;
  if (typeof field !== 'string' || !(field in FIELD_REGISTRY)) {
    throw new ValidationError(`Unknown or unsupported filter field: ${String(field)}`);
  }
  const def = FIELD_REGISTRY[field];
  if (!def) {
    throw new ValidationError(`Unknown or unsupported filter field: ${String(field)}`);
  }

  const operator = record.operator;
  if (typeof operator !== 'string' || !def.operators.includes(operator as SegmentOperator)) {
    throw new ValidationError(`Operator "${String(operator)}" is not allowed for field "${field}"`);
  }
  const op = operator as SegmentOperator;

  const arity = OPERATOR_ARITY[op];
  const value = record.value;

  if (arity === 'none') {
    return { field, operator: op };
  }
  if (arity === 'pair') {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new ValidationError(`Operator "${op}" on field "${field}" requires a value array of length 2`);
    }
    return { field, operator: op, value: value.map((v) => coerceValue(def, v, field)) };
  }
  if (arity === 'list') {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
      throw new ValidationError(`Operator "${op}" on field "${field}" requires a non-empty value array (max 100)`);
    }
    return { field, operator: op, value: value.map((v) => coerceValue(def, v, field)) };
  }
  // single
  return { field, operator: op, value: coerceValue(def, value, field) };
}

function coerceValue(def: SegmentFieldDef, value: unknown, field: string): unknown {
  if (def.type === 'ENUM') {
    if (typeof value !== 'string' || (def.enumValues && !def.enumValues.includes(value))) {
      throw new ValidationError(`Invalid enum value for field "${field}": ${String(value)}`);
    }
    return value;
  }
  if (def.type === 'NUMBER' || def.type === 'MONEY') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError(`Field "${field}" requires a numeric value`);
    }
    return value;
  }
  if (def.type === 'DATE') {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new ValidationError(`Field "${field}" requires a date value`);
    }
    return value;
  }
  if (def.type === 'STRING') {
    if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
      throw new ValidationError(`Field "${field}" requires a non-empty string value (max 256 chars)`);
    }
    return value;
  }
  throw new ValidationError(`Field "${field}" does not accept a value for boolean/exists operators`);
}

interface SqlBuildContext {
  values: unknown[];
}

function buildGroupSql(group: SegmentGroup, ctx: SqlBuildContext): string {
  const parts = group.conditions.map((node) =>
    isGroup(node) ? `(${buildGroupSql(node, ctx)})` : buildConditionSql(node, ctx),
  );
  return parts.join(` ${group.operator} `);
}

function buildConditionSql(condition: SegmentCondition, ctx: SqlBuildContext): string {
  const def = FIELD_REGISTRY[condition.field];
  if (!def) {
    // Unreachable after validateFilterDefinition, but defends this
    // function against being called directly with unvalidated input.
    throw new ValidationError(`Unknown filter field: ${condition.field}`);
  }

  const op = condition.operator;

  if (op === 'EXISTS' || op === 'NOT_EXISTS') {
    if (!def.existsExpr) {
      throw new ValidationError(`Field "${condition.field}" does not support EXISTS/NOT_EXISTS`);
    }
    const exists = def.existsExpr.includes('%OP%') || def.existsExpr.includes('%VALUE%')
      ? def.existsExpr // pure existence check ignores %OP%/%VALUE% templates; only used with other operators
      : def.existsExpr;
    return op === 'EXISTS' ? exists : `NOT ${exists}`;
  }

  if (op === 'IS_TRUE' || op === 'IS_FALSE') {
    if (!def.existsExpr) {
      throw new ValidationError(`Field "${condition.field}" does not support boolean operators`);
    }
    return op === 'IS_TRUE' ? def.existsExpr : `NOT ${def.existsExpr}`;
  }

  // Fields with an existsExpr template (%OP%/%VALUE%) are relation-scoped
  // comparisons ("has a proposal whose total >= X"); fields with a plain
  // `expr` are scalar/derived values compared directly.
  if (def.existsExpr && (def.existsExpr.includes('%OP%') || def.existsExpr.includes('%VALUE%'))) {
    return buildTemplatedCondition(def, op, condition.value, ctx);
  }

  if (!def.expr) {
    throw new ValidationError(`Field "${condition.field}" is not comparable with operator "${op}"`);
  }
  return buildScalarCondition(def.expr, def.type, op, condition.value, ctx);
}

function buildTemplatedCondition(
  def: SegmentFieldDef,
  op: SegmentOperator,
  value: unknown,
  ctx: SqlBuildContext,
): string {
  const template = def.existsExpr ?? '';
  if (template.includes('%VALUE%')) {
    // trip.category: value is an allowlisted enum string substituted as a
    // bound parameter placeholder, never inlined as raw text.
    if (op === 'IN' || op === 'NOT_IN') {
      const values = Array.isArray(value) ? value : [value];
      const clauses = values.map((v) => {
        ctx.values.push(v);
        return template.replace(/%VALUE%/g, `$${ctx.values.length}`);
      });
      const joined = clauses.map((c) => `(${c})`).join(' OR ');
      return op === 'IN' ? `(${joined})` : `NOT (${joined})`;
    }
    ctx.values.push(value);
    return template.replace(/%VALUE%/g, `$${ctx.values.length}`);
  }

  // %OP% template: comparison operator + value(s) inline (still fully
  // parameterized -- only the SQL operator token itself, drawn from a
  // fixed allowlisted switch below, is ever inlined as text).
  const opSql = scalarOperatorSql(op, ctx, value);
  return template.replace('%OP%', opSql);
}

function buildScalarCondition(
  expr: string,
  type: SegmentFieldType,
  op: SegmentOperator,
  value: unknown,
  ctx: SqlBuildContext,
): string {
  if (op === 'CONTAINS') {
    ctx.values.push(`%${String(value)}%`);
    return `${expr} ILIKE $${ctx.values.length}`;
  }
  if (op === 'STARTS_WITH') {
    ctx.values.push(`${String(value)}%`);
    return `${expr} ILIKE $${ctx.values.length}`;
  }
  if (op === 'LAST_N_DAYS') {
    ctx.values.push(value);
    return `${expr} >= now() - ($${ctx.values.length}::text || ' days')::interval`;
  }
  if (op === 'NEXT_N_DAYS') {
    ctx.values.push(value);
    return `${expr} <= now() + ($${ctx.values.length}::text || ' days')::interval AND ${expr} >= now()`;
  }
  if (op === 'BEFORE') {
    ctx.values.push(value);
    return `${expr} < $${ctx.values.length}`;
  }
  if (op === 'AFTER') {
    ctx.values.push(value);
    return `${expr} > $${ctx.values.length}`;
  }
  if (op === 'BETWEEN') {
    const [a, b] = value as [unknown, unknown];
    ctx.values.push(a, b);
    return `${expr} BETWEEN $${ctx.values.length - 1} AND $${ctx.values.length}`;
  }
  if (op === 'IN' || op === 'NOT_IN') {
    const values = value as unknown[];
    ctx.values.push(values);
    // Postgres native enum columns (e.g. customers."Status") do not
    // compare directly against a text[]; cast both sides to text so
    // ENUM/STRING fields work uniformly regardless of the underlying
    // column's declared type.
    const lhs = type === 'ENUM' || type === 'STRING' ? `${expr}::text` : expr;
    const cast = type === 'ENUM' || type === 'STRING' ? '::text[]' : '';
    return `${lhs} ${op === 'IN' ? '=' : '<>'} ANY($${ctx.values.length}${cast})`;
  }
  const opSql = scalarOperatorSql(op, ctx, value);
  return `${expr} ${opSql}`;
}

function scalarOperatorSql(op: SegmentOperator, ctx: SqlBuildContext, value: unknown): string {
  const simple: Partial<Record<SegmentOperator, string>> = {
    EQ: '=', NEQ: '<>', GT: '>', GTE: '>=', LT: '<', LTE: '<=',
  };
  const sql = simple[op];
  if (!sql) {
    throw new ValidationError(`Unsupported operator: ${op}`);
  }
  ctx.values.push(value);
  return `${sql} $${ctx.values.length}`;
}

// ============================================================
// EXECUTION
// ============================================================

export interface SegmentPagination {
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function parseSegmentPagination(query: Record<string, unknown>): SegmentPagination {
  let page = 1;
  if (typeof query.page === 'string' && query.page.trim().length > 0) {
    const parsed = Number(query.page);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new ValidationError('Query parameter "page" must be a positive integer');
    }
    page = Math.trunc(parsed);
  }
  let pageSize = DEFAULT_PAGE_SIZE;
  if (typeof query.pageSize === 'string' && query.pageSize.trim().length > 0) {
    const parsed = Number(query.pageSize);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new ValidationError('Query parameter "pageSize" must be a positive integer');
    }
    pageSize = Math.min(Math.trunc(parsed), MAX_PAGE_SIZE);
  }
  return { page, pageSize };
}

const SORTABLE_COLUMNS: Record<string, string> = {
  name: 'c.name',
  createdAt: 'c.created_at',
};

export interface SegmentResultRow {
  id: string;
  name: string;
  city: string | null;
  lastContactAt: string | null;
  nextDeparture: string | null;
  averageTicket: number;
}

export interface SegmentRunResult {
  total: number;
  page: number;
  pageSize: number;
  customers: SegmentResultRow[];
}

// Executes filter_definition against the LIVE customers table -- this is
// the single dynamic-membership execution path used by both segment
// preview and segment "open" (spec: "não persistir snapshot de membros").
export async function runFilterDefinition(
  client: TenantTransactionClient,
  filterDefinition: FilterDefinition,
  pagination: SegmentPagination,
  sort?: string,
): Promise<SegmentRunResult> {
  const agencyId = getAgencyId();
  const ctx: SqlBuildContext = { values: [agencyId] };
  const whereSql = buildGroupSql(filterDefinition, ctx);

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customers c
     WHERE c.agency_id = $1 AND c.deleted_at IS NULL AND (${whereSql})`,
    ctx.values,
  );
  const total = Number(countResult.rows[0]?.count ?? '0');

  const sortColumn = (sort && SORTABLE_COLUMNS[sort]) || 'c.created_at';
  const limit = pagination.pageSize;
  const offset = (pagination.page - 1) * pagination.pageSize;

  const dataValues = [...ctx.values, limit, offset];
  const dataResult = await client.query<{
    id: string;
    name: string;
    city: string | null;
    last_contact_at: string | null;
    next_departure: string | null;
    average_ticket: string;
  }>(
    `SELECT c.id, c.name,
            ${PRIMARY_ADDRESS.replace('%COLUMN%', 'city')} AS city,
            (SELECT MAX(ci.occurred_at) FROM customer_interactions ci WHERE ci.agency_id = c.agency_id AND ci.customer_id = c.id) AS last_contact_at,
            (SELECT MIN(t.start_date) FROM trips t WHERE t.agency_id = c.agency_id AND t.customer_id = c.id AND t.start_date > now() AND t.status <> 'CANCELLED') AS next_departure,
            (SELECT COALESCE(AVG(s.total), 0) FROM sales s WHERE s.agency_id = c.agency_id AND s.customer_id = c.id AND s.status IN ('CONFIRMED', 'PAID')) AS average_ticket
     FROM customers c
     WHERE c.agency_id = $1 AND c.deleted_at IS NULL AND (${whereSql})
     ORDER BY ${sortColumn} DESC
     LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues,
  );

  return {
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    customers: dataResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      lastContactAt: row.last_contact_at,
      nextDeparture: row.next_departure,
      averageTicket: Number(row.average_ticket),
    })),
  };
}

export async function previewSegment(
  database: DatabaseRuntime,
  filterDefinition: FilterDefinition,
  pagination: SegmentPagination,
): Promise<SegmentRunResult> {
  return database.withTenantTransaction((client) => runFilterDefinition(client, filterDefinition, pagination));
}

// ============================================================
// CUSTOMER MEMBERSHIP (F-04) -- fail-closed segment eligibility for
// the customer portal (offers / communications). Reuses the same
// buildGroupSql engine as runFilterDefinition; never builds ad-hoc SQL
// and never duplicates the DSL. Errors DENY membership (fail closed).
// ============================================================

/**
 * Evaluate whether the given customer matches a single filter_definition
 * against the live customers table. Any validation or SQL error returns
 * false -- a broken segment must never leak content to a non-member.
 */
async function customerMatchesFilter(
  client: TenantTransactionClient,
  filterDefinition: unknown,
  customerId: string,
): Promise<boolean> {
  try {
    const validated = validateFilterDefinition(filterDefinition);
    const agencyId = getAgencyId();
    const ctx: SqlBuildContext = { values: [agencyId] };
    const whereSql = buildGroupSql(validated, ctx);
    const result = await client.query<{ match: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM customers c
         WHERE c.agency_id = $1 AND c.deleted_at IS NULL
           AND c.id = $2
           AND (${whereSql})
       ) AS match`,
      [...ctx.values.slice(0, 1), customerId, ...ctx.values.slice(1)],
    );
    return result.rows[0]?.match === true;
  } catch {
    return false;
  }
}

/**
 * F-04: ids of every non-archived, non-archived segment this customer
 * actually belongs to (evaluated live). Used to filter segment-targeted
 * offers/communications. Fail closed: unreadable/invalid segments are
 * simply not returned, so targeted content for them stays hidden.
 */
export async function computeEligibleSegmentIds(
  client: TenantTransactionClient,
  customerId: string,
): Promise<string[]> {
  const agencyId = getAgencyId();
  const segments = await client.query<{ id: string; filter_definition: unknown }>(
    `SELECT id, filter_definition
     FROM customer_segments
     WHERE agency_id = $1
       AND archived_at IS NULL
       AND filter_definition IS NOT NULL`,
    [agencyId],
  );

  const eligible: string[] = [];
  for (const segment of segments.rows) {
    if (await customerMatchesFilter(client, segment.filter_definition, customerId)) {
      eligible.push(segment.id);
    }
  }
  return eligible;
}

/**
 * F-04: true only if the segment exists, is active, has a valid
 * filter_definition, AND this customer matches it live. Fail closed on
 * every error path (unknown id, archived segment, invalid definition,
 * SQL failure).
 */
export async function isCustomerInSegment(
  client: TenantTransactionClient,
  segmentId: string,
  customerId: string,
): Promise<boolean> {
  const agencyId = getAgencyId();
  const segment = await client.query<{ filter_definition: unknown }>(
    `SELECT filter_definition
     FROM customer_segments
     WHERE agency_id = $1 AND id = $2
       AND archived_at IS NULL
       AND filter_definition IS NOT NULL`,
    [agencyId, segmentId],
  );
  const row = segment.rows[0];
  if (!row) return false;
  return customerMatchesFilter(client, row.filter_definition, customerId);
}
