/**
 * Field-level history for sales. Audit metadata only holds primitives, so a
 * change is stored as `changed_fields` ("a,b") plus `old_<field>` /
 * `new_<field>` pairs. The actor and timestamp come from audit_logs itself.
 */
import type { AuditMetadata } from './audit-log';

const NUMERIC_FIELDS = ['gross_amount', 'cost_amount', 'margin_amount', 'installment_count'] as const;
const TEXT_FIELDS = [
  'customer_id',
  'seller_id',
  'category_id',
  'payment_method_id',
  'description',
  'notes',
  'sale_date',
  'due_date',
] as const;

export const SALE_AUDITED_FIELDS: readonly string[] = [...TEXT_FIELDS, ...NUMERIC_FIELDS];

/** Longest value kept per field (matches the audit metadata string cap). */
const MAX_VALUE_LENGTH = 500;

/** Any row-like object; only the audited fields are read. */
export type SaleSnapshot = object;

function normalize(field: string, value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  if ((NUMERIC_FIELDS as readonly string[]).includes(field)) return Number(value);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Metadata describing every audited field that differs between two snapshots. */
export function diffSaleFields(before: SaleSnapshot, after: SaleSnapshot): AuditMetadata {
  const changed: string[] = [];
  const metadata: AuditMetadata = {};
  for (const field of SALE_AUDITED_FIELDS) {
    const from = normalize(field, (before as Record<string, unknown>)[field]);
    const to = normalize(field, (after as Record<string, unknown>)[field]);
    if (from === to) continue;
    changed.push(field);
    for (const [key, value] of [
      [`old_${field}`, from],
      [`new_${field}`, to],
    ] as const) {
      if (typeof value === 'string' && value.length > MAX_VALUE_LENGTH) {
        metadata[key] = value.slice(0, MAX_VALUE_LENGTH);
        metadata[`${field}_truncated`] = true;
      } else {
        metadata[key] = value;
      }
    }
  }
  metadata.changed_fields = changed.join(',');
  return metadata;
}

export interface SaleFieldChange {
  field: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

/** Inverse of diffSaleFields for presentation. */
export function readSaleChanges(metadata: Record<string, unknown> | null): SaleFieldChange[] {
  if (!metadata) return [];
  const listed = typeof metadata.changed_fields === 'string' ? metadata.changed_fields : '';
  const value = (key: string): SaleFieldChange['from'] => {
    const raw = metadata[key];
    return raw === undefined ? null : (raw as SaleFieldChange['from']);
  };
  return listed
    .split(',')
    .filter((field) => SALE_AUDITED_FIELDS.includes(field))
    .map((field) => ({ field, from: value(`old_${field}`), to: value(`new_${field}`) }));
}
