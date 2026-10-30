/**
 * Sale categories (ADR-008): the agency's category catalog plus the per-category
 * sale form profile. Tenant comes from the session context only.
 */

import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import {
  getSaleFormField,
  saleFormFieldsFor,
  validateProfileRules,
  type SaleFormFieldDefinition,
  type SaleFormRule,
} from './sale-form-fields';

export interface SaleCategory {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  formRevision: number;
  legacyRef?: string;
}

export interface SaleCategoryFormField {
  fieldKey: string;
  storage: SaleFormFieldDefinition['storage'];
  label: string;
  type: SaleFormFieldDefinition['type'];
  group: string;
  locked: boolean;
  enabled: boolean;
  required: boolean;
  sortOrder: number;
}

export interface SaleCategoryForm {
  category: SaleCategory;
  formRevision: number;
  fields: SaleCategoryFormField[];
}

interface CategoryRow {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  form_revision: number;
  legacy_ref: string | null;
}

interface RuleRow {
  field_key: string;
  enabled: boolean;
  required: boolean;
  sort_order: number;
}

const CATEGORY_COLUMNS = 'id, name, active, sort_order, form_revision, legacy_ref';
const UNIQUE_VIOLATION = '23505';

function toCategory(row: CategoryRow): SaleCategory {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    sortOrder: row.sort_order,
    formRevision: row.form_revision,
    ...(row.legacy_ref !== null ? { legacyRef: row.legacy_ref } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;
}

export async function listSaleCategories(database: DatabaseRuntime, includeInactive: boolean): Promise<SaleCategory[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS} FROM commission_categories
        WHERE agency_id = $1 AND ($2::boolean OR active)
        ORDER BY sort_order, lower(name)`,
      [agencyId, includeInactive],
    );
    return result.rows.map(toCategory);
  });
}

export async function createSaleCategory(
  database: DatabaseRuntime,
  input: { name: string; sortOrder?: number },
): Promise<SaleCategory> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    try {
      const result = await client.query<CategoryRow>(
        `INSERT INTO commission_categories (agency_id, name, sort_order)
         VALUES ($1, $2, $3) RETURNING ${CATEGORY_COLUMNS}`,
        [agencyId, input.name.trim(), input.sortOrder ?? 0],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Category insert did not return a row');
      await recordAuditEvent(client, {
        eventType: AuditEventType.SALE_CATEGORY_CREATED,
        entityType: 'sale_category',
        entityId: row.id,
        required: true,
        metadata: { title: row.name },
      });
      return toCategory(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('A category with this name already exists');
      throw error;
    }
  });
}

export async function updateSaleCategory(
  database: DatabaseRuntime,
  id: string,
  input: { name?: string; active?: boolean; sortOrder?: number },
): Promise<SaleCategory> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const sets: string[] = [];
    const values: unknown[] = [agencyId, id];
    const changed: string[] = [];
    if (input.name !== undefined) {
      values.push(input.name.trim());
      sets.push(`name = $${values.length}`);
      changed.push('name');
    }
    if (input.active !== undefined) {
      values.push(input.active);
      sets.push(`active = $${values.length}`);
      changed.push(`active:${input.active ? 'on' : 'off'}`);
    }
    if (input.sortOrder !== undefined) {
      values.push(input.sortOrder);
      sets.push(`sort_order = $${values.length}`);
      changed.push('sortOrder');
    }
    try {
      const result = await client.query<CategoryRow>(
        `UPDATE commission_categories SET ${sets.join(', ')}, updated_at = now()
          WHERE agency_id = $1 AND id = $2 RETURNING ${CATEGORY_COLUMNS}`,
        values,
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundError('Category not found');
      await recordAuditEvent(client, {
        eventType: AuditEventType.SALE_CATEGORY_UPDATED,
        entityType: 'sale_category',
        entityId: row.id,
        required: true,
        metadata: { title: row.name, fieldsChanged: changed },
      });
      return toCategory(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('A category with this name already exists');
      throw error;
    }
  });
}

/** Loads a category and its stored profile rules inside an open tenant transaction. */
export async function loadCategoryWithRules(
  client: TenantTransactionClient,
  agencyId: string,
  categoryId: string,
  lock: false | 'update' | 'share' = false,
): Promise<{ category: SaleCategory; rules: SaleFormRule[]; sortOrders: Map<string, number> } | null> {
  // 'update' is taken by the profile editor / category edits, 'share' by sales that snapshot the
  // profile: a sale then sees one consistent revision and cannot race a replace or a deactivation.
  const lockClause = lock === 'update' ? ' FOR UPDATE' : lock === 'share' ? ' FOR SHARE' : '';
  const categoryResult = await client.query<CategoryRow>(
    `SELECT ${CATEGORY_COLUMNS} FROM commission_categories WHERE agency_id = $1 AND id = $2${lockClause}`,
    [agencyId, categoryId],
  );
  const row = categoryResult.rows[0];
  if (!row) return null;
  const ruleResult = await client.query<RuleRow>(
    `SELECT field_key, enabled, required, sort_order FROM sale_category_fields
      WHERE agency_id = $1 AND category_id = $2 ORDER BY sort_order, field_key`,
    [agencyId, categoryId],
  );
  return {
    category: toCategory(row),
    rules: ruleResult.rows.map((r) => ({ fieldKey: r.field_key, enabled: r.enabled, required: r.required })),
    sortOrders: new Map(ruleResult.rows.map((r) => [r.field_key, r.sort_order])),
  };
}

function mergeForm(
  category: SaleCategory,
  rules: readonly SaleFormRule[],
  sortOrders: ReadonlyMap<string, number>,
): SaleCategoryForm {
  const ruleByKey = new Map(rules.map((rule) => [rule.fieldKey, rule]));
  const fields = saleFormFieldsFor('FULL').map((field, index): SaleCategoryFormField => {
    const rule = ruleByKey.get(field.key);
    return {
      fieldKey: field.key,
      storage: field.storage,
      label: field.label,
      type: field.type,
      group: field.group,
      locked: field.locked,
      enabled: field.locked ? true : (rule?.enabled ?? false),
      required: field.locked ? false : (rule?.required ?? false),
      sortOrder: sortOrders.get(field.key) ?? index,
    };
  });
  return { category, formRevision: category.formRevision, fields };
}

export async function getSaleCategoryForm(database: DatabaseRuntime, categoryId: string): Promise<SaleCategoryForm> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const loaded = await loadCategoryWithRules(client, agencyId, categoryId);
    if (!loaded) throw new NotFoundError('Category not found');
    return mergeForm(loaded.category, loaded.rules, loaded.sortOrders);
  });
}

export interface SaleCategoryFormInput {
  fields: Array<{ fieldKey: string; enabled: boolean; required: boolean; sortOrder?: number }>;
}

function describeRule(rule: SaleFormRule | undefined): string {
  if (!rule || !rule.enabled) return 'off';
  return rule.required ? 'req' : 'on';
}

/** Replaces the whole profile of a category (idempotent), bumps the revision and audits before/after. */
export async function replaceSaleCategoryForm(
  database: DatabaseRuntime,
  categoryId: string,
  input: SaleCategoryFormInput,
): Promise<SaleCategoryForm> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  const submitted: SaleFormRule[] = input.fields.map((f) => ({ fieldKey: f.fieldKey, enabled: f.enabled, required: f.required }));
  validateProfileRules(submitted);
  // locked fields are not stored: they are always enabled and never required
  const persisted = input.fields.filter((f) => !getSaleFormField(f.fieldKey)?.locked);

  return database.withTenantTransaction(async (client) => {
    const loaded = await loadCategoryWithRules(client, agencyId, categoryId, 'update');
    if (!loaded) throw new NotFoundError('Category not found');

    const before = new Map(loaded.rules.map((r) => [r.fieldKey, r]));
    const after = new Map(persisted.map((f, index) => [f.fieldKey, { ...f, order: f.sortOrder ?? index }]));
    const changed: string[] = [];
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const from = describeRule(before.get(key));
      const to = describeRule(after.get(key));
      if (from !== to) changed.push(`${key}:${from}>${to}`);
      if (after.has(key) && before.has(key) && loaded.sortOrders.get(key) !== after.get(key)!.order) {
        changed.push(`${key}:order ${loaded.sortOrders.get(key) ?? '-'}>${after.get(key)!.order}`);
      }
    }

    await client.query(`DELETE FROM sale_category_fields WHERE agency_id = $1 AND category_id = $2`, [agencyId, categoryId]);
    for (const [index, field] of persisted.entries()) {
      await client.query(
        `INSERT INTO sale_category_fields (agency_id, category_id, field_key, enabled, required, sort_order, group_name, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [agencyId, categoryId, field.fieldKey, field.enabled, field.required, field.sortOrder ?? index,
          getSaleFormField(field.fieldKey)?.group ?? null, userId],
      );
    }
    const bumped = await client.query<CategoryRow>(
      `UPDATE commission_categories SET form_revision = form_revision + 1, updated_at = now()
        WHERE agency_id = $1 AND id = $2 RETURNING ${CATEGORY_COLUMNS}`,
      [agencyId, categoryId],
    );
    const row = bumped.rows[0];
    if (!row) throw new NotFoundError('Category not found');

    await recordAuditEvent(client, {
      eventType: AuditEventType.SALE_CATEGORY_FORM_UPDATED,
      entityType: 'sale_category',
      entityId: categoryId,
      required: true,
      metadata: { title: row.name, fieldsChanged: changed, sortOrder: row.form_revision },
    });

    const rules = persisted.map((f) => ({ fieldKey: f.fieldKey, enabled: f.enabled, required: f.required }));
    return mergeForm(toCategory(row), rules, new Map(persisted.map((f, i) => [f.fieldKey, f.sortOrder ?? i])));
  });
}

export function listSaleFormRegistry() {
  return saleFormFieldsFor('FULL').map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    group: field.group,
    locked: field.locked,
    classification: field.classification,
    availableIn: field.availableIn,
  }));
}

export function assertNonEmptyName(name: string): void {
  if (name.trim().length === 0 || name.trim().length > 80) {
    throw new ValidationError('Field "name" must have between 1 and 80 characters');
  }
}
