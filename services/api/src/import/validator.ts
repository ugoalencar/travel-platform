/**
 * Import validation logic.
 *
 * Validates parsed rows against entity-specific business rules.
 * Produces per-row classification (NEW / MATCHED / POSSIBLE_DUPLICATE / INVALID)
 * and per-field error messages.
 *
 * SECURITY: Validation is strict — unknown fields are ignored, required fields
 * are enforced, and format rules are applied without trust in the source data.
 */

import type { DatabaseRuntime } from '../database';
import type {
  EntityFieldSchema,
  ImportError,
} from './types';
import {
  getEntityFields,
  ImportEntityType,
  ImportRowClassification,
} from './types';
import { getAgencyId } from '../../../../packages/domain/tenant-context';

// ============================================================
// Validation result
// ============================================================

export interface ValidateRowResult {
  classification: ImportRowClassification;
  issues: string[];
  matchedId?: string | null;
}

export interface ValidationResult {
  rows: ValidateRowResult[];
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  errors: ImportError[];
}

// ============================================================
// Format validators
// ============================================================

function isValidEmail(value: string): boolean {
  // RFC 5322 simplified
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  // Brazilian phone: (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  // Or international with digits only
  const cleaned = value.replace(/[\s\-().+]/g, '');
  return /^\d{8,15}$/.test(cleaned);
}

function isValidCpf(value: string): boolean {
  // CPF: XXX.XXX.XXX-XX or 11 digits
  const cleaned = value.replace(/[.\-]/g, '');
  if (!/^\d{11}$/.test(cleaned)) return false;

  // CPF algorithm check
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i] ?? '0', 10) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cleaned[9] ?? '0', 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned[i] ?? '0', 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(cleaned[10] ?? '0', 10);
}

function isValidCnpj(value: string): boolean {
  // CNPJ: XX.XXX.XXX/XXXX-XX or 14 digits
  const cleaned = value.replace(/[.\-/]/g, '');
  if (!/^\d{14}$/.test(cleaned)) return false;

  // CNPJ algorithm check
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i] ?? '0', 10) * (weights1[i] ?? 0);
  }
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(cleaned[12] ?? '0', 10) !== digit1) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleaned[i] ?? '0', 10) * (weights2[i] ?? 0);
  }
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  return parseInt(cleaned[13] ?? '0', 10) === digit2;
}

function isValidDate(value: string): boolean {
  // Accept: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value);
    return !isNaN(d.getTime());
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return !isNaN(d.getTime());
  }
  return false;
}

function parseDate(value: string): string | null {
  // Normalize to YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/');
    return `${year}-${month}-${day}`;
  }
  return null;
}

// ============================================================
// Validate a single row
// ============================================================

function validateSingleRow(
  data: Record<string, string>,
  mapping: Record<string, string>,
  fields: EntityFieldSchema[],
): ValidateRowResult {
  const issues: string[] = [];
  const normalizedData: Record<string, string> = {};

  // Apply mapping and validate each field
  for (const [sourceCol, targetField] of Object.entries(mapping)) {
    const value = data[sourceCol] ?? '';
    const fieldSchema = fields.find((f) => f.field === targetField);

    if (!fieldSchema) {
      // Unknown target field — skip silently
      continue;
    }

    // Required check
    if (fieldSchema.required && value.length === 0) {
      issues.push(`Campo obrigatório vazio: ${fieldSchema.label}`);
      continue;
    }

    // Skip further validation if empty and optional
    if (value.length === 0) {
      normalizedData[targetField] = '';
      continue;
    }

    // Max length check
    if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
      issues.push(`Campo "${fieldSchema.label}" excede ${fieldSchema.maxLength} caracteres`);
      continue;
    }

    // Type-specific validation
    switch (fieldSchema.type) {
      case 'email':
        if (!isValidEmail(value)) {
          issues.push(`E-mail inválido: ${value}`);
        }
        break;
      case 'phone':
        if (!isValidPhone(value)) {
          issues.push(`Telefone inválido: ${value}`);
        }
        break;
      case 'date':
        if (!isValidDate(value)) {
          issues.push(`Data inválida: ${value}. Use YYYY-MM-DD ou DD/MM/YYYY`);
        } else {
          normalizedData[targetField] = parseDate(value) ?? value;
        }
        break;
    }

    // Entity-specific format checks
    if (targetField === 'cpf' && value.length > 0 && !isValidCpf(value)) {
      issues.push(`CPF inválido: ${value}`);
    }
    if (targetField === 'cnpj' && value.length > 0 && !isValidCnpj(value)) {
      issues.push(`CNPJ inválido: ${value}`);
    }

    if (normalizedData[targetField] === undefined) {
      normalizedData[targetField] = value;
    }
  }

  // Check for required fields not in mapping
  for (const field of fields) {
    if (field.required && !(field.field in normalizedData)) {
      issues.push(`Campo obrigatório não mapeado: ${field.label}`);
    }
  }

  const hasErrors = issues.some((i) => i.includes('inválido') || i.includes('obrigatório'));
  const classification: ImportRowClassification = hasErrors
    ? ImportRowClassification.INVALID
    : ImportRowClassification.NEW;

  return { classification, issues, matchedId: null };
}

// ============================================================
// Batch validation with duplicate detection
// ============================================================

/**
 * Validate all rows in a parsed import, checking for duplicates
 * against existing data in the database.
 */
export async function validateImportRows(
  database: DatabaseRuntime,
  entityType: ImportEntityType,
  rows: { rowNumber: number; data: Record<string, string> }[],
  mapping: Record<string, string>,
): Promise<ValidationResult> {
  const fields = getEntityFields(entityType);
  const errors: ImportError[] = [];
  const validatedRows: ValidateRowResult[] = [];
  let validRows = 0;
  let warningRows = 0;
  let errorRows = 0;

  // Step 1: Basic field validation for each row
  for (const row of rows) {
    const result = validateSingleRow(row.data, mapping, fields);
    validatedRows.push(result);

    if (result.classification === ImportRowClassification.INVALID) {
      errorRows++;
      for (const issue of result.issues) {
        errors.push({
          row: row.rowNumber,
          column: '',
          message: issue,
          severity: 'error',
        });
      }
    } else {
      validRows++;
      if (result.issues.length > 0) {
        warningRows++;
        for (const issue of result.issues) {
          errors.push({
            row: row.rowNumber,
            column: '',
            message: issue,
            severity: 'warning',
          });
        }
      }
    }
  }

  // Step 2: Duplicate detection (entity-specific)
  try {
    const duplicates = await detectDuplicates(database, entityType, rows, mapping, fields);
    for (const dup of duplicates) {
      const rowIdx = rows.findIndex((r) => r.rowNumber === dup.rowNumber);
      if (rowIdx >= 0 && validatedRows[rowIdx]) {
        validatedRows[rowIdx].classification = dup.classification;
        validatedRows[rowIdx].matchedId = dup.matchedId ?? null;
        if (dup.issues) {
          validatedRows[rowIdx].issues.push(...dup.issues);
        }
      }
    }
  } catch {
    // Duplicate detection is best-effort; if it fails, we still validate
    errors.push({
      row: 0,
      column: '',
      message: 'Detecção de duplicatas indisponível. Importação prosseguirá sem checagem de duplicatas.',
      severity: 'warning',
    });
  }

  return {
    rows: validatedRows,
    totalRows: rows.length,
    validRows,
    warningRows,
    errorRows,
    errors,
  };
}

// ============================================================
// Duplicate detection
// ============================================================

interface DuplicateResult {
  rowNumber: number;
  classification: ImportRowClassification;
  matchedId?: string | null;
  issues?: string[];
}

/**
 * Detect duplicates by checking unique fields (email, cpf, cnpj)
 * against existing records in the database.
 */
async function detectDuplicates(
  database: DatabaseRuntime,
  entityType: ImportEntityType,
  rows: { rowNumber: number; data: Record<string, string> }[],
  mapping: Record<string, string>,
  fields: EntityFieldSchema[],
): Promise<DuplicateResult[]> {
  const results: DuplicateResult[] = [];

  // Get unique fields for this entity
  const uniqueFields = fields.filter((f) => f.unique);
  if (uniqueFields.length === 0) return results;

  // Build a map of unique values per field
  const uniqueValuesByField: Record<string, Map<string, number[]>> = {};
  for (const field of uniqueFields) {
    uniqueValuesByField[field.field] = new Map();
  }

  for (const row of rows) {
    for (const field of uniqueFields) {
      // Find source column that maps to this field
      const sourceCol = Object.entries(mapping).find(([, v]) => v === field.field)?.[0];
      if (!sourceCol) continue;

      const value = (row.data[sourceCol] ?? '').trim().toLowerCase();
      if (value.length === 0) continue;

      const map = uniqueValuesByField[field.field];
      if (!map) continue;

      const existing = map.get(value) ?? [];
      existing.push(row.rowNumber);
      map.set(value, existing);
    }
  }

  // For each unique field, query the database for existing values
  const agencyId = getAgencyId();

  for (const field of uniqueFields) {
    const map = uniqueValuesByField[field.field];
    if (!map || map.size === 0) continue;

    const values = Array.from(map.keys());

    // Query existing records
    const tableName = getTableName(entityType);
    const columnName = field.field === 'trade_name' ? 'trade_name' : field.field;

    // Batch query (max 100 values per query to avoid parameter limits)
    const BATCH_SIZE = 100;
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE);

      try {
        const result = await database.withTenantTransaction(async (client) => {
          const query = `
            SELECT id, ${columnName} as value
            FROM ${tableName}
            WHERE agency_id = $1
              AND ${columnName} = ANY($2)
              AND deleted_at IS NULL
          `;
          const queryResult = await client.query<{ id: string; value: string }>(query, [
            agencyId,
            batch,
          ]);
          return queryResult.rows;
        });

        // Map results back to row numbers
        for (const row of result) {
          const normalizedValue = (row.value ?? '').trim().toLowerCase();
          const rowNumbers = map.get(normalizedValue) ?? [];
          for (const rowNumber of rowNumbers) {
            results.push({
              rowNumber,
              classification: ImportRowClassification.MATCHED,
              matchedId: row.id,
              issues: [`Duplicata encontrada por ${field.label}: "${row.value}"`],
            });
          }
        }
      } catch {
        // Table might not exist for this entity type — skip
      }
    }
  }

  return results;
}

/**
 * Get the database table name for an entity type.
 */
function getTableName(entityType: ImportEntityType): string {
  switch (entityType) {
    case ImportEntityType.CUSTOMER:
      return 'customers';
    case ImportEntityType.SUPPLIER:
      return 'suppliers';
    case ImportEntityType.EMPLOYEE:
      return 'users';
    case ImportEntityType.TAG:
      return 'tags';
    default:
      return 'customers'; // fallback
  }
}
