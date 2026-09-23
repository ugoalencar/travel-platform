/**
 * Import Center column allowlist (F-03).
 *
 * Defense-in-depth against SQL injection via the mapping targetField:
 * insertEntity previously interpolated arbitrary mapping values into the
 * INSERT column list. Only the columns below may ever reach SQL for a
 * given entity type. Checked at three layers:
 *   1. POST /:jobId/validate route — union of all allowlists, before any
 *      tenant code runs (400 with no transaction opened).
 *   2. dryRunImport — per-entity allowlist after the job is loaded.
 *   3. insertEntity — per-column gate immediately before SQL build;
 *      a non-allowlisted non-empty value throws ValidationError so the
 *      whole tenant transaction rolls back.
 *
 * `role` is intentionally absent from EMPLOYEE: import must never grant
 * privileges (see audit F-03).
 */

import { ValidationError } from '../errors';
import { ImportEntityType } from './types';

const CUSTOMER_ALLOWLIST: readonly string[] = [
  'name',
  'email',
  'phone',
  'cpf',
  'birth_date',
  'notes',
];

const SUPPLIER_ALLOWLIST: readonly string[] = [
  'name',
  'trade_name',
  'email',
  'phone',
  'cnpj',
  'category',
  'notes',
];

/** EMPLOYEE: no `role` — import never sets privileges. */
const EMPLOYEE_ALLOWLIST: readonly string[] = ['name', 'email'];

const TAG_ALLOWLIST: readonly string[] = ['name', 'category', 'color'];

const ALLOWLISTS: Readonly<Record<ImportEntityType, readonly string[]>> = {
  [ImportEntityType.CUSTOMER]: CUSTOMER_ALLOWLIST,
  [ImportEntityType.SUPPLIER]: SUPPLIER_ALLOWLIST,
  [ImportEntityType.EMPLOYEE]: EMPLOYEE_ALLOWLIST,
  [ImportEntityType.TAG]: TAG_ALLOWLIST,
  // Not yet supported for import (getEntityFields throws for these too).
  [ImportEntityType.WISH]: [],
  [ImportEntityType.OFFER]: [],
  [ImportEntityType.PROPOSAL]: [],
};

/** Columns insertEntity always supplies itself; never taken from mapping. */
const SYSTEM_COLUMNS: ReadonlySet<string> = new Set([
  'id',
  'agency_id',
  'created_by',
  'created_at',
  'updated_at',
  'deleted_at',
]);

export function getAllowedImportFields(entityType: ImportEntityType): readonly string[] {
  const allowlist = ALLOWLISTS[entityType];
  if (!allowlist) {
    throw new ValidationError(`Tipo de entidade não suportado para importação: ${entityType}`);
  }
  return allowlist;
}

/** Union of every entity allowlist — used by the route-level pre-check. */
export function getImportMappingUnion(): Set<string> {
  const union = new Set<string>();
  for (const allowlist of Object.values(ALLOWLISTS)) {
    for (const field of allowlist) union.add(field);
  }
  return union;
}

export function isAllowedImportField(
  entityType: ImportEntityType,
  targetField: string,
): boolean {
  return getAllowedImportFields(entityType).includes(targetField);
}

/**
 * Reject a mapping whose target fields are outside the union of all
 * allowlists. Safe to call before any tenant/DB context exists.
 * Throws ValidationError (HTTP 400 at the route).
 */
export function assertMappingInUnion(mapping: Record<string, string>): void {
  const union = getImportMappingUnion();
  const disallowed = new Set<string>();
  for (const targetField of Object.values(mapping)) {
    if (!targetField) continue;
    if (SYSTEM_COLUMNS.has(targetField)) continue;
    if (!union.has(targetField)) disallowed.add(targetField);
  }
  if (disallowed.size > 0) {
    throw new ValidationError(
      `Campos de destino não permitidos na importação: ${[...disallowed].sort().join(', ')}`,
    );
  }
}

/**
 * Reject a mapping whose target fields are outside this entity's
 * allowlist. System columns (id, timestamps, …) are ignored — they are
 * never taken from client mapping. Throws ValidationError.
 */
export function assertMappingAllowed(
  entityType: ImportEntityType,
  mapping: Record<string, string>,
): void {
  const allowlist = getAllowedImportFields(entityType);
  const disallowed = new Set<string>();
  for (const targetField of Object.values(mapping)) {
    if (!targetField) continue;
    if (SYSTEM_COLUMNS.has(targetField)) continue;
    if (!allowlist.includes(targetField)) disallowed.add(targetField);
  }
  if (disallowed.size > 0) {
    throw new ValidationError(
      `Campos não permitidos para ${entityType}: ${[...disallowed].sort().join(', ')}. Permitidos: ${[...allowlist].sort().join(', ')}`,
    );
  }
}
