/**
 * Configurable sale form (ADR-008): registry listing and the per-category form
 * profile. Mirrors the Full contract (services/api/src/routes/sale-categories.ts);
 * Lite keeps its snake_case JSON style and its /categories base path.
 */
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireAdministrator, requirePermission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import {
  getSaleFormField,
  saleFormFieldsFor,
  validateProfileRules,
  type SaleFormRule,
} from '../sale-form-fields';
import { getTenantContext } from '../tenant-context';
import { parseObjectBody } from '../validation';

export interface CategoryWithRules {
  category: { id: string; name: string; active: boolean; sort_order: number; form_revision: number };
  rules: SaleFormRule[];
  sortOrders: Map<string, number>;
}

/** Loads a category and its stored profile inside an open tenant transaction (null when absent). */
export async function loadCategoryWithRules(
  client: TenantClient,
  tenantId: string,
  categoryId: string,
  lock: false | 'update' | 'share' = false,
): Promise<CategoryWithRules | null> {
  // 'update' is taken by the profile editor, 'share' by sales that snapshot the profile: a sale then
  // sees one consistent revision and cannot race a replace or a deactivation.
  const lockClause = lock === 'update' ? ' FOR UPDATE' : lock === 'share' ? ' FOR SHARE' : '';
  const categoryResult = await client.query<CategoryWithRules['category']>(
    `SELECT id, name, active, sort_order, form_revision FROM sale_categories
      WHERE tenant_id = $1 AND id = $2${lockClause}`,
    [tenantId, categoryId],
  );
  const category = categoryResult.rows[0];
  if (!category) return null;
  const ruleResult = await client.query<{ field_key: string; enabled: boolean; required: boolean; sort_order: number }>(
    `SELECT field_key, enabled, required, sort_order FROM sale_category_fields
      WHERE tenant_id = $1 AND category_id = $2 ORDER BY sort_order, field_key`,
    [tenantId, categoryId],
  );
  return {
    category,
    rules: ruleResult.rows.map((r) => ({ fieldKey: r.field_key, enabled: r.enabled, required: r.required })),
    sortOrders: new Map(ruleResult.rows.map((r) => [r.field_key, r.sort_order])),
  };
}

function mergeForm(
  category: CategoryWithRules['category'],
  rules: readonly SaleFormRule[],
  sortOrders: ReadonlyMap<string, number>,
) {
  const ruleByKey = new Map(rules.map((rule) => [rule.fieldKey, rule]));
  return {
    category,
    form_revision: category.form_revision,
    fields: saleFormFieldsFor('LITE').map((field, index) => {
      const rule = ruleByKey.get(field.key);
      return {
        field_key: field.key,
        label: field.label,
        type: field.type,
        group: field.group,
        storage: field.storage,
        locked: field.locked,
        enabled: field.locked ? true : (rule?.enabled ?? false),
        required: field.locked ? false : (rule?.required ?? false),
        sort_order: sortOrders.get(field.key) ?? index,
      };
    }),
  };
}

function describeRule(rule: SaleFormRule | undefined): string {
  if (!rule || !rule.enabled) return 'off';
  return rule.required ? 'req' : 'on';
}

interface SubmittedField {
  fieldKey: string;
  enabled: boolean;
  required: boolean;
  sortOrder?: number;
}

function parseForm(body: unknown): SubmittedField[] {
  const record = parseObjectBody(body);
  for (const key of Object.keys(record)) {
    if (key !== 'fields') throw new ValidationError(`Campo desconhecido no corpo da requisição: ${key}`);
  }
  if (!Array.isArray(record.fields) || record.fields.length > 100) {
    throw new ValidationError('O campo fields deve ser uma lista com no máximo 100 itens');
  }
  return record.fields.map((entry: unknown): SubmittedField => {
    const item = parseObjectBody(entry);
    for (const key of Object.keys(item)) {
      if (!['field_key', 'enabled', 'required', 'sort_order'].includes(key)) {
        throw new ValidationError(`Campo desconhecido no item do formulário: ${key}`);
      }
    }
    if (typeof item.field_key !== 'string') throw new ValidationError('O campo field_key deve ser texto');
    if (typeof item.enabled !== 'boolean' || typeof item.required !== 'boolean') {
      throw new ValidationError('Os campos enabled e required devem ser verdadeiro ou falso');
    }
    let sortOrder: number | undefined;
    if (item.sort_order !== undefined) {
      if (typeof item.sort_order !== 'number' || !Number.isInteger(item.sort_order) || item.sort_order < 0 || item.sort_order > 10_000) {
        throw new ValidationError('O campo sort_order deve ser um inteiro entre 0 e 10000');
      }
      sortOrder = item.sort_order;
    }
    return {
      fieldKey: item.field_key,
      enabled: item.enabled,
      required: item.required,
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    };
  });
}

export function registerSaleFormRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/sale-form-fields', { preHandler: protectedHooks }, () => ({
    fields: saleFormFieldsFor('LITE').map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      group: field.group,
      locked: field.locked,
      classification: field.classification,
      available_in: field.availableIn,
    })),
  }));

  app.get('/categories/:id/form', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };
    return database.withTenantTransaction(async (client) => {
      const loaded = await loadCategoryWithRules(client, context.tenantId, id);
      if (!loaded) throw new NotFoundError('Category not found');
      return { form: mergeForm(loaded.category, loaded.rules, loaded.sortOrders) };
    });
  });

  app.put('/categories/:id/form', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'settings.manage');
    requireAdministrator(context);
    const { id } = request.params as { id: string };
    const submitted = parseForm(request.body);
    validateProfileRules(submitted.map((f) => ({ fieldKey: f.fieldKey, enabled: f.enabled, required: f.required })));
    // locked fields are not stored: always enabled, never required
    const persisted = submitted.filter((f) => !getSaleFormField(f.fieldKey)?.locked);

    return database.withTenantTransaction(async (client) => {
      const loaded = await loadCategoryWithRules(client, context.tenantId, id, 'update');
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

      await client.query(`DELETE FROM sale_category_fields WHERE tenant_id = $1 AND category_id = $2`, [
        context.tenantId,
        id,
      ]);
      for (const [index, field] of persisted.entries()) {
        await client.query(
          `INSERT INTO sale_category_fields (tenant_id, category_id, field_key, enabled, required, sort_order, group_name, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [context.tenantId, id, field.fieldKey, field.enabled, field.required, field.sortOrder ?? index,
            getSaleFormField(field.fieldKey)?.group ?? null, context.userId || null],
        );
      }
      const bumped = await client.query<CategoryWithRules['category']>(
        `UPDATE sale_categories SET form_revision = form_revision + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, name, active, sort_order, form_revision`,
        [context.tenantId, id],
      );
      const category = bumped.rows[0]!;

      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_CATEGORY_FORM_UPDATED,
        entityType: 'sale_category',
        entityId: id,
        metadata: { form_revision: category.form_revision, changed: changed.join(',').slice(0, 450) },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_CATEGORY_UPDATED',
        entityType: 'sale_category',
        entityId: id,
        payload: { name: category.name, form_revision: category.form_revision },
      });

      const rules = persisted.map((f) => ({ fieldKey: f.fieldKey, enabled: f.enabled, required: f.required }));
      return { form: mergeForm(category, rules, new Map(persisted.map((f, i) => [f.fieldKey, f.sortOrder ?? i]))) };
    });
  });
}
