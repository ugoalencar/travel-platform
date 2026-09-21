/**
 * Import Center types and constants.
 *
 * Shared between API routes, parsers, and validators.
 * Entity schemas are derived from the real Prisma schema — not invented.
 */

// ============================================================
// Enums (mirror the SQL enums)
// ============================================================

export enum ImportJobStatus {
  UPLOADING = 'UPLOADING',
  PARSING = 'PARSING',
  MAPPED = 'MAPPED',
  VALIDATING = 'VALIDATING',
  DRY_RUN = 'DRY_RUN',
  CONFIRMED = 'CONFIRMED',
  IMPORTING = 'IMPORTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum ImportEntityType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
  EMPLOYEE = 'EMPLOYEE',
  TAG = 'TAG',
  WISH = 'WISH',
  OFFER = 'OFFER',
  PROPOSAL = 'PROPOSAL',
}

export enum ImportRowClassification {
  NEW = 'NEW',
  MATCHED = 'MATCHED',
  POSSIBLE_DUPLICATE = 'POSSIBLE_DUPLICATE',
  INVALID = 'INVALID',
}

// ============================================================
// Import job record (matches DB schema)
// ============================================================

export interface ImportJob {
  id: string;
  agencyId: string;
  createdBy: string;
  entityType: ImportEntityType;
  sourceSystem: string | null;
  originalFilename: string;
  storageKey: string;
  status: ImportJobStatus;
  mapping: Record<string, string>;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  errors: ImportError[];
  preview: ImportPreviewRow[];
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Error and preview types
// ============================================================

export interface ImportError {
  row: number;
  column: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportPreviewRow {
  rowNumber: number;
  classification: ImportRowClassification;
  data: Record<string, string>;
  matchedId?: string | null;
  issues?: string[] | null;
}

// ============================================================
// API input/output types
// ============================================================

export interface UploadImportFileInput {
  entityType: ImportEntityType;
  sourceSystem?: string;
}

export interface ApplyMappingInput {
  mapping: Record<string, string>; // { "Nome do Cliente": "name" }
}

export interface ConfirmImportInput {
  jobId: string;
}

export interface ImportMappingTemplate {
  id: string;
  agencyId: string;
  createdBy: string;
  name: string;
  entityType: ImportEntityType;
  mapping: Record<string, string>;
  sourceSystem: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Entity field schemas (what we can import per entity type)
// ============================================================

export interface EntityFieldSchema {
  field: string;
  label: string;
  type: 'string' | 'email' | 'phone' | 'date' | 'number' | 'boolean';
  required: boolean;
  unique?: boolean; // Used for duplicate detection
  maxLength?: number;
  format?: string; // e.g. 'YYYY-MM-DD', '(XX) XXXXX-XXXX'
}

/**
 * Customer fields — derived from the real customers table schema.
 * See 063_customer_portal_access.sql and 064_customer_portal_auth.sql.
 */
export const CUSTOMER_FIELDS: EntityFieldSchema[] = [
  { field: 'name', label: 'Nome', type: 'string', required: true, maxLength: 255 },
  { field: 'email', label: 'E-mail', type: 'email', required: false, unique: true },
  { field: 'phone', label: 'Telefone', type: 'phone', required: false },
  { field: 'cpf', label: 'CPF', type: 'string', required: false, unique: true, maxLength: 14 },
  { field: 'birth_date', label: 'Data de Nascimento', type: 'date', required: false },
  { field: 'notes', label: 'Observações', type: 'string', required: false, maxLength: 2000 },
];

/**
 * Supplier fields — derived from the real suppliers table.
 * See 065_suppliers.sql.
 */
export const SUPPLIER_FIELDS: EntityFieldSchema[] = [
  { field: 'name', label: 'Nome / Razão Social', type: 'string', required: true, maxLength: 255 },
  { field: 'trade_name', label: 'Nome Fantasia', type: 'string', required: false, maxLength: 255 },
  { field: 'email', label: 'E-mail', type: 'email', required: false },
  { field: 'phone', label: 'Telefone', type: 'phone', required: false },
  { field: 'cnpj', label: 'CNPJ', type: 'string', required: false, unique: true, maxLength: 18 },
  { field: 'category', label: 'Categoria', type: 'string', required: false, maxLength: 100 },
  { field: 'notes', label: 'Observações', type: 'string', required: false, maxLength: 2000 },
];

/**
 * Employee fields — derived from the real users table.
 * See 061_local_password_auth.sql and users table.
 */
export const EMPLOYEE_FIELDS: EntityFieldSchema[] = [
  { field: 'name', label: 'Nome', type: 'string', required: true, maxLength: 255 },
  { field: 'email', label: 'E-mail', type: 'email', required: true, unique: true },
  { field: 'role', label: 'Função', type: 'string', required: false },
];

/**
 * Tag fields — derived from the real tags table.
 */
export const TAG_FIELDS: EntityFieldSchema[] = [
  { field: 'name', label: 'Nome da Tag', type: 'string', required: true, maxLength: 100 },
  { field: 'category', label: 'Categoria', type: 'string', required: false, maxLength: 100 },
  { field: 'color', label: 'Cor', type: 'string', required: false, maxLength: 7 },
];

/**
 * Get field schema for an entity type.
 */
export function getEntityFields(entityType: ImportEntityType): EntityFieldSchema[] {
  switch (entityType) {
    case ImportEntityType.CUSTOMER:
      return CUSTOMER_FIELDS;
    case ImportEntityType.SUPPLIER:
      return SUPPLIER_FIELDS;
    case ImportEntityType.EMPLOYEE:
      return EMPLOYEE_FIELDS;
    case ImportEntityType.TAG:
      return TAG_FIELDS;
    default:
      throw new Error(`Entity type ${entityType} not yet supported for import`);
  }
}

/**
 * Allowed MIME types for import files.
 */
export const ALLOWED_IMPORT_MIME_TYPES: readonly string[] = [
  'text/csv',
  'application/csv',
  'text/plain', // Some systems send CSV as text/plain
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls (legacy)
];

/**
 * Maximum file size for import: 10MB.
 */
export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum rows per import: 10,000.
 */
export const MAX_IMPORT_ROWS = 10_000;

/**
 * Preview rows shown during dry run: 50.
 */
export const PREVIEW_ROW_COUNT = 50;
